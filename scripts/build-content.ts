/**
 * Content generator.
 *
 * Pulls documentation from the public PANDA repositories and emits
 * `src/content/generated.ts`. Run via `npm run build:content`.
 *
 * Why a generator rather than hand-copied content: hand-copying is how the
 * portal's `sdk-docs/` directory became stale while nobody noticed. Bundled
 * content that is *generated* can be checked for staleness in CI; content that
 * was copied by hand cannot.
 *
 * PUBLIC-SOURCE GUARD (PRD Section 10.3): the build fails if any source path
 * resolves outside a known public repository. Without this, a future edit
 * could quietly bundle internal material into a publicly published package.
 * The same guard exists on the portal docs build, for the same reason.
 *
 * Note this runs at BUILD time, on a developer or CI machine. The published
 * server never fetches anything — see PRD FR-M1/M3.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

import type { ContentBundle, DocSection, Stack } from "../src/content/types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

/**
 * Repositories this generator is permitted to read from. Anything not in this
 * list is refused — that is the guard, enforced in `assertPublicRepo`.
 */
const PUBLIC_REPOS = [
  "panda-spec",
  "panda-php",
  "panda-node",
  "panda-go",
  "panda-py",
  "panda-docker",
  "panda-mcp",
  "panda-docs",
] as const;

type PublicRepo = (typeof PUBLIC_REPOS)[number];

/**
 * Where the directory name differs from the repository name.
 *
 * The cross-cutting guides currently live in a plain `docs/` directory that
 * has **no git remote** (tracked as an open item in PRD 006). It is not yet
 * really a repository, so it has no name to match. Recorded here rather than
 * silently renamed, so the day someone gives it a remote this entry is the
 * one line that changes.
 */
const REPO_DIR_OVERRIDES: Partial<Record<PublicRepo, string>> = {
  "panda-docs": "docs",
};

function repoDir(root: string, repo: PublicRepo): string {
  return resolve(root, REPO_DIR_OVERRIDES[repo] ?? repo);
}

interface SourceSpec {
  readonly slug: string;
  readonly title: string;
  readonly stacks: readonly Stack[];
  readonly repo: PublicRepo;
  /** Path inside the repository. */
  readonly path: string;
  /**
   * How to present the source. Markdown passes through; JSON is fenced so a
   * machine-readable file renders as a readable code block rather than a wall
   * of text.
   */
  readonly format?: "markdown" | "json";
}

/**
 * The documentation set. Paths are relative to each repository's root.
 *
 * `panda-docs` is the working name for the cross-cutting guides currently in
 * the `docs/` directory of the PANDA workspace. That directory has no remote
 * yet — see `PRD 006` open item — so this mapping will need revisiting once
 * its canonical home is decided. Recorded here rather than hidden.
 */
const SOURCES: readonly SourceSpec[] = [
  {
    slug: "getting-started",
    title: "Getting Started",
    stacks: [],
    repo: "panda-docs",
    path: "sdk-usage-guide.md",
  },
  {
    slug: "cli",
    title: "CLI Reference",
    stacks: [],
    repo: "panda-docs",
    path: "cli-usage-guide.md",
  },
  {
    slug: "setup-wizard",
    title: "Setup Wizard",
    stacks: [],
    repo: "panda-docs",
    path: "setup-wizard-guide.md",
  },
  {
    slug: "key-providers",
    title: "Key Providers",
    stacks: [],
    repo: "panda-docs",
    path: "key-provider-comparison.md",
  },
  {
    slug: "key-providers-vault",
    title: "HashiCorp Vault",
    stacks: [],
    repo: "panda-docs",
    path: "vault-authentication-guide.md",
  },
  {
    slug: "key-providers-infisical",
    title: "Infisical",
    stacks: [],
    repo: "panda-docs",
    path: "infisical-setup-guide.md",
  },
  {
    slug: "key-validation",
    title: "Key Validation",
    stacks: [],
    repo: "panda-docs",
    path: "key-validation-feature.md",
  },
  {
    slug: "envelope-format",
    title: "Envelope (Wire) Format",
    stacks: [],
    repo: "panda-spec",
    path: "envelope-format.md",
  },
  {
    slug: "test-vectors",
    title: "Cross-language Test Vectors",
    stacks: [],
    repo: "panda-spec",
    path: "vectors/vectors.json",
    format: "json",
  },
  {
    slug: "php",
    title: "PHP",
    stacks: ["php"],
    repo: "panda-php",
    path: "README.md",
  },
  {
    slug: "node",
    title: "Node.js",
    stacks: ["node"],
    repo: "panda-node",
    path: "README.md",
  },
  {
    slug: "go",
    title: "Go",
    stacks: ["go"],
    repo: "panda-go",
    path: "README.md",
  },
  {
    slug: "python",
    title: "Python",
    stacks: ["python"],
    repo: "panda-py",
    path: "README.md",
  },
];

/**
 * Where the sibling repositories live.
 *
 * Overridable so CI can check out the sources wherever it likes:
 *   PANDA_SOURCE_ROOT=/path/to/repos npm run build:content
 */
function sourceRoot(): string {
  const configured = process.env["PANDA_SOURCE_ROOT"];
  const root = configured
    ? resolve(configured)
    : resolve(REPO_ROOT, ".."); // siblings of this repo
  return root;
}

/**
 * Refuse to read anything that is not a known public repository.
 *
 * Resolves both sides before comparing, so `../panda-php/../../etc/passwd`
 * does not slip through a naive string prefix check.
 */
