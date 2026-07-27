import { describe, expect, it } from "vitest";

import {
  ENHANCE_CONFIRM_THRESHOLD,
  UNTITLED_JOB,
  coverLetterSchema,
  deriveJobTitle,
  jobStatusSchema,
  needsEnhanceConfirmation,
  normalizeJobUrl,
  saveJobMatchInputSchema,
  scoreView,
  storedAnalysisSchema,
} from "./match";

/**
 * The pure half of the job domain.
 *
 * The tests that matter most here are `normalizeJobUrl`'s. That value arrives
 * from a chat message a model read and is rendered as a link the user clicks —
 * it is the one string in this package that can execute something.
 */

describe("deriveJobTitle", () => {
  it("joins the role and the company", () => {
    expect(deriveJobTitle("Senior Engineer", "Acme")).toBe(
      "Senior Engineer at Acme",
    );
  });

  it("uses whichever half exists", () => {
    expect(deriveJobTitle("Senior Engineer", null)).toBe("Senior Engineer");
    expect(deriveJobTitle(null, "Acme")).toBe("Acme");
    expect(deriveJobTitle("  ", "Acme")).toBe("Acme");
  });

  it("names a job with nothing readable on it", () => {
    expect(deriveJobTitle(null, null)).toBe(UNTITLED_JOB);
    expect(deriveJobTitle("", "   ")).toBe(UNTITLED_JOB);
  });

  it("truncates rather than wrapping the panel header", () => {
    const title = deriveJobTitle("R".repeat(200), "Acme");
    expect(title.length).toBeLessThanOrEqual(80);
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("normalizeJobUrl", () => {
  it("keeps an ordinary posting URL", () => {
    expect(normalizeJobUrl("https://acme.com/jobs/42")).toBe(
      "https://acme.com/jobs/42",
    );
  });

  it("promotes a bare host to https, because that is what people paste", () => {
    expect(normalizeJobUrl("acme.com/jobs/42")).toBe("https://acme.com/jobs/42");
  });

  // The reason this function exists rather than a trim().
  it("refuses a scheme that would execute on click", () => {
    expect(normalizeJobUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeJobUrl("  JavaScript:alert(1)  ")).toBeNull();
    expect(normalizeJobUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(normalizeJobUrl("file:///etc/passwd")).toBeNull();
  });

  it("refuses prose the model mistook for a link", () => {
    expect(normalizeJobUrl("remote")).toBeNull();
    expect(normalizeJobUrl("see the posting")).toBeNull();
  });

  it("treats absence as absence", () => {
    expect(normalizeJobUrl(null)).toBeNull();
    expect(normalizeJobUrl(undefined)).toBeNull();
    expect(normalizeJobUrl("   ")).toBeNull();
  });
});

describe("scoreView", () => {
  it("reports no delta before an enhancement", () => {
    expect(scoreView({ initialScore: 74, enhancedScore: null })).toEqual({
      score: 74,
      previous: null,
      delta: null,
    });
  });

  it("reports the improvement once both numbers exist", () => {
    expect(scoreView({ initialScore: 74, enhancedScore: 86 })).toEqual({
      score: 86,
      previous: 74,
      delta: 12,
    });
  });

  // "+12" against a baseline nobody measured is a claim, not a measurement.
  it("will not invent a delta against a missing baseline", () => {
    expect(scoreView({ initialScore: null, enhancedScore: 86 })).toEqual({
      score: 86,
      previous: null,
      delta: null,
    });
  });

  it("reports a drop as honestly as a rise", () => {
    expect(scoreView({ initialScore: 80, enhancedScore: 74 }).delta).toBe(-6);
  });

  it("has nothing to show for an unscored job", () => {
    expect(scoreView({ initialScore: null, enhancedScore: null }).score).toBeNull();
  });
});

describe("needsEnhanceConfirmation", () => {
  it("asks below the threshold", () => {
    expect(needsEnhanceConfirmation(ENHANCE_CONFIRM_THRESHOLD - 1)).toBe(true);
    expect(needsEnhanceConfirmation(0)).toBe(true);
  });

  it("proceeds at or above it", () => {
    expect(needsEnhanceConfirmation(ENHANCE_CONFIRM_THRESHOLD)).toBe(false);
    expect(needsEnhanceConfirmation(100)).toBe(false);
  });

  // Not knowing how well something fits is not a reason to skip the question.
  it("asks when there is no score", () => {
    expect(needsEnhanceConfirmation(null)).toBe(true);
  });
});

describe("schemas", () => {
  it("accepts a save that carries only what it knows", () => {
    const parsed = saveJobMatchInputSchema.safeParse({
      id: "0b8b1b3e-1f0e-4f1e-8f0e-1f0e4f1e8f0e",
      jobDescription: "Senior Frontend Engineer. React, TypeScript.",
    });
    expect(parsed.success).toBe(true);
  });

  it("refuses an empty job description — there is nothing to match against", () => {
    const parsed = saveJobMatchInputSchema.safeParse({
      id: "0b8b1b3e-1f0e-4f1e-8f0e-1f0e4f1e8f0e",
      jobDescription: "   ",
    });
    expect(parsed.success).toBe(false);
  });

  it("bounds a stored analysis rather than trusting its shape", () => {
    const parsed = storedAnalysisSchema.safeParse({
      requirements: [
        {
          text: "React",
          level: "strong",
          note: "Named in the Acme role.",
          evidence: [{ id: "exp1", section: "experience", label: "Acme" }],
          downgraded: false,
        },
      ],
      keywords: [{ keyword: "React", present: true }],
      summary: { score: 100, strong: 1, partial: 0, gap: 0, total: 1 },
    });
    expect(parsed.success).toBe(true);
  });

  it("refuses a score outside 0–100", () => {
    const parsed = storedAnalysisSchema.safeParse({
      requirements: [],
      keywords: [],
      summary: { score: 140, strong: 0, partial: 0, gap: 0, total: 0 },
    });
    expect(parsed.success).toBe(false);
  });

  it("has no field for a greeting or a sign-off", () => {
    const parsed = coverLetterSchema.parse({
      opening: "Acme's platform work is the part of this posting I want.",
      body: ["I rebuilt a billing dashboard at Northwind."],
      closing: "I'd welcome a conversation.",
      greeting: "Dear Ms. Chen",
      signoff: "Yours sincerely",
    });
    expect(parsed).not.toHaveProperty("greeting");
    expect(parsed).not.toHaveProperty("signoff");
  });

  it("knows the tracker's states", () => {
    expect(jobStatusSchema.safeParse("applied").success).toBe(true);
    expect(jobStatusSchema.safeParse("ghosted").success).toBe(false);
  });
});
