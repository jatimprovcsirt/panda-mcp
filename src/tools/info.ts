/**
 * Tier 1 — server introspection.
 *
 * `get_server_info` exists so a developer can confirm, from inside their
 * assistant, three things that are otherwise invisible: which tools are
 * active, which documentation versions are bundled, and whether the
 * restricted `--docs-only` mode is in effect.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { TIER2_TOOL_NAMES } from "../capabilities.js";
import { bundle, sections } from "../content/index.js";
import { VERSION } from "../version.js";
import { describe, text } from "./shared.js";
import type { ServerContext } from "./shared.js";

export function registerInfoTools(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "get_server_info",
    {
      title: "Get PANDA MCP server info",
      description: describe(
        "Report the server version, which documentation is bundled, and which " +
          "tools are currently active. Call this first if you are unsure what " +
          "this server can do.",
      ),
      inputSchema: {
        verbose: z.boolean().optional().describe("Include the full section list."),
      },
    },
    async ({ verbose }) => {
      const repos = [...new Set(sections().map((s) => s.source.repo))];

      const lines = [
        `# PANDA MCP server`,
        ``,
        `Server version: ${VERSION}`,
        `Content generated: ${bundle.generatedAt}`,
        `Bundled sections: ${sections().length}`,
        `Source repositories: ${repos.join(", ")}`,
        ``,
        `## Active tools (${ctx.capabilities.registered.length})`,
        ``,
        ...ctx.capabilities.registered.map((name) => `- \`${name}\``),
      ];

      if (ctx.capabilities.docsOnly) {
        lines.push(
          ``,
          `## Withheld by --docs-only`,
          ``,
          `This server is running in documentation-only mode. These tools are ` +
            `not registered and cannot be called:`,
          ``,
          ...TIER2_TOOL_NAMES.map((name) => `- \`${name}\``),
        );
      }

      if (verbose) {
        lines.push(``, `## Bundled sections`, ``);
        for (const section of sections()) {
          const scope =
            section.stacks.length > 0 ? section.stacks.join(", ") : "all stacks";
          lines.push(
            `- \`${section.slug}\` — ${section.title} (${scope}) ` +
              `— ${section.source.repo}/${section.source.path}@${section.source.commit}`,
          );
        }
      }

      lines.push(
        ``,
        `## Bundled version revisions`,
        ``,
        ...Object.entries(bundle.sdkVersions).map(([repo, rev]) => `- ${repo}: \`${rev}\``),
        ``,
        `Note: if your project depends on a different version of a PANDA SDK, its ` +
          `API may differ from the documentation bundled here. Check the ` +
          `repository for that version.`,
      );

      return text(lines.join("\n"));
    },
  );
}
