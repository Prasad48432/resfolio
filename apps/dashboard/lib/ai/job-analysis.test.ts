import type { ProfileItemRef } from "@resfolio/profile";
import { describe, expect, it } from "vitest";

import {
  coverKeywords,
  indexProfileItems,
  isKeywordPresent,
  jobAnalysisSchema,
  parseJobRequest,
  summarizeMatch,
  verifyRequirement,
  type RawRequirement,
  type VerifiedRequirement,
} from "./job-analysis";
import { MAX_JD_CHARS } from "./limits";

const REFS: ProfileItemRef[] = [
  { id: "exp-1", section: "experience", label: "Senior Engineer · Acme" },
  { id: "proj-1", section: "projects", label: "Orbit" },
];

const index = indexProfileItems(REFS);

function requirement(patch: Partial<RawRequirement> = {}): RawRequirement {
  return {
    text: "5+ years building distributed systems",
    evidence: ["exp-1"],
    level: "strong",
    note: "Six years at Acme on billing infrastructure.",
    ...patch,
  };
}

function verified(level: VerifiedRequirement["level"]): VerifiedRequirement {
  return { text: "x", level, note: "n", evidence: [], downgraded: false };
}

describe("jobAnalysisSchema", () => {
  it("puts evidence before the level, so a verdict is never generated first", () => {
    // Structured output follows schema order, so this ordering is what makes
    // the model find its support before judging — and what lets the UI show a
    // level only once it has been checked. Guarding it because a tidy-up that
    // alphabetised these fields would silently undo both.
    const keys = Object.keys(
      jobAnalysisSchema.shape.requirements.element.shape,
    );
    expect(keys.indexOf("evidence")).toBeLessThan(keys.indexOf("level"));
  });

  it("gives the model no field in which to state a match percentage", () => {
    expect(Object.keys(jobAnalysisSchema.shape)).toEqual([
      "role",
      "requirements",
      "keywords",
    ]);
  });
});

describe("verifyRequirement", () => {
  it("resolves citations to the items the UI will show", () => {
    const result = verifyRequirement(requirement(), index);
    expect(result.evidence).toEqual([REFS[0]]);
    expect(result.level).toBe("strong");
    expect(result.downgraded).toBe(false);
  });

  it("drops a citation that names nothing in this profile", () => {
    const result = verifyRequirement(
      requirement({ evidence: ["exp-1", "exp-nope"] }),
      index,
    );
    expect(result.evidence).toEqual([REFS[0]]);
    expect(result.level).toBe("strong");
  });

  it("demotes a match whose every citation was invented", () => {
    // The failure this exists for: a model that has decided someone is a good
    // fit cites an id it half-remembers, and the fabrication arrives as a score
    // rather than as a sentence.
    const result = verifyRequirement(
      requirement({ level: "strong", evidence: ["ghost"] }),
      index,
    );
    expect(result.level).toBe("gap");
    expect(result.downgraded).toBe(true);
  });

  it("demotes a partial with no evidence too", () => {
    const result = verifyRequirement(
      requirement({ level: "partial", evidence: [] }),
      index,
    );
    expect(result.level).toBe("gap");
    expect(result.downgraded).toBe(true);
  });

  it("leaves a genuine gap alone", () => {
    const result = verifyRequirement(
      requirement({ level: "gap", evidence: [], note: "Not mentioned." }),
      index,
    );
    expect(result.level).toBe("gap");
    // Not a demotion — the model said gap and meant it, and flagging it would
    // put a warning on the analysis' most honest line.
    expect(result.downgraded).toBe(false);
  });
});

describe("summarizeMatch", () => {
  it("counts strong as 1 and partial as a half", () => {
    const summary = summarizeMatch([
      verified("strong"),
      verified("strong"),
      verified("partial"),
      verified("gap"),
    ]);
    expect(summary).toEqual({
      score: 63, // (2 + 0.5) / 4
      strong: 2,
      partial: 1,
      gap: 1,
      total: 4,
    });
  });

  it("is reproducible for the same input", () => {
    const input = [verified("strong"), verified("gap"), verified("partial")];
    expect(summarizeMatch(input)).toEqual(summarizeMatch(input));
  });

  it("scores an all-gap analysis at zero rather than dividing by nothing", () => {
    expect(summarizeMatch([verified("gap")]).score).toBe(0);
    expect(summarizeMatch([]).score).toBe(0);
  });
});

describe("isKeywordPresent", () => {
  const haystack =
    "Worked at Google on Kubernetes. Shipped a C++ and .NET SDK.";

  it("does not report Go as covered because the profile says Google", () => {
    // The bug this rules out is the damaging direction: telling someone their
    // resume already says something it doesn't.
    expect(isKeywordPresent(haystack, "Go")).toBe(false);
    expect(isKeywordPresent("Wrote services in Go.", "Go")).toBe(true);
  });

  it("matches keywords whose edges aren't word characters", () => {
    // `\bc\+\+\b` matches nothing — there is no boundary after a `+`.
    expect(isKeywordPresent(haystack, "C++")).toBe(true);
    expect(isKeywordPresent(haystack, ".NET")).toBe(true);
  });

  it("matches multi-word phrases and ignores case", () => {
    expect(
      isKeywordPresent("Built distributed systems.", "Distributed Systems"),
    ).toBe(true);
  });

  it("treats a dot as a literal, not as any character", () => {
    expect(isKeywordPresent("Used Nodexjs somewhere", "node.js")).toBe(false);
    expect(isKeywordPresent("Used Node.js in anger", "node.js")).toBe(true);
  });

  it("is false for an empty keyword rather than matching everything", () => {
    expect(isKeywordPresent(haystack, "   ")).toBe(false);
  });
});

describe("coverKeywords", () => {
  it("marks each keyword present or absent", () => {
    expect(coverKeywords(["Kubernetes", "Rust"], "Ran Kubernetes.")).toEqual([
      { keyword: "Kubernetes", present: true },
      { keyword: "Rust", present: false },
    ]);
  });

  it("collapses repeats, which models produce in long lists", () => {
    expect(coverKeywords(["React", "react", " React "], "")).toHaveLength(1);
  });
});

describe("parseJobRequest", () => {
  it("accepts a pasted description", () => {
    const result = parseJobRequest({ jobDescription: "  Senior Engineer  " });
    expect(result).toEqual({ ok: true, jobDescription: "Senior Engineer" });
  });

  it("rejects an empty paste as invalid, not as too large", () => {
    const result = parseJobRequest({ jobDescription: "   " });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.problem.kind).toBe("invalid");
  });

  it("rejects an oversized description rather than truncating it", () => {
    // Truncation would analyse a job nobody advertised, confidently.
    const result = parseJobRequest({
      jobDescription: "x".repeat(MAX_JD_CHARS + 1),
    });
    expect(result.ok === false && result.problem.kind).toBe("too-large");
  });

  it("rejects a body that isn't the expected shape", () => {
    expect(parseJobRequest(null).ok).toBe(false);
    expect(parseJobRequest({ jd: "text" }).ok).toBe(false);
  });
});
