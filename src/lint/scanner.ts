/**
 * Filesystem walker.
 *
 * Read-only, unconditionally. Nothing in this module opens a file for writing
 * (PRD FR-M12) — `validate_implementation` must never modify a project.
 *
 * Two boundaries are enforced here rather than in rules, because they are
 * properties of *reading* rather than of any particular check:
 *
 *   1. Nothing outside the configured root is read, including through a
 *      symlink (FR-M18).
 *   2. `.env` files are not read unless explicitly opted in (FR-M20).
 */

import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join, posix, relative, resolve, sep, dirname } from "node:path";

import { detectStack } from "./detect-stack.js";
import type { ScanContext, ScanFile, ScanReport, SkippedFile } from "./types.js";
import { buildSuppressionIndex } from "./suppression.js";
import { RULES } from "./registry.js";

/** Directories that are never worth walking. Matched exactly. */
const IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "out",
  "target",
  ".next",
  ".nuxt",
  ".venv",
  "venv",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".tox",
  ".nox",
  ".turbo",
  "coverage",
  "htmlcov",
  "site-packages",
  ".gradle",
  ".terraform",
  ".idea",
  ".vscode",
]);

/**
 * Directory suffixes that mark generated or vendored content.
 *
 * `panda_py.egg-info` is a packaging artefact and its `PKG-INFO` contains a
 * copy of the README — which produced findings against documentation text
 * rather than source. Generated files are not a developer's code and must not
 * be reported as if they were.
 */
const IGNORED_DIRECTORY_SUFFIXES = [".egg-info", ".dist-info", ".cache", ".terraform"];

function isIgnoredDirectory(name: string): boolean {
  if (IGNORED_DIRECTORIES.has(name)) return true;
  return IGNORED_DIRECTORY_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

const SCANNABLE_EXTENSIONS = new Set([
  ".php",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".go",
  ".py",
  ".rb",
  ".java",
  ".cs",
  // Configuration surfaces, where key-provider and TLS mistakes live.
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".conf",
  ".properties",
  ".xml",
]);

/**
 * Files worth reading regardless of extension.
 *
 * Without this, `go.mod` and `requirements.txt` were never scanned — their
 * extensions are not in the list above — which silently broke stack detection
 * for every Go and most Python projects. A manifest that is never read is a
 * detection that never happens.
 */
const KNOWN_FILENAMES = new Set([
  "go.mod",
  "go.sum",
  "requirements.txt",
  "requirements-dev.txt",
  "requirements-prod.txt",
  "pipfile",
  "gemfile",
  "cargo.toml",
  "makefile",
  "dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
]);

/** A file larger than this is almost certainly not source. */
const MAX_FILE_BYTES = 1_000_000;

/**
 * `.env` files are excluded by default.
 *
 * They are the single highest-risk thing in a project to read — the most
 * likely place for a live key. Config problems that matter (a local key
 * provider wired into production, a committed demo token) are detectable from
 * committed config files, so the exclusion costs little and removes the worst
 * case.
 */
function isEnvFile(name: string): boolean {
  return name === ".env" || name.startsWith(".env.");
}

function hasScannableExtension(name: string): boolean {
  const lower = name.toLowerCase();
  if (KNOWN_FILENAMES.has(lower)) return true;
  if (SCANNABLE_EXTENSIONS.has(lower.slice(lower.lastIndexOf(".")))) return true;
  // Files with no extension, or dotfiles like `.env.example`.
  return !lower.includes(".") || lower.startsWith(".");
}

function toPosix(absolute: string, root: string): string {
  return relative(root, absolute).split(sep).join(posix.sep);
}

/**
 * True when `candidate` is inside `root`, after resolving both.
 *
 * Resolving first is the point: a string prefix check would accept
 * `<root>/../secrets` because the string starts with the root.
 */
function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel !== "" && !rel.startsWith("..") && !resolve(root, rel).startsWith(root + sep + "..");
}

interface WalkState {
  readonly root: string;
  readonly realRoot: string;
  readonly includeEnv: boolean;
  readonly files: ScanFile[];
  readonly skipped: SkippedFile[];
}

