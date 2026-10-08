/**
 * Keep src/version.ts and package.json in agreement.
 *
 * The version is a literal rather than an import so the bundler does not inline
 * the whole manifest into the published binary. The cost of that choice is a
 * drift risk, and this script is the mitigation.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8")) as {
  version: string;
};

const source = readFileSync(resolve(REPO_ROOT, "src/version.ts"), "utf8");
const match = /export const VERSION = "([^"]+)"/.exec(source);

if (!match) {
  process.stderr.write("[check-version] FAILED — could not find VERSION in src/version.ts\n");
  process.exit(1);
}

const declared = match[1]!;

if (declared !== pkg.version) {
  process.stderr.write(
    `[check-version] FAILED — version mismatch\n` +
      `  package.json : ${pkg.version}\n` +
      `  src/version.ts: ${declared}\n` +
      `\nUpdate src/version.ts to match. A published package that reports the ` +
      `wrong version makes every bug report ambiguous.\n`,
  );
  process.exit(1);
}

process.stderr.write(`[check-version] ok — ${declared}\n`);
