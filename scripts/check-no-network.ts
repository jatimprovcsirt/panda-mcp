/**
 * Enforce the "no network requests" claim mechanically (PRD FR-M1).
 *
 * The capability statement promises this server never makes an outbound
 * request. A promise in a README is a policy; a build that fails on an HTTP
 * import is a control. This is the control.
 *
 * Scans the source for network APIs and the dependency list for known HTTP
 * clients. Comments are stripped first, so prose *about* the absence of
 * networking does not trip the check.
 *
 * Run via `npm run check:no-network`. Wired into CI.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Network APIs that must not appear in src/.
 *
 * Deliberately specific (`fetch(` rather than `fetch`) so identifiers like
 * `prefetchSection` do not false-positive. A guard that cries wolf gets
 * disabled, and a disabled guard is worse than none.
 */
const FORBIDDEN_APIS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /\bfetch\s*\(/, label: "fetch()" },
  { pattern: /\bhttps?\.request\s*\(/, label: "http(s).request()" },
  { pattern: /\bhttps?\.get\s*\(/, label: "http(s).get()" },
  { pattern: /\bnet\.(connect|createConnection)\s*\(/, label: "net.connect()" },
  { pattern: /\bdgram\.createSocket\s*\(/, label: "dgram.createSocket()" },
  { pattern: /\bnew\s+WebSocket\s*\(/, label: "new WebSocket()" },
  { pattern: /\bXMLHttpRequest\b/, label: "XMLHttpRequest" },
  { pattern: /\brequire\s*\(\s*['"](?:axios|node-fetch|got|superagent|undici)['"]/, label: "HTTP client import" },
  { pattern: /\bfrom\s+['"](?:axios|node-fetch|got|superagent|undici)['"]/, label: "HTTP client import" },
];

/** Packages that would give this process a network capability. */
const FORBIDDEN_DEPENDENCIES = [
  "axios",
  "node-fetch",
  "got",
  "superagent",
  "undici",
  "request",
  "needle",
  "ky",
];

/**
 * `@modelcontextprotocol/sdk` is permitted and unavoidable: it is the protocol
 * implementation. It is checked separately — the stdio transport must be the
 * one in use, and no HTTP transport may be imported.
 */
const FORBIDDEN_SDK_TRANSPORTS = [
  "server/streamableHttp",
  "server/sse",
  "client/streamableHttp",
  "client/sse",
];

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * `src/content/generated.ts` is machine-written documentation text inside a
 * JSON literal — it is data, not code, and it cannot execute anything.
 *
 * It legitimately contains the strings `fetch(` and `->fetch()` because PANDA's
 * own documentation shows HTTP and PDO examples. Scanning it produces false
 * positives, and a guard that cries wolf gets disabled.
 *
 * This exclusion is narrow on purpose, and safe for a second reason: the file
 * is regenerated from source repositories by `build:content`, and
 * `check:content` fails if it differs from its sources. A hand-edit adding a
 * real network call would be caught twice over.
 */
function isGeneratedData(relPath: string): boolean {
  return relPath.replace(/\\/g, "/") === "src/content/generated.ts";
}

const problems: string[] = [];

for (const file of walk(resolve(REPO_ROOT, "src"))) {
  const rel = relative(REPO_ROOT, file);
  if (isGeneratedData(rel)) continue;

  const code = stripComments(readFileSync(file, "utf8"));

  for (const { pattern, label } of FORBIDDEN_APIS) {
    if (pattern.test(code)) {
      problems.push(`${rel}: uses ${label}`);
    }
  }
}

// The transport must be stdio. An SSE or streamable-HTTP transport import is
// exactly the change that would silently give this server a listening socket.
for (const file of walk(resolve(REPO_ROOT, "src"))) {
  const code = readFileSync(file, "utf8");
  for (const transport of FORBIDDEN_SDK_TRANSPORTS) {
    if (code.includes(transport)) {
      problems.push(`${relative(REPO_ROOT, file)}: imports a network transport (${transport})`);
    }
  }
}

const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
};

for (const dep of FORBIDDEN_DEPENDENCIES) {
  if (pkg.dependencies?.[dep]) {
    problems.push(`package.json: depends on ${dep}, which provides network access`);
  }
}

if (problems.length > 0) {
  process.stderr.write(
    `\n[check-no-network] FAILED — this server must make no network requests.\n\n` +
      problems.map((p) => `  ✗ ${p}`).join("\n") +
      `\n\nIf an outbound request is genuinely required, the capability statement ` +
      `in src/capabilities.ts and README.md must change first — the claim and the ` +
      `code are not allowed to disagree.\n\n`,
  );
  process.exit(1);
}

process.stderr.write("[check-no-network] ok — no network APIs, no network transports, no HTTP clients\n");
