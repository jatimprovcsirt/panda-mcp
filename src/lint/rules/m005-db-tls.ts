/**
 * M005 — TLS certificate verification disabled.
 *
 * PANDA encrypts fields at rest. That does nothing for a connection whose
 * certificate is not verified: the database link carries plaintext on the way
 * in and out, and so does every other outbound connection. Disabling
 * verification is a common shortcut taken to make a self-signed certificate
 * work, and it is usually left in place long after.
 *
 * SCOPE, stated honestly: this rule was originally described as a *database*
 * check, but `InsecureSkipVerify: true` is not database-specific — it matches
 * a Vault client, an HTTP client, anything. Rather than narrow the pattern
 * (which would miss the same mistake in a different driver), the rule is
 * broadened and named for what it actually detects.
 *
 * Consequence: a project that deliberately offers an insecure option — PANDA's
 * own `PANDA_VAULT_INSECURE` is one — will be flagged. That is intentional.
 * The finding asks the developer to acknowledge the decision with a reason:
 *
 *     // panda-mcp-ignore M005: opt-in escape hatch for self-signed Vault in dev
 *
 * An unacknowledged insecure TLS path and an acknowledged one look identical
 * in a diff, and only one of them was a decision.
 */

import type { Rule, RuleMatch, ScanFile } from "../types.js";

const INSECURE_PATTERNS: ReadonlyArray<{ pattern: RegExp; driver: string }> = [
  // Node — pg, mysql2, tedious
  { pattern: /rejectUnauthorized\s*:\s*false/, driver: "Node.js driver" },
  { pattern: /ssl\s*:\s*\{[^}]*rejectUnauthorized\s*:\s*false/, driver: "Node.js driver" },
  { pattern: /trustServerCertificate\s*:\s*true/, driver: "tedious/mssql" },

  // Go — database/sql drivers
  { pattern: /InsecureSkipVerify\s*:\s*true/, driver: "Go TLS config" },
  { pattern: /tls\s*=\s*false/i, driver: "Go pq/mysql DSN" },

  // libpq / PostgreSQL connection strings
  { pattern: /sslmode\s*=\s*disable/i, driver: "libpq" },
  { pattern: /sslmode\s*=\s*allow/i, driver: "libpq" },
  { pattern: /sslmode\s*=\s*prefer/i, driver: "libpq" },

  // MySQL
  { pattern: /ssl-mode\s*=\s*DISABLED/i, driver: "MySQL" },
  { pattern: /verifyServerCertificate\s*=\s*false/i, driver: "MySQL JDBC" },
  { pattern: /MYSQL_ATTR_SSL_VERIFY_SERVER_CERT\s*=>\s*false/, driver: "PDO MySQL" },

  // Python
  { pattern: /sslmode\s*=\s*['"]disable['"]/i, driver: "psycopg/asyncpg" },
  { pattern: /ssl\s*=\s*False/, driver: "Python driver" },

  // .NET
  { pattern: /TrustServerCertificate\s*=\s*True/i, driver: ".NET SqlClient" },
];

/** Files where these strings are documentation rather than configuration. */
const EXEMPT_PATH = /(^|\/)(docs?|examples?)(\/|$)|\.md$/i;

export const m005DatabaseTls: Rule = {
  id: "M005",
  severity: "high",
  title: "TLS certificate verification disabled",
  description:
    "Certificate verification is turned off on a connection. Field encryption " +
    "protects data at rest; an unverified TLS link can still be intercepted, " +
    "which defeats the point of using TLS at all.",
  remediation:
    "Enable certificate verification and point the client at your CA bundle. " +
    "If a self-signed certificate is why this was disabled, install the CA " +
    "certificate on the host instead — disabling verification removes the " +
    "protection rather than working around it. If this is a deliberate, " +
    "documented escape hatch, acknowledge it: " +
    "`// panda-mcp-ignore M005: <why this insecure path exists>`",
  docsUrl: "https://github.com/jatimprovcsirt/panda-spec#tls",

  appliesTo(file: ScanFile): boolean {
    return !EXEMPT_PATH.test(file.relPath);
  },

  check(file: ScanFile): RuleMatch[] {
    const matches: RuleMatch[] = [];

    file.content.split("\n").forEach((text, index) => {
      const hit = INSECURE_PATTERNS.find((p) => p.pattern.test(text));
      if (hit) {
        matches.push({ line: index + 1, message: `Detected in ${hit.driver} configuration.` });
      }
    });

    return matches;
  },
};
