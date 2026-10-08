/**
 * Logging.
 *
 * CRITICAL: stdout is the MCP protocol channel on a stdio transport. Writing
 * anything else to stdout corrupts the protocol stream and the client will
 * fail to parse it. Every log line in this process goes to stderr.
 *
 * There is deliberately no `console.log` anywhere in src/ — the no-network
 * check script also greps for it.
 */

function write(level: string, message: string, extra?: unknown): void {
  const line = `[panda-mcp] ${level} ${message}`;
  if (extra === undefined) {
    process.stderr.write(`${line}\n`);
  } else {
    process.stderr.write(`${line} ${safeStringify(extra)}\n`);
  }
}

/**
 * Never let a logging failure throw into the request path, and never let a
 * circular structure escape — a crash while reporting a crash is the worst
 * possible outcome in a crypto-adjacent tool.
 */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "<unserialisable>";
  }
}

export const log = {
  info: (message: string, extra?: unknown) => write("INFO ", message, extra),
  warn: (message: string, extra?: unknown) => write("WARN ", message, extra),
  error: (message: string, extra?: unknown) => write("ERROR", message, extra),
};
