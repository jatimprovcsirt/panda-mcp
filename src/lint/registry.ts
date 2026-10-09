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
import { m006MissingBlindIndex } from "./rules/m006-missing-blind-index.js";
import { m007LowCardinalityIndex } from "./rules/m007-low-cardinality-index.js";
import { m008LocalProviderInProd } from "./rules/m008-local-provider-in-prod.js";
import { m009NoAuditLog } from "./rules/m009-no-audit-log.js";
import { m010ColumnSize } from "./rules/m010-column-size.js";
import { m011DocsVersionDrift } from "./rules/m011-docs-version-drift.js";
import type { ProjectRule, Rule } from "./types.js";

/** v1 catalogue — the rules that ship with Tier 2. */
export const RULES: readonly Rule[] = [
  m001HardcodedKey,
  m002DecryptRaw,
  m003DemoToken,
  m004PlaintextField,
  m005DatabaseTls,
  m006MissingBlindIndex,
  m007LowCardinalityIndex,
  m008LocalProviderInProd,
  m010ColumnSize,
];

/**
 * Rules that need the whole project.
 *
 * Kept separate because they are asked a different question. `appliesTo` here
 * decides whether the project is in scope at all — M009 must not tell a
 * repository that has never heard of PANDA that it lacks PANDA audit logging.
 */
export const PROJECT_RULES: readonly ProjectRule[] = [m009NoAuditLog, m011DocsVersionDrift];

export function ruleById(id: string): Rule | undefined {
  return RULES.find((r) => r.id === id.toUpperCase());
}
