import { profileViewFixtures } from "@resfolio/fixtures";
import {
  checkTemplateRequirements,
  resolveTheme,
  type PortfolioPageKind,
  type ProfileView,
} from "@resfolio/template-sdk";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { defaultDarkAnimeConfig, darkAnime } from "./index";
import type { DarkAnimeConfig } from "./config";

/**
 * The template contract harness (doc 05). Draws from `@resfolio/fixtures` so
 * unit, template and e2e tests all describe the same people.
 *
 * Note this renders the **server** output only: the client islands are inert
 * here, which is exactly the property worth testing — the page must be complete
 * without them.
 */

function getView(key: string): ProfileView {
  const found = profileViewFixtures.find((fixture) => fixture.key === key);
  if (!found) throw new Error(`missing fixture: ${key}`);
  return found.view;
}
const ada = getView("ada");
const jun = getView("jun");

const BASE = "/p/ada";
const theme = resolveTheme(darkAnime, {});

function render(
  page: PortfolioPageKind,
  view: ProfileView,
  params: Record<string, string> = {},
  config: DarkAnimeConfig = defaultDarkAnimeConfig,
): string {
  const Page = darkAnime.pages[page];
  if (!Page) throw new Error(`no renderer for ${page}`);
  return renderToStaticMarkup(
    <Page
      view={view}
      config={config}
      theme={theme}
      params={params}
      basePath={BASE}
    />,
  );
}

/**
 * The markup with the `<style>` block removed. Asserting "this class is absent"
 * against the raw output is a trap: the stylesheet names **every** class, so
 * `toContain("rf-banner")` is true even on a page with no cover.
 */
function body(html: string): string {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, "");
}

/** Just the theme root's inline `style` attribute — what `resolveTheme` put
 * there, as opposed to what the stylesheet declares. */
function inlineStyle(html: string): string {
  return /<div class="rf-site" style="([^"]*)"/.exec(html)?.[1] ?? "";
}

describe("dark-anime — definition", () => {
  it("renders every page it declares in capabilities", () => {
    for (const page of darkAnime.capabilities.pages) {
      expect(typeof darkAnime.pages[page]).toBe("function");
    }
  });

  it("declares the same pages as the platform route table (URL-stable switch)", () => {
    expect([...darkAnime.capabilities.pages].sort()).toEqual(
      ["about", "home", "projectDetail", "projects", "resume"].sort(),
    );
  });

  it("resolves fonts from the preset and colours from the stylesheet", () => {
    const html = render("home", ada);
    // The preset carries fonts only. If a colour ever lands in the inline
    // style, the runtime theme toggle silently stops working — an inline custom
    // property beats every stylesheet rule. That's what this guards.
    expect(inlineStyle(html)).toContain("--rf-font-display");
    expect(inlineStyle(html)).not.toContain("--rf-bg");
    expect(html).toContain("--rf-bg: #050506");
  });
});

describe("dark-anime — home", () => {
  it("renders name, summary and a featured project", () => {
    const html = render("home", ada);
    expect(html).toContain("Ada Okonkwo");
    expect(html).toContain("fluxlog");
    expect(html).toContain("<strong>12 years</strong>");
    expect(html).not.toContain("**12 years**");
  });

  it("links project cards to platform URLs", () => {
    const html = render("home", ada);
    expect(html).toContain(`href="/p/ada/projects/prj-fluxlog"`);
    expect(html).toContain(`href="/p/ada/resume"`);
  });

  it("renders for a sparse profile without crashing", () => {
    const html = render("home", jun);
    expect(html).toContain("Jun Park");
  });
});

