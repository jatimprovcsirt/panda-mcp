/**
 * M007 — blind index over a low-cardinality field.
 *
 * The subtle one. A blind index is deterministic — that is what makes it
 * searchable — so it leaks equality: two rows with the same index value have
 * the same plaintext. For a unique identifier like a NIK that leaks almost
 * nothing, because the value is unique anyway.
 *
 * For a field with four possible values it leaks almost everything. An index
 * on `golongan_darah` across ten thousand rows is a list of blood types; an
 * index on `agama` is a list of religions. The encryption on the primary
 * column still holds, but the index sitting beside it gives the value away —
 * and religion is a category UU PDP treats as sensitive on its own.
 *
 * The finding is not "remove the index". It is "this index may reveal more
 * than you intended", which is a judgement the developer has to make.
 */

import { normaliseFieldName } from "./m004-fields.js";
import type { Rule, RuleMatch, ScanFile } from "../types.js";

/**
 * Fields whose value set is small enough that an equality index is close to
 * publishing the value itself.
 *
 * Geographic fields are included because Indonesian administrative divisions
 * are coarse: a province index across one agency's data often narrows a person
 * to a handful of rows.
 */
const LOW_CARDINALITY_FIELDS: readonly string[] = [
  // Demographics
  "jeniskelamin",
  "gender",
  "agama",
  "religion",
  "statusperkawinan",
  "maritalstatus",
  "golongandarah",
  "bloodtype",
  "kewarganegaraan",
  "nationality",
  "kategoriumur",
  "agegroup",

  // Statuses
  "statusaktif",
  "isactive",
  "statusverifikasi",
  "jeniskeanggotaan",
];

/**
 * Administrative divisions, kept as their own list rather than mixed into the
 * one above.
 *
 * They need separate handling because the names are ordinary Indonesian words:
 * a column called `kota` in a logistics schema is a destination, not a
 * person's residence, and `desa` may be a branch name. These only count as
 * personal data when the file also looks like it holds people.
 */
const GEOGRAPHIC_FIELDS: readonly string[] = [
  "provinsi",
  "propinsi",
  "province",
  "kota",
  "kabupaten",
  "kecamatan",
  "kelurahan",
  "desa",
  "kodepos",
  "postalcode",
  "rw",
  "rt",
];

const LOW_CARDINALITY = new Set(LOW_CARDINALITY_FIELDS.map(normaliseFieldName));
const GEOGRAPHIC = new Set(GEOGRAPHIC_FIELDS.map(normaliseFieldName));

/** Evidence that a file is about people, not places. */
const PERSON_CONTEXT =
  /alamat|address|domisili|residence|penduduk|citizen|warga|karyawan|pegawai|pasien|siswa|nasabah/i;

/** A blind index declared next to a field name. */
const BLIND_INDEX_FOR_FIELD: readonly RegExp[] = [
  // Laravel: 'gender' => [ 'kid' => …, 'blind_index' => true ]
  /['"]([a-z0-9_-]+)['"]\s*=>\s*\[[^\]]*blind_?index/gi,
  // Column naming: gender_bidx
  /\b([a-z0-9_-]+)_bidx\b/gi,
  // Django: gender_idx = models.CharField(… db_index=True)
  /^\s*([a-z_][a-z0-9_]*)(?:_bidx|_idx)\s*=\s*models\.\w+Field\([^)]*db_index\s*=\s*True/gim,
  // Go/GORM tag: `db:"gender_bidx"`
  /db:"([a-z0-9_-]+)_bidx"/gi,
];

const EXEMPT_PATH =
  /(^|\/)(docs?|examples?|tests?|fixtures?)(\/|$)|\.md$|\.test\.|_test\.|\.spec\./i;

export const m007LowCardinalityIndex: Rule = {
  id: "M007",
  severity: "medium",
  title: "Blind index over a low-cardinality field",
  description:
    "A blind index is deterministic, so it reveals when two rows hold the same " +
    "value. For a unique identifier that reveals almost nothing; for a field " +
    "with a handful of possible values it effectively reveals the value itself, " +
    "even though the encrypted column beside it does not.",
  remediation:
    "If this field has few distinct values, drop the blind index and query it " +
    "another way — or accept the leak knowingly and suppress with a reason: " +
    "`// panda-mcp-ignore M007: <why the equality leak is acceptable here>`. " +
    "Note that some of these categories are sensitive under UU PDP regardless " +
    "of whether they identify anyone.",
  docsUrl: "https://github.com/jatimprovcsirt/panda-spec#blind-indexing",

  appliesTo(file: ScanFile): boolean {
    return !EXEMPT_PATH.test(file.relPath);
  },

  check(file: ScanFile): RuleMatch[] {
    const lines = new Set<number>();

    for (const pattern of BLIND_INDEX_FOR_FIELD) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(file.content)) !== null) {
        const name = match[1];
        if (name === undefined) continue;

        const normalised = normaliseFieldName(name);
        const isGeographic = GEOGRAPHIC.has(normalised);
        if (!LOW_CARDINALITY.has(normalised) && !isGeographic) continue;

        // A geographic name alone is not enough to call this personal data.
        if (isGeographic && !PERSON_CONTEXT.test(file.content)) continue;

        lines.add(file.content.slice(0, match.index).split("\n").length);
      }
    }

    return [...lines].sort((a, b) => a - b).map((line) => ({ line }));
  },
};
