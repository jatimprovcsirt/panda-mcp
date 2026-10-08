/**
 * Content model.
 *
 * This is the interface between the content generator (scripts/build-content.ts,
 * which pulls from the public SDK repositories) and the tools that serve it.
 * The generator must produce exactly this shape; the loader and tools must not
 * care where it came from.
 *
 * PRD Section 4.3: content is bundled at build time, never fetched at runtime.
 * That is what makes the "no network requests" claim absolute rather than a
 * policy — see FR-M1/M3.
 */

export const STACKS = [
  "php",
  "laravel",
  "codeigniter",
  "node",
  "express",
  "nestjs",
  "go",
  "python",
  "django",
  "flask",
  "fastapi",
  "docker",
] as const;

export type Stack = (typeof STACKS)[number];

export const KEY_PROVIDERS = ["local", "vault", "infisical"] as const;
export type KeyProvider = (typeof KEY_PROVIDERS)[number];

export function isStack(value: string): value is Stack {
  return (STACKS as readonly string[]).includes(value);
}

/**
 * Where a section came from. Recorded so every response can cite its source
 * (FR-M8) — an assistant that cannot say where an answer came from is not
 * meaningfully better than one guessing.
 */
export interface DocSource {
  readonly repo: string;
  readonly path: string;
  readonly commit: string;
}

export interface DocSection {
  /** Stable identifier, used in `panda://docs/{slug}` resource URIs. */
  readonly slug: string;
  readonly title: string;
  /** Which stacks this section applies to. Empty means cross-cutting. */
  readonly stacks: readonly Stack[];
  readonly body: string;
  readonly source: DocSource;
}

export interface ContentBundle {
  /** ISO timestamp of the build that produced this bundle. */
  readonly generatedAt: string;
  /** SDK versions this documentation set describes, keyed by repo name. */
  readonly sdkVersions: Readonly<Record<string, string>>;
  readonly sections: readonly DocSection[];
}
