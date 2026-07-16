import { profileViewFixtures } from "@resfolio/fixtures";
import {
  resolveTheme,
  type PortfolioPageKind,
  type ProfileView,
} from "@resfolio/template-sdk";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { portfolioMinimal } from "./index";

/**
 * The template contract harness (doc 05 impl step 4): render every declared
 * page against the shared fixture ProfileViews and assert real content
 * survives, links are platform-shaped, output is deterministic, and no raw
 * HTML from user text leaks. This is the seed the CI visual-snapshot harness
 * grows from when template #2 lands.
 */

function getView(key: string): ProfileView {
  const found = profileViewFixtures.find((fixture) => fixture.key === key);
  if (!found) throw new Error(`missing fixture: ${key}`);
  return found.view;
}
const ada = getView("ada");
const jun = getView("jun");

const BASE = "/p/ada";
const theme = resolveTheme(portfolioMinimal, { themeId: "midnight" });

function render(
  page: PortfolioPageKind,
  view: ProfileView,
  params: Record<string, string> = {},
): string {
  const Page = portfolioMinimal.pages[page];
  if (!Page) throw new Error(`no renderer for ${page}`);
  return renderToStaticMarkup(
    <Page
      view={view}
      config={portfolioMinimal.defaultConfig}
      theme={theme}
      params={params}
      basePath={BASE}
    />,
  );
}

describe("portfolio-minimal — definition", () => {
  it("renders every page it declares in capabilities", () => {
    for (const page of portfolioMinimal.capabilities.pages) {
      expect(typeof portfolioMinimal.pages[page]).toBe("function");
    }
  });

  it("applies the resolved theme preset to the root", () => {
    const html = render("home", ada);
    expect(html).toContain("--rf-accent:#e0603a");
    expect(html).toContain("--rf-bg:#0a0a0b");
  });
});

describe("portfolio-minimal — home", () => {
  it("renders name, headline, summary and a featured project", () => {
    const html = render("home", ada);
    expect(html).toContain("Ada Okonkwo");
    expect(html).toContain("Staff Software Engineer");
    expect(html).toContain("fluxlog");
    // rich text is rendered, not shown as markdown
    expect(html).toContain("<strong>12 years</strong>");
    expect(html).not.toContain("**12 years**");
  });

  it("links the résumé action and project cards to platform URLs", () => {
    const html = render("home", ada);
    expect(html).toContain(`href="/p/ada/resume"`);
    expect(html).toContain(`href="/p/ada/projects/prj-fluxlog"`);
  });

  it("renders for a sparse profile without crashing", () => {
    const html = render("home", jun);
    expect(html).toContain("Jun Park");
    expect(html).toContain("Personal portfolio");
  });
});

describe("portfolio-minimal — projects & detail", () => {
  it("lists all projects with detail links", () => {
    const html = render("projects", ada);
    expect(html).toContain("fluxlog");
    expect(html).toContain(`href="/p/ada/projects/prj-fluxlog"`);
  });

  it("resolves a project by slug (= stable id)", () => {
    const html = render("projectDetail", ada, { slug: "prj-fluxlog" });
    expect(html).toContain("fluxlog");
    expect(html).toContain("structured logging library");
    expect(html).toContain("1.4k GitHub stars");
    expect(html).toContain(`href="https://github.com/example-ada/fluxlog"`);
  });

  it("degrades to a not-found body for an unknown slug", () => {
    const html = render("projectDetail", ada, { slug: "does-not-exist" });
    expect(html).toContain("Project not found");
  });
});

describe("portfolio-minimal — about & résumé", () => {
  it("about renders the work history", () => {
    const html = render("about", ada);
    expect(html).toContain("Ada Okonkwo");
    expect(html).toContain("Northwind Systems");
    expect(html).toContain("Experience");
  });

  it("résumé renders experience, education and skills", () => {
    const html = render("resume", ada);
    expect(html).toContain("Northwind Systems");
    expect(html).toContain("TU Berlin");
    expect(html).toContain("Rust");
  });
});

describe("portfolio-minimal — safety & determinism", () => {
  it("is deterministic (same inputs → identical markup)", () => {
    expect(render("home", ada)).toBe(render("home", ada));
    expect(render("resume", ada)).toBe(render("resume", ada));
  });

  it("never emits a raw <script> from any page", () => {
    for (const page of portfolioMinimal.capabilities.pages) {
      const html = render(page, ada, { slug: "prj-fluxlog" });
      expect(html).not.toContain("<script");
    }
  });
});
