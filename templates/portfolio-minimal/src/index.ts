import { defineTemplate } from "@resfolio/template-sdk";

import {
  defaultPortfolioMinimalConfig,
  portfolioMinimalConfigSchema,
} from "./config";
import { AboutPage } from "./pages/about";
import { HomePage } from "./pages/home";
import { ProjectDetailPage } from "./pages/project-detail";
import { ProjectsPage } from "./pages/projects";
import { ResumePage } from "./pages/resume";
import { themes } from "./theme";

/**
 * `portfolio-minimal` — the first Resfolio portfolio template
 * (docs/architecture/03-portfolio-rendering.md). A quiet, editorial dark/light
 * site: serif display type, generous whitespace, project-forward. Universal
 * RSC pages (no required client JS). Validated + frozen by `defineTemplate`
 * at load — a contract violation fails loudly in CI.
 */
export const portfolioMinimal = defineTemplate({
  kind: "portfolio",
  id: "portfolio-minimal",
  version: "1.0.0",
  compat: { profileView: 1, sdk: 1 },

  name: "Minimal",
  description:
    "A quiet, editorial portfolio — serif headings, generous whitespace, project-forward. Dark or light.",

  configSchema: portfolioMinimalConfigSchema,
  defaultConfig: defaultPortfolioMinimalConfig,
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
  portfolioMinimalConfigSchema,
  defaultPortfolioMinimalConfig,
  type PortfolioMinimalConfig,
} from "./config";
