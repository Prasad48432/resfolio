import type { ProfileItemRef } from "@resfolio/profile";
import { describe, expect, it } from "vitest";

import {
  assembleCoverLetter,
  coverLetterFilename,
  coverLetterGreeting,
  coverLetterSchema,
  coverLetterSignoff,
  findUnsupportedTerms,
  verifyCoverLetter,
} from "./cover-letter";

/**
 * Cover letters (docs/architecture/13-ai-layer.md, Phase 6).
 *
 * The vocabulary scanner is the whole guarantee this phase has, so most of these
 * are adversarial: a fabrication that slips past it reaches an employer inside a
 * sentence nobody checked. The false-positive cases matter almost as much — a
 * warning list with noise in it is a warning list nobody reads, and then the real
 * flag goes unseen too.
 */

/** A profile and a posting, unioned — which is the haystack's whole point: a
 * letter may name what the user has done *or* what the posting asked for. */
const HAYSTACK = [
  '"company": "Acme", "role": "Senior Engineer"',
  '"technologies": ["TypeScript", "Postgres", "API"]',
  '"summary": "Cut checkout latency by 40% and mentored 3 engineers."',
  '"institution": "Imperial College London", "startDate": "2019-09"',
  "--- posting ---",
  "Senior Platform Engineer at Globex. We work in Go and Kubernetes.",
].join("\n");

describe("findUnsupportedTerms — catches fabrication", () => {
  it("flags a technology in neither the profile nor the posting", () => {
    const flags = findUnsupportedTerms(
      "I have shipped production services on Rust for three years.",
      HAYSTACK,
    );
    expect(flags).toEqual([{ term: "Rust", kind: "name" }]);
  });

  it("flags an invented employer used mid-sentence", () => {
    const flags = findUnsupportedTerms(
      "My time at Initech taught me to ship carefully.",
      HAYSTACK,
    );
    expect(flags.map((flag) => flag.term)).toEqual(["Initech"]);
  });

  it("flags a metric the profile never states", () => {
    // The single most consequential fabrication in a cover letter, and the one a
    // user is least likely to catch on a reread.
    const flags = findUnsupportedTerms(
      "I reduced infrastructure spend by 65% in my first quarter.",
      HAYSTACK,
    );
    expect(flags).toEqual([{ term: "65%", kind: "number" }]);
  });

  it("flags a years-of-experience total", () => {
    // Arithmetic over real dates, but still a claim the profile does not make —
    // and the prompt asks the model not to write one, so a flag here is the
    // check and the instruction agreeing.
    const flags = findUnsupportedTerms(
      "I bring 12 years of platform experience.",
      HAYSTACK,
    );
    expect(flags).toEqual([{ term: "12", kind: "number" }]);
  });

  it("flags a camel-cased name even at the start of a sentence", () => {
    // Position alone would miss this; the internal capital is what marks it as a
    // name wherever it sits.
    const flags = findUnsupportedTerms(
      "GraphQL is central to my work.",
      HAYSTACK,
    );
    expect(flags.map((flag) => flag.term)).toEqual(["GraphQL"]);
  });

  it("flags an all-caps acronym", () => {
    const flags = findUnsupportedTerms(
      "I hold an AWS certification.",
      HAYSTACK,
    );
    expect(flags.map((flag) => flag.term)).toEqual(["AWS"]);
  });

  it("reports a repeated term once", () => {
    const flags = findUnsupportedTerms(
      "I used Rust at scale. Rust is where I do my best work.",
      HAYSTACK,
    );
    expect(flags).toHaveLength(1);
  });

  it("does not let a profile word vouch for a substring of it", () => {
    // The posting mentions Go; the profile mentions neither Golang nor Google.
    // `includes`-style matching would call both covered.
    const flags = findUnsupportedTerms(
      "I have deep experience with Google infrastructure.",
      "Senior Engineer. We work in Go.",
    );
    expect(flags.map((flag) => flag.term)).toEqual(["Google"]);
  });
});

