import { describe, expect, it } from "vitest";

import { bundle, cite, getSection, searchDocs, sections, sectionsForStack } from "../src/content/index.js";

describe("bundled content", () => {
  it("contains the documentation set", () => {
    expect(sections().length).toBeGreaterThan(0);
  });

  it("records a source for every section (PRD FR-M8)", () => {
    for (const section of sections()) {
      expect(section.source.repo).toBeTruthy();
      expect(section.source.path).toBeTruthy();
      expect(section.source.commit).toBeTruthy();
      expect(section.body.length).toBeGreaterThan(0);
    }
  });

  it("stamps a generation time", () => {
    expect(Number.isNaN(Date.parse(bundle.generatedAt))).toBe(false);
  });

  it("never bundles content from outside a public repository", () => {
    // The generator enforces this at build time; this asserts the committed
    // output did not come from somewhere else.
    const allowed = new Set([
      "panda-spec",
      "panda-php",
      "panda-node",
      "panda-go",
      "panda-py",
      "panda-docker",
      "panda-mcp",
      "panda-docs",
    ]);

    for (const section of sections()) {
      expect(allowed).toContain(section.source.repo);
    }
  });
});

describe("search", () => {
  it("returns nothing for an empty query rather than everything", () => {
    expect(searchDocs("")).toEqual([]);
    expect(searchDocs("   ")).toEqual([]);
  });

  it("is deterministic — identical queries give identical results (NFR)", () => {
    const a = searchDocs("key provider");
    const b = searchDocs("key provider");
    expect(a).toEqual(b);
  });

  it("respects the limit", () => {
    expect(searchDocs("key", { limit: 2 }).length).toBeLessThanOrEqual(2);
  });

  it("carries a citation on every hit", () => {
    for (const hit of searchDocs("encrypt")) {
      expect(cite(hit.source)).toMatch(/@/);
      expect(hit.excerpt.length).toBeGreaterThan(0);
    }
  });

  it("scores title matches above body mentions", () => {
    const hits = searchDocs("envelope");
    expect(hits.length).toBeGreaterThan(0);
    // The envelope spec section titles itself "Envelope (Wire) Format".
    expect(hits[0]?.slug).toBe("envelope-format");
  });
});

describe("section lookup", () => {
  it("finds a section by slug", () => {
    expect(getSection("envelope-format")?.title).toContain("Envelope");
  });

  it("returns undefined for an unknown slug", () => {
    expect(getSection("no-such-section")).toBeUndefined();
  });

  it("includes cross-cutting sections for a stack filter", () => {
    const forGo = sectionsForStack("go");
    expect(forGo.some((s) => s.stacks.length === 0)).toBe(true);
    expect(forGo.some((s) => s.stacks.includes("go"))).toBe(true);
  });
});
