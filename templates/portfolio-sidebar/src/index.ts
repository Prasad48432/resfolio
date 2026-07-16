import { defineTemplate } from "@resfolio/template-sdk";

import {
  defaultPortfolioSidebarConfig,
  portfolioSidebarConfigSchema,
} from "./config";
import { AboutPage } from "./pages/about";
import { HomePage } from "./pages/home";
import { ProjectDetailPage } from "./pages/project-detail";
import { ProjectsPage } from "./pages/projects";
import { ResumePage } from "./pages/resume";
import { themes } from "./theme";

/**
 * `portfolio-sidebar` — the second Resfolio portfolio template
 * (docs/architecture/03-portfolio-rendering.md). A two-column site: a sticky
 * profile sidebar (brand, avatar, nav, socials) beside a scrolling content
 * column, in a dark (`slate`) or light (`ivory`) sans-serif key. It declares
 * the **same** `capabilities.pages` as `portfolio-minimal` and builds URLs with
 * the same `href` seam, so switching between the two preserves every URL
 * (doc 04). Validated + frozen by `defineTemplate` at load.
 */
export const portfolioSidebar = defineTemplate({
  kind: "portfolio",
  id: "portfolio-sidebar",
  version: "1.0.0",
  compat: { profileView: 1, sdk: 1 },

  name: "Sidebar",
  description:
    "A two-column site — a sticky profile sidebar beside your work. Dark or light, clean sans-serif.",

  configSchema: portfolioSidebarConfigSchema,
  defaultConfig: defaultPortfolioSidebarConfig,
  themes,

  capabilities: {
    pages: ["home", "projects", "projectDetail", "about", "resume"],
  },

  pages: {
    home: HomePage,
    projects: ProjectsPage,
    projectDetail: ProjectDetailPage,
    about: AboutPage,
    resume: ResumePage,
  },
});

export {
  portfolioSidebarConfigSchema,
  defaultPortfolioSidebarConfig,
  type PortfolioSidebarConfig,
} from "./config";
