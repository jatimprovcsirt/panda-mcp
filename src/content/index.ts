/**
 * Content access layer.
 *
 * Everything here reads the bundle produced by scripts/build-content.ts. No
 * filesystem access, no network — the bundle is a compiled-in constant.
 */

import { content } from "./generated.js";
import type { ContentBundle, DocSection, DocSource, Stack } from "./types.js";

export type { ContentBundle, DocSection, DocSource, Stack };
export { STACKS, KEY_PROVIDERS, isStack } from "./types.js";
export type { KeyProvider } from "./types.js";

export const bundle: ContentBundle = content;

export function sections(): readonly DocSection[] {
  return bundle.sections;
}

export function getSection(slug: string): DocSection | undefined {
  return bundle.sections.find((s) => s.slug === slug);
}

/** Sections that apply to a given stack, plus the cross-cutting ones. */
export function sectionsForStack(stack: Stack): readonly DocSection[] {
  return bundle.sections.filter(
    (s) => s.stacks.length === 0 || s.stacks.includes(stack),
  );
}

export interface SearchHit {
  readonly slug: string;
  readonly title: string;
  readonly source: DocSource;
  /** Context around the best match, not the whole document. */
  readonly excerpt: string;
  readonly score: number;
}

const EXCERPT_RADIUS = 400;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length >= 2);
}

/**
 * Score a section against the query.
 *
 * Deliberately simple and deterministic (NFR "Determinism"): identical queries
 * must produce identical results, with no randomness and no time dependence.
 * A ranking model would be better at this and worse at being explainable —
 * for a documentation lookup, a developer can see why a section matched.
 */
/**
 * A title match is worth far more than body mentions.
 *
 * Learned from a real failure: searching "envelope" ranked the getting-started
 * guide above the section titled "Envelope (Wire) Format", because the guide
 * is long and mentions envelopes more often in passing. Raw term frequency
 * rewards verbosity; a documentation lookup wants the section *about* the
 * term. Hence a large title bonus and a cap on body contributions, so length
 * cannot buy relevance.
 */
const TITLE_MATCH_BONUS = 50;
const MAX_BODY_HITS_PER_TERM = 20;

function scoreSection(section: DocSection, terms: readonly string[]): number {
  const haystack = section.body.toLowerCase();
  const titleLower = section.title.toLowerCase();

  let score = 0;
  for (const term of terms) {
    if (titleLower.includes(term)) score += TITLE_MATCH_BONUS;

    let hits = 0;
    let index = haystack.indexOf(term);
    while (index !== -1 && hits < MAX_BODY_HITS_PER_TERM) {
      hits++;
      index = haystack.indexOf(term, index + term.length);
    }
    score += hits;
  }
  return score;
}

function findExcerpt(body: string, terms: readonly string[]): string {
  const lower = body.toLowerCase();

  let best = -1;
  for (const term of terms) {
    const at = lower.indexOf(term);
    if (at !== -1 && (best === -1 || at < best)) best = at;
  }

  const start = best === -1 ? 0 : Math.max(0, best - EXCERPT_RADIUS);
  const end = Math.min(body.length, start + EXCERPT_RADIUS * 2);
  const slice = body.slice(start, end).trim();

  const prefix = start > 0 ? "…" : "";
  const suffix = end < body.length ? "…" : "";
  return `${prefix}${slice}${suffix}`;
}

export interface SearchOptions {
  readonly stack?: Stack | undefined;
  readonly limit?: number;
}

export function searchDocs(query: string, options: SearchOptions = {}): SearchHit[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];

  const pool = options.stack ? sectionsForStack(options.stack) : bundle.sections;
  const limit = options.limit ?? 5;

  return pool
    .map((section) => ({
      slug: section.slug,
      title: section.title,
      source: section.source,
      excerpt: findExcerpt(section.body, terms),
      score: scoreSection(section, terms),
    }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug))
    .slice(0, limit);
}

/** Render a citation line. Every documentation response carries one (FR-M8). */
export function cite(source: DocSource): string {
  return `${source.repo}/${source.path}@${source.commit}`;
}