function walk(directory: string, state: WalkState): void {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    state.skipped.push({ path: toPosix(directory, state.root), reason: "unreadable directory" });
    return;
  }

  for (const entry of entries) {
    const absolute = join(directory, entry.name);

    if (entry.isSymbolicLink()) {
      // Never follow a symlink, and say so when it points outside the root —
      // a silently skipped link is a hole in coverage the user cannot see.
      let real: string;
      try {
        real = realpathSync(absolute);
      } catch {
        state.skipped.push({
          path: toPosix(absolute, state.root),
          reason: "broken symlink",
        });
        continue;
      }

      if (!isInside(state.realRoot, real) && real !== state.realRoot) {
        state.skipped.push({
          path: toPosix(absolute, state.root),
          reason: "symlink points outside the project root",
        });
        continue;
      }

      // Inside the root: recurse if it is a directory, otherwise read it as a
      // normal file. Guard against symlink loops with a depth-unaware check.
      try {
        if (statSync(real).isDirectory()) walk(real, state);
        else readOne(real, toPosix(absolute, state.root), state);
      } catch {
        state.skipped.push({ path: toPosix(absolute, state.root), reason: "unreadable" });
      }
      continue;
    }

    if (entry.isDirectory()) {
      if (isIgnoredDirectory(entry.name)) continue;
      walk(absolute, state);
      continue;
    }

    if (!entry.isFile()) continue;
    readOne(absolute, toPosix(absolute, state.root), state);
  }
}

function readOne(absolute: string, relPath: string, state: WalkState): void {
  const name = absolute.slice(absolute.lastIndexOf(sep) + 1);

  if (isEnvFile(name) && !state.includeEnv) {
    state.skipped.push({ path: relPath, reason: ".env excluded by default" });
    return;
  }

  if (!hasScannableExtension(name)) return;

  let size: number;
  try {
    size = statSync(absolute).size;
  } catch {
    state.skipped.push({ path: relPath, reason: "unreadable" });
    return;
  }

  if (size > MAX_FILE_BYTES) {
    state.skipped.push({ path: relPath, reason: `larger than ${MAX_FILE_BYTES} bytes` });
    return;
  }

  let content: string;
  try {
    content = readFileSync(absolute, "utf8");
  } catch {
    state.skipped.push({ path: relPath, reason: "unreadable or not text" });
    return;
  }

  // Skip binaries that slipped through on extension.
  if (content.includes("\u0000")) {
    state.skipped.push({ path: relPath, reason: "binary file" });
    return;
  }

  state.files.push({ absolutePath: absolute, relPath, content });
}

export function scan(root: string, options: { includeEnv: boolean }): ScanReport {
  const absoluteRoot = resolve(root);

  if (!existsSync(absoluteRoot)) {
    return {
      root: absoluteRoot,
      stack: null,
      findings: [],
      filesScanned: 0,
      rulesRun: [],
      skipped: [{ path: absoluteRoot, reason: "path does not exist" }],
    };
  }

  // Resolve the root itself first, so a symlinked project directory still
  // compares consistently against real paths during the walk.
  let realRoot: string;
  try {
    realRoot = realpathSync(absoluteRoot);
  } catch {
    realRoot = absoluteRoot;
  }

  const state: WalkState = {
    root: absoluteRoot,
    realRoot,
    includeEnv: options.includeEnv,
    files: [],
    skipped: [],
  };

  try {
    if (statSync(absoluteRoot).isDirectory()) walk(absoluteRoot, state);
    else readOne(absoluteRoot, ".", state);
  } catch {
    state.skipped.push({ path: ".", reason: "root is not readable as a directory" });
  }

  const ctx: ScanContext = {
    root: absoluteRoot,
    stack: detectStack(state.files),
    includeEnv: options.includeEnv,
  };

  const findings = [];
  const rulesRun: string[] = [];

  for (const rule of RULES) {
    let ran = false;

    for (const file of state.files) {
      if (!rule.appliesTo(file, ctx)) continue;
      ran = true;

      const index = buildSuppressionIndex(file.content);

      for (const match of rule.check(file, ctx)) {
        // A finding with no line number is a rule bug; surface it rather than
        // dropping it silently.
        const line = match.line > 0 ? match.line : 1;

        findings.push({
          rule: rule.id,
          severity: rule.severity,
          file: file.relPath,
          line,
          message: match.message ?? rule.description,
          remediation: rule.remediation,
          docsUrl: rule.docsUrl,
          ...(index.appliesAt(line, rule.id) ? { suppressed: true } : {}),
        });
      }
    }

    if (ran) rulesRun.push(rule.id);
  }

  return {
    root: absoluteRoot,
    stack: ctx.stack,
    findings: findings
      .filter((f) => !f.suppressed)
      .sort(
        (a, b) =>
          a.file.localeCompare(b.file) ||
          a.line - b.line ||
          a.rule.localeCompare(b.rule),
      ),
    filesScanned: state.files.length,
    rulesRun,
    skipped: state.skipped,
  };
}

void dirname;
