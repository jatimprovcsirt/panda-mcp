/**
 * Stack detection.
 *
 * Best-effort, from manifest files. Detection failure is not an error: rules
 * that depend on the stack simply do not run, and everything that is
 * language-agnostic still does.
 *
 * Deliberately reports the most *specific* match. A Laravel project is
 * detected as `laravel`, not `php`, because the framework-specific guidance is
 * what the developer needs.
 */

import type { ScanFile } from "./types.js";
import type { Stack } from "../content/types.js";

function find(files: readonly ScanFile[], relPath: string): ScanFile | undefined {
  return files.find((f) => f.relPath === relPath);
}

interface Manifest {
  readonly name: string;
  readonly content: string;
}

function readManifests(files: readonly ScanFile[]): Manifest[] {
  const wanted = [
    "composer.json",
    "package.json",
    "go.mod",
    "requirements.txt",
    "pyproject.toml",
    "Pipfile",
  ];

  return wanted
    .map((name) => {
      const file = find(files, name);
      return file ? { name, content: file.content.toLowerCase() } : undefined;
    })
    .filter((m): m is Manifest => m !== undefined);
}

export function detectStack(files: readonly ScanFile[]): Stack | null {
  const manifests = readManifests(files);

  const has = (name: string): Manifest | undefined =>
    manifests.find((m) => m.name === name);
  const mentions = (name: string, needle: string): boolean =>
    name !== undefined && (has(name)?.content.includes(needle) ?? false);

  // PHP
  const composer = has("composer.json");
  if (composer) {
    if (composer.content.includes("laravel/framework")) return "laravel";
    if (composer.content.includes("codeigniter4/")) return "codeigniter";
    return "php";
  }

  // Python — check before Node, since a project can have both and the Python
  // manifest is the more specific signal when present.
  const python =
    has("pyproject.toml") ?? has("requirements.txt") ?? has("Pipfile");
  if (python) {
    const text = python.content;
    if (text.includes("django")) return "django";
    if (text.includes("fastapi")) return "fastapi";
    if (text.includes("flask")) return "flask";
    return "python";
  }

  // Go
  if (mentions("go.mod", "module ")) return "go";

  // Node
  const pkg = has("package.json");
  if (pkg) {
    if (pkg.content.includes("@nestjs/core")) return "nestjs";
    if (pkg.content.includes("\"express\"")) return "express";
    return "node";
  }

  return null;
}
