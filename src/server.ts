/**
 * Server construction, separated from the CLI entry point.
 *
 * `index.ts` is the executable; this module is the thing it runs. Keeping them
 * apart means tests can build a server and connect it to an in-memory
 * transport without triggering the CLI's side effects.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { resolveCapabilities } from "./capabilities.js";
import type { CliOptions } from "./cli.js";
import { registerPrompts } from "./prompts.js";
import { registerResources } from "./resources.js";
import { registerDocTools } from "./tools/docs.js";
import { registerInfoTools } from "./tools/info.js";
import { VERSION } from "./version.js";

export const SERVER_NAME = "panda-mcp";

/**
 * Instructions handed to the client on connect.
 *
 * Worth spending words on: the single most common failure when an assistant
 * writes PANDA code is inventing a plausible API, because PANDA does not
 * appear in training data. Telling the model to look it up first is cheaper
 * than any amount of downstream correction.
 */
const INSTRUCTIONS =
  "PANDA documentation and validation server. PANDA is a field-level " +
  "encryption SDK for Indonesian government applications; its API is niche " +
  "and is not reliably represented in model training data. Always call " +
  "search_docs or get_api_reference before writing PANDA code, and say so " +
  "rather than guessing if the documentation does not cover what was asked. " +
  "This server performs no cryptographic operation and holds no key: it " +
  "cannot encrypt or decrypt anything.";

export function createServer(options: CliOptions): McpServer {
  const capabilities = resolveCapabilities(options.docsOnly);

  const server = new McpServer(
    { name: SERVER_NAME, version: VERSION },
    { instructions: INSTRUCTIONS },
  );

  const ctx = { capabilities, options };

  registerDocTools(server);
  registerInfoTools(server, ctx);

  // Resources and prompts are documentation-side and therefore always
  // available — including under --docs-only, which withholds only the tools
  // that read local files.
  registerResources(server);
  registerPrompts(server);

  // Tier 2 tools (validate_implementation, explain_envelope,
  // scaffold_integration) are registered here once implemented — Phase 3 and 4.
  // They are deliberately absent rather than stubbed: a tool that exists and
  // returns "not implemented" is worse than no tool, because a model will
  // call it and then work around the failure.

  return server;
}
