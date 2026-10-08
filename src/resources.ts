/**
 * MCP resources.
 *
 * Every bundled document is also reachable as a resource, so a client that
 * surfaces resources can let the user attach one to a conversation — "look at
 * the envelope spec" — without the model having to call a tool first.
 *
 * The same content is reachable through tools. That duplication is deliberate:
 * resource support varies across MCP clients, and a client that ignores
 * resources entirely must still be able to read the documentation.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { bundle, sections } from "./content/index.js";
import type { DocSection } from "./content/index.js";

export const DOC_URI_PREFIX = "panda://docs/";

export function docUri(slug: string): string {
  return `${DOC_URI_PREFIX}${slug}`;
}

function describeSection(section: DocSection): string {
  const scope =
    section.stacks.length > 0 ? `Applies to: ${section.stacks.join(", ")}` : "Applies to: all stacks";

  return [
    `# ${section.title}`,
    ``,
    `Source: ${section.source.repo}/${section.source.path}@${section.source.commit}`,
    scope,
    ``,
    section.body,
  ].join("\n");
}

export function registerResources(server: McpServer): void {
  for (const section of sections()) {
    server.registerResource(
      section.slug,
      docUri(section.slug),
      {
        title: section.title,
        description:
          section.stacks.length > 0
            ? `PANDA documentation (${section.stacks.join(", ")})`
            : "PANDA documentation",
        mimeType: "text/markdown",
      },
      (uri) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown",
            text: describeSection(section),
          },
        ],
      }),
    );
  }

  // A machine-readable index, so a client can enumerate without guessing
  // slugs or issuing a tool call.
  server.registerResource(
    "index",
    "panda://index",
    {
      title: "PANDA documentation index",
      description: "Every bundled section, with its source and revision",
      mimeType: "application/json",
    },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              generatedAt: bundle.generatedAt,
              sdkVersions: bundle.sdkVersions,
              sections: sections().map((s) => ({
                slug: s.slug,
                uri: docUri(s.slug),
                title: s.title,
                stacks: s.stacks,
                source: s.source,
              })),
            },
            null,
            2,
          ),
        },
      ],
    }),
  );
}
