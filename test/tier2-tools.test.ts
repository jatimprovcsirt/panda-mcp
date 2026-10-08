/**
 * Tier 2 tools over the protocol.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { CliOptions } from "../src/cli.js";
import { createServer } from "../src/server.js";

const tempRoots: string[] = [];
const open: Array<() => Promise<void>> = [];

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "panda-mcp-t2-"));
  tempRoots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, "utf8");
  }
  return root;
}

async function connect(projectRoot: string, docsOnly = false): Promise<Client> {
  const options: CliOptions = { mode: "serve", docsOnly, projectRoot, includeEnv: false };
  const server = createServer(options);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "t2", version: "1" });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  open.push(async () => {
    await client.close();
  });
  return client;
}

function text(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content;
  return content?.find((c) => c.type === "text")?.text ?? "";
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((fn) => fn()));
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("validate_implementation", () => {
  it("reports findings with file and line, never the matched value", async () => {
    const SECRET = "kZ8vQ2mN4pR6tW9yB1cD3fG5hJ7kL0mP2qS4uV6xY8zA=";
    const root = project({
      "config/panda.php": `<?php\n$PANDA_KEY_default = "${SECRET}";\n`,
    });

    const client = await connect(root);
    const body = text(await client.callTool({ name: "validate_implementation", arguments: {} }));

    expect(body).toMatch(/M001/);
    expect(body).toContain("config/panda.php:2");
    expect(body).not.toContain(SECRET);
  });

  it("states that a clean result is not a guarantee", async () => {
    const root = project({ "src/clean.js": "export const add = (a, b) => a + b;\n" });

    const client = await connect(root);
    const body = text(await client.callTool({ name: "validate_implementation", arguments: {} }));

    expect(body).toMatch(/No findings/);
    expect(body).toMatch(/not a clean bill of health|not that the code is correct/i);
  });

  it("reports what it skipped", async () => {
    const root = project({
      "src/a.js": "const x = 1;",
      ".env": "PANDA_KEY_default=whatever",
    });

    const client = await connect(root);
    const body = text(await client.callTool({ name: "validate_implementation", arguments: {} }));

    expect(body).toMatch(/Not scanned/);
    expect(body).toMatch(/\.env excluded/);
  });

  it("is absent under --docs-only", async () => {
    const client = await connect(process.cwd(), true);
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).not.toContain("validate_implementation");
    expect(names).not.toContain("explain_envelope");
  });
});

describe("explain_envelope", () => {
  const valid = JSON.stringify({
    v: 1,
    alg: "aes-256-gcm",
    kid: "opd-dukcapil-key-1",
    nonce: Buffer.alloc(12, 1).toString("base64"),
    ciphertext: Buffer.alloc(42, 2).toString("base64"),
  });

  it("reports structure for a well-formed envelope", async () => {
    const client = await connect(process.cwd());
    const body = text(
      await client.callTool({ name: "explain_envelope", arguments: { envelope: valid } }),
    );

    expect(body).toMatch(/well-formed/i);
    expect(body).toContain("opd-dukcapil-key-1");
    expect(body).toContain("26 bytes"); // 42 - 16 tag
  });

  it("diagnoses a wrong nonce length", async () => {
    const bad = JSON.stringify({
      v: 1,
      alg: "aes-256-gcm",
      kid: "k",
      nonce: Buffer.alloc(8, 1).toString("base64"),
      ciphertext: Buffer.alloc(42, 2).toString("base64"),
    });

    const client = await connect(process.cwd());
    const body = text(
      await client.callTool({ name: "explain_envelope", arguments: { envelope: bad } }),
    );

    expect(body).toMatch(/8 bytes/);
    expect(body).toMatch(/exactly 12/);
  });

  it("handles invalid JSON without throwing", async () => {
    const client = await connect(process.cwd());
    const body = text(
      await client.callTool({ name: "explain_envelope", arguments: { envelope: "not json{{" } }),
    );
    expect(body).toMatch(/not valid JSON/i);
  });

  it("states it does not decrypt", async () => {
    const client = await connect(process.cwd());
    const body = text(
      await client.callTool({ name: "explain_envelope", arguments: { envelope: valid } }),
    );
    expect(body).toMatch(/does not decrypt|no key/i);
  });
});
