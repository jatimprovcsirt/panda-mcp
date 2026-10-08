import { describe, expect, it } from "vitest";

import { CliError, parseArgs } from "../src/cli.js";

const CWD = "/tmp/project";

describe("parseArgs", () => {
  it("defaults to serve mode with Tier 2 enabled", () => {
    const opts = parseArgs([], CWD);
    expect(opts.mode).toBe("serve");
    expect(opts.docsOnly).toBe(false);
    expect(opts.includeEnv).toBe(false);
    expect(opts.projectRoot).toBe(CWD);
  });

  it("enables docs-only mode", () => {
    expect(parseArgs(["--docs-only"], CWD).docsOnly).toBe(true);
  });

  it("reads --project-root as a separate value", () => {
    expect(parseArgs(["--project-root", "/srv/app"], CWD).projectRoot).toBe("/srv/app");
  });

  it("reads --project-root= as an inline value", () => {
    expect(parseArgs(["--project-root=/srv/app"], CWD).projectRoot).toBe("/srv/app");
  });

  it("enables .env scanning only when asked (PRD FR-M20)", () => {
    expect(parseArgs([], CWD).includeEnv).toBe(false);
    expect(parseArgs(["--include-env"], CWD).includeEnv).toBe(true);
  });

  it("recognises help and version", () => {
    expect(parseArgs(["--help"], CWD).mode).toBe("help");
    expect(parseArgs(["-h"], CWD).mode).toBe("help");
    expect(parseArgs(["--version"], CWD).mode).toBe("version");
    expect(parseArgs(["-v"], CWD).mode).toBe("version");
  });

  it("combines flags", () => {
    const opts = parseArgs(["--docs-only", "--project-root", "/srv/app", "--include-env"], CWD);
    expect(opts).toMatchObject({
      mode: "serve",
      docsOnly: true,
      projectRoot: "/srv/app",
      includeEnv: true,
    });
  });
});

describe("parseArgs rejects bad input rather than guessing", () => {
  it("throws on an unknown flag", () => {
    expect(() => parseArgs(["--nope"], CWD)).toThrow(CliError);
  });

  it("throws when --project-root has no value", () => {
    expect(() => parseArgs(["--project-root"], CWD)).toThrow(/requires a value/);
    expect(() => parseArgs(["--project-root", "--docs-only"], CWD)).toThrow(/requires a value/);
  });

  it("refuses an empty project root rather than scanning everything", () => {
    expect(() => parseArgs(["--project-root", "  "], CWD)).toThrow(/must not be empty/);
    expect(() => parseArgs(["--project-root="], CWD)).toThrow(/must not be empty/);
  });
});
