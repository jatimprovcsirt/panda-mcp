/**
 * End-to-end test against the built artifact over a real stdio pipe.
 *
 * Everything else in this suite runs in-process. This one spawns `dist/index.js`
 * as a child process and speaks JSON-RPC to it over stdin/stdout — which is
 * what `npx @jatimprovcsirt/panda-mcp` actually does. It is the test that
 * catches a bad shebang, a stray `console.log` corrupting the protocol stream,
 * or a build that fails to start.
 *
 * Skipped when dist/ is absent, so `npm test` works before the first build.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = resolve(REPO_ROOT, "dist/index.js");

const hasBuild = existsSync(ENTRY);

interface Rpc {
  jsonrpc: "2.0";
  id?: number;
  method: string;
  params?: unknown;
}

const running: Array<() => void> = [];

afterEach(() => {
  for (const stop of running.splice(0)) stop();
});

/**
 * Start the built server and return a request/response function.
 *
 * Reads newline-delimited JSON-RPC from stdout. Any non-JSON line on stdout is
 * captured as noise — that is precisely the failure mode this test exists to
 * detect, so it is recorded rather than thrown away.
 */
async function startServer(args: string[] = []) {
  const child = spawn(process.execPath, [ENTRY, ...args], {
    stdio: ["pipe", "pipe", "pipe"],
    cwd: REPO_ROOT,
  });

  const pending = new Map<number, (value: unknown) => void>();
  const noise: string[] = [];
  let buffered = "";

  child.stdout.on("data", (chunk: Buffer) => {
    buffered += chunk.toString("utf8");
    let newline = buffered.indexOf("\n");
    while (newline !== -1) {
      const line = buffered.slice(0, newline).trim();
      buffered = buffered.slice(newline + 1);
      newline = buffered.indexOf("\n");
      if (line === "") continue;

      try {
        const message = JSON.parse(line) as { id?: number };
        if (typeof message.id === "number") {
          pending.get(message.id)?.(message);
          pending.delete(message.id);
        }
      } catch {
        noise.push(line);
      }
    }
  });

  running.push(() => child.kill());

  let nextId = 1;
  const call = (method: string, params?: unknown): Promise<unknown> => {
    const id = nextId++;
    const request: Rpc = { jsonrpc: "2.0", id, method, ...(params ? { params } : {}) };
    return new Promise((resolvePromise) => {
      pending.set(id, resolvePromise);
      child.stdin.write(`${JSON.stringify(request)}\n`);
    });
  };

  const notify = (method: string): void => {
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method })}\n`);
  };

  await call("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "e2e", version: "1.0.0" },
  });
  notify("notifications/initialized");

  return { call, getNoise: () => noise };
}

const describeBuilt = hasBuild ? describe : describe.skip;

describeBuilt("built server over stdio", () => {
  it("completes a handshake and lists tools", async () => {
    const { call } = await startServer(["--docs-only"]);
    const result = (await call("tools/list")) as {
      result?: { tools: Array<{ name: string }> };
    };

    const names = result.result?.tools.map((t) => t.name) ?? [];
    expect(names).toContain("search_docs");
    expect(names).toContain("get_server_info");
    expect(names).not.toContain("validate_implementation");
  });

  it("keeps stdout clean — a stray console.log would corrupt the protocol", async () => {
    const { call, getNoise } = await startServer(["--docs-only"]);
    await call("tools/list");

    expect(getNoise()).toEqual([]);
  });

  it("answers a documentation query with a citation", async () => {
    const { call } = await startServer(["--docs-only"]);
    const result = (await call("tools/call", {
      name: "search_docs",
      arguments: { query: "key provider" },
    })) as { result?: { content: Array<{ text: string }> } };

    const text = result.result?.content[0]?.text ?? "";
    expect(text).toContain("Source:");
  });

  it("starts cleanly in full mode", async () => {
    const { call } = await startServer([]);
    const result = (await call("tools/list")) as { result?: { tools: unknown[] } };
    expect(result.result?.tools.length).toBeGreaterThan(0);
  });
});
