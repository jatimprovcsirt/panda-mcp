/**
 * M001 — hardcoded encryption key.
 *
 * The highest-severity rule, and the one most likely to cause harm if written
 * carelessly: a naive implementation reports the key it found, which moves a
 * live key into the model's context. This rule emits a line number and
 * nothing else — see Finding in ../types.ts.
 *
 * A PANDA key is 32 random bytes, base64-encoded: 44 characters ending in a
 * single `=`. That shape alone is not a signal (plenty of hashes match), so a
 * match requires a key-ish identifier on the same line.
 */

import type { Rule, RuleMatch, ScanFile } from "../types.js";

/**
 * Identifiers that suggest the value beside them is key material.
 *
 * Note `PANDA_KEY[A-Z0-9_]*` rather than `\bPANDA_KEY\b`. A word boundary
 * requires a non-word character on one side, and `_` is a word character — so
 * `\bPANDA_KEY\b` does NOT match `PANDA_KEY_default`, which is the only form
 * this identifier ever actually takes. That mistake made the rule silently
 * never fire.
 */
const KEY_CONTEXT = new RegExp(
  [
    "PANDA_KEY[A-Z0-9_]*",
    "PANDA_DEFAULT_KEY[A-Z0-9_]*",
    "\\bapi[_-]?key\\b",
    "\\bsecret[_-]?key\\b",
    "\\bencryption[_-]?key\\b",
    "\\bmaster[_-]?key\\b",
    "\\bprivate[_-]?key\\b",
    "\\bsigning[_-]?key\\b",
  ].join("|"),
  "i",
);

/** base64 of exactly 32 bytes. */
const BASE64_32 = /[A-Za-z0-9+/]{43}=/;

/** Obvious placeholders, which are the whole point of an example file. */
const PLACEHOLDER =
  /(changeme|change_me|your[_-]?key|placeholder|example|xxxx|<[^>]+>|\$\{|process\.env|os\.environ|getenv|\{\{)/i;

export const m001HardcodedKey: Rule = {
  id: "M001",
  severity: "critical",
  title: "Hardcoded encryption key",
  description:
    "A value that looks like a 32-byte base64 key is assigned to a key-shaped " +
    "variable. A key committed to source control cannot be rotated without " +
    "re-encrypting every record it protects.",
  remediation:
    "Read the key from the environment or a secret manager instead — " +
    "LocalKeyProvider for development, Vault or Infisical for production. " +
    "If this key ever protected real data, treat it as compromised and rotate it.",
  docsUrl: "https://github.com/jatimprovcsirt/panda-spec#key-management",

  appliesTo(file: ScanFile): boolean {
    // Skip the documentation bundle: it contains examples by design.
    return !file.relPath.startsWith("docs/") && !file.relPath.endsWith(".md");
  },

  check(file: ScanFile): RuleMatch[] {
    const matches: RuleMatch[] = [];

    file.content.split("\n").forEach((text, index) => {
      if (!KEY_CONTEXT.test(text)) return;
      if (!BASE64_32.test(text)) return;
      if (PLACEHOLDER.test(text)) return;

      // Deliberately no captured value in the message.
      matches.push({ line: index + 1 });
    });

    return matches;
  },
};
