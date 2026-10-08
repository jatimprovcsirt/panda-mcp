/**
 * PANDA MCP server — CLI entry point.
 *
 * A documentation and validation server for AI coding assistants. It performs
 * no cryptographic operation and holds no encryption key: there is no encrypt,
 * decrypt, mask, or blind-index tool, under any configuration, and there never
 * will be. See PRD 005 Section 6 for why that is a design invariant rather
 * than a scope decision.
 *
 * Transport is stdio only. There is no HTTP server and no SSE endpoint —
 * which is what makes "this server makes no network requests" a structural
 * property rather than a promise.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { resolveCapabilities } from "./capabilities.js";
import { CliError, HELP_TEXT, parseArgs } from "./cli.js";
import type { CliOptions } from "./cli.js";
import { bundle, sections } from "./content/index.js";
import { log } from "./logging.js";
import { SERVER_NAME, createServer } from "./server.js";
import { VERSION } from "./version.js";

/** Exit codes: 0 ok, 2 bad usage — matching the convention used by the SDK CLIs. */
const EXIT_USAGE = 2;

function startupBanner(options: CliOptions): void {
  const repos = [...new Set(sections().map((s) => s.source.repo))];
  const caps = resolveCapabilities(options.docsOnly);

  // Goes to stderr: stdout carries the MCP protocol stream and must stay clean.
  log.info(`${SERVER_NAME} ${VERSION}`);
  log.info(
    `tools: ${caps.registered.length} registered` +
      (options.docsOnly ? ` (--docs-only; withheld: ${caps.withheld.join(", ")})` : ""),
  );
  log.info(`content: ${sections().length} sections from ${repos.length} repos`);
  log.info(`content generated: ${bundle.generatedAt}`);

  if (!options.docsOnly) {
    log.info(`project root: ${options.projectRoot}`);
    if (options.includeEnv) {
      log.warn(
        "--include-env is set: .env files will be scanned. Matched values are never echoed.",
      );
    }
  }
}

async function serve(options: CliOptions): Promise<void> {
  const server = createServer(options);

  startupBanner(options);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = (signal: string) => {
    log.info(`received ${signal}, shutting down`);
    void server.close().finally(() => process.exit(0));
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

async function main(): Promise<void> {
  let options: CliOptions;

  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof CliError) {
      // Help and version are normal output; usage errors are not.
      process.stdout.write(HELP_TEXT);
      log.error(error.message);
      process.exit(EXIT_USAGE);
    }
    throw error;
  }

  // --help and --version write to stdout deliberately: in these modes the
  // protocol is not running, so stdout is an ordinary terminal.
  if (options.mode === "help") {
    process.stdout.write(HELP_TEXT);
    return;
  }
  if (options.mode === "version") {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  await serve(options);
}

main().catch((error: unknown) => {
  log.error("fatal", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
