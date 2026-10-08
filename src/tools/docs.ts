/**
 * Tier 1 — documentation tools.
 *
 * These never touch the filesystem and never touch the network. They read the
 * bundle compiled in at build time.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { cite, getSection, searchDocs, sections, STACKS } from "../content/index.js";
import type { DocSection, Stack } from "../content/index.js";
import { describe, failure, text } from "./shared.js";

/** Bodies can be long; keep responses inside a useful context budget. */
const MAX_BODY_CHARS = 12_000;

function renderSection(section: DocSection, body = section.body): string {
  const truncated =
    body.length > MAX_BODY_CHARS
      ? `${body.slice(0, MAX_BODY_CHARS)}\n\n…[truncated — ${body.length - MAX_BODY_CHARS} more characters]`
      : body;

  return [
    `# ${section.title}`,
    ``,
    `Source: ${cite(section.source)}`,
    section.stacks.length > 0 ? `Applies to: ${section.stacks.join(", ")}` : `Applies to: all stacks`,
    ``,
    truncated,
  ].join("\n");
}

export function registerDocTools(server: McpServer): void {
  server.registerTool(
    "search_docs",
    {
      title: "Search PANDA documentation",
      description: describe(
        "Search PANDA's bundled documentation and return matching excerpts with " +
          "citations. Use this before answering any question about how to use " +
          "PANDA — the API is niche and is not reliably represented in model " +
          "training data. Optionally scope the search to a stack.",
      ),
      inputSchema: {
        query: z.string().min(1).describe("What to search for."),
        stack: z
          .enum(STACKS)
          .optional()
          .describe("Restrict results to a stack plus the cross-cutting guides."),
        limit: z.number().int().min(1).max(20).optional().describe("Max results. Default 5."),
      },
    },
    async ({ query, stack, limit }) => {
      const hits = searchDocs(query, { stack: stack as Stack | undefined, limit });

      if (hits.length === 0) {
        return failure(
          `No documentation matched "${query}". ` +
            `Available sections: ${sections().map((s) => s.slug).join(", ")}.`,
        );
      }

      const body = hits
        .map((hit, i) =>
          [
            `## ${i + 1}. ${hit.title}`,
            `Source: ${cite(hit.source)}`,
            `Slug: ${hit.slug}`,
            ``,
            hit.excerpt,
          ].join("\n"),
        )
        .join("\n\n---\n\n");

      return text(body);
    },
  );

  server.registerTool(
    "get_api_reference",
    {
      title: "Get PANDA API reference",
      description: describe(
        "Look up how a specific PANDA operation is called in a given language. " +
          "Returns the matching documentation excerpt with its source citation. " +
          "Prefer this over recalling an API from memory — inventing a plausible " +
          "signature is the single most common failure mode when using PANDA.",
      ),
      inputSchema: {
        stack: z.enum(STACKS).describe("Target language or framework."),
        operation: z
          .string()
          .min(1)
          .describe("Operation to look up, e.g. 'encrypt', 'decryptRaw', 'blind index'."),
      },
    },
    async ({ stack, operation }) => {
      const hits = searchDocs(operation, { stack: stack as Stack, limit: 3 });

      if (hits.length === 0) {
        const available = sections()
          .filter((s) => s.stacks.length === 0 || s.stacks.includes(stack as Stack))
          .map((s) => s.slug);
        return failure(
          `No documentation for "${operation}" in stack "${stack}". ` +
            `Available for this stack: ${available.join(", ")}.`,
        );
      }

      const body = hits
        .map((hit) =>
          [
            `# ${hit.title}`,
            `Source: ${cite(hit.source)}`,
            ``,
            hit.excerpt,
          ].join("\n"),
        )
        .join("\n\n---\n\n");

      return text(
        `${body}\n\n---\n\nIf this excerpt does not contain the exact signature you ` +
          `need, say so rather than guessing — the full documentation is at ` +
          `https://github.com/jatimprovcsirt/panda-${stack === "python" ? "py" : stack}.`,
      );
    },
  );

  server.registerTool(
    "get_setup_guide",
    {
      title: "Get PANDA setup guide",
      description: describe(
        "Get the setup steps for installing PANDA with a specific key provider. " +
          "Covers the CLI init flow and per-provider configuration.",
      ),
      inputSchema: {
        key_provider: z
          .enum(["local", "vault", "infisical"])
          .describe("Which key provider the project will use."),
        stack: z.enum(STACKS).optional().describe("Target language or framework."),
      },
    },
    async ({ key_provider, stack }) => {
      const slugByProvider: Record<string, string> = {
        local: "setup-wizard",
        vault: "key-providers-vault",
        infisical: "key-providers-infisical",
      };

      const primary = getSection(slugByProvider[key_provider]!);
      const wizard = getSection("setup-wizard");
      const stackSection = stack ? getSection(stack as string) : undefined;

      if (!primary) {
        return failure(
          `No setup guide bundled for key provider "${key_provider}".`,
        );
      }

      const parts = [renderSection(primary)];
      if (wizard && wizard.slug !== primary.slug) parts.push(renderSection(wizard));
      if (stackSection) parts.push(renderSection(stackSection));

      return text(parts.join("\n\n---\n\n"));
    },
  );

  server.registerTool(
    "compare_key_providers",
    {
      title: "Compare PANDA key providers",
      description: describe(
        "Compare the three supported key providers — local environment variables, " +
          "HashiCorp Vault, and Infisical — by setup cost, security posture, and " +
          "intended use. Use this when advising which provider a project should use.",
      ),
      inputSchema: {},
    },
    async () => {
      const section = getSection("key-providers");
      if (!section) return failure("Key provider comparison is not bundled.");
      return text(renderSection(section));
    },
  );

  server.registerTool(
    "get_envelope_spec",
    {
      title: "Get the PANDA envelope format spec",
      description: describe(
        "Return the canonical v1 envelope wire format — the JSON structure every " +
          "PANDA ciphertext uses. Use this when debugging an envelope, writing a " +
          "cross-language integration, or explaining why ciphertext from one " +
          "language is readable by another.",
      ),
      inputSchema: {},
    },
    async () => {
      const section = getSection("envelope-format");
      if (!section) return failure("Envelope specification is not bundled.");
      return text(renderSection(section));
    },
  );
}
