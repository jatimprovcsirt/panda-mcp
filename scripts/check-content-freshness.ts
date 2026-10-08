/**
 * Fail if the committed content bundle is out of date with its sources.
 *
 * Content that is generated can be checked; content that was copied by hand
 * cannot. This is the reason the bundle is generated at all (PRD Section 4.3),
 * and this check is what makes the generation worth its machinery.
 *
 * Recomputes in-process via the generator's own `buildBundle`, so the two can
 * never disagree — a checker that reimplements the thing it checks is a
 * checker that will eventually be wrong.
 *
 * `generatedAt` is ignored. It is not a content signal — the generator
 * preserves it when the content is unchanged, so comparing it would be
 * comparing a field that is deliberately stable, and a checkout that never
 * ran the generator would otherwise look stale.
 *
 * Run via `npm run check:content`. Wired into CI.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildBundle } from "./build-content.js";
import { bundle } from "../src/content/index.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface Comparable {
  slug: string;
  repo: string;
  path: string;
  commit: string;
  body: string;
}

function snapshot(b: {
  sections: ReadonlyArray<{
    slug: string;
    body: string;
    source: { repo: string; path: string; commit: string };
  }>;
}): Comparable[] {
  return b.sections
    .map((s) => ({
      slug: s.slug,
      repo: s.source.repo,
      path: s.source.path,
      commit: s.source.commit,
      body: s.body,
    }))
    .sort((a, b2) => a.slug.localeCompare(b2.slug));
}

const problems: string[] = [];

let fresh: ReturnType<typeof buildBundle>;
try {
  fresh = buildBundle();
} catch (error) {
  process.stderr.write(
    `[check-content] FAILED — could not read sources: ` +
      `${error instanceof Error ? error.message : String(error)}\n` +
      `Set PANDA_SOURCE_ROOT to the directory containing the PANDA repositories.\n`,
  );
  process.exit(1);
}

const committed = snapshot(bundle);
const current = snapshot(fresh);

const committedSlugs = new Set(committed.map((s) => s.slug));
const currentSlugs = new Set(current.map((s) => s.slug));

for (const slug of currentSlugs) {
  if (!committedSlugs.has(slug)) problems.push(`missing from bundle: ${slug}`);
}
for (const slug of committedSlugs) {
  if (!currentSlugs.has(slug)) problems.push(`no longer in sources: ${slug}`);
}

for (const now of current) {
  const was = committed.find((c) => c.slug === now.slug);
  if (!was) continue;

  if (was.commit !== now.commit) {
    problems.push(`${now.slug}: source revision changed ${was.commit} → ${now.commit}`);
  }
  if (was.body !== now.body) {
    problems.push(`${now.slug}: content changed (${was.body.length} → ${now.body.length} bytes)`);
  }
}

if (problems.length > 0) {
  process.stderr.write(
    `\n[check-content] FAILED — the committed bundle is stale.\n\n` +
      problems.map((p) => `  ✗ ${p}`).join("\n") +
      `\n\nRegenerate with: npm run build:content\n` +
      `The published server documents whatever is committed here — shipping a ` +
      `stale bundle means the assistant confidently describes an API that has ` +
      `already changed.\n\n`,
  );
  process.exit(1);
}

process.stderr.write(
  `[check-content] ok — ${committed.length} sections match their sources\n`,
);
void REPO_ROOT;
