import { profileViewFixtures } from "@resfolio/fixtures";
import { resolveTheme, type ProfileView } from "@resfolio/template-sdk";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { defaultResumeEditorialConfig, resumeEditorial } from "./index";

/**
 * The template contract harness (doc 05). It renders the real document, so a
 * crash or a lost section shows up here rather than in a PDF. Draws from
 * `@resfolio/fixtures` for the "every section renders" cases, and from a
 * hand-built copy of the reference résumé for the "matches the PDF" cases.
 */

const theme = resolveTheme(resumeEditorial, {});

function render(view: ProfileView): string {
  return renderToStaticMarkup(
    <resumeEditorial.document
      view={view}
      config={defaultResumeEditorialConfig}
      theme={theme}
    />,
  );
}

/** The markup with the `<style>` block removed — the sheet names every class,
 * so asserting a class is present against raw output would always pass. */
function body(html: string): string {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, "");
}

function getView(key: string): ProfileView {
  const found = profileViewFixtures.find((fixture) => fixture.key === key);
  if (!found) throw new Error(`missing fixture: ${key}`);
  return found.view;
}

describe("resume-editorial — fixtures", () => {
  it("renders a full profile with every section, in reading order", () => {
    const html = render(getView("ada"));
    expect(html).toContain("Ada Okonkwo");
    // Section titles are uppercased by CSS, so the source text is title-cased.
    expect(body(html)).toContain("rf-section-title");
    expect(html).toContain("Experience");
    expect(html).toContain("Education");
    expect(html).toContain("Projects");
  });

  it("renders a sparse profile without crashing", () => {
    expect(render(getView("jun"))).toContain("Jun Park");
  });

  it("is deterministic (same inputs → identical markup)", () => {
    expect(render(getView("ada"))).toBe(render(getView("ada")));
  });

  it("never emits a raw <script> (it is a static document)", () => {
    expect(render(getView("ada"))).not.toContain("<script");
  });
});

/** A ProfileView mirroring the reference PDF, built directly (the document
 * consumes a ProfileView, so no Profile/migration machinery is needed here). */
const referenceView = {
  basics: {
    name: "Sai Prasad Reddy Mikkili",
    summary:
      "Full Stack AI Developer with experience designing scalable web applications, AI-powered platforms, and machine learning solutions. Proficient in Next.js, React, TypeScript, Python, TensorFlow, PostgreSQL, Supabase, AWS, and Docker.",
    location: "",
    contacts: {
      email: "prasadreddymar6@gmail.com",
      phone: "+91 8074414860",
      website: "",
    },
    links: [
      { id: "l1", label: "Portfolio", url: "https://example.com" },
      { id: "l2", label: "LinkedIn", url: "https://linkedin.com/in/example" },
      { id: "l3", label: "GitHub", url: "https://github.com/Prasad48432" },
    ],
  },
  sections: [
    {
      key: "education",
      items: [
        {
          id: "e1",
          institution: "Jawaharlal Nehru Technological University Hyderabad",
          degree: "B.Tech, Electronics and Communication Engineering",
          area: "",
          score: "8.05 CGPA",
          location: "Hyderabad, Telangana",
          startDate: "2021-09",
          endDate: "2025-06",
          summary: "",
          highlights: [],
        },
      ],
    },
    {
      key: "experience",
      items: [
        {
          id: "x1",
          role: "Full Stack AI Developer",
          company: "Revival Labs (Congkong Friends), Seoul (Remote)",
          location: "",
          startDate: "2025-07",
          endDate: "",
          summary: "",
          highlights: [
            "Built BrainGround, a real-time quiz platform supporting **2,000+** concurrent users with low-latency participation and live scoring.",
          ],
        },
      ],
    },
    {
      key: "projects",
      items: [
        {
          id: "p1",
          name: "Ezra AI",
          description: "",
          technologies: ["Typescript", "Next.js", "Supabase"],
          url: "https://ezra.example.com",
          repoUrl: "https://github.com/example/ezra",
          highlights: [
            "Engineered an AI-driven matchmaking engine for **500+** event participants.",
          ],
        },
      ],
    },
    {
      key: "skills",
      items: [
        {
          id: "s1",
          name: "Languages",
          skills: ["JavaScript", "TypeScript", "Python", "C++", "SQL"],
        },
      ],
    },
  ],
} as unknown as ProfileView;

describe("resume-editorial — matches the reference", () => {
  const html = render(referenceView);

  it("renders the masthead: name and a text contact line", () => {
    expect(html).toContain("Sai Prasad Reddy Mikkili");
    expect(html).toContain("prasadreddymar6@gmail.com");
    expect(html).toContain("GitHub");
    // Centred masthead, not a left-aligned header.
    expect(body(html)).toContain("rf-header");
  });

  it("emphasises inline numbers (e.g. 2,000+) via bold", () => {
    expect(html).toContain("<strong>2,000+</strong>");
    expect(html).not.toContain("**2,000+**");
  });

  it("puts a project's tech list on the title line and links opposite", () => {
    expect(body(html)).toContain("rf-entry-tech");
    expect(body(html)).toContain("rf-links");
    expect(html).toContain("Live");
    // The reference repo is a github.com URL, so the link reads "GitHub".
    expect(html).toContain("GitHub");
  });

  it("renders skills as 'Name: a | b | c'", () => {
    expect(html).toContain("Languages");
    expect(html).toContain("JavaScript | TypeScript | Python");
  });

  it("uses the serif font stack (Lora) via the theme token", () => {
    expect(html).toContain("--font-lora");
  });
});
