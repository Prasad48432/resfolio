import { defineTemplate } from "@resfolio/template-sdk";

import { defaultDarkAnimeConfig, darkAnimeConfigSchema } from "./config";
import { AboutPage } from "./pages/about";
import { BlogPage } from "./pages/blog";
import { BlogPostPage } from "./pages/blog-post";
import { HomePage } from "./pages/home";
import { ProjectDetailPage } from "./pages/project-detail";
import { ProjectsPage } from "./pages/projects";
import { ResumePage } from "./pages/resume";
import { themes } from "./theme";

/**
 * `dark-anime` — Resfolio's portfolio template
 * (docs/architecture/03-portfolio-rendering.md).
 *
 * Adapted from **github.com/Ashutoshx7/Portfolio-v2-** (the trailing-dash repo;
 * `Portfolio-v2` without the dash is a different, unrelated site). A dark-first
 * developer site: a full-bleed banner, an avatar breaking its lower edge, a
 * dashed reading column, a fixed INDEX rail, and a single-scroll home —
 * Experience, Projects, Skills, Writing, a pull-quote — plus `/blog` and
 * `/blog/<slug>` for posts written natively in Resfolio.
 *
 * **What we kept and what we changed.** The reference is a personal site: its
 * name, bio, experience list, skills and socials are hardcoded arrays inside
 * components. Everything that was data there is the **ProfileView** here, so
 * the layout is one person's design serving any Resfolio profile. What has no
 * home in a Profile — the banner, the tagline, the quote, the intro-call link —
 * is template `config`, declared below and collected by the dashboard.
 *
 * Server-first with three client islands (theme toggle, ⌘K palette, INDEX
 * rail) — each an enhancement over markup already in the HTML, so the site
 * reads, navigates and indexes with no JS at all.
 *
 * Validated + frozen by `defineTemplate` at load — a contract violation fails
 * loudly in CI, never at request time.
 */
export const darkAnime = defineTemplate({
  kind: "portfolio",
  id: "dark-anime",
  version: "1.0.0",
  compat: { profileView: 1, sdk: 1 },

  name: "Dark Anime",
  description:
    "A dark-first developer site: full-bleed banner, dashed reading column, fixed index rail, single-scroll home. ⌘K to jump.",

  configSchema: darkAnimeConfigSchema,
  defaultConfig: defaultDarkAnimeConfig,
  themes,

  // What the schema cannot say (doc 05): that a URL is a banner, that it wants
  // 1200×260, that a quote is long-form. Everything else the dashboard infers.
  configFields: {
    bannerImage: {
      label: "Banner image",
      description:
        "The wide image across the top — this template's signature. Very wide and short; anything tall gets cropped hard.",
      kind: "image",
      image: { width: 1200, height: 260 },
    },
    tagline: {
      label: "Tagline",
      description:
        "The small line under your name. An age, a pronoun, a city — anything short.",
    },
    quote: {
      label: "Featured quote",
      description:
        "A line you want people to leave with. Empty hides the section.",
      kind: "textarea",
    },
    quoteAttribution: {
      label: "Quote attribution",
      description: "Who said it.",
    },
    introCallUrl: {
      label: "Intro call link",
      description: "Cal.com, Calendly, anything. Empty hides the button.",
      // Without this the field renders *no control at all*: it's a
      // `"" | url` union, a shape introspection refuses to guess at.
      kind: "url",
    },
  },

  // What this template can't look right without. Advisory: the dashboard
  // prompts and gates Publish, nothing blocks a render — the half-filled draft
  // preview is exactly what the user fixes it against.
  requirements: {
    config: ["bannerImage"],
    // The hero is name + summary over the banner; without them it's an image
    // with a gap under it. Experience and projects are the body.
    profile: [
      "basics.name",
      "basics.summary",
      "basics.avatarUrl",
      "sections.projects",
      "sections.experience",
    ],
  },

  capabilities: {
    pages: [
      "home",
      "projects",
      "projectDetail",
      "about",
      "resume",
      "blog",
      "blogPost",
    ],
  },

  pages: {
    home: HomePage,
    projects: ProjectsPage,
    projectDetail: ProjectDetailPage,
    about: AboutPage,
    resume: ResumePage,
    blog: BlogPage,
    blogPost: BlogPostPage,
  },
});

export {
  darkAnimeConfigSchema,
  defaultDarkAnimeConfig,
  type DarkAnimeConfig,
} from "./config";
