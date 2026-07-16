import { describe, expect, it } from "vitest";

import { classifyCandidate } from "./classify";

/**
 * Import semantics (doc 12): three states, no conflict, no archive. The
 * never-overwrite invariant is structural — nothing here can auto-apply —
 * so the table is small and total.
 */
describe("classifyCandidate", () => {
  it("never imported → new", () => {
    expect(
      classifyCandidate({ externalFingerprint: "aaaa", baseFingerprint: null }),
    ).toBe("new");
  });

  it("same fingerprint as the receipt → duplicate (silently skipped)", () => {
    expect(
      classifyCandidate({
        externalFingerprint: "aaaa",
        baseFingerprint: "aaaa",
      }),
    ).toBe("duplicate");
  });

  it("changed fingerprint vs. the receipt → refresh_available", () => {
    expect(
      classifyCandidate({
        externalFingerprint: "bbbb",
        baseFingerprint: "aaaa",
      }),
    ).toBe("refresh_available");
  });

  // Idempotence: re-fetching identical upstream content can never produce a
  // second import — the same fingerprint is always a duplicate (fuzzed).
  it("an already-imported fingerprint is always a duplicate (fuzzed)", () => {
    for (let i = 0; i < 1000; i += 1) {
      const fingerprint = Math.random().toString(16).slice(2, 10);
      expect(
        classifyCandidate({
          externalFingerprint: fingerprint,
          baseFingerprint: fingerprint,
        }),
      ).toBe("duplicate");
    }
  });

  // Totality: every input lands in exactly one of the three states.
  it("classification is total over arbitrary fingerprints (fuzzed)", () => {
    for (let i = 0; i < 1000; i += 1) {
      const externalFingerprint = Math.random().toString(16).slice(2, 10);
      const baseFingerprint =
        Math.random() < 0.3 ? null : Math.random().toString(16).slice(2, 10);
      const state = classifyCandidate({ externalFingerprint, baseFingerprint });
      expect(["new", "duplicate", "refresh_available"]).toContain(state);
      if (baseFingerprint === null) {
        expect(state).toBe("new");
      }
    }
  });
});