describe("dark-anime — config", () => {
  it("shows the banner image only when configured", () => {
    expect(body(render("home", ada))).not.toContain("rf-banner");
    const html = render(
      "home",
      ada,
      {},
      {
        ...defaultDarkAnimeConfig,
        bannerImage: "https://example.com/banner.jpg",
      },
    );
    expect(body(html)).toContain("rf-banner");
    expect(html).toContain("https://example.com/banner.jpg");
  });

  it("shows the quote only when configured, with its attribution", () => {
    expect(body(render("home", ada))).not.toContain("rf-quote-text");
    const html = render(
      "home",
      ada,
      {},
      {
        ...defaultDarkAnimeConfig,
        quote: "Ship the thing.",
        quoteAttribution: "Someone wise",
      },
    );
    expect(html).toContain("Ship the thing.");
    expect(html).toContain("Someone wise");
  });

  it("honours featuredProjectCount on the home page", () => {
    const all = render("projects", ada);
    const one = render(
      "home",
      ada,
      {},
      {
        ...defaultDarkAnimeConfig,
        featuredProjectCount: 1,
      },
    );
    const count = (html: string) =>
      html.split(`href="/p/ada/projects/prj-`).length - 1;
    expect(count(one)).toBe(1);
    expect(count(all)).toBeGreaterThanOrEqual(1);
  });

  it("hides the avatar when showAvatar is off", () => {
    expect(body(render("home", ada))).toContain("rf-avatar");
    const html = render(
      "home",
      ada,
      {},
      {
        ...defaultDarkAnimeConfig,
        showAvatar: false,
      },
    );
    expect(body(html)).not.toContain("rf-avatar");
  });
});

describe("dark-anime — requirements", () => {
  it("reports the banner image missing on a default config", () => {
    const missing = checkTemplateRequirements(darkAnime.requirements, {
      config: defaultDarkAnimeConfig,
      view: ada,
    });
    expect(missing).toContainEqual({ scope: "config", key: "bannerImage" });
  });

  it("is satisfied by a full profile plus a banner", () => {
    const missing = checkTemplateRequirements(darkAnime.requirements, {
      config: {
        ...defaultDarkAnimeConfig,
        bannerImage: "https://example.com/banner.jpg",
      },
      view: ada,
    });
    expect(missing).toEqual([]);
  });

  it("reports what a sparse profile is missing, so the user can be told", () => {
    const missing = checkTemplateRequirements(darkAnime.requirements, {
      config: defaultDarkAnimeConfig,
      view: jun,
    });
    // `jun` is the deliberately-thin fixture — that's the case this feature
    // exists for.
    expect(missing.length).toBeGreaterThan(1);
    expect(missing.every((entry) => entry.key !== "basics.name")).toBe(true);
  });
});

describe("dark-anime — projects & detail", () => {
  it("lists all projects with detail links", () => {
    const html = render("projects", ada);
    expect(html).toContain("fluxlog");
    expect(html).toContain(`href="/p/ada/projects/prj-fluxlog"`);
  });

  it("resolves a project by slug (= stable id)", () => {
    const html = render("projectDetail", ada, { slug: "prj-fluxlog" });
    expect(html).toContain("fluxlog");
    expect(html).toContain(`href="https://github.com/example-ada/fluxlog"`);
  });

  it("degrades to a not-found body for an unknown slug", () => {
    const html = render("projectDetail", ada, { slug: "does-not-exist" });
    expect(html).toContain("Project not found");
  });
});

describe("dark-anime — about & résumé", () => {
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

describe("dark-anime — islands are an enhancement, not the page", () => {
  it("serves both palettes so the page is themed before any JS runs", () => {
    const html = render("home", ada);
    expect(html).toContain("prefers-color-scheme: light");
    expect(html).toContain(`.rf-site[data-theme="light"]`);
    // No server-rendered data-theme: CSS decides until the user chooses, so a
    // visitor is never briefly in the wrong key waiting for hydration.
    expect(body(html)).not.toContain("data-theme");
  });

  it("renders every nav destination as a real link, palette or no palette", () => {
    const html = render("home", ada);
    for (const path of ["/p/ada/projects", "/p/ada/about", "/p/ada/resume"]) {
      expect(html).toContain(`href="${path}"`);
    }
  });

  it("keeps revealed content in the server HTML", () => {
    // The Reveal island animates markup that is already there. If content ever
    // moved into a prop or behind hydration, this is what would catch it.
    expect(render("home", ada)).toContain("fluxlog");
  });
});

describe("dark-anime — safety", () => {
  it("is deterministic (same inputs → identical markup)", () => {
    expect(render("home", ada)).toBe(render("home", ada));
    expect(render("resume", ada)).toBe(render("resume", ada));
  });

  it("never emits a raw <script> from any page", () => {
    for (const page of darkAnime.capabilities.pages) {
      const html = render(page, ada, { slug: "prj-fluxlog" });
      // The stylesheet is a <style> block, not <script>.
      expect(html).not.toContain("<script");
    }
  });
});
