/**
 * Lint engine types.
 *
 * The single most important constraint in this file is on `Finding`: it
 * carries a *location* and a *rule*, never a matched value. See the doc
 * comment on `Finding` — this is not a style preference.
 */

import type { Stack } from "../content/types.js";

export const SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type Severity = (typeof SEVERITIES)[number];

/** Ordering for summary output. Lower is more severe. */
export const SEVERITY_ORDER: Readonly<Record<Severity, number>> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * A single lint finding.
 *
 * HARD RULE (PRD FR-M19): no field here may carry text matched from the
 * scanned source.
 *
 * The reason is concrete. A naive implementation reports
 * `found hardcoded key: PANDA_KEY_x=abc123…` — and has just moved a live
 * encryption key into the model's context window. That is precisely the
 * failure this server exists to prevent, so `Finding` has nowhere to put a
 * matched value even if a rule author wanted to.
 *
 * Location, rule, and a written explanation. Nothing else.
 */
export interface Finding {
  /** Rule identifier, e.g. "M001". */
  readonly rule: string;
  readonly severity: Severity;
  /** Path relative to the scanned root. Never absolute — absolute paths leak
   *  usernames and directory layouts into a model's context for no benefit. */
  readonly file: string;
  /** 1-based line number. */
  readonly line: number;
  /** What is wrong, in plain language for a developer without a
   *  cryptography background. */
  readonly message: string;
  /** What to do about it. */
  readonly remediation: string;
  /** Documentation anchor, so the developer can read more. */
  readonly docsUrl: string;
  /** Set when the finding was suppressed inline; kept for the summary count
   *  so a rule that is constantly suppressed is visible as a quality signal. */
  readonly suppressed?: boolean;
}

export interface ScanFile {
  /** Absolute path. */
  readonly absolutePath: string;
  /** Path relative to the scanned root, POSIX separators. */
  readonly relPath: string;
  readonly content: string;
}

export interface ScanContext {
  readonly root: string;
  readonly stack: Stack | null;
  readonly includeEnv: boolean;
}

/**
 * A rule.
 *
 * `appliesTo` is a cheap pre-filter so a rule is not run against every file in
 * a project. `check` receives one file at a time and returns findings with
 * line numbers but **without** `file` — the engine fills that in, so a rule
 * cannot get it wrong or leak a different path.
 */
export interface Rule {
  readonly id: string;
  readonly severity: Severity;
  readonly title: string;
  readonly description: string;
  readonly remediation: string;
  readonly docsUrl: string;
  appliesTo(file: ScanFile, ctx: ScanContext): boolean;
  check(file: ScanFile, ctx: ScanContext): RuleMatch[];
}

/** What a rule returns. The engine adds `rule`, `severity`, `file`, and the
 *  static text from the rule definition. */
export interface RuleMatch {
  readonly line: number;
  /** Rule-specific detail. MUST NOT contain matched source text. */
  readonly message?: string;
}

/**
 * A rule that needs the whole project rather than one file.
 *
 * Some questions cannot be answered from a single file: "is audit logging
 * configured anywhere?" and "does the installed SDK version match the
 * documentation bundled here?" are both about the project as a whole. A
 * file-scoped rule trying to answer them would fire on whichever file
 * happened to be scanned first, which is both wrong and unreproducible.
 */
export interface ProjectContext {
  readonly root: string;
  readonly stack: Stack | null;
  readonly files: readonly ScanFile[];
  /** Suppression index per file, keyed by relative path. */
  readonly suppressions: ReadonlyMap<string, { appliesAt(line: number, rule: string): boolean }>;
}

export interface ProjectMatch {
  readonly file: string;
  readonly line: number;
  /** MUST NOT contain matched source text. See Finding. */
  readonly message?: string;
}

export interface ProjectRule {
  readonly id: string;
  readonly severity: Severity;
  readonly title: string;
  readonly description: string;
  readonly remediation: string;
  readonly docsUrl: string;
  /** Skip the project entirely when this is false — keeps a rule from
   *  reporting "no audit logging" in a repository that has never heard of
   *  PANDA. */
  appliesTo(project: ProjectContext): boolean;
  check(project: ProjectContext): ProjectMatch[];
}

export interface SkippedFile {
  readonly path: string;
  readonly reason: string;
}

export interface ScanReport {
  readonly root: string;
  readonly stack: Stack | null;
  readonly findings: readonly Finding[];
  readonly filesScanned: number;
  readonly rulesRun: readonly string[];
  readonly skipped: readonly SkippedFile[];
}
