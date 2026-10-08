/**
 * Command-line parsing.
 *
 * Deliberately hand-rolled rather than pulled from a dependency: the flag set
 * is small and fixed, and every runtime dependency has to be justified in the
 * SBOM (PRD NFR "Supply chain").
 */

export interface CliOptions {
  readonly mode: "serve" | "help" | "version";
  /** Tier 2 tools are not registered when true. */
  readonly docsOnly: boolean;
  /** Filesystem scope for Tier 2 tools. */
  readonly projectRoot: string;
  /** Include .env files when scanning. Off by default (PRD FR-M20). */
  readonly includeEnv: boolean;
}

export class CliError extends Error {}

export const HELP_TEXT = `panda-mcp — PANDA documentation and validation server

USAGE
  panda-mcp [options]

OPTIONS
  --docs-only           Expose documentation tools only. Reads no local files.
  --project-root <path> Root directory for file scanning. Default: cwd.
  --include-env         Include .env files when scanning. Off by default;
                        matched values are never echoed either way.
  --version, -v         Print version and exit.
  --help, -h            Print this help and exit.

WHAT THIS SERVER DOES NOT DO
  It performs no cryptographic operation. There is no encrypt, decrypt, mask,
  or blind-index tool, under any configuration. It holds no encryption key.
  It makes no network requests. See README.md.
`;

function readValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new CliError(`${flag} requires a value`);
  }
  return value;
}

export function parseArgs(
  argv: readonly string[],
  cwd: string = process.cwd(),
): CliOptions {
  let mode: CliOptions["mode"] = "serve";
  let docsOnly = false;
  let projectRoot = cwd;
  let includeEnv = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;

    switch (arg) {
      case "--docs-only":
        docsOnly = true;
        break;
      case "--include-env":
        includeEnv = true;
        break;
      case "--project-root":
        projectRoot = readValue(argv, i, arg);
        i++;
        break;
      case "--version":
      case "-v":
        mode = "version";
        break;
      case "--help":
      case "-h":
        mode = "help";
        break;
      default:
        if (arg.startsWith("--project-root=")) {
          projectRoot = arg.slice("--project-root=".length);
          break;
        }
        throw new CliError(`unknown argument: ${arg}`);
    }
  }

  // Reject an empty value rather than silently scanning the whole filesystem.
  if (projectRoot.trim() === "") {
    throw new CliError("--project-root must not be empty");
  }

  return { mode, docsOnly, projectRoot, includeEnv };
}
