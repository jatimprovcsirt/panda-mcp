/**
 * M006 — identity field encrypted without a blind index.
 *
 * FORMULATION, because the obvious version of this rule is unusable.
 *
 * "Encrypted field with no blind-index column" would fire on every encrypted
 * field in the project — most of which correctly have none. A health diagnosis
 * is encrypted and is never looked up by exact match; a blind index on it
 * would be pure cost. Reporting it would train people to ignore the rule.
 *
 * So the scope is narrower: only fields whose *names* appear in M004's identity
 * list — NIK, KK, NPWP, and the rest of the identifiers that exist to be looked
 * up by. Those are the ones where a missing blind index is a real problem,
 * because the index is immutable: adding it later means reindexing every row,
 * and rows indexed under a different key never match.
 *
 * The finding is deliberately worded as a conditional. This rule cannot know
 * whether the project ever looks the field up — it knows only that if it ever
 * does, it will not work.
 */

import { IDENTITY_FIELDS, normaliseFieldName } from "./m004-fields.js";
import type { Rule, RuleMatch, ScanFile } from "../types.js";

const IDENTITY = new Set(IDENTITY_FIELDS.map(normaliseFieldName));

/** Does this file use PANDA at all? */
const PANDA_REFERENCE = /\bpanda\b|EncryptedCast|EncryptedField|FieldCipher/i;

/** Declares a blind index for a field. */
const BLIND_INDEX_DECLARED = /blind_?index|_bidx|BlindIndex/i;

/**
 * Field declarations, same shapes M004 looks for.
 *
 * Only used to find *encrypted* field names here, so the capture must sit in a
 * context that implies encryption rather than a bare field list.
 */
const ENCRYPTED_FIELD_PATTERNS: readonly RegExp[] = [
  // Laravel: 'nik' => EncryptedCast::class . ':kid'
  /['"]([a-z0-9_-]+)['"]\s*=>\s*EncryptedCast/g,
  // Laravel encryptedFields config: 'nik' => ['kid' => …]
  /['"]([a-z0-9_-]+)['"]\s*=>\s*\[\s*['"]kid['"]/g,
  // Python: nik = EncryptedField(kid="…")
  /^\s*([a-z_][a-z0-9_]*)\s*=\s*EncryptedField\s*\(/gm,
  // Node: nik: EncryptedField(...) / encryptedFields: ['nik']
  /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*EncryptedField/gm,
];

const EXEMPT_PATH =
  /(^|\/)(docs?|examples?|tests?|fixtures?)(\/|$)|\.md$|\.test\.|_test\.|\.spec\./i;

export const m006MissingBlindIndex: Rule = {
  id: "M006",
  severity: "medium",
  title: "Identity field encrypted without a blind index",
  description:
    "A field that looks like an identifier is encrypted here, and this file " +
    "declares no blind index for it. Without one, an exact-match lookup on the " +
    "encrypted column will not match anything.",
  remediation:
    "If this field is ever looked up by value, add a blind index now. It is " +
    "derived from the value and the key, so it cannot be changed later without " +
    "re-indexing every row. If the field is written and never searched, this is " +
    "fine — suppress it with a reason: " +
    "`// panda-mcp-ignore M006: <why this field is never looked up>`",
  docsUrl: "https://github.com/jatimprovcsirt/panda-spec#blind-indexing",

  appliesTo(file: ScanFile): boolean {
    if (EXEMPT_PATH.test(file.relPath)) return false;
    if (!PANDA_REFERENCE.test(file.content)) return false;
    // A file that configures a blind index somewhere is doing the right thing;
    // per-field pairing is not something a regex can resolve reliably.
    return !BLIND_INDEX_DECLARED.test(file.content);
  },

  check(file: ScanFile): RuleMatch[] {
    const lines = new Set<number>();

    for (const pattern of ENCRYPTED_FIELD_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(file.content)) !== null) {
        const name = match[1];
        if (name === undefined) continue;
        if (!IDENTITY.has(normaliseFieldName(name))) continue;
        lines.add(file.content.slice(0, match.index).split("\n").length);
      }
    }

    return [...lines].sort((a, b) => a - b).map((line) => ({ line }));
  },
};
