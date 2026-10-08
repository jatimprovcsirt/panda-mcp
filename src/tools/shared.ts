/**
 * Shared helpers for tool registration.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { CAPABILITY_STATEMENT } from "../capabilities.js";
import type { ServerCapabilities } from "../capabilities.js";
import type { CliOptions } from "../cli.js";

export interface ServerContext {
  readonly capabilities: ServerCapabilities;
  readonly options: CliOptions;
}

/**
 * Every tool description ends with the capability statement (PRD FR-M28).
 *
 * This is deliberate repetition. A developer reading a tool call in their
 * assistant's UI should not have to open the README to learn what the server
 * can and cannot reach.
 */
export function describe(description: string): string {
  return `${description}\n\n— ${CAPABILITY_STATEMENT}`;
}

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export function text(body: string): ToolResult {
  return { content: [{ type: "text", text: body }] };
}

export function failure(message: string): ToolResult {
  // Never echo scanned file content or matched values into an error — FR-M19
  // applies to errors exactly as it applies to findings.
  return { content: [{ type: "text", text: message }], isError: true };
}

export function registerAll(
  server: McpServer,
  register: (server: McpServer) => void,
): void {
  register(server);
}
