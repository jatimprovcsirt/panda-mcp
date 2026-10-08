/**
 * M004 — personal-data field names.
 *
 * ⚠️  THIS LIST NEEDS DOMAIN REVIEW. See the note at the bottom of this file.
 *
 * Kept separate from the rule logic on purpose: this is domain knowledge that
 * a data-protection officer can review and extend without reading or
 * understanding any code. Everything here is data.
 */

/**
 * Field names that identify a person, or describe one.
 *
 * Matching is on normalised names — lowercase, with separators removed — so
 * `nomor_kk`, `nomorKK`, `nomor-kk`, and `NomorKK` all match `nomorkk`.
 */
export const IDENTITY_FIELDS: readonly string[] = [
  // Indonesian national identifiers
  "nik", // Nomor Induk Kependudukan
  "nomornik",
  "ktp", // the physical identity card — holds either the NIK or a photo
  "noktp",
  "nomorktp",
  "nokk", // Nomor Kartu Keluarga
  "nomorkk",
  "kartukeluarga",
  "npwp", // tax identifier
  "nomornpwp",
  "nib", // business identifier
  "sim", // driving licence
  "nomorsim",
  "paspor",
  "nomorpaspor",
  "passport",
  "nisn", // student identifier
  "nis",
  "nip", // civil servant identifier

  // Names
  "nama",
  "namalengkap",
  "namaibu", // mother's maiden name — a common identity-check answer
  "namaibukandung",
  "ibukandung",
  "fullname",

  // Dates and places of birth
  "tanggallahir",
  "tgllahir",
  "birthdate",
  "birthday",
  "dob",
  "tempatlahir",
  "birthplace",

  // Contact
  "alamat",
  "alamatlengkap",
  "address",
  "nohp",
  "nomorhp",
  "notelepon",
  "nomortelepon",
  "telepon",
  "phone",
  "phonenumber",
  "email",
  "alamatemail",

  // Health insurance
  "bpjs",
  "nobpjs",
  "nomorbpjs",
  "kis", // Kartu Indonesia Sehat
];

/**
 * Personal data under UU PDP's specific categories, and health data.
 *
 * Also the *column names* these tend to appear under in Indonesian systems.
 */
export const SENSITIVE_FIELDS: readonly string[] = [
  // Health
  "diagnosa",
  "diagnosis",
  "penyakit",
  "riwayatpenyakit",
  "riwayatkesehatan",
  "obat",
  "resep",
  "hasillab",
  "norekam",
  "nomorrekammedis",
  "rekammedis",
  "medicalrecord",
  "pasien",
  "patient",
  "golongandarah",
  "bloodtype",
  "kehamilan",
  "disabilitas",

  // Biometric and genetic
  "biometrik",
  "biometric",
  "sidikjari",
  "fingerprint",
  "fotoktp",
  "wajah",
  "faceid",
  "genetika",
  "dna",

  // Financial
  "norek", // Nomor Rekening — the everyday abbreviation in Indonesian systems
  "norekening",
  "nomorrekening",
  "rekening",
  "bankaccount",
  "accountnumber",
  "gaji",
  "penghasilan",
  "salary",

  // Beliefs and family — explicitly protected categories
  "agama",
  "religion",
  "statusperkawinan",
  "maritalstatus",
  "pekerjaan",
  "occupation",

  // Children
  "dataanak",
  "namasekolah",
  "sekolah",
];

/** Everything M004 looks for. */
export const ALL_FIELDS: readonly string[] = [...IDENTITY_FIELDS, ...SENSITIVE_FIELDS];

/**
 * Normalise a field name so separator style does not matter.
 *
 * `nomor_kk`, `nomorKK`, `nomor-kk` and `nomor kk` all become `nomorkk`.
 */
export function normaliseFieldName(raw: string): string {
  return raw.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

const NORMALISED = new Set(ALL_FIELDS.map(normaliseFieldName));

/**
 * True when a declared field name looks like personal data.
 *
 * There is deliberately **no minimum length** here. Membership in the curated
 * list is the check, and a length floor on top of it is redundancy that can
 * only cause harm: it would silently disable any short entry someone adds, with
 * nothing to indicate the entry is unreachable.
 *
 * How long a name must be is a question for the list, not for a filter. If a
 * name is too collision-prone to match, leave it out of the list — where the
 * decision is visible — rather than letting a guard quietly overrule it.
 */
export function isPersonalDataField(raw: string): boolean {
  const normalised = normaliseFieldName(raw);
  if (normalised.length === 0) return false;
  return NORMALISED.has(normalised);
}

// ---------------------------------------------------------------------------
// ⚠️  NEEDS DOMAIN REVIEW
//
// This list was seeded from PANDA's own documentation, UU PDP's categories, and
// common Indonesian government field naming. It has NOT been reviewed by
// anyone with data-protection expertise.
//
// Two known limitations:
//
//   1. It is Indonesian-centric. Agencies with regional naming conventions, or
//      with English-language schemas, will need additions.
//
//   2. Some entries are broad. `nama`, `alamat`, and `pekerjaan` are extremely
//      common column names and will match fields that are not personal data in
//      the relevant sense (a product name, a warehouse address). M004 mitigates
//      this by only firing when a file declares such a field AND never mentions
//      PANDA — but the list itself is still the source of most false positives.
//
//   3. Two-letter names are excluded on purpose. `kk` (Kartu Keluarga) is a
//      genuine field name and an obvious candidate, but at two characters it is
//      too likely to collide with an unrelated abbreviation to be worth the
//      noise. The longer spellings — `nokk`, `nomorkk`, `kartukeluarga` — are
//      in the list instead. Revisit if `nokk` proves too narrow in practice.
//
// Review this file before enabling M004 on a real codebase. A rule that cries
// wolf gets disabled, and this is the rule most likely to do it.
// ---------------------------------------------------------------------------
