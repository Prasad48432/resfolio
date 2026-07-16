import { describe, expect, it } from "vitest";

import { candidateItemSchema } from "./candidate";

const validProject = {
  kind: "project" as const,
  externalId: "repo-1",
  title: "fluxlog",
  url: "https://fluxlog.dev",
  raw: { anything: true },
  payload: { name: "fluxlog", repoUrl: "https://github.com/ada/fluxlog" },
};

describe("candidateItemSchema", () => {
  it("parses a minimal project candidate and applies payload defaults", () => {
    const candidate = candidateItemSchema.parse(validProject);
    expect(candidate.kind).toBe("project");
    expect(candidate.media).toEqual([]);
    expect(candidate.metrics).toEqual([]);
    if (candidate.kind === "project") {
      // Reused profile item defaults flow through.
      expect(candidate.payload.description).toBe("");
      expect(candidate.payload.technologies).toEqual([]);
      expect(candidate.payload.highlights).toEqual([]);
    }
  });

  it("rejects an unknown kind", () => {
    expect(
      candidateItemSchema.safeParse({ ...validProject, kind: "mystery" })
        .success,
    ).toBe(false);
  });

  it("rejects a payload url with an unsafe scheme (profile schema enforced)", () => {
    const result = candidateItemSchema.safeParse({
      ...validProject,
      payload: { name: "x", url: "javascript:alert(1)" },
    });
    expect(result.success).toBe(false);
  });

  it("requires a non-empty externalId", () => {
    expect(
      candidateItemSchema.safeParse({ ...validProject, externalId: "" }).success,
    ).toBe(false);
  });

  it("validates an article against the writing payload shape", () => {
    const ok = candidateItemSchema.safeParse({
      kind: "article",
      externalId: "post-1",
      title: "Hello",
      raw: {},
      payload: { title: "Hello", summary: "world" },
    });
    expect(ok.success).toBe(true);
    // article payload has no `name` field — a project payload must not validate.
    const bad = candidateItemSchema.safeParse({
      kind: "article",
      externalId: "post-1",
      title: "Hello",
      raw: {},
      payload: { name: "wrong-shape" },
    });
    expect(bad.success).toBe(false);
  });

  it("rejects a metric with a non-member key", () => {
    expect(
      candidateItemSchema.safeParse({
        ...validProject,
        metrics: [{ key: "likes", value: 3 }],
      }).success,
    ).toBe(false);
  });
});
