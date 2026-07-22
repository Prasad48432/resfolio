import { defineTemplate } from "@resfolio/template-sdk";

import {
  defaultResumeEditorialConfig,
  resumeEditorialConfigSchema,
} from "./config";
import { ResumeDocument } from "./document";
import { customizableTokens, themes } from "./theme";

/**
 * `resume-editorial` — a serif, monochrome resume
 * (docs/architecture/02-resume-rendering.md). A centred masthead over a
 * `|`-separated contact line, uppercase section titles on full-width rules, and
 * two-column entry rows (title / dates, italic subtitle / location). Set in
 * **Lora** with Georgia-flavoured italics (see `theme.ts`). Single-column,
 * ATS-safe, physical-unit CSS. Validated + frozen by `defineTemplate` at load —
 * a contract violation fails loudly in CI.
 *
 * Its config is **structurally identical** to `resume-classic`'s so the two
 * share the dashboard's one resume editor form; only the defaults and the look
 * differ (see `config.ts`).
 */
export const resumeEditorial = defineTemplate({
  kind: "resume",
  id: "resume-editorial",
  version: "1.0.0",
  compat: { profileView: 1, sdk: 1 },

  name: "Editorial",
  description:
    "A serif, monochrome resume — centred masthead, ruled section titles, set in Lora. ATS-safe.",

  configSchema: resumeEditorialConfigSchema,
  defaultConfig: defaultResumeEditorialConfig,
  themes,
  customizableTokens,

  capabilities: {
    atsSafe: true,
    pageSizes: ["A4", "LETTER"],
  },

  // Seeded into a new resume's view, then owned by the user. Matches the
  // reference's reading order: education, experience, projects, achievements,
  // skills — a partial list; everything unlisted follows in canonical order.
  defaultSectionOrder: [
    "education",
    "experience",
    "projects",
    "awards",
    "skills",
  ],

  document: ResumeDocument,
});

export {
  resumeEditorialConfigSchema,
  defaultResumeEditorialConfig,
  type ResumeEditorialConfig,
} from "./config";
