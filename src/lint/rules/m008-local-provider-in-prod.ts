/**
 * M008 — local key provider wired into a non-development configuration.
 *
 * `LocalKeyProvider` reads keys from environment variables. That is the right
 * choice for development and a poor one for a deployment: environment
 * variables leak through `docker inspect`, crash dumps, `/proc/<pid>/environ`,
 * process listings in some configurations, and any error reporter that
 * serialises its context. They also cannot be rotated without a redeploy, and
 * there is no audit trail of who read them.
 *
 * The rule is deliberately narrow: it only looks at configuration surfaces,
 * and never at anything on a development path. `PANDA_KEY_PROVIDER_DRIVER=local`
 * in `.env.example` is exactly what should be there.
 */

import { isConfigurationSurface, isDevelopmentPath } from "../config-surface.js";
import type { Rule, RuleMatch, ScanFile } from "../types.js";

/** The driver set to local, in the forms it is actually written. */
const LOCAL_DRIVER_PATTERNS: readonly RegExp[] = [
  /PANDA_KEY_PROVIDER_DRIVER\s*[:=]\s*["']?local\b/i,
  /["']key_provider_driver["']\s*:\s*["']local["']/i,
  /keyProvider\s*[:=]\s*["']local["']/,
  /PROVIDER_DRIVER\s*[:=]\s*["']?local\b/i,
];

export const m008LocalProviderInProd: Rule = {
  id: "M008",
  severity: "medium",
  title: "Local key provider outside development",
  description:
    "This configuration selects the environment-variable key provider. In a " +
    "deployment that means the encryption key lives in the process environment, " +
    "where it can surface in container inspection, crash dumps, process " +
    "listings, and error reports — and where it cannot be rotated without a " +
    "redeploy.",
  remediation:
    "Use a secret manager for anything beyond local development: Vault or " +
    "Infisical both have a PANDA key provider. If this file is a template or a " +
    "development overlay that the path does not make obvious, move it under a " +
    "path containing `dev`, or suppress with a reason: " +
    "`# panda-mcp-ignore M008: <why local is correct here>`",
  docsUrl: "https://github.com/jatimprovcsirt/panda-spec#key-management",

  appliesTo(file: ScanFile): boolean {
    if (isDevelopmentPath(file.relPath)) return false;
    return isConfigurationSurface(file.relPath);
  },

  check(file: ScanFile): RuleMatch[] {
    const matches: RuleMatch[] = [];

    file.content.split("\n").forEach((text, index) => {
      // A commented-out line is not a setting.
      if (/^\s*(#|\/\/|--)/.test(text)) return;
      if (LOCAL_DRIVER_PATTERNS.some((p) => p.test(text))) {
        matches.push({ line: index + 1 });
      }
    });

    return matches;
  },
};