describe("findUnsupportedTerms — does not cry wolf", () => {
  it("accepts the posting's own company and role", () => {
    // The reason the posting is in the haystack at all: this vocabulary is
    // legitimately absent from the user's career.
    expect(
      findUnsupportedTerms(
        "I am applying for the Senior Platform Engineer role at Globex.",
        HAYSTACK,
      ),
    ).toEqual([]);
  });

  it("accepts a technology the posting asked for and the profile lacks", () => {
    expect(
      findUnsupportedTerms(
        "The posting's focus on Kubernetes is what drew me in.",
        HAYSTACK,
      ),
    ).toEqual([]);
  });

  it("accepts the profile's own employer, school and figures", () => {
    expect(
      findUnsupportedTerms(
        "At Acme I cut checkout latency by 40% and mentored 3 engineers, building on what I studied at Imperial College London.",
        HAYSTACK,
      ),
    ).toEqual([]);
  });

  it("accepts a plural of a profile term", () => {
    expect(findUnsupportedTerms("I design clean APIs.", HAYSTACK)).toEqual([]);
  });

  it("accepts a percentage whose number the profile states", () => {
    // The profile says 40%; a letter saying "40 percent" or "40%" is a
    // restatement, not a new claim.
    expect(findUnsupportedTerms("Latency fell 40 percent.", HAYSTACK)).toEqual(
      [],
    );
  });

  it("does not flag ordinary sentence openers", () => {
    expect(
      findUnsupportedTerms(
        "Your team's work interests me. Building reliable systems is what I do. Thank you for considering me.",
        HAYSTACK,
      ),
    ).toEqual([]);
  });

  it("does not flag the first person mid-sentence", () => {
    // "I" is the one English word capitalised mid-sentence for grammar alone.
    expect(
      findUnsupportedTerms(
        "Where I have worked, and where I'd like to work next, I've focused on reliability.",
        HAYSTACK,
      ),
    ).toEqual([]);
  });

  it("ignores punctuation and possessives", () => {
    expect(
      findUnsupportedTerms(
        "Acme's platform, TypeScript throughout, taught me a lot (especially Postgres).",
        HAYSTACK,
      ),
    ).toEqual([]);
  });
});

describe("verifyCoverLetter", () => {
  const ROLE_ID = "item_role";
  const PROJECT_ID = "item_project";

  const index = new Map<string, ProfileItemRef>([
    [
      ROLE_ID,
      { id: ROLE_ID, section: "experience", label: "Senior Engineer · Acme" },
    ],
    [PROJECT_ID, { id: PROJECT_ID, section: "projects", label: "Orbit" }],
  ]);

  it("resolves citations to items the user recognises", () => {
    const review = verifyCoverLetter(
      {
        opening:
          "I am applying for the Senior Platform Engineer role at Globex.",
        body: [
          {
            evidence: [ROLE_ID, PROJECT_ID],
            text: "At Acme I cut checkout latency by 40%.",
          },
        ],
        closing: "I would welcome a conversation.",
      },
      index,
      HAYSTACK,
    );

    expect(review.body[0]?.evidence.map((ref) => ref.label)).toEqual([
      "Senior Engineer · Acme",
      "Orbit",
    ]);
    expect(review.ungroundedCount).toBe(0);
    expect(review.unsupported).toEqual([]);
  });

  it("marks a paragraph ungrounded when its citations resolve to nothing", () => {
    // A model that has decided someone is a good fit will cite an id it half
    // remembers. The paragraph stays — a letter with a hole in the middle is
    // worse than one with a warning beside it — but it is not presented as
    // supported.
    const review = verifyCoverLetter(
      {
        opening: "Hello.",
        body: [
          {
            evidence: ["item_does_not_exist"],
            text: "I led the platform team.",
          },
        ],
        closing: "Thank you.",
      },
      index,
      HAYSTACK,
    );

    expect(review.body[0]?.ungrounded).toBe(true);
    expect(review.body[0]?.evidence).toEqual([]);
    expect(review.ungroundedCount).toBe(1);
  });

  it("scans opening and closing, not just the body", () => {
    const review = verifyCoverLetter(
      {
        opening: "I have followed Initech's work for years.",
        body: [{ evidence: [ROLE_ID], text: "At Acme I shipped TypeScript." }],
        closing: "I am relocating to Toronto shortly.",
      },
      index,
      HAYSTACK,
    );

    expect(review.unsupported.map((flag) => flag.term)).toEqual([
      "Initech",
      "Toronto",
    ]);
  });
});

