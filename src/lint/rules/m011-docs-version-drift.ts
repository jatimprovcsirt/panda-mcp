/**
 * M011 — the project's SDK version differs from the documentation bundled here.
 *
 * The premise of this server is version-matched documentation. Bundling is
 * what makes that possible — but bundling only helps if a mismatch is visible.
 * A developer on panda-php 0.3.0 being served 0.5.0 documentation is worse off
 * than one with no documentation, because the answers look authoritative.
 *
 * Compares major.minor only. A project on `^0.5.0` is fine with a 0.5.0
 * bundle, and patch-level differences do not change an API.
 */

import { bundle } from "../../content/index.js";
import type { ProjectContext, ProjectMatch, ProjectRule, ScanFile } from "../types.js";

/** Which repository each package manager entry corresponds to. */
const PACKAGE_TO_REPO: ReadonlyArray<{ manifest: string; needle: string; repo: string }> = [
  { manifest: "package.json", needle: "@jatimprovcsirt/panda-node", repo: "panda-node" },
  { manifest: "composer.json", needle: "jatimprovcsirt/panda-php", repo: "panda-php" },
  { manifest: "go.mod", needle: "github.com/jatimprovcsirt/panda-go", repo: "panda-go" },
  { manifest: "pyproject.toml", needle: "panda-crypto-py", repo: "panda-py" },
  { manifest: "requirements.txt", needle: "panda-crypto-py", repo: "panda-py" },
];

/** `^0.5.0`, `~0.5`, `>=0.5.0 <1.0.0`, `0.5.0` — all reduce to the first number seen. */
const VERSION_IN_RANGE = /(\d+)\.(\d+)/;

interface Drift {
  readonly file: string;
  readonly repo: string;
  readonly projectVersion: string;
  readonly bundledVersion: string;
}

function findDrift(files: readonly ScanFile[]): Drift[] {
  const drifts: Drift[] = [];

  for (const { manifest, needle, repo } of PACKAGE_TO_REPO) {
    const file = files.find((f) => f.relPath === manifest || f.relPath.endsWith(`/${manifest}`));
    if (!file) continue;

    const bundled = bundle.sdkVersions[repo];
    if (!bundled || bundled === "unknown") continue;

    const bundledMatch = VERSION_IN_RANGE.exec(bundled);
    if (!bundledMatch) continue;

    for (const [index, text] of file.content.split("\n").entries()) {
      if (!text.includes(needle)) continue;

      const projectMatch = VERSION_IN_RANGE.exec(text);
      if (!projectMatch) continue;

      const sameMajorMinor =
        projectMatch[1] === bundledMatch[1] && projectMatch[2] === bundledMatch[2];
      if (sameMajorMinor) continue;

      drifts.push({
        file: file.relPath,
        repo,
        projectVersion: `${projectMatch[1]}.${projectMatch[2]}`,
        bundledVersion: `${bundledMatch[1]}.${bundledMatch[2]}`,
      });
      break; // one finding per manifest is enough
    }
  }

  return drifts;
}

export const m011DocsVersionDrift: ProjectRule = {
  id: "M011",
  severity: "low",
  title: "Bundled documentation version differs from the installed SDK",
  description:
    "The PANDA SDK this project depends on is a different major or minor " +
    "version from the documentation bundled with this server. Answers given " +
    "from the bundle may describe an API this project does not have.",
  remediation:
    "Check the repository for the version you actually depend on, or upgrade " +
    "the dependency. If the difference is intentional and understood, suppress " +
    "with a reason: `// panda-mcp-ignore M011: <why the versions differ>`",
  docsUrl: "https://github.com/jatimprovcsirt/panda-spec#compatibility",

  appliesTo(project: ProjectContext): boolean {
    return findDrift(project.files).length > 0;
  },

  check(project: ProjectContext): ProjectMatch[] {
    return findDrift(project.files).map((drift) => {
      const file = project.files.find((f) => f.relPath === drift.file);
      const line = file
        ? file.content
            .split("\n")
            .findIndex((t) => t.includes(PACKAGE_TO_REPO.find((p) => p.repo === drift.repo)?.needle ?? "")) + 1
        : 1;

      return {
        file: drift.file,
        line: line > 0 ? line : 1,
        message:
          `Project depends on ${drift.repo} ${drift.projectVersion}; ` +
          `the bundled documentation covers ${drift.bundledVersion}.`,
      };
    });
  },
};
