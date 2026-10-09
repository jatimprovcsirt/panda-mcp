/**
 * M003 — demo token in a non-development configuration.
 *
 * PANDA ships a static demo token so development is not blocked on the
 * registration portal. It grants nothing — it satisfies the `init` token check
 * and carries no organisational identity — but finding it in a production
 * configuration means the deployment was never properly registered, and
 * nobody noticed.
 *
 * The severity is high rather than critical precisely because it grants no
 * privilege. It is a compliance signal, not a security hole, and saying so
 * honestly is more useful than inflating it.
 */

import { isConfigurationSurface, isDevelopmentPath } from "../config-surface.js";
import type { Rule, RuleMatch, ScanFile } from "../types.js";

const DEMO_TOKEN = /panda_demo_[a-f0-9]{48}/;

export const m003DemoToken: Rule = {
  id: "M003",
  severity: "high",
  title: "Demo token outside development",
  description:
    "The static PANDA demo token appears in a configuration that does not look " +
    "like development. The token carries no organisational identity, so its " +
    "presence means this deployment was never registered as an application.",
  remediation:
    "Register the application in the PANDA portal and replace this with a " +
    "panda_live_ token. Until the portal is available, treat this as a " +
    "tracked item rather than leaving it silently in place.",
  docsUrl: "https://github.com/jatimprovcsirt/panda-spec#demo-token",

  appliesTo(file: ScanFile): boolean {
    if (isDevelopmentPath(file.relPath)) return false;
    return isConfigurationSurface(file.relPath);
  },

  check(file: ScanFile): RuleMatch[] {
    const matches: RuleMatch[] = [];

    file.content.split("\n").forEach((text, index) => {
      if (DEMO_TOKEN.test(text)) matches.push({ line: index + 1 });
    });

    return matches;
  },
};
