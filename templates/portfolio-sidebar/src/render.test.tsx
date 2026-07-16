import { profileViewFixtures } from "@resfolio/fixtures";
import {
  resolveTheme,
  type PortfolioPageKind,
  type ProfileView,
} from "@resfolio/template-sdk";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { portfolioSidebar } from "./index";

/**
 * The template contract harness (doc 05 impl step 4): render every declared
 * page against the shared fixture ProfileViews and assert real content
 * survives, links are platform-shaped, output is deterministic, and no raw
 * HTML from user text leaks. With `portfolio-minimal`'s identical harness this
 * is the seed the CI visual-snapshot layer grows from.
 */

function getView(key: string): ProfileView {
  const found = profileViewFixtures.find((fixture) => fixture.key === key);
  if (!found) throw new Error(`missing fixture: ${key}`);
  return found.view;
}
const ada = getView("ada");
const jun = getView("jun");

const BASE = "/p/ada";
const theme = resolveTheme(portfolioSidebar, { themeId: "slate" });

function render(
  page: PortfolioPageKind,
  view: ProfileView,
  params: Record<string, string> = {},
): string {
  const Page = portfolioSidebar.pages[page];
  if (!Page) throw new Error(`no renderer for ${page}`);
  return renderToStaticMarkup(
    <Page
      view={view}
      config={portfolioSidebar.defaultConfig}
      theme={theme}
      params={params}
      basePath={BASE}
    />,
  );
}

describe("portfolio-sidebar — definition", () => {
  it("renders every page it declares in capabilities", () => {
    for (const page of portfolioSidebar.capabilities.pages) {
      expect(typeof portfolioSidebar.pages[page]).toBe("function");
    }
  });

  it("declares the same pages as the platform route table (URL-stable switch)", () => {
    expect([...portfolioSidebar.capabilities.pages].sort()).toEqual(
      ["about", "home", "projectDetail", "projects", "resume"].sort(),
    );
  });

  it("applies the resolved theme preset to the root", () => {
    const html = render("home", ada);
    expect(html).toContain("--rf-accent:#6366f1");
    expect(html).toContain("--rf-bg:#0f1117");
  });
});

describe("portfolio-sidebar — home", () => {
  it("renders name, headline, summary and a featured project", () => {
    const html = render("home", ada);
    expect(html).toContain("Ada Okonkwo");
    expect(html).toContain("Staff Software Engineer");
    expect(html).toContain("fluxlog");
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
  });
});

describe("portfolio-sidebar — projects & detail", () => {
  it("lists all projects with detail links", () => {
    const html = render("projects", ada);
    expect(html).toContain("fluxlog");
    expect(html).toContain(`href="/p/ada/projects/prj-fluxlog"`);
  });

  it("resolves a project by slug (= stable id)", () => {
    const html = render("projectDetail", ada, { slug: "prj-fluxlog" });
    expect(html).toContain("fluxlog");
    expect(html).toContain("1.4k GitHub stars");
    expect(html).toContain(`href="https://github.com/example-ada/fluxlog"`);
  });

  it("degrades to a not-found body for an unknown slug", () => {
    const html = render("projectDetail", ada, { slug: "does-not-exist" });
    expect(html).toContain("Project not found");
  });
});

describe("portfolio-sidebar — about & résumé", () => {
  it("about renders the work history", () => {
    const html = render("about", ada);
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

describe("portfolio-sidebar — config & safety", () => {
  it("fixes the sidebar on the left (opinionated layout, not configurable)", () => {
    const html = render("home", ada);
    expect(html).toContain(`data-side="left"`);
  });

  it("is deterministic (same inputs → identical markup)", () => {
    expect(render("home", ada)).toBe(render("home", ada));
    expect(render("resume", ada)).toBe(render("resume", ada));
  });

  it("never emits a raw <script> from any page", () => {
    for (const page of portfolioSidebar.capabilities.pages) {
      const html = render(page, ada, { slug: "prj-fluxlog" });
      // The stylesheet is a <style> block, not <script>.
      expect(html).not.toContain("<script");
    }
  });
});
