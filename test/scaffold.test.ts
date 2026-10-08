/**
 * Scaffold generator.
 *
 * The load-bearing test in this file is "writes nothing". Everything else is
 * about output quality; that one is about the capability claim.
 */

import { mkdtempSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { CliOptions } from "../src/cli.js";
import { TEMPLATED_STACKS, scaffold } from "../src/scaffold/index.js";
import type { ScaffoldRequest } from "../src/scaffold/types.js";
import { createServer } from "../src/server.js";
import type { Stack } from "../src/content/types.js";

const tempRoots: string[] = [];
const open: Array<() => Promise<void>> = [];

function project(files: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "panda-mcp-scaffold-"));
  tempRoots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, "utf8");
  }
  return root;
}

/** Recursive listing of every path under a directory. */
function tree(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    out.push(entry.name);
    if (entry.isDirectory()) out.push(...tree(full).map((p) => join(entry.name, p)));
  }
  return out.sort();
}

async function connect(projectRoot: string, docsOnly = false): Promise<Client> {
  const options: CliOptions = { mode: "serve", docsOnly, projectRoot, includeEnv: false };
  const server = createServer(options);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "scaffold-test", version: "1" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  open.push(async () => {
    await client.close();
  });
  return client;
}

function textOf(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content;
  return content?.find((c) => c.type === "text")?.text ?? "";
}

function request(stack: Stack, overrides: Partial<ScaffoldRequest> = {}): ScaffoldRequest {
  return {
    stack,
    keyProvider: "local",
    kid: "opd-key-1",
    entity: "citizens",
    fields: [
      { name: "nik", searchable: true },
      { name: "nama_lengkap", searchable: false },
    ],
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((fn) => fn()));
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------

describe("the generator writes nothing", () => {
  it("leaves the filesystem untouched for every templated stack", async () => {
    for (const stack of TEMPLATED_STACKS) {
      const root = project({ "existing.txt": "untouched" });
      const before = tree(root);
      const beforeStat = statSync(join(root, "existing.txt")).mtimeMs;

      const options: CliOptions = {
        mode: "serve",
        docsOnly: false,
        projectRoot: root,
        includeEnv: false,
      };
      const server = createServer(options);
      const [ct, st] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "t", version: "1" });
      await Promise.all([server.connect(st), client.connect(ct)]);

      await client.callTool({
        name: "scaffold_integration",
        arguments: {
          stack,
          fields: [{ name: "nik", searchable: true }],
          key_provider: "local",
          kid: "k",
          entity: "citizens",
        },
      });

      expect(tree(root)).toEqual(before);
      expect(statSync(join(root, "existing.txt")).mtimeMs).toBe(beforeStat);

      await client.close();
    }
  });
});

describe("templates", () => {
  it("produces a migration, wiring, and env for each templated stack", () => {
    for (const stack of TEMPLATED_STACKS) {
      const result = scaffold(request(stack));
      expect(result.files.length, stack).toBeGreaterThanOrEqual(3);
      expect(result.unsupported, stack).toBeUndefined();
    }
  });

  it("creates a blind-index column only for searchable fields", () => {
    const result = scaffold(request("laravel"));
    const migration = result.files.find((f) => f.path.includes("migrations"));
    expect(migration?.content).toContain("nik_bidx");
    expect(migration?.content).not.toContain("nama_lengkap_bidx");
  });

  it("never emits key material", () => {
    for (const stack of TEMPLATED_STACKS) {
      const result = scaffold(request(stack));
      const all = result.files.map((f) => f.content).join("\n");

      // A 44-character base64 literal would be a key. There must never be one.
      expect(all, stack).not.toMatch(/[A-Za-z0-9+/]{43}=/);
      expect(all, stack).toMatch(/PANDA_KEY_PROVIDER_DRIVER/);
    }
  });

  it("cites the API surface it was written against", () => {
    for (const stack of TEMPLATED_STACKS) {
      const result = scaffold(request(stack));
      expect(result.apisUsed.length, stack).toBeGreaterThan(0);
    }
  });

  it("names the real package, not an invented one", () => {
    expect(scaffold(request("laravel")).files.map((f) => f.content).join()).toContain(
      "Panda\\Integrations\\Laravel",
    );
    expect(scaffold(request("nestjs")).files.map((f) => f.content).join()).toContain(
      "@jatimprovcsirt/panda-node",
    );
    expect(scaffold(request("django")).files.map((f) => f.content).join()).toContain(
      "panda.integrations.django",
    );
    expect(scaffold(request("go")).files.map((f) => f.content).join()).toContain(
      "github.com/jatimprovcsirt/panda-go",
    );
  });

  it("does not fabricate wiring for a stack without a template", () => {
    const result = scaffold(request("codeigniter"));

    expect(result.unsupported).toMatch(/No integration template/i);
    // Migration and env still produced — those are stack-agnostic.
    expect(result.files.some((f) => f.path.includes("migrations"))).toBe(true);
    expect(result.files.some((f) => f.path === ".env.example")).toBe(true);
    // And no invented PHP class appears.
    expect(result.files.map((f) => f.content).join()).not.toContain("class ");
  });

  it("returns nothing to do when no fields are given", () => {
    const result = scaffold(request("laravel", { fields: [] }));
    expect(result.files).toEqual([]);
    expect(result.notes[0]?.text).toMatch(/nothing to encrypt/i);
  });

  it("keeps generated paths inside the project root", () => {
    for (const stack of TEMPLATED_STACKS) {
      for (const file of scaffold(request(stack)).files) {
        expect(file.path.startsWith("/"), file.path).toBe(false);
        expect(file.path.includes(".."), file.path).toBe(false);
      }
    }
  });
});

describe("scaffold_integration tool", () => {
  it("says plainly that nothing was written", async () => {
    const root = project();
    const client = await connect(root);

    const body = textOf(
      await client.callTool({
        name: "scaffold_integration",
        arguments: {
          stack: "laravel",
          fields: [{ name: "nik", searchable: true }],
          key_provider: "local",
          entity: "citizens",
        },
      }),
    );

    expect(body).toMatch(/Nothing has been written/i);
    expect(body).toMatch(/own file tools/i);
  });

  it("warns when a target path already exists", async () => {
    const root = project({ ".env.example": "EXISTING=1\n" });
    const client = await connect(root);

    const body = textOf(
      await client.callTool({
        name: "scaffold_integration",
        arguments: {
          stack: "laravel",
          fields: [{ name: "nik", searchable: true }],
          key_provider: "local",
          entity: "citizens",
        },
      }),
    );

    expect(body).toMatch(/already exist/i);
    expect(body).toContain(".env.example");
  });

  it("is absent under --docs-only", async () => {
    const client = await connect(process.cwd(), true);
    expect((await client.listTools()).tools.map((t) => t.name)).not.toContain(
      "scaffold_integration",
    );
  });

  it("is present without --docs-only", async () => {
    const client = await connect(process.cwd(), false);
    expect((await client.listTools()).tools.map((t) => t.name)).toContain(
      "scaffold_integration",
    );
  });
});
