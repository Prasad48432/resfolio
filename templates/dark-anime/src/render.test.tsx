import { profileViewFixtures } from "@resfolio/fixtures";
import {
  checkTemplateRequirements,
  resolveTheme,
  type PortfolioPageKind,
  type PostView,
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
      [
        "about",
        "blog",
        "blogPost",
        "home",
        "projectDetail",
        "projects",
        "resume",
      ].sort(),
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

  // The ember canvas is decoration on the banner, so it must not outlive it:
  // a canvas floating over a page with no banner would sit on the hero.
  it("mounts the ember canvas only alongside a banner", () => {
    expect(body(render("home", ada))).not.toContain("rf-banner-embers");
    expect(
      body(
        render(
          "home",
          ada,
          {},
          {
            ...defaultDarkAnimeConfig,
            bannerImage: "https://example.com/banner.jpg",
          },
        ),
      ),
    ).toContain("rf-banner-embers");
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

  it("caps the home page's featured projects and links them all from /projects", () => {
    const count = (html: string) =>
      html.split(`href="/p/ada/projects/prj-`).length - 1;
    const home = count(render("home", ada));
    expect(home).toBeGreaterThan(0);
    expect(home).toBeLessThanOrEqual(6);
    expect(count(render("projects", ada))).toBeGreaterThanOrEqual(home);
  });

  // The avatar is driven by the data, not by a toggle (config.ts): present on
  // a profile that has one, absent on one that doesn't.
  it("shows the avatar when the profile has one and omits it when it doesn't", () => {
    expect(body(render("home", ada))).toContain("rf-avatar");
    expect(
      body(
        render("home", {
          ...ada,
          basics: { ...ada.basics, avatarUrl: undefined },
        }),
      ),
    ).not.toContain("rf-avatar");
  });

  // The frame is a wrapper element rather than a border on the <img>, because
  // the mat between them is padding and object-fit: cover would eat it.
  it("wraps the avatar in its frame", () => {
    expect(body(render("home", ada))).toContain("rf-avatar-frame");
  });
});

/**
 * Writing carries entries from two places that must render as one list: posts
 * written natively in Resfolio (projected in by `@resfolio/blog`, identified by
 * a `slug`) and articles imported from elsewhere (identified by a `url`). The
 * template never asks which is which — it reads the shape.
 */
/** A view whose Writing section holds exactly the given items. */
function withWriting(items: unknown[]): ProfileView {
  return {
    ...ada,
    sections: [
      ...ada.sections.filter((section) => section.key !== "writing"),
      { key: "writing", title: "Writing", items },
    ],
  } as ProfileView;
}

/** A text node, for building post bodies. */
const t = (value: string) => ({ type: "text", text: value });

/** Render the `blogPost` page with a given post (or none). */
function renderPost(post: PostView | undefined): string {
  const Page = darkAnime.pages.blogPost;
  if (!Page) throw new Error("no blogPost renderer");
  return renderToStaticMarkup(
    <Page
      view={ada}
      config={defaultDarkAnimeConfig}
      theme={theme}
      params={{ slug: post?.slug ?? "missing" }}
      basePath={BASE}
      post={post}
    />,
  );
}

const nativePost = {
  id: "post-1",
  source: "manual",
  title: "On Observability",
  publisher: "",
  summary: "Why boring systems win.",
  date: "2026-03-04",
  slug: "on-observability",
  coverImage: "https://cdn.example.com/cover.webp",
  tags: ["rust", "ops"],
  readingMinutes: 7,
};

describe("dark-anime — writing", () => {
  it("links a native post to its on-site URL, built from the base path", () => {
    const html = render("home", withWriting([nativePost]));
    expect(html).toContain(`href="/p/ada/blog/on-observability"`);
    expect(html).toContain("On Observability");
  });

  it("renders cover, excerpt, date, reading time and tags", () => {
    const html = body(render("home", withWriting([nativePost])));
    expect(html).toContain("https://cdn.example.com/cover.webp");
    expect(html).toContain("Why boring systems win.");
    expect(html).toContain("7 min read");
    expect(html).toContain("rust");
    expect(html).toContain("Mar 2026");
  });

  it("links an imported article out and marks it external", () => {
    const html = render(
      "home",
      withWriting([
        {
          id: "ref-1",
          source: "rss",
          title: "Elsewhere",
          publisher: "Some Blog",
          summary: "",
          url: "https://example.com/post",
          tags: [],
        },
      ]),
    );
    expect(html).toContain(`href="https://example.com/post"`);
    expect(html).toContain("rel="); // noopener on the outbound link
    expect(body(html)).toContain("rf-write-out");
  });

  it("renders an entry with neither slug nor url as inert, not a dead link", () => {
    // A talk with no recording is still worth listing — but an <a> with no
    // href is focusable, announced as a link, and goes nowhere.
    const html = body(
      render(
        "home",
        withWriting([
          {
            id: "talk-1",
            source: "manual",
            title: "A Talk",
            publisher: "SomeConf",
            summary: "",
            tags: [],
          },
        ]),
      ),
    );
    expect(html).toContain("A Talk");
    expect(html).toContain(`<div class="rf-write"`);
  });

  it("survives a post with no cover, tags or reading time", () => {
    const html = render(
      "home",
      withWriting([
        {
          id: "post-2",
          source: "manual",
          title: "Bare Post",
          publisher: "",
          summary: "",
          slug: "bare-post",
          tags: [],
        },
      ]),
    );
    expect(html).toContain("Bare Post");
    expect(body(html)).not.toContain("rf-write-cover");
  });
});

describe("dark-anime — blog index & post", () => {
  const post = {
    id: "post-1",
    title: "On Observability",
    slug: "on-observability",
    excerpt: "Why boring systems win.",
    body: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [t("A Section")] },
        { type: "paragraph", content: [t("Body prose here.")] },
        { type: "codeBlock", content: [t("cargo build")] },
      ],
    },
    coverImage: "https://cdn.example.com/cover.webp",
    tags: ["rust"],
    readingMinutes: 7,
    publishedOn: "2026-03-04",
    seo: { title: "On Observability", description: "Why boring systems win." },
  } as PostView;

  it("the index lists writing and links each entry", () => {
    const html = render("blog", withWriting([nativePost]));
    expect(html).toContain("Writing");
    expect(html).toContain(`href="/p/ada/blog/on-observability"`);
  });

  it("the index degrades to an empty state, not a crash", () => {
    expect(render("blog", withWriting([]))).toContain("Nothing published yet");
  });

  it("renders the post title, meta, cover, tags and body", () => {
    const html = renderPost(post);
    expect(html).toContain("On Observability");
    expect(html).toContain("7 min read");
    // The machine-readable date rides on <time>; HTML attribute names are
    // case-insensitive, so React's `dateTime` spelling is matched either way.
    expect(html).toMatch(/<time [^>]*datetime="2026-03-04"/i);
    expect(html).toContain("Mar 2026");
    expect(html).toContain("https://cdn.example.com/cover.webp");
    expect(html).toContain("Body prose here.");
    expect(html).toContain("cargo build");
    expect(html).toContain("rust");
  });

  it("keeps the post title as the only h1 on the page", () => {
    // The body's own h2 is demoted by the SDK; two h1s would be a real
    // accessibility and SEO fault on the page people actually read.
    const html = renderPost(post);
    expect(html.split("<h1").length - 1).toBe(1);
    expect(html).toContain("A Section");
  });

  it("degrades to a readable not-found body when no post is passed", () => {
    // The platform 404s an unknown slug before rendering; a template is not
    // entitled to assume that, and must not throw over a stale link.
    expect(renderPost(undefined)).toContain("Post not found");
  });

  it("links back to the index", () => {
    expect(renderPost(post)).toContain(`href="/p/ada/blog"`);
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
