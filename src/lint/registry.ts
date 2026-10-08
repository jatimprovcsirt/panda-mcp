/**
 * Rule registry.
 *
 * Adding a rule is adding it here. Nothing else discovers rules, so the
 * catalogue is readable in one place — which matters when the question is
 * "what does this tool actually check?".
 *
 * Every rule that ships must have positive, negative, and near-miss fixtures.
 * Near-miss fixtures are the false-positive guard, and they are mandatory:
 * a linter that cries wolf gets disabled, and a disabled linter is worse than
 * no linter because it implies review that did not happen.
 */

import { m001HardcodedKey } from "./rules/m001-hardcoded-key.js";
import { m002DecryptRaw } from "./rules/m002-decrypt-raw.js";
import { m003DemoToken } from "./rules/m003-demo-token.js";
import { m004PlaintextField } from "./rules/m004-plaintext-field.js";
import { m005DatabaseTls } from "./rules/m005-db-tls.js";
import type { Rule } from "./types.js";

/** v1 catalogue — the rules that ship with Tier 2. */
export const RULES: readonly Rule[] = [
  m001HardcodedKey,
  m002DecryptRaw,
  m003DemoToken,
  m004PlaintextField,
  m005DatabaseTls,
];

/**
 * Rules defined but not yet implemented. Listed so the gap is visible rather
 * than absent — `get_server_info` and the rule catalogue in the docs both
 * refer to these.
 */
export const PLANNED_RULES: ReadonlyArray<{ id: string; title: string }> = [
  { id: "M006", title: "Encrypted column with no blind-index column" },
  { id: "M007", title: "Blind index on a low-cardinality field" },
  { id: "M008", title: "Local key provider in a production configuration" },
  { id: "M009", title: "No audit logging configured" },
  { id: "M010", title: "Envelope column sized without tag expansion" },
  { id: "M011", title: "Bundled documentation version differs from the installed SDK" },
];

export function ruleById(id: string): Rule | undefined {
  return RULES.find((r) => r.id === id.toUpperCase());
}
