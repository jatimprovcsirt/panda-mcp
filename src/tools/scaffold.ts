/**
 * `scaffold_integration` — Tier 2.
 *
 * Returns a proposal. Writes nothing, ever. See ../scaffold/types.ts for why
 * that is the design rather than an omission — the short version is that the
 * client already has a better approval flow than this server would build, and
 * "never writes" is a stronger claim than "writes only after you approve".
 */

import { existsSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { KEY_PROVIDERS, STACKS } from "../content/index.js";
import type { KeyProvider, Stack } from "../content/index.js";
import { TEMPLATED_STACKS, scaffold } from "../scaffold/index.js";
import type { ProposedFile } from "../scaffold/types.js";
import { describe, failure, text } from "./shared.js";
import type { ServerContext } from "./shared.js";

const ACTION_LABEL: Record<ProposedFile["action"], string> = {
  create: "CREATE",
  append: "APPEND TO",
  manual: "EDIT BY HAND",
};

/** Resolve a proposed path against the project root, refusing escapes. */
function resolveTarget(projectRoot: string, relPath: string): string | null {
  const root = resolve(projectRoot);
  const full = resolve(root, relPath);
  const rel = relative(root, full);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return full;
}

export function registerScaffoldTool(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "scaffold_integration",
    {
      title: "Propose a PANDA integration",
      description: describe(
        "Produce the files needed to add PANDA field-level encryption to a project: " +
          "a migration, the framework wiring, and the environment configuration. " +
          "RETURNS A PROPOSAL — IT WRITES NOTHING. Show the result to the user and " +
          "write the files with your own file tools, so the write goes through the " +
          "user's normal approval flow. " +
          "The field list is required and is not guessed: naming which data is " +
          "personal is a decision for the developer.",
      ),
      inputSchema: {
        stack: z
          .enum(STACKS)
          .describe(
            `Target stack. Full templates exist for: ${TEMPLATED_STACKS.join(", ")}. ` +
              `Others receive migration and configuration only.`,
          ),
        fields: z
          .array(
            z.object({
              name: z.string().min(1).describe("Column or attribute name, e.g. 'nik'."),
              searchable: z
                .boolean()
                .describe(
                  "Whether this field needs exact-match lookup. Requires a blind-index " +
                    "column, which is immutable — decide now, not later.",
                ),
              nullable: z.boolean().optional(),
              blindIndexColumn: z.string().optional(),
            }),
          )
          .min(1)
          .describe("Fields to encrypt. Not inferred — you name them."),
        key_provider: z.enum(KEY_PROVIDERS),
        kid: z.string().optional().describe("Key id. Defaults to 'default-key'."),
        entity: z
          .string()
          .optional()
          .describe("Table or model name, where the stack needs one."),
      },
    },
    async ({ stack, fields, key_provider, kid, entity }) => {
      const request = {
        stack: stack as Stack,
        fields,
        keyProvider: key_provider as KeyProvider,
        ...(kid !== undefined ? { kid } : {}),
        ...(entity !== undefined ? { entity } : {}),
      };

      const result = scaffold(request);

      // Report which targets already exist. The caller is about to write these
      // files with its own tools, and it needs to know what it is overwriting.
      const existing: string[] = [];
      const escaped: string[] = [];
      for (const file of result.files) {
        if (file.action === "manual") continue;
        const target = resolveTarget(ctx.options.projectRoot, file.path);
        if (target === null) {
          escaped.push(file.path);
          continue;
        }
        if (existsSync(target) || existsSync(join(ctx.options.projectRoot, file.path))) {
          existing.push(file.path);
        }
      }

      if (escaped.length > 0) {
        return failure(
          `Refusing to propose paths outside the project root: ${escaped.join(", ")}.`,
        );
      }

      const header = [
        `# Proposed PANDA integration — \`${stack}\``,
        ``,
        `**Nothing has been written.** These are proposals. Show them to the user, `,
        `then create the files with your own file tools so the write goes through `,
        `the user's normal approval flow.`,
        ``,
        `- Key provider: \`${key_provider}\``,
        `- Key id: \`${kid ?? "default-key"}\``,
        `- Fields: ${fields.map((f) => `${f.name}${f.searchable ? " (searchable)" : ""}`).join(", ")}`,
      ];

      if (result.unsupported) {
        header.push(``, `> ${result.unsupported}`);
      }

      if (existing.length > 0) {
        header.push(
          ``,
          `## ⚠️ These paths already exist`,
          ``,
          ...existing.map((p) => `- \`${p}\``),
          ``,
          `Do not overwrite them blind. Read each one first, decide whether to merge ` +
            `or replace, and ask the user before writing.`,
        );
      }

      const files = result.files
        .map((file) => {
          const placement = file.placement ? `\n_${file.placement}_\n` : "";
          return [
            `## ${ACTION_LABEL[file.action]} — \`${file.path}\``,
            ``,
            file.purpose,
            placement,
            "```",
            file.content.trimEnd(),
            "```",
          ].join("\n");
        })
        .join("\n\n---\n\n");

      const notes = result.notes.length
        ? [`## Notes`, ``, ...result.notes.map((n) => `- ${n.text}`)].join("\n")
        : "";

      const apis = result.apisUsed.length
        ? [
            `## API surfaces used`,
            ``,
            ...result.apisUsed.map((a) => `- \`${a}\``),
            ``,
            `Check these against the version you have installed. This generator was ` +
              `written against the versions listed by \`get_server_info\`.`,
          ].join("\n")
        : "";

      return text([...header, ``, `---`, ``, files, ``, `---`, ``, notes, ``, apis].join("\n"));
    },
  );
}
