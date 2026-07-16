import { describe, expect, it } from "vitest";

import { candidateItemSchema, type CandidateItem } from "./candidate";
import { computeFingerprint } from "./fingerprint";

function project(overrides: Record<string, unknown> = {}): CandidateItem {
  return candidateItemSchema.parse({
    kind: "project",
    externalId: "repo-1",
    title: "fluxlog",
    url: "https://fluxlog.dev",
    metrics: [{ key: "stars", value: 10 }],
    raw: { fetchedAt: "2024-06-01" },
    payload: { name: "fluxlog", repoUrl: "https://github.com/ada/fluxlog" },
    ...overrides,
  });
}

describe("computeFingerprint", () => {
  it("is deterministic for identical content", () => {
    expect(computeFingerprint(project())).toBe(computeFingerprint(project()));
  });

  it("is a 16-char hex digest", () => {
    expect(computeFingerprint(project())).toMatch(/^[0-9a-f]{16}$/);
  });

  it("ignores `raw` — provider churn there must not fake an update", () => {
    const a = project({ raw: { fetchedAt: "2024-06-01", rateLimit: 5000 } });
    const b = project({ raw: { fetchedAt: "2024-12-31", rateLimit: 1 } });
    expect(computeFingerprint(a)).toBe(computeFingerprint(b));
  });

  it("changes when the payload changes", () => {
    const a = project();
    const b = project({ payload: { name: "fluxlog v2", repoUrl: "https://github.com/ada/fluxlog" } });
    expect(computeFingerprint(a)).not.toBe(computeFingerprint(b));
  });

  it("changes when metrics or url change", () => {
    const base = computeFingerprint(project());
    expect(computeFingerprint(project({ metrics: [{ key: "stars", value: 11 }] }))).not.toBe(base);
    expect(computeFingerprint(project({ url: "https://other.dev" }))).not.toBe(base);
  });
});
