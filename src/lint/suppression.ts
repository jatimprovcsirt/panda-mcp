/**
 * Inline suppression.
 *
 * Syntax (one mechanism for every rule — PRD FR-M21):
 *
 *     // panda-mcp-ignore M002: full value required for the export endpoint
 *     const raw = cipher.decryptRaw(envelope);
 *
 *     const raw = cipher.decryptRaw(envelope); // panda-mcp-ignore M002: export endpoint
 *
 * A suppression applies to its own line and to the following line, so it works
 * both inline and on the line above the statement.
 *
 * DESIGN DECISION — M002 reuses this mechanism rather than inventing its own
 * "intentional marker". Two syntaxes for "I meant to do this" would be one
 * too many, and a marker that merely says "intentional" carries no more
 * information than a suppression with a required justification. Requiring the
 * justification is what makes the suppression an act of acknowledgement
 * rather than a mute button.
 *
 * A bare `panda-mcp-ignore M002` with no reason after the colon is reported as
 * invalid rather than honoured. Suppression is allowed; silencing without a
 * reason is not.
 */

export interface Suppression {
  readonly rules: readonly string[];
  readonly justification: string;
  /** 1-based line the comment appears on. */
  readonly line: number;
}

export interface InvalidSuppression {
  readonly line: number;
  readonly reason: string;
}

const SUPPRESSION_PATTERN = /panda-mcp-ignore\s+([A-Za-z0-9_,\s]+?)\s*:\s*(.+)/;

/**
 * A directive with no usable justification — including `M002:` with nothing
 * after the colon, which is the shape people write when they mean "silence
 * this" and have no reason to give.
 */
const BARE_PATTERN = /panda-mcp-ignore\s+([A-Za-z0-9_,\s]+?)\s*:?\s*$/;

export interface SuppressionIndex {
  /** True when `rule` is suppressed at `line`. */
  appliesAt(line: number, rule: string): boolean;
  /** Suppressions that were written but not honoured. */
  readonly invalid: readonly InvalidSuppression[];
  /** Rule id → number of times it was suppressed. A rule that is constantly
   *  suppressed is a rule that is probably wrong, so this is kept as a
   *  quality signal rather than discarded. */
  readonly countsByRule: Readonly<Record<string, number>>;
}

export function buildSuppressionIndex(content: string): SuppressionIndex {
  const lines = content.split("\n");
  const byLine = new Map<number, Suppression[]>();
  const invalid: InvalidSuppression[] = [];
  const countsByRule: Record<string, number> = {};

  lines.forEach((text, index) => {
    const line = index + 1;

    const match = SUPPRESSION_PATTERN.exec(text);
    if (match) {
      const rules = match[1]!
        .split(/[,\s]+/)
        .map((r) => r.trim().toUpperCase())
        .filter((r) => r.length > 0);

      const justification = match[2]!.trim();

      if (rules.length === 0) {
        invalid.push({ line, reason: "no rule id given" });
        return;
      }
      if (justification.length < 8) {
        // "fix", "ok", "why" — technically non-empty, practically meaningless.
        invalid.push({ line, reason: "justification is too short to be useful" });
        return;
      }

      const entry: Suppression = { rules, justification, line };
      for (const target of [line, line + 1]) {
        const existing = byLine.get(target) ?? [];
        existing.push(entry);
        byLine.set(target, existing);
      }
      for (const rule of rules) {
        countsByRule[rule] = (countsByRule[rule] ?? 0) + 1;
      }
      return;
    }

    if (BARE_PATTERN.test(text)) {
      invalid.push({ line, reason: "no justification after the colon" });
    }
  });

  return {
    appliesAt(line: number, rule: string): boolean {
      const entries = byLine.get(line);
      if (!entries) return false;
      return entries.some((e) => e.rules.includes(rule) || e.rules.includes("ALL"));
    },
    invalid,
    countsByRule,
  };
}
