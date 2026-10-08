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

import type { Rule, RuleMatch, ScanFile } from "../types.js";

const DEMO_TOKEN = /panda_demo_[a-f0-9]{48}/;

/**
 * Paths where a demo token is expected and correct.
 *
 * `staging` is deliberately absent: staging is not development, and a demo
 * token there means the same registration gap as production.
 *
 * `tests?` rather than `test` — with the earlier spelling, `tests/Unit/Foo.php`
 * matched nothing and every test file was scanned.
 */
const DEVELOPMENT_PATH =
  /(^|\/)(\.env\.example|\.env\.sample|docs?|examples?|samples?|fixtures?|tests?|spec|__tests__)(\/|$)|(^|[./_-])(dev|local|mock)([./_-]|$)|\.md$/i;

/**
 * Configuration surfaces only.
 *
 * The SDK defines the demo token as a public constant
 * (`public const DEMO_TOKEN = 'panda_demo_…'`), and its telemetry client
 * references it. Those are definitions, not deployments, and flagging them
 * made this rule fire on every PANDA repository.
 *
 * A demo token matters when it reaches a *configuration* — a manifest, a
 * deployment file, a config directory. Restricting the rule to configuration
 * surfaces is what its own description already claimed it did.
 */
const CONFIG_EXTENSION = /\.(ya?ml|json|toml|ini|conf|properties|xml|tf|env)$/i;

function isConfigurationSurface(relPath: string): boolean {
  if (CONFIG_EXTENSION.test(relPath)) return true;
  if (/(^|\/)(config|configs|deploy|deployment|deployments|k8s|kubernetes|helm|infra)\//i.test(relPath))
    return true;
  return /(^|\/)[^/]*config[^/]*$/i.test(relPath);
}

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
    if (DEVELOPMENT_PATH.test(file.relPath)) return false;
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
