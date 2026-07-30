import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  buildProfileFromResume,
  calendarDate,
  httpUrl,
  isEmptyImport,
  linkLabel,
  resumeExtractionSchema,
  type ResumeExtraction,
} from "./intake";

/**
 * Resume intake, tested without a model — which is the point of the module
 * boundary: `intake.ts` takes a plain object, so every rule it enforces can be
 * exercised with a fixture. The prompt that produces the object is the
 * dashboard's problem (`lib/ai/resume-intake.ts`).
 */

const emptyBasics = {
  name: "",
  summary: "",
  location: "",
  email: "",
  phone: "",
  website: "",
  links: [] as { label: string; url: string }[],
};

function extraction(
  overrides: Partial<ResumeExtraction> = {},
): ResumeExtraction {
  return {
    basics: emptyBasics,
    experience: [],
    education: [],
    projects: [],
    skills: [],
    writing: [],
    certifications: [],
    awards: [],
    languages: [],
    ...overrides,
  };
}

function role(overrides: Partial<ResumeExtraction["experience"][number]> = {}) {
  return {
    company: "Acme",
    role: "Senior Engineer",
    location: "",
    startDate: "2022-01",
    endDate: "",
    summary: "",
    highlights: [] as string[],
    ...overrides,
  };
}

describe("the model-facing schema", () => {
  it("emits no oneOf — the strict response_format subset rejects it", () => {
    // The rule `proposal.ts` documents: a discriminated union becomes `oneOf`,
    // which fails with a 400 before generation starts, and on screen that is
    // indistinguishable from the model not answering.
    const json = JSON.stringify(z.toJSONSchema(resumeExtractionSchema));
    expect(json).not.toContain("oneOf");
  });

  it("has no optional properties — strict output requires every one present", () => {
    const schema = z.toJSONSchema(resumeExtractionSchema) as {
      properties: Record<string, unknown>;
      required?: string[];
    };
    expect(schema.required?.sort()).toEqual(
      Object.keys(schema.properties).sort(),
    );
  });
});

describe("calendarDate", () => {
  it("passes canonical values through", () => {
    expect(calendarDate("2024-03")).toBe("2024-03");
    expect(calendarDate("2024")).toBe("2024");
    expect(calendarDate("2024-03-15")).toBe("2024-03-15");
  });

  it("reads the human spellings a model falls back to", () => {
    expect(calendarDate("Jan 2020")).toBe("2020-01");
    expect(calendarDate("January 2020")).toBe("2020-01");
    expect(calendarDate("Sept. 2019")).toBe("2019-09");
    expect(calendarDate("03/2020")).toBe("2020-03");
    expect(calendarDate("3-2020")).toBe("2020-03");
  });

  it("never invents a component it was not given", () => {
    // The schema supports year-only precision precisely so this does not have
    // to guess at January.
    expect(calendarDate("2019")).toBe("2019");
  });

  it("keeps the year when the month is nonsense", () => {
    expect(calendarDate("2020-13")).toBe("2020");
  });

  it("is absent rather than approximate for anything unreadable", () => {
    expect(calendarDate("")).toBeUndefined();
    expect(calendarDate("Present")).toBeUndefined();
    expect(calendarDate("summer of '09")).toBeUndefined();
    expect(calendarDate("0007")).toBeUndefined();
  });
});

describe("httpUrl", () => {
  it("completes a bare host, because that is how resumes print links", () => {
    expect(httpUrl("github.com/someone")).toBe("https://github.com/someone");
  });

  it("keeps an explicit scheme", () => {
    expect(httpUrl("http://example.com/x")).toBe("http://example.com/x");
  });

  it("drops a trailing sentence punctuation the PDF ran into the URL", () => {
    expect(httpUrl("example.com/work.")).toBe("https://example.com/work");
  });

  it("refuses every scheme but http(s) — doc 10", () => {
    expect(httpUrl("javascript:alert(1)")).toBeUndefined();
    expect(httpUrl("data:text/html,<script>")).toBeUndefined();
    // An address belongs in contacts.email, not in a link.
    expect(httpUrl("mailto:someone@example.com")).toBeUndefined();
  });

  it("refuses a hostname that is not one", () => {
    // `https://senior` parses perfectly well as a URL.
    expect(httpUrl("Senior Engineer")).toBeUndefined();
    expect(httpUrl("")).toBeUndefined();
  });
});

describe("linkLabel", () => {
  it("prefers the printed label", () => {
    expect(linkLabel("My code", "https://github.com/x")).toBe("My code");
  });

  it("derives one from the host when the resume printed none", () => {
    expect(linkLabel("", "https://www.github.com/x")).toBe("Github");
  });
});

