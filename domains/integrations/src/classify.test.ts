import { describe, expect, it } from "vitest";

import { classifyCandidate } from "./classify";

describe("classifyCandidate", () => {
  it("never-imported → new", () => {
    expect(
      classifyCandidate({
        externalFingerprint: "aaaa",
        baseFingerprint: null,
        userEdited: false,
      }),
    ).toBe("new");
  });

  it("unchanged fingerprint → unchanged", () => {
    expect(
      classifyCandidate({
        externalFingerprint: "aaaa",
        baseFingerprint: "aaaa",
        userEdited: false,
      }),
    ).toBe("unchanged");
  });

  it("upstream changed, not edited → updated", () => {
    expect(
      classifyCandidate({
        externalFingerprint: "bbbb",
        baseFingerprint: "aaaa",
        userEdited: false,
      }),
    ).toBe("updated");
  });

  it("upstream changed, user edited → conflict", () => {
    expect(
      classifyCandidate({
        externalFingerprint: "bbbb",
        baseFingerprint: "aaaa",
        userEdited: true,
      }),
    ).toBe("conflict");
  });

  it("removed upstream → archive, regardless of edit or base", () => {
    expect(
      classifyCandidate({
        externalFingerprint: "bbbb",
        baseFingerprint: "aaaa",
        userEdited: true,
        upstreamRemoved: true,
      }),
    ).toBe("archive");
  });

  // The non-negotiable invariant (doc 12): an imported item the user has edited
  // is NEVER auto-updated — the only auto-appliable state is `updated`.
  it("never yields `updated` for an edited item (fuzzed)", () => {
    for (let i = 0; i < 1000; i += 1) {
      const externalFingerprint = Math.random().toString(16).slice(2, 10);
      const baseFingerprint =
        Math.random() < 0.3 ? null : Math.random().toString(16).slice(2, 10);
      const state = classifyCandidate({
        externalFingerprint,
        baseFingerprint,
        userEdited: true,
      });
      expect(state).not.toBe("updated");
    }
  });
});
