/**
 * M004 — personal-data field declared in a file that never mentions PANDA.
 *
 * FORMULATION MATTERS HERE. The obvious rule — "find personal-data fields and
 * report them" — would fire on every model, migration, form request, and
 * serialiser in a codebase, which is dozens of findings on a project that is
 * already using PANDA correctly. That rule gets disabled within a day.
 *
 * This rule fires only when a file declares a known personal-data field **and
 * never references PANDA anywhere in the file**. That is a much narrower
 * claim: "this model handles NIK and nothing in it has anything to do with
 * encryption." It still produces false positives — a read-only DTO that
 * receives already-decrypted data, for instance — but the ratio is far better,
 * and the finding is worth a look every time it appears.
 *
 * The field list itself lives in ./m004-fields.ts, separate from this logic,
 * so a data-protection officer can review it without reading code.
 */

import { isPersonalDataField } from "./m004-fields.js";
import type { Rule, RuleMatch, ScanFile } from "../types.js";

/** Any reference to PANDA anywhere in the file exempts it. */
const PANDA_REFERENCE = /\bpanda\b|Encrypted(Cast|Field)|FieldCipher|BlindIndex/i;

/** Paths where a field list is expected and not an encryption decision. */
const EXEMPT_PATH =
  /(^|\/)(docs?|examples?|fixtures?|seeders?|seeds?|mocks?)(\/|$)|\.md$|\.test\.|_test\.|\.spec\./i;

/**
 * Field declarations across the ORMs the SDK integrates with.
 *
 * Each pattern captures a candidate name in group 1. Kept as a plain list so
 * adding a framework is a one-line change.
 */
const DECLARATION_PATTERNS: readonly RegExp[] = [
  // Eloquent: $fillable = ['nik', ...] / $casts = ['nik' => ...]
  /['"]([a-z0-9_-]+)['"]\s*(?:=>|,)/gi,
  // Laravel migration: $table->string('nik')
  /\$table\s*->\s*\w+\s*\(\s*['"]([a-z0-9_-]+)['"]/gi,
  // Prisma / TypeORM / general JS object key: nik: string
  /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*[?:]?\s*:\s*(?:string|String|varchar|text)/gm,
  // Go struct field with a db/json tag: NIK string `db:"nik"`
  /^\s*([A-Z][A-Za-z0-9_]*)\s+\w+\s+`[^`]*\b(?:db|json|gorm):"([a-z0-9_-]+)/gm,
  // Python / Django: nik = models.CharField(...)
  /^\s*([a-z_][a-z0-9_]*)\s*=\s*models\.\w+Field/gm,
];

export const m004PlaintextField: Rule = {
  id: "M004",
  severity: "high",
  title: "Personal-data field with no PANDA reference",
  description:
    "A field with a name that indicates personal data is declared here, and " +
    "this file contains no reference to PANDA at all. Either the field is " +
    "stored in plaintext, or it is handled elsewhere and this file is a " +
    "pass-through — both are worth confirming.",
  remediation:
    "If this field stores personal data, apply the PANDA encrypted field " +
    "mechanism for your framework and add a blind-index column if it needs " +
    "exact-match search. If this field is a read-only DTO receiving " +
    "already-decrypted values, suppress the finding with a reason: " +
    "`// panda-mcp-ignore M004: <why this field is not stored here>`",
  docsUrl: "https://github.com/jatimprovcsirt/panda-spec#field-encryption",

  appliesTo(file: ScanFile): boolean {
    if (EXEMPT_PATH.test(file.relPath)) return false;
    // The whole point of the narrow formulation.
    return !PANDA_REFERENCE.test(file.content);
  },

  check(file: ScanFile): RuleMatch[] {
    const hits = new Set<number>();

    for (const pattern of DECLARATION_PATTERNS) {
      // Patterns carry /g, so reset before each file to avoid lastIndex leakage
      // between files — a classic source of "works on the second run only".
      pattern.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = pattern.exec(file.content)) !== null) {
        // Group 2 exists for the Go tag form; otherwise group 1 is the name.
        const candidate = match[2] ?? match[1];
        if (candidate === undefined) continue;
        if (!isPersonalDataField(candidate)) continue;

        const line = file.content.slice(0, match.index).split("\n").length;
        hits.add(line);
      }
    }

    // One finding per line, even if several patterns matched it.
    return [...hits].sort((a, b) => a - b).map((line) => ({ line }));
  },
};
