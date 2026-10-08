/**
 * `validate_implementation` — Tier 2.
 *
 * READ-ONLY, UNCONDITIONALLY (PRD FR-M12). Nothing in this path opens a file
 * for writing. If you are reviewing a change to this file, that is the
 * property to check.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { scan } from "../lint/scanner.js";
import { SEVERITY_ORDER } from "../lint/types.js";
import type { Finding, Severity } from "../lint/types.js";
import { describe, failure, text } from "./shared.js";
import type { ServerContext } from "./shared.js";

const MAX_FINDINGS_SHOWN = 50;
const MAX_SKIPPED_SHOWN = 10;

function renderFinding(finding: Finding, index: number): string {
  return [
    `### ${index + 1}. \`${finding.rule}\` — ${finding.severity}`,
    ``,
    `\`${finding.file}:${finding.line}\``,
    ``,
    finding.message,
    ``,
    `**Fix:** ${finding.remediation}`,
    ``,
    `_Docs: ${finding.docsUrl}_`,
  ].join("\n");
}

function countBySeverity(findings: readonly Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const finding of findings) counts[finding.severity]++;
  return counts;
}

export function registerValidateTool(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "validate_implementation",
    {
      title: "Validate PANDA usage in a codebase",
      description: describe(
        "Static analysis of a project for incorrect PANDA usage — hardcoded keys, " +
          "unacknowledged full-plaintext reads, demo tokens outside development, " +
          "personal-data fields with no encryption, and disabled database TLS. " +
          "Read-only: it never modifies a file. " +
          "IMPORTANT: this is a heuristic check. A clean result means no known " +
          "patterns were found, NOT that the code is correct.",
      ),
      inputSchema: {
        path: z
          .string()
          .optional()
          .describe(
            "Directory to scan, relative to the configured project root. " +
              "Defaults to the project root itself.",
          ),
      },
    },
    async ({ path }) => {
      const target = path ?? ctx.options.projectRoot;

      let report;
      try {
        report = scan(target, { includeEnv: ctx.options.includeEnv });
      } catch (error) {
        return failure(
          `Could not scan ${target}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      if (report.filesScanned === 0) {
        return failure(
          `No scannable files found under ${target}. ` +
            `Checked for source and configuration files, excluding build output, ` +
            `dependency directories, and .env files` +
            (ctx.options.includeEnv ? "" : " (use --include-env to include those)") +
            `.`,
        );
      }

      const counts = countBySeverity(report.findings);

      const header = [
        `# PANDA usage check`,
        ``,
        `Scanned **${report.filesScanned}** files` +
          (report.stack ? ` (detected stack: \`${report.stack}\`)` : ` (stack not detected)`),
        `Rules run: ${report.rulesRun.join(", ")}`,
        ``,
        `**${report.findings.length} finding(s)** — ` +
          `${counts.critical} critical, ${counts.high} high, ` +
          `${counts.medium} medium, ${counts.low} low`,
      ].join("\n");

      // Built before the clean-report early return. A "no findings" result that
      // silently drops the list of files it never looked at is the exact
      // false-comfort this section exists to prevent — the .env file most
      // likely to hold a live key is the one a clean report would hide.
      const skippedNote =
        report.skipped.length > 0
          ? [
              ``,
              `## Not scanned (${report.skipped.length})`,
              ``,
              ...report.skipped
                .slice(0, MAX_SKIPPED_SHOWN)
                .map((s) => `- \`${s.path}\` — ${s.reason}`),
              report.skipped.length > MAX_SKIPPED_SHOWN
                ? `- …and ${report.skipped.length - MAX_SKIPPED_SHOWN} more`
                : "",
            ]
              .filter((l) => l !== "")
              .join("\n")
          : "";

      if (report.findings.length === 0) {
        return text(
          [
            header,
            ``,
            `## No findings`,
            ``,
            `No known issue patterns were detected. **This is not a clean bill of ` +
              `health.** This check is heuristic: it looks for specific patterns and ` +
              `will miss problems it does not know about. It is a prompt for review, ` +
              `not a substitute for one.`,
            skippedNote,
          ]
            .filter((l) => l !== "")
            .join("\n"),
        );
      }

      const sorted = [...report.findings].sort(
        (a, b) =>
          SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
          a.file.localeCompare(b.file) ||
          a.line - b.line,
      );

      const shown = sorted.slice(0, MAX_FINDINGS_SHOWN);
      const remainder = sorted.length - shown.length;

      const body = shown.map(renderFinding).join("\n\n---\n\n");

      return text(
        [
          header,
          ``,
          `## Findings`,
          ``,
          body,
          remainder > 0 ? `\n\n…and ${remainder} more finding(s).` : "",
          skippedNote,
          ``,
          `---`,
          ``,
          `Heuristic check. A clean result means no known patterns were found, ` +
            `not that the code is correct. Findings give a file and line but never ` +
            `the matched value — review the location yourself.`,
        ].join("\n"),
      );
    },
  );
}