function assertPublicRepo(root: string, repo: PublicRepo, absPath: string): void {
  const dir = repoDir(root, repo);
  const rel = relative(dir, absPath);

  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(
      `public-source guard: ${absPath} resolves outside ${dir}. ` +
        `Bundled content must come from a public repository.`,
    );
  }
}

function readCommit(repoDir: string): string {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: repoDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    // Not a git checkout — a tarball, or a directory that was moved. Record
    // that honestly rather than inventing a revision.
    return "unknown";
  }
}

/**
 * Normalise a source file into documentation body text.
 *
 * Line endings are normalised first. Source repositories are edited on Windows
 * and Linux alike, and git checks them out with whatever the local convention
 * is. Embedding raw CRLF would make the output depend on the machine that ran
 * the build, so `check:content` would pass on a Windows checkout and fail on a
 * Linux CI runner for a bundle that is semantically identical.
 */
function present(raw: string, format: SourceSpec["format"] = "markdown"): string {
  const normalised = raw.replace(/\r\n/g, "\n");

  // A JSON file embedded raw reads as a wall of text. Fencing it makes it
  // legible in the same rendering path as the markdown sources.
  if (format === "json") {
    return "```json\n" + normalised.trimEnd() + "\n```\n";
  }

  return normalised;
}

function collect(root: string): DocSection[] {
  const sections: DocSection[] = [];
  const missing: string[] = [];

  for (const spec of SOURCES) {
    const dir = repoDir(root, spec.repo);
    const absPath = resolve(dir, spec.path);

    assertPublicRepo(root, spec.repo, absPath);

    if (!existsSync(absPath)) {
      missing.push(`${spec.repo}/${spec.path}`);
      continue;
    }

    sections.push({
      slug: spec.slug,
      title: spec.title,
      stacks: spec.stacks,
      body: present(readFileSync(absPath, "utf8"), spec.format),
      source: {
        repo: spec.repo,
        path: spec.path,
        commit: readCommit(dir),
      },
    });
  }

  if (missing.length > 0) {
    // A missing source is a broken bundle, not a warning. Shipping a package
    // that silently documents half of PANDA is worse than failing the build.
    throw new Error(
      `missing ${missing.length} source file(s):\n  ${missing.join("\n  ")}\n` +
        `Checked under: ${root}\n` +
        `Set PANDA_SOURCE_ROOT to the directory containing the PANDA repositories.`,
    );
  }

  return sections;
}

/**
 * Build the bundle from source repositories.
 *
 * Exported so the freshness check can recompute in-process and compare,
 * rather than duplicating this logic and risking disagreement with it.
 */
export function buildBundle(root: string = sourceRoot()): ContentBundle {
  const sections = collect(root);

  return {
    generatedAt: new Date().toISOString(),
    sdkVersions: Object.fromEntries(
      [...new Set(sections.map((s) => s.source.repo))].map((repo) => [
        repo,
        sections.find((s) => s.source.repo === repo)?.source.commit ?? "unknown",
      ]),
    ),
    sections,
  };
}

/** Serialise a bundle as the generated TypeScript module. */
export function renderBundle(bundle: ContentBundle): string {
  return `// AUTO-GENERATED by scripts/build-content.ts — DO NOT EDIT BY HAND.
// Regenerate with: npm run build:content
//
// Bundled at build time so the published server makes no network requests.
// See PRD 005 Section 4.3.

import type { ContentBundle } from "./types.js";

export const content: ContentBundle = ${JSON.stringify(bundle, null, 2)};
`;
}

export const GENERATED_PATH = "src/content/generated.ts";

const GENERATED_AT_PATTERN = /"generatedAt": "([^"]+)"/;

/**
 * Write the bundle, preserving the previous timestamp when nothing changed.
 *
 * The naive version stamped `Date.now()` on every build, which meant every
 * regeneration dirtied the working tree even when no content had moved. That
 * makes `git diff --exit-code` useless as a freshness check and puts a
 * meaningless one-line change in unrelated commits.
 *
 * Preserving the timestamp also makes the field more useful. "When was this
 * content last changed" is the question a reader actually has — how stale is
 * the documentation in front of me. "When did someone last run the build" is
 * not.
 *
 * Returns true if the file was written.
 */
function write(bundle: ContentBundle): boolean {
  const outDir = resolve(REPO_ROOT, "src/content");
  mkdirSync(outDir, { recursive: true });

  const outFile = join(outDir, "generated.ts");
  const existing = existsSync(outFile) ? readFileSync(outFile, "utf8") : undefined;
  const previousStamp = existing ? GENERATED_AT_PATTERN.exec(existing)?.[1] : undefined;

  // Re-render with the previous timestamp. If that reproduces the existing
  // file byte for byte, the content is unchanged and there is nothing to do.
  if (previousStamp !== undefined) {
    const candidate = renderBundle({ ...bundle, generatedAt: previousStamp });
    if (candidate === existing) {
      process.stderr.write(
        `[build-content] ${bundle.sections.length} sections unchanged — ` +
          `content last modified ${previousStamp}\n`,
      );
      return false;
    }
  }

  writeFileSync(outFile, renderBundle(bundle), "utf8");

  const bytes = bundle.sections.reduce((n, s) => n + s.body.length, 0);
  process.stderr.write(
    `[build-content] ${bundle.sections.length} sections, ${(bytes / 1024).toFixed(1)} KB ` +
      `from ${sourceRoot()}\n` +
      `[build-content] wrote ${relative(REPO_ROOT, outFile)} (${bundle.generatedAt})\n`,
  );
  return true;
}

/** True when this module is the process entry point rather than an import. */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url);
}

if (isEntryPoint()) {
  write(buildBundle());
}
