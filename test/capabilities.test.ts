import { describe, expect, it } from "vitest";

import {
  CAPABILITY_STATEMENT,
  TIER1_TOOL_NAMES,
  TIER2_TOOL_NAMES,
  isTier2Enabled,
  resolveCapabilities,
} from "../src/capabilities.js";

describe("capability gating (PRD FR-M5)", () => {
  it("registers Tier 1 only under --docs-only", () => {
    const caps = resolveCapabilities(true);
    expect(caps.registered).toEqual([...TIER1_TOOL_NAMES]);
    expect(caps.withheld).toEqual([...TIER2_TOOL_NAMES]);
  });

  it("registers Tier 1 and Tier 2 without --docs-only", () => {
    const caps = resolveCapabilities(false);
    expect(caps.registered).toContain("search_docs");
    expect(caps.withheld).toEqual([]);
  });

  it("never registers a Tier 2 tool under --docs-only", () => {
    const caps = resolveCapabilities(true);
    for (const tool of TIER2_TOOL_NAMES) {
      expect(caps.registered).not.toContain(tool);
    }
  });

  it("reports Tier 2 as disabled only under --docs-only", () => {
    expect(isTier2Enabled(true)).toBe(false);
    expect(isTier2Enabled(false)).toBe(true);
  });

  it("does not report the same tool as both registered and withheld", () => {
    for (const docsOnly of [true, false]) {
      const caps = resolveCapabilities(docsOnly);
      const overlap = caps.registered.filter((t) =>
        (caps.withheld as readonly string[]).includes(t),
      );
      expect(overlap).toEqual([]);
    }
  });
});

describe("excluded capabilities are absent by construction (PRD FR-M25/26)", () => {
  const FORBIDDEN = [
    "encrypt",
    "decrypt",
    "decrypt_raw",
    "decryptRaw",
    "mask",
    "blind_index",
    "blindindex",
    "unmask",
  ];

  it("exposes no cryptographic operation in any mode", () => {
    for (const docsOnly of [true, false]) {
      const all = [
        ...resolveCapabilities(docsOnly).registered,
        ...resolveCapabilities(docsOnly).withheld,
      ].map((n) => n.toLowerCase());

      for (const forbidden of FORBIDDEN) {
        expect(all).not.toContain(forbidden.toLowerCase());
      }
    }
  });
});

describe("capability statement (PRD FR-M28)", () => {
  it("states the four claims a reader can verify", () => {
    expect(CAPABILITY_STATEMENT).toMatch(/reads files under the project root/i);
    expect(CAPABILITY_STATEMENT).toMatch(/writes only after you approve/i);
    expect(CAPABILITY_STATEMENT).toMatch(/makes no network requests/i);
    expect(CAPABILITY_STATEMENT).toMatch(/never holds, reads, requests, or has access to an encryption key/i);
  });

  it("states that no cryptographic operation is performed", () => {
    expect(CAPABILITY_STATEMENT).toMatch(/performs no cryptographic operation/i);
  });
});