describe("buildProfileFromResume", () => {
  it("stamps resume provenance on every item, never manual", () => {
    const { profile } = buildProfileFromResume(
      extraction({ experience: [role()] }),
    );
    expect(profile.sections.experience[0]?.source).toBe("resume");
  });

  it("counts what landed, not what was extracted", () => {
    const result = buildProfileFromResume(
      extraction({
        // The second has no company, which `experienceItemSchema` requires.
        experience: [role(), role({ company: "" })],
      }),
    );
    expect(result.counts.experience).toBe(1);
    expect(result.dropped).toBe(1);
  });

  it("drops the bad field rather than the item around it", () => {
    const result = buildProfileFromResume(
      extraction({
        experience: [role({ startDate: "whenever", endDate: "Present" })],
      }),
    );
    // The role survives; only the dates are absent.
    expect(result.counts.experience).toBe(1);
    expect(result.dropped).toBe(0);
    expect(result.profile.sections.experience[0]?.startDate).toBeUndefined();
  });

  it("counts skills in terms, not groups", () => {
    const result = buildProfileFromResume(
      extraction({
        skills: [
          { name: "Languages", skills: ["TypeScript", "Go", "Rust"] },
          { name: "Cloud", skills: ["AWS", "Terraform"] },
        ],
      }),
    );
    expect(result.counts.skills).toBe(5);
    expect(result.profile.sections.skills).toHaveLength(2);
  });

  it("names an unheaded skill group rather than losing it", () => {
    const result = buildProfileFromResume(
      extraction({ skills: [{ name: "", skills: ["Docker"] }] }),
    );
    expect(result.profile.sections.skills[0]?.name).toBe("Skills");
  });

  it("turns a bulleted summary into sentences", () => {
    // `inlineRichTextSchema` rejects lists, so the alternative is losing the
    // paragraph every output surface leads with.
    const result = buildProfileFromResume(
      extraction({
        basics: {
          ...emptyBasics,
          summary: "- Led a team of six\n- Shipped the payments rewrite",
        },
      }),
    );
    expect(result.profile.basics.summary).toBe(
      "Led a team of six. Shipped the payments rewrite",
    );
    expect(result.hasSummary).toBe(true);
  });

  it("strips the bullet markers a PDF leaves on highlights", () => {
    const result = buildProfileFromResume(
      extraction({
        experience: [
          role({ highlights: ["• Cut build times by 40%", "1. Hired six"] }),
        ],
      }),
    );
    expect(result.profile.sections.experience[0]?.highlights).toEqual([
      "Cut build times by 40%",
      "Hired six",
    ]);
  });

  it("deduplicates the lines a two-column text layer repeats", () => {
    const result = buildProfileFromResume(
      extraction({
        experience: [role({ highlights: ["Shipped it", "shipped it"] })],
      }),
    );
    expect(result.profile.sections.experience[0]?.highlights).toEqual([
      "Shipped it",
    ]);
  });

  it("neutralises raw HTML rather than losing the item to it", () => {
    const result = buildProfileFromResume(
      extraction({
        experience: [role({ summary: "Ran <b>everything</b> on <div" })],
      }),
    );
    expect(result.counts.experience).toBe(1);
    expect(result.profile.sections.experience[0]?.summary).toBe(
      "Ran everything on div",
    );
  });

  it("removes the invisible debris that would defeat a keyword search", () => {
    const result = buildProfileFromResume(
      extraction({ experience: [role({ role: "Senior​Engineer " })] }),
    );
    expect(result.profile.sections.experience[0]?.role).toBe("Senior Engineer");
  });

  it("lets the document outrank the OAuth account on name and email", () => {
    const result = buildProfileFromResume(
      extraction({
        basics: {
          ...emptyBasics,
          name: "S. P. R. Mikkili",
          email: "hire.me@example.com",
        },
      }),
      { name: "Sai Prasad", email: "signin@gmail.com" },
    );
    expect(result.profile.basics.name).toBe("S. P. R. Mikkili");
    expect(result.profile.basics.contacts.email).toBe("hire.me@example.com");
  });

  it("falls back to the account when the document is silent", () => {
    const result = buildProfileFromResume(extraction(), {
      name: "Sai Prasad",
      email: "signin@gmail.com",
    });
    expect(result.profile.basics.name).toBe("Sai Prasad");
    expect(result.profile.basics.contacts.email).toBe("signin@gmail.com");
  });

  it("keeps a link only when its destination survives, and labels it", () => {
    const result = buildProfileFromResume(
      extraction({
        basics: {
          ...emptyBasics,
          links: [
            { label: "", url: "linkedin.com/in/someone" },
            { label: "Bad", url: "javascript:alert(1)" },
          ],
        },
      }),
    );
    expect(result.profile.basics.links).toHaveLength(1);
    expect(result.profile.basics.links[0]?.label).toBe("Linkedin");
  });

  it("caps a section at MAX_INTAKE_ITEMS", () => {
    const result = buildProfileFromResume(
      extraction({
        experience: Array.from({ length: 30 }, (_, index) =>
          role({ company: `Company ${index}` }),
        ),
      }),
    );
    expect(result.counts.experience).toBe(20);
  });

  it("never throws on an extraction that produced nothing", () => {
    const result = buildProfileFromResume(extraction(), { name: "Someone" });
    expect(isEmptyImport(result)).toBe(true);
    expect(result.dropped).toBe(0);
  });

  it("does not call a name alone a successful import", () => {
    // Every OAuth account has a name, so a profile carrying only one is what a
    // failed extraction looks like.
    const result = buildProfileFromResume(
      extraction({ basics: { ...emptyBasics, name: "Someone" } }),
    );
    expect(isEmptyImport(result)).toBe(true);
  });

  it("reports a real import as non-empty", () => {
    const result = buildProfileFromResume(extraction({ experience: [role()] }));
    expect(isEmptyImport(result)).toBe(false);
  });

  it("gives every item a distinct id", () => {
    const result = buildProfileFromResume(
      extraction({
        experience: [role({ company: "A" }), role({ company: "B" })],
      }),
    );
    const ids = result.profile.sections.experience.map((item) => item.id);
    expect(new Set(ids).size).toBe(2);
  });
});
