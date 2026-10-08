/**
 * M002 — full-plaintext decryption without acknowledgement.
 *
 * `decryptRaw()` exists because some call sites genuinely need the full value.
 * It is also the single method that defeats PANDA's masked-by-default design,
 * so every use should be a deliberate one that a reviewer can see.
 *
 * The suppression mechanism doubles as the intentional marker:
 *
 *     // panda-mcp-ignore M002: full value required for the export endpoint
 *     const raw = cipher.decryptRaw(envelope);
 *
 * Requiring a written justification is what separates acknowledgement from a
 * mute button. A bare suppression with no reason is rejected by the
 * suppression parser and reported as invalid.
 *
 * This rule fires often by design. A project that reports twenty M002s and
 * suppresses none of them has twenty unmasked read sites, which is exactly
 * what a reviewer should be shown.
 */

import type { Rule, RuleMatch, ScanFile } from "../types.js";

/**
 * The method across all four SDKs.
 *
 * The optional `->` or `.` prefix matters: PHP calls it as
 * `$cipher->decryptRaw(...)`, and a pattern requiring a literal `.` silently
 * misses every PHP call site — the language PANDA's largest audience uses.
 */
const CALL = /(?:->|\.)?\bdecrypt_?raw\s*\(/i;

/**
 * A definition is not a call site.
 *
 * `public function decryptRaw(Envelope $e)` declares the method; it does not
 * unmask anything. Without this guard the rule flags every SDK's own
 * implementation of the method it exists to report.
 */
const DECLARATION = /\b(function|func|def)\b[^\n]*\bdecrypt_?raw\s*\(/i;

/**
 * Files where naming the method is the point.
 *
 * `tests?` rather than `test` — the earlier spelling required a separator
 * right after "test", so `tests/Unit/Foo.php` matched nothing and every test
 * file in every PHP project was scanned. The most common directory name in
 * the language is `tests`, plural.
 */
const EXEMPT_PATH =
  /(^|\/)(docs?|examples?|tests?|spec|__tests__)(\/|$)|\.md$|\.test\.|_test\.|\.spec\./i;

export const m002DecryptRaw: Rule = {
  id: "M002",
  severity: "high",
  title: "Full plaintext decryption",
  description:
    "A call to the unmasking method. PANDA returns masked values by default; " +
    "this call site deliberately bypasses that and returns the full value, " +
    "which then flows into whatever the caller does with it.",
  remediation:
    "Use decrypt() unless the full value is genuinely required — it returns a " +
    "masked value suitable for API responses and logs. If the full value is " +
    "needed, add a suppression with a reason on the line above so the decision " +
    "is visible in review: " +
    "`// panda-mcp-ignore M002: <why the full value is required>`",
  docsUrl: "https://github.com/jatimprovcsirt/panda-spec#masking",

  appliesTo(file: ScanFile): boolean {
    return !EXEMPT_PATH.test(file.relPath);
  },

  check(file: ScanFile): RuleMatch[] {
    const matches: RuleMatch[] = [];

    file.content.split("\n").forEach((text, index) => {
      if (DECLARATION.test(text)) return;
      if (CALL.test(text)) matches.push({ line: index + 1 });
    });

    return matches;
  },
};