describe("coverLetterSchema", () => {
  it("has no field for a greeting or a signoff", () => {
    // The envelope is the platform's, so an invented "Dear Ms. Chen" has nowhere
    // to go. Unknown keys are stripped rather than kept.
    const parsed = coverLetterSchema.parse({
      role: "Engineer",
      company: "Globex",
      greeting: "Dear Ms. Chen,",
      opening: "Hello.",
      body: [{ evidence: [], text: "Words." }],
      closing: "Thanks.",
      signoff: "Yours, Someone Else",
    });

    expect(parsed).not.toHaveProperty("greeting");
    expect(parsed).not.toHaveProperty("signoff");
  });

  it("orders evidence before text", () => {
    // Generation follows schema order, so this is what makes the model cite
    // before it writes. A tidy-up that alphabetised the two would undo it.
    const shape = Object.keys(coverLetterSchema.shape.body.element.shape);
    expect(shape).toEqual(["evidence", "text"]);
  });

  it("requires at least one body paragraph", () => {
    const result = coverLetterSchema.safeParse({
      role: "Engineer",
      company: "Globex",
      opening: "Hello.",
      body: [],
      closing: "Thanks.",
    });
    expect(result.success).toBe(false);
  });
});

describe("assembly", () => {
  it("builds plain text with blank lines between parts", () => {
    expect(
      assembleCoverLetter({
        greeting: "Dear Hiring Manager,",
        opening: "First.",
        body: ["Second.", "Third."],
        closing: "Fourth.",
        signoff: "Sincerely,\nAda",
      }),
    ).toBe(
      "Dear Hiring Manager,\n\nFirst.\n\nSecond.\n\nThird.\n\nFourth.\n\nSincerely,\nAda",
    );
  });

  it("drops empty parts so a partial stream has no gaps", () => {
    expect(
      assembleCoverLetter({
        greeting: "Dear Hiring Manager,",
        opening: "First.",
        body: [],
        closing: "",
        signoff: "",
      }),
    ).toBe("Dear Hiring Manager,\n\nFirst.");
  });

  it("falls back to an unaddressed greeting rather than inventing a name", () => {
    expect(coverLetterGreeting("  ")).toBe("Dear Hiring Manager,");
    expect(coverLetterGreeting("Dr Chen")).toBe("Dear Dr Chen,");
  });

  it("signs with the profile's name", () => {
    expect(coverLetterSignoff("Ada Lovelace")).toBe("Sincerely,\nAda Lovelace");
    expect(coverLetterSignoff("")).toBe("Sincerely,");
  });

  it("builds a filesystem-safe download name", () => {
    expect(coverLetterFilename("Globex / Inc.", "Senior Engineer")).toBe(
      "Globex Inc - Senior Engineer.pdf",
    );
    expect(coverLetterFilename("", "")).toBe("cover letter.pdf");
  });

  it("defaults to pdf, because that is what the download route serves", () => {
    // The regression this guards is invisible from either side on its own: the
    // route returned real PDF bytes under a `.txt` name, and a browser saves
    // what the header says. The file downloaded fine and opened in nothing.
    expect(coverLetterFilename("Acme", "Engineer")).toMatch(/\.pdf$/);
    expect(coverLetterFilename("Acme", "Engineer", "txt")).toBe(
      "Acme - Engineer.txt",
    );
  });
});
