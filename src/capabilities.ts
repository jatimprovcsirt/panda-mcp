/**
 * Single source of truth for which tools this server exposes.
 *
 * Both tool registration (index.ts) and `get_server_info` read from here, so
 * the reported capability set can never disagree with what is actually
 * registered.
 *
 * `--docs-only` is not cosmetic: a model cannot call a tool that was never
 * registered. Dropping Tier 2 here is a real reduction in the surface a
 * scanning tool can reach, not a display preference. See PRD Section 5.3.
 */

/** Documentation tools. Always available. */
export const TIER1_TOOL_NAMES = [
  "search_docs",
  "get_api_reference",
  "get_setup_guide",
  "compare_key_providers",
  "get_envelope_spec",
  "get_server_info",
] as const;

/**
 * Validation and scaffolding tools. Read local files, so they are gated.
 *
 * Note what is NOT in this list, and never will be: encrypt, decrypt, mask,
 * blind_index. The server performs no cryptographic operation and holds no
 * key. See PRD Section 6.
 */
export const TIER2_TOOL_NAMES = [
  "validate_implementation",
  "explain_envelope",
  "scaffold_integration",
] as const;

export type Tier1ToolName = (typeof TIER1_TOOL_NAMES)[number];
export type Tier2ToolName = (typeof TIER2_TOOL_NAMES)[number];
export type ToolName = Tier1ToolName | Tier2ToolName;

export interface ServerCapabilities {
  /** True when started with --docs-only. */
  readonly docsOnly: boolean;
  /** Tools that will be registered. */
  readonly registered: readonly ToolName[];
  /** Tools deliberately withheld. Empty unless docsOnly. */
  readonly withheld: readonly Tier2ToolName[];
}

export function resolveCapabilities(docsOnly: boolean): ServerCapabilities {
  return {
    docsOnly,
    registered: docsOnly
      ? [...TIER1_TOOL_NAMES]
      : [...TIER1_TOOL_NAMES, ...TIER2_TOOL_NAMES],
    withheld: docsOnly ? [...TIER2_TOOL_NAMES] : [],
  };
}

export function isTier2Enabled(docsOnly: boolean): boolean {
  return !docsOnly;
}

/**
 * Human-readable form of the capability statement.
 *
 * Published verbatim in the README and repeated in every tool description
 * (PRD FR-M28). The claims are falsifiable on purpose — `docs/security/
 * VERIFYING.md` explains how to check each one against the source.
 */
export const CAPABILITY_STATEMENT =
  "This server reads files under the project root you configure. " +
  "It never writes any file. It makes no network requests. " +
  "It never holds, reads, requests, or has access to an encryption key. " +
  "It performs no cryptographic operation.";
