/**
 * M009 — PANDA is in use but no audit logging is configured.
 *
 * A project-level rule, because the question is about the project. Asking it
 * of one file at a time would fire on whichever file happened to be scanned
 * first — wrong, and different depending on directory order.
 *
 * The rule only runs at all when the project actually references PANDA. A
 * repository that has never heard of it should not be told it lacks PANDA
 * audit logging.
 *
 * Reported once, against the file that constructs the cipher, so the location
 * is stable and points at something the developer can act on.
 */

import type { ProjectContext, ProjectMatch, ProjectRule, ScanFile } from "../types.js";

const PANDA_REFERENCE = /\bpanda\b|EncryptedCast|EncryptedField|FieldCipher|BlindIndex/i;

/**
 * Evidence that audit logging is wired up.
 *
 * Intentionally broad. The cost of a false negative here is a missing nudge;
 * the cost of a false positive is a project that configured auditing being
 * told it did not, which makes the whole check untrustworthy.
 */
const AUDIT_EVIDENCE: readonly RegExp[] = [
  /\baudit\w*\b/i,
  /\bAuditLogger\b/,
  /decryptRaw|decrypt_raw|DecryptRaw/,
  /\blog(ging)?_(channel|driver|sink)\b/i,
  /\bPANDA_AUDIT\b/i,
];

/** Files that construct the cipher — the natural place for the finding. */
const CONSTRUCTION_SITE: readonly RegExp[] = [
  /new\s+FieldCipher\s*\(/,
  /crypto\.NewFieldCipher\s*\(/,
  /PandaModule\.forRoot\s*\(/,
  /PandaServiceProvider/,
  /new\s+FieldCipher/,
  /createKeyProvider\s*\(/,
];

const EXEMPT_PATH =
  /(^|\/)(docs?|examples?|tests?|fixtures?)(\/|$)|\.md$|\.test\.|_test\.|\.spec\./i;

function findConstructionSite(files: readonly ScanFile[]): ScanFile | undefined {
  return files.find(
    (f) =>
      !EXEMPT_PATH.test(f.relPath) &&
      PANDA_REFERENCE.test(f.content) &&
      CONSTRUCTION_SITE.some((p) => p.test(f.content)),
  );
}

export const m009NoAuditLog: ProjectRule = {
  id: "M009",
  severity: "low",
  title: "No audit logging configured",
  description:
    "PANDA is in use in this project, and nothing in it appears to configure " +
    "audit logging. Every call that returns a full unmasked value is supposed " +
    "to leave a record — that record is what answers \"who read this citizen's " +
    "data, and when\" during a UU PDP audit.",
  remediation:
    "Configure the audit logger where the cipher is constructed. If auditing " +
    "happens somewhere this check cannot see — a framework event listener, an " +
    "external log pipeline — suppress with a reason: " +
    "`// panda-mcp-ignore M009: <where auditing is configured>`",
  docsUrl: "https://github.com/jatimprovcsirt/panda-spec#audit",

  appliesTo(project: ProjectContext): boolean {
    // Only a project that uses PANDA at all.
    if (!project.files.some((f) => PANDA_REFERENCE.test(f.content))) return false;

    // And only when nothing anywhere mentions auditing.
    return !project.files.some((f) => AUDIT_EVIDENCE.some((p) => p.test(f.content)));
  },

  check(project: ProjectContext): ProjectMatch[] {
    const site = findConstructionSite(project.files);

    // Without a construction site there is no useful place to point at. The
    // project uses PANDA but this rule cannot say where — better to stay quiet
    // than to attach the finding to an arbitrary file.
    if (!site) return [];

    return [{ file: site.relPath, line: 1 }];
  },
};
