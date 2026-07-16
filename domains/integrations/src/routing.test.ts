import { describe, expect, it } from "vitest";

import {
  CANDIDATE_KINDS,
  candidateItemSchema,
  type CandidateItem,
} from "./candidate";
import {
  assertRouteTarget,
  COMPATIBLE_ROUTE_TARGETS,
  DEFAULT_ROUTE_FOR_KIND,
  isRouteCompatible,
  resolveRoute,
} from "./routing";
import { CandidateApplyError } from "./errors";

function articleCandidate(
  route?: CandidateItem["route"],
): CandidateItem {
  return candidateItemSchema.parse({
    kind: "article",
    externalId: "post-1",
    title: "Hello",
    raw: {},
    route,
    payload: { title: "Hello", summary: "Hi." },
  });
}

describe("routing policy", () => {
  it("every kind has a default route and a compatible-target list", () => {
    for (const kind of CANDIDATE_KINDS) {
      const route = DEFAULT_ROUTE_FOR_KIND[kind];
      expect(route).toBeDefined();
      expect(COMPATIBLE_ROUTE_TARGETS[kind]).toBeDefined();
      // A non-null default must be one of its own compatible targets.
      if (route.sectionKey !== null) {
        expect(COMPATIBLE_ROUTE_TARGETS[kind]).toContain(route.sectionKey);
      }
    }
  });

  it("unclassified defaults to unrouted — no automatic destination", () => {
    expect(DEFAULT_ROUTE_FOR_KIND.unclassified).toEqual({
      sectionKey: null,
      confidence: "suggested",
    });
  });

  it("profileBasics is suggested, never certain — a basics patch is always shown", () => {
    expect(DEFAULT_ROUTE_FOR_KIND.profileBasics).toEqual({
      sectionKey: "basics",
      confidence: "suggested",
    });
  });

  it("the LinkedIn kinds route to their own sections", () => {
    expect(DEFAULT_ROUTE_FOR_KIND.experience.sectionKey).toBe("experience");
    expect(DEFAULT_ROUTE_FOR_KIND.education.sectionKey).toBe("education");
    expect(DEFAULT_ROUTE_FOR_KIND.skillGroup.sectionKey).toBe("skills");
    expect(DEFAULT_ROUTE_FOR_KIND.certification.sectionKey).toBe(
      "certifications",
    );
  });
});

describe("resolveRoute", () => {
  it("falls back to the kind default when the connector declares nothing", () => {
    expect(resolveRoute(articleCandidate())).toEqual({
      sectionKey: "writing",
      confidence: "certain",
    });
  });

  it("honors a compatible connector declaration", () => {
    const candidate = articleCandidate({
      sectionKey: "writing",
      confidence: "suggested",
    });
    expect(resolveRoute(candidate)).toEqual({
      sectionKey: "writing",
      confidence: "suggested",
    });
  });

  it("sanitizes an incompatible connector declaration to unrouted, never guesses", () => {
    const candidate = articleCandidate({
      sectionKey: "projects",
      confidence: "certain",
    });
    expect(resolveRoute(candidate)).toEqual({
      sectionKey: null,
      confidence: "suggested",
    });
  });

  it("keeps an explicit unrouted declaration", () => {
    const candidate = articleCandidate({
      sectionKey: null,
      confidence: "suggested",
    });
    expect(resolveRoute(candidate).sectionKey).toBeNull();
  });
});

describe("route override validation (the mis-route guard)", () => {
  it("accepts a compatible target", () => {
    expect(() => assertRouteTarget("article", "writing")).not.toThrow();
    expect(isRouteCompatible("unclassified", "custom")).toBe(true);
  });

  it("rejects an incompatible target so a mis-route can't produce an invalid profile", () => {
    expect(() => assertRouteTarget("article", "projects")).toThrow(
      CandidateApplyError,
    );
    expect(() => assertRouteTarget("experience", "writing")).toThrow(
      CandidateApplyError,
    );
    expect(isRouteCompatible("skillGroup", "projects")).toBe(false);
  });
});
