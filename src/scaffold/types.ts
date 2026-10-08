/**
 * Scaffold model.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  DESIGN DECISION: this generator NEVER WRITES.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `scaffold_integration` returns a proposal. The assistant that called it then
 * uses its own file-writing tools to create the files, which means the write
 * goes through the client's existing approval flow — where the user sees a
 * real diff and a real permission prompt.
 *
 * This is a deliberate departure from the shape PRD FR-M16/M17 assumed (a
 * server that writes after confirmation). It is stricter, not looser: never
 * writing satisfies "write only after explicit user confirmation" by
 * exceeding it.
 *
 * Four reasons it is the better design:
 *
 *  1. **The capability claim gets stronger and simpler.** "It never writes."
 *     beats "it writes only after you approve" — one is a structural property,
 *     the other is a behaviour to be trusted.
 *  2. **MCP elicitation is not universally supported.** Building confirmation
 *     on it would silently degrade on clients that lack it, and a confirmation
 *     that quietly does not happen is worse than none.
 *  3. **The client already has a better approval UI than we would build.** It
 *     shows syntax-highlighted diffs and remembers the user's choices.
 *  4. **"No write without confirmation" becomes trivially testable**, rather
 *     than a property depending on a code path being reached.
 *
 * A caller that wants files written asks its assistant to write them. The
 * assistant was going to do that anyway.
 */

import type { KeyProvider, Stack } from "../content/types.js";

export interface FieldSpec {
  /** Column or attribute name, e.g. `nik`. */
  readonly name: string;
  /**
   * Whether the field needs a blind-index column for exact-match lookup.
   * PANDA's blind index is immutable — it is derived from the value and the
   * key — so a field that will ever be searched must have one from the start.
   * Adding it later means backfilling.
   */
  readonly searchable: boolean;
  /** Whether the column accepts null. Defaults to false. */
  readonly nullable?: boolean;
  /** Override the derived blind-index column name. */
  readonly blindIndexColumn?: string;
}

export interface ScaffoldRequest {
  readonly stack: Stack;
  readonly fields: readonly FieldSpec[];
  readonly keyProvider: KeyProvider;
  /** Key identifier. Defaults to the provider's default. */
  readonly kid?: string;
  /** Table or model name, where the stack needs one. */
  readonly entity?: string;
}

/**
 * What the caller should do with a proposed artefact.
 *
 * - `create` — a complete new file; write it verbatim.
 * - `append` — lines to add to an existing file. Emitting a *fragment* rather
 *   than a fabricated "whole file" matters: we have not read the target, so
 *   any whole-file content we produced would silently drop whatever is
 *   already in it.
 * - `manual` — a snippet the developer must place themselves, because the
 *   surrounding context (which model class, which settings block) is not
 *   something a generator can get right from a field list.
 */
export type ProposedAction = "create" | "append" | "manual";

export interface ProposedFile {
  /** Path relative to the project root, POSIX separators. */
  readonly path: string;
  readonly action: ProposedAction;
  readonly content: string;
  /** One line on what this file is for. */
  readonly purpose: string;
  /** For `manual`: exactly where the snippet goes. */
  readonly placement?: string;
}

export interface ScaffoldNote {
  /** Something the developer must decide or do by hand. */
  readonly text: string;
}

export interface ScaffoldResult {
  readonly files: readonly ProposedFile[];
  /**
   * Upstream API surfaces the templates were written against, so a developer
   * can check them rather than trusting them.
   */
  readonly apisUsed: readonly string[];
  readonly notes: readonly ScaffoldNote[];
  /** Populated when the stack has no templates yet. */
  readonly unsupported?: string;
}

/** Derive the conventional blind-index column name for a field. */
export function blindIndexColumnFor(field: FieldSpec): string {
  return field.blindIndexColumn ?? `${field.name}_bidx`;
}

/** Columns a scaffold will produce, for migration generation. */
export interface ColumnPlan {
  readonly encryptedColumn: string;
  readonly blindIndexColumn: string | null;
  readonly nullable: boolean;
}

export function planColumns(fields: readonly FieldSpec[]): ColumnPlan[] {
  return fields.map((field) => ({
    encryptedColumn: field.name,
    blindIndexColumn: field.searchable ? blindIndexColumnFor(field) : null,
    nullable: field.nullable ?? false,
  }));
}
