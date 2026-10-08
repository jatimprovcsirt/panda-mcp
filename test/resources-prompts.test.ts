/**
 * Resources and prompts.
 *
 * The prompts carry two safety instructions that matter more than the rest of
 * the text, so they are asserted directly rather than trusted to survive a
 * future edit.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { CliOptions } from "../src/cli.js";
import { sections } from "../src/content/index.js";
import { PROMPT_IDS } from "../src/prompts.js";
import { docUri } from "../src/resources.js";
import { createServer } from "../src/server.js";

function options(docsOnly: boolean): CliOptions {
  return { mode: "serve", docsOnly, projectRoot: process.cwd(), includeEnv: false };
}

const open: Array<() => Promise<void>> = [];

async function connect(docsOnly: boolean): Promise<Client> {
  const server = createServer(options(docsOnly));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "panda-mcp-test", version: "1.0.0" });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  open.push(async () => {
    await client.close();
  });

  return client;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((fn) => fn()));
});

describe("resources", () => {
  it("lists every bundled section plus an index", async () => {
    const client = await connect(true);
    const { resources } = await client.listResources();

    const uris = resources.map((r) => r.uri);
    expect(uris).toContain("panda://index");

    for (const section of sections()) {
      expect(uris).toContain(docUri(section.slug));
    }
  });

  it("serves a section with its citation", async () => {
    const client = await connect(true);
    const result = await client.readResource({ uri: docUri("envelope-format") });

    const text = (result.contents[0] as { text?: string }).text ?? "";
    expect(text).toContain("Source:");
    expect(text.toLowerCase()).toContain("envelope");
  });

  it("serves a machine-readable index", async () => {
    const client = await connect(true);
    const result = await client.readResource({ uri: "panda://index" });

    const text = (result.contents[0] as { text?: string }).text ?? "";
    const index = JSON.parse(text) as { sections: Array<{ slug: string }> };

    expect(index.sections.length).toBe(sections().length);
    expect(index.sections.map((s) => s.slug)).toContain("envelope-format");
  });

  it("is available under --docs-only", async () => {
    const client = await connect(true);
    const { resources } = await client.listResources();
    expect(resources.length).toBeGreaterThan(0);
  });
});

describe("prompts", () => {
  it("exposes one setup prompt per target", async () => {
    const client = await connect(true);
    const { prompts } = await client.listPrompts();

    expect(prompts.map((p) => p.name).sort()).toEqual([...PROMPT_IDS].sort());
  });

  it("returns prompt text for a target", async () => {
    const client = await connect(true);
    const result = await client.getPrompt({ name: "setup_php" });
    const text = (result.messages[0]?.content as { text?: string }).text ?? "";

    expect(text).toContain("PANDA");
    expect(text).toContain("panda-php");
  });

  // The two instructions below are the reason this prompt exists rather than
  // the developer writing their own. Assert them explicitly.
  it("instructs the assistant to use decrypt() and not decryptRaw()", async () => {
    const client = await connect(true);
    const result = await client.getPrompt({ name: "setup_go" });
    const text = (result.messages[0]?.content as { text?: string }).text ?? "";

    expect(text).toMatch(/decrypt\(\).*ter-mask/is);
    expect(text).toMatch(/Jangan pakai decryptRaw\(\)/i);
  });

  it("instructs against hardcoding keys", async () => {
    const client = await connect(true);
    const result = await client.getPrompt({ name: "setup_python" });
    const text = (result.messages[0]?.content as { text?: string }).text ?? "";

    expect(text).toMatch(/Jangan pernah hardcode kunci/i);
  });

  it("leaves the protected-field list to the developer", async () => {
    const client = await connect(true);
    const result = await client.getPrompt({ name: "setup_nodejs" });
    const text = (result.messages[0]?.content as { text?: string }).text ?? "";

    // A placeholder, not a filled-in list: naming the fields is a decision
    // that must not be automated.
    expect(text).toContain("<sebutkan");
  });

  it("accepts a developer-supplied field list", async () => {
    const client = await connect(true);
    const result = await client.getPrompt({
      name: "setup_docker",
      arguments: { fields: "NIK, nomor KK" },
    });
    const text = (result.messages[0]?.content as { text?: string }).text ?? "";

    expect(text).toContain("NIK, nomor KK");
    expect(text).not.toContain("<sebutkan");
  });

  it("is available under --docs-only", async () => {
    const client = await connect(true);
    const { prompts } = await client.listPrompts();
    expect(prompts.length).toBe(PROMPT_IDS.length);
  });
});
