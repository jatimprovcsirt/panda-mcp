/**
 * M010 — encrypted column declared with a plaintext-sized limit.
 *
 * An envelope is not the length of the value it holds. For plaintext of N
 * bytes the stored string is roughly:
 *
 *     base64(JSON wrapper + nonce + (N + 16-byte tag))
 *     ≈ 1.34 × N + 130
 *
 * A 16-digit NIK becomes around 150 characters. A 200-character address
 * becomes around 400. A `VARCHAR(16)` on a NIK column does not hold an
 * envelope at all — and depending on the database and strict mode, it either
 * rejects the insert or truncates it silently, leaving a value that can never
 * be decrypted.
 *
 * Silent truncation is the worse of the two outcomes, which is why this is
 * worth a rule rather than a documentation note.
 */

import { IDENTITY_FIELDS, normaliseFieldName } from "./m004-fields.js";
import type { Rule, RuleMatch, ScanFile } from "../types.js";

const IDENTITY = new Set(IDENTITY_FIELDS.map(normaliseFieldName));

/** Below this, no envelope of any realistic plaintext fits. */
const MINIMUM_ENVELOPE_LENGTH = 255;

/**
 * Column declarations carrying an explicit small length.
 *
 * Group 1 is the field name, group 2 the declared length.
 */
const SIZED_COLUMN_PATTERNS: readonly RegExp[] = [
  // Laravel: $table->string('nik', 16) / ->char('nik', 16)
  /\$table\s*->\s*(?:string|char)\s*\(\s*['"]([a-z0-9_-]+)['"]\s*,\s*(\d+)/gi,
  // SQL: nik VARCHAR(16) / nik CHARACTER VARYING(16)
  /\b([a-z_][a-z0-9_]*)\s+(?:VAR)?CHAR(?:ACTER VARYING)?\s*\(\s*(\d+)\s*\)/gi,
  // Prisma: nik String @db.VarChar(16)
  /([a-zA-Z_][a-zA-Z0-9_]*)\s+String\s+@db\.(?:Var)?Char\s*\(\s*(\d+)\s*\)/g,
  // Django: nik = models.CharField(max_length=16)
  /^\s*([a-z_][a-z0-9_]*)\s*=\s*models\.\w+Field\([^)]*max_length\s*=\s*(\d+)/gim,
];

const EXEMPT_PATH =
  /(^|\/)(docs?|examples?|tests?|fixtures?)(\/|$)|\.md$|\.test\.|_test\.|\.spec\./i;

export const m010ColumnSize: Rule = {
  id: "M010",
  severity: "low",
  title: "Encrypted column sized for plaintext",
  description:
    "A column that holds or will hold a PANDA envelope is declared with a " +
    "plaintext-sized limit. An envelope is roughly 1.34x the plaintext plus " +
    "about 130 characters of JSON and nonce overhead, so this limit cannot " +
    "hold one — the insert either fails or is truncated, and a truncated " +
    "envelope can never be decrypted.",
  remediation:
    "Widen the column to TEXT. If a length limit is required by your schema " +
    "conventions, derive it from the longest plaintext this field can hold: " +
    "roughly `1.34 x max_plaintext_length + 130`.",
  docsUrl: "https://github.com/jatimprovcsirt/panda-spec#envelope-format",

  appliesTo(file: ScanFile): boolean {
    return !EXEMPT_PATH.test(file.relPath);
  },

  check(file: ScanFile): RuleMatch[] {
    const hits = new Map<number, string>();

    for (const pattern of SIZED_COLUMN_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(file.content)) !== null) {
        const fieldName = match[1];
        const length = Number(match[2]);
        if (fieldName === undefined || !Number.isFinite(length)) continue;
        if (length >= MINIMUM_ENVELOPE_LENGTH) continue;

        // Only fields that look like identifiers.
        //
        // An earlier version also fired when the *file* mentioned PANDA, on the
        // reasoning that a PANDA file's columns hold envelopes. That was wrong,
        // and running the rule against the SDK repositories showed why: PANDA's
        // own bookkeeping table declares `table_name VARCHAR(128)` and
        // `column_name VARCHAR(128)`, which hold a table name and a column name.
        // Nothing about a file using PANDA makes every small column in it an
        // envelope — that inference produced four false positives per SDK repo.
        if (!IDENTITY.has(normaliseFieldName(fieldName))) continue;

        const line = file.content.slice(0, match.index).split("\n").length;
        hits.set(line, `Declared length ${length}; an envelope for this field will not fit.`);
      }
    }

    return [...hits.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([line, message]) => ({ line, message }));
  },
};