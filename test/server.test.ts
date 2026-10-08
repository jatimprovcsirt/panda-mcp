/**
 * Protocol-level tests.
 *
 * These connect a real server to a real client over an in-memory transport,
 * so they assert what a model actually sees — not what the source appears to
 * register. The `--docs-only` guarantee is only meaningful at this level.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { CAPABILITY_STATEMENT, TIER1_TOOL_NAMES, TIER2_TOOL_NAMES } from "../src/capabilities.js";
import type { CliOptions } from "../src/cli.js";
import { createServer } from "../src/server.js";

function options(docsOnly: boolean): CliOptions {
  return {
    mode: "serve",
    docsOnly,
    projectRoot: process.cwd(),
    includeEnv: false,
  };
}

const open: Array<{ close: () => Promise<void> }> = [];

async function connect(docsOnly: boolean): Promise<Client> {
  const server = createServer(options(docsOnly));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const client = new Client({ name: "panda-mcp-test", version: "1.0.0" });

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  open.push({
    close: async () => {
      await client.close();
    },
  });

  return client;
}

function firstText(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content;
  return content?.find((c) => c.type === "text")?.text ?? "";
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((c) => c.close()));
});

describe("tool registration over the protocol", () => {
  it("exposes exactly the Tier 1 tools under --docs-only", async () => {
    const client = await connect(true);
    const { tools } = await client.listTools();

    expect(tools.map((t) => t.name).sort()).toEqual([...TIER1_TOOL_NAMES].sort());
  });

  it("withholds every Tier 2 tool under --docs-only", async () => {
    const client = await connect(true);
    const names = (await client.listTools()).tools.map((t) => t.name);

    for (const tool of TIER2_TOOL_NAMES) {
      expect(names).not.toContain(tool);
    }
  });

  it("exposes Tier 1 and Tier 2 without --docs-only", async () => {
    const client = await connect(false);
    const names = (await client.listTools()).tools.map((t) => t.name);

    for (const tool of TIER1_TOOL_NAMES) {
      expect(names).toContain(tool);
    }
  });

  it("exposes no cryptographic operation in either mode", async () => {
    const forbidden = ["encrypt", "decrypt", "decrypt_raw", "mask", "blind_index", "unmask"];

    for (const docsOnly of [true, false]) {
      const client = await connect(docsOnly);
      const names = (await client.listTools()).tools.map((t) => t.name.toLowerCase());

      for (const name of names) {
        for (const bad of forbidden) {
          expect(name).not.toBe(bad);
        }
      }
    }
  });

  it("carries the capability statement in every tool description", async () => {
    const client = await connect(false);
    const { tools } = await client.listTools();

    for (const tool of tools) {
      expect(tool.description ?? "").toContain(CAPABILITY_STATEMENT);
    }
  });
});

describe("documentation tools", () => {
  it("answers get_server_info with the active capability set", async () => {
    const client = await connect(true);
    const body = firstText(await client.callTool({ name: "get_server_info", arguments: {} }));

    expect(body).toContain("PANDA MCP server");
    expect(body).toContain("docs-only");
    expect(body).toContain("search_docs");
  });

  it("returns cited excerpts from search_docs", async () => {
    const client = await connect(true);
    const body = firstText(
      await client.callTool({ name: "search_docs", arguments: { query: "key provider" } }),
    );

    expect(body).toContain("Source:");
    expect(body.length).toBeGreaterThan(100);
  });

  it("returns the envelope specification", async () => {
    const client = await connect(true);
    const body = firstText(
      await client.callTool({ name: "get_envelope_spec", arguments: {} }),
    );

    expect(body.toLowerCase()).toContain("envelope");
    expect(body).toContain("Source:");
  });

  it("fails helpfully rather than silently on an unmatched query", async () => {
    const client = await connect(true);
    const result = await client.callTool({
      name: "search_docs",
      // A single nonsense token, deliberately: an earlier version of this test
      // used a hyphenated phrase that happened to contain the real word
      // "term", so the search legitimately matched and the test was wrong
      // rather than the code.
      arguments: { query: "zzqqxxvv" },
    });

    expect(result.isError).toBe(true);
    expect(firstText(result)).toContain("Available sections:");
  });
});
