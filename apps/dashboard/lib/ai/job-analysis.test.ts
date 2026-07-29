import type { ProfileItemRef } from "@resfolio/profile";
import { describe, expect, it } from "vitest";

import {
  MIN_JOB_DESCRIPTION_CHARS,
  buildJobMatchReview,
  coverKeywords,
  findJobDescription,
  indexProfileItems,
  isKeywordPresent,
  jobAnalysisSchema,
  jobMatchInputSchema,
  optionalFact,
  parseJobRequest,
  summarizeMatch,
  verifyRequirement,
  type RawKeyword,
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

/** An atomic keyword, as the model emits one: no alternatives. */
function kw(term: string): RawKeyword {
  return { term, anyOf: [] };
}

describe("coverKeywords", () => {
  it("marks each keyword present or absent", () => {
    expect(
      coverKeywords([kw("Kubernetes"), kw("Rust")], "Ran Kubernetes."),
    ).toEqual([
      { keyword: "Kubernetes", present: true, alternatives: [], matched: null },
      { keyword: "Rust", present: false, alternatives: [], matched: null },
    ]);
  });

  it("collapses repeats, which models produce in long lists", () => {
    expect(
      coverKeywords([kw("React"), kw("react"), kw(" React ")], ""),
    ).toHaveLength(1);
  });

  /**
   * The reported bug: "Build features using Angular/React and Java/Node.js" was
   * read as four demands, so a profile with React and Node.js — which satisfies
   * that sentence completely — was told it lacked Angular and Java.
   */
  describe("either/or requirements", () => {
    const HAS = "Built with React and Node.js.";

    it("counts an alternation as covered when any one option is present", () => {
      const [angularOrReact] = coverKeywords(
        [{ term: "Angular/React", anyOf: ["Angular", "React"] }],
        HAS,
      );
      expect(angularOrReact?.present).toBe(true);
    });

    it("records which option satisfied it, so the claim is checkable", () => {
      const [entry] = coverKeywords(
        [{ term: "Java/Node.js", anyOf: ["Java", "Node.js"] }],
        HAS,
      );
      expect(entry?.matched).toBe("Node.js");
      expect(entry?.alternatives).toEqual(["Java", "Node.js"]);
    });

    it("is still a gap when none of the options is present", () => {
      const [entry] = coverKeywords(
        [{ term: "Elixir/Erlang", anyOf: ["Elixir", "Erlang"] }],
        HAS,
      );
      expect(entry?.present).toBe(false);
      expect(entry?.matched).toBeNull();
    });

    /** `CI/CD` is one thing. The model decides that by leaving `anyOf` empty —
     * splitting on the slash in code would produce a keyword "CD". */
    it("leaves an atomic slash term whole", () => {
      const [entry] = coverKeywords([kw("CI/CD")], "Set up CI/CD pipelines.");
      expect(entry?.keyword).toBe("CI/CD");
      expect(entry?.present).toBe(true);
      expect(entry?.matched).toBeNull();
    });

    it("does not claim a match for an atomic term via a substring of it", () => {
      // The word-boundary rule still applies to every candidate.
      const [entry] = coverKeywords([kw("CI/CD")], "Worked on CD players.");
      expect(entry?.present).toBe(false);
    });

    it("reports no matched option for an atomic term", () => {
      const [entry] = coverKeywords([kw("React")], HAS);
      expect(entry?.present).toBe(true);
      // "React satisfies React" is noise; only a choice needs explaining.
      expect(entry?.matched).toBeNull();
    });
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

/**
 * The chat tool's half of the analysis (Phase 7).
 *
 * `findJobDescription` is the one that would fail silently: get it wrong and the
 * profile is matched against the word "recalculate", which produces a confident
 * page of gaps rather than an error.
 */

/** A `UIMessage`-shaped stub — role and text parts are all this reads. */
const say = (role: "user" | "assistant", text: string) => ({
  role,
  parts: [{ type: "text", text }],
});

const POSTING =
  `Senior Frontend Engineer at Acme. ${"We need React, TypeScript and Next.js. ".repeat(10)}`.trim();

describe("findJobDescription", () => {
  it("finds the posting the user pasted", () => {
    expect(findJobDescription([say("user", POSTING)])).toBe(POSTING);
  });

  /**
   * The case this function exists for. After accepting enhancements the user
   * types "recalculate the match" — taking the literal last message would match
   * their profile against those two words.
   */
  it("walks back past a short follow-up to the posting", () => {
    const found = findJobDescription([
      say("user", POSTING),
      say("assistant", "You look like a strong fit for the React work."),
      say("user", "recalculate the match"),
    ]);
    expect(found).toBe(POSTING);
  });

  it("prefers the most recent posting when two were pasted", () => {
    const second =
      `Staff Backend Engineer at Northwind. ${"Go, Postgres and Kubernetes. ".repeat(10)}`.trim();
    expect(
      findJobDescription([say("user", POSTING), say("user", second)]),
    ).toBe(second);
  });

  it("ignores the assistant's own long turns", () => {
    const found = findJobDescription([
      say("assistant", "A long assistant answer. ".repeat(40)),
      say("user", "hello"),
    ]);
    expect(found).toBeNull();
  });

  // Better nothing than a confident analysis of a job nobody advertised.
  it("returns null when nothing is long enough to be a posting", () => {
    expect(findJobDescription([say("user", "hi")])).toBeNull();
    expect(findJobDescription([])).toBeNull();
    expect(
      findJobDescription([
        say("user", "x".repeat(MIN_JOB_DESCRIPTION_CHARS - 1)),
      ]),
    ).toBeNull();
  });

  it("accepts a message exactly at the floor", () => {
    const text = "x".repeat(MIN_JOB_DESCRIPTION_CHARS);
    expect(findJobDescription([say("user", text)])).toBe(text);
  });
});

describe("jobMatchInputSchema", () => {
  // The posting is closed over server-side; making the model echo it back would
  // double the bill for the turn.
  it("has no field for the job description", () => {
    const parsed = jobMatchInputSchema.parse({
      role: "Senior Frontend Engineer",
      requirements: [
        { text: "React", evidence: ["exp-1"], level: "strong", note: "Acme." },
      ],
      keywords: [kw("React")],
      jobDescription: "the whole posting, echoed back",
    });
    expect(parsed).not.toHaveProperty("jobDescription");
  });

  it("caps requirements, because every extra one is latency behind a blank panel", () => {
    const requirement = {
      text: "React",
      evidence: [],
      level: "gap" as const,
      note: "Not shown.",
    };
    expect(
      jobMatchInputSchema.safeParse({
        role: "Engineer",
        requirements: Array.from({ length: 13 }, () => requirement),
        keywords: [],
      }).success,
    ).toBe(false);
  });
});

describe("buildJobMatchReview", () => {
  const input = {
    role: "Senior Frontend Engineer",
    company: "  Acme  ",
    location: "",
    jobUrl: "https://acme.com/jobs/1",
    requirements: [
      {
        text: "React",
        evidence: ["exp-1"],
        level: "strong" as const,
        note: "Named in the Acme role.",
      },
      {
        text: "Kubernetes",
        // The model claimed a match and cited an id that does not exist.
        evidence: ["exp-99"],
        level: "strong" as const,
        note: "Claimed.",
      },
    ],
    keywords: [kw("React"), kw("Kubernetes")],
  };

  const context = {
    jobId: "job-1",
    jobDescription: POSTING,
    index: indexProfileItems(REFS),
    haystack: JSON.stringify({ skills: ["React"] }),
  };

  it("demotes a match whose citations resolve to nothing", () => {
    const review = buildJobMatchReview(input, context);
    expect(review.requirements[1]!.level).toBe("gap");
    expect(review.requirements[1]!.downgraded).toBe(true);
  });

  it("computes the score from the verified levels, not the claimed ones", () => {
    // One strong, one demoted to gap → 50%, never the 100% the model asserted.
    expect(buildJobMatchReview(input, context).summary.score).toBe(50);
  });

  it("checks keyword coverage against what the model was shown", () => {
    const review = buildJobMatchReview(input, context);
    expect(review.keywords).toEqual([
      { keyword: "React", present: true, alternatives: [], matched: null },
      {
        keyword: "Kubernetes",
        present: false,
        alternatives: [],
        matched: null,
      },
    ]);
  });

  it("normalises the posting's own fields without inventing them", () => {
    const review = buildJobMatchReview(input, context);
    expect(review.company).toBe("Acme");
    // An empty string is an absent location, not a location called "".
    expect(review.location).toBeNull();
  });

  /**
   * Observed against the real gateway: asked for a location the posting did not
   * state, the model answered "Not specified" rather than omitting the field.
   * Stored as-is, that renders under the job title as a place.
   */
  it("drops a model's stand-in for an absent field", () => {
    const review = buildJobMatchReview(
      { ...input, company: "N/A", location: "Not specified." },
      context,
    );
    expect(review.company).toBeNull();
    expect(review.location).toBeNull();
  });

  it("carries the id and the posting so the card can save itself", () => {
    const review = buildJobMatchReview(input, context);
    expect(review.jobId).toBe("job-1");
    expect(review.jobDescription).toBe(POSTING);
  });
});

describe("optionalFact", () => {
  it("keeps a real answer", () => {
    expect(optionalFact("Acme")).toBe("Acme");
    expect(optionalFact("  Hyderabad, India  ")).toBe("Hyderabad, India");
  });

  it("treats the ways a model says 'there isn't one' as absence", () => {
    for (const phrase of [
      "N/A",
      "n/a",
      "none",
      "Not specified",
      "not specified.",
      "Unspecified",
      "Not stated",
      "Not mentioned",
      "Unknown",
      "-",
      "   ",
      "",
    ]) {
      expect(optionalFact(phrase)).toBeNull();
    }
    expect(optionalFact(undefined)).toBeNull();
  });

  // The list is about absence, never about content. Both of these are answers.
  it("keeps answers that only look like non-answers", () => {
    expect(optionalFact("Remote")).toBe("Remote");
    expect(optionalFact("Confidential")).toBe("Confidential");
    expect(optionalFact("Anywhere")).toBe("Anywhere");
  });
});
