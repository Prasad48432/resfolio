import { defineTemplate } from "@resfolio/template-sdk";

import {
  defaultResumeClassicConfig,
  resumeClassicConfigSchema,
} from "./config";
import { ResumeDocument } from "./document";
import { customizableTokens, themes } from "./theme";

/**
 * `resume-classic` — the first Resfolio resume template
 * (docs/architecture/02-resume-rendering.md). Clean single-column, ATS-safe,
 * self-hosted Manrope, physical-unit CSS. Validated + frozen by
 * `defineTemplate` at load — a contract violation fails loudly in CI.
 */
export const resumeClassic = defineTemplate({
  kind: "resume",
  id: "resume-classic",
  // Bumped for the hyphen list marker (styles.ts). The PDF export store keys
  // on this version, so a presentation change that skips it keeps serving the
  // previous render from cache — the change would look applied in the preview
  // and be invisible in every download.
  version: "1.0.1",
  compat: { profileView: 1, sdk: 1 },

  name: "Classic",
  description:
    "A clean single-column resume — quiet typography, generous whitespace, ATS-safe.",

  configSchema: resumeClassicConfigSchema,
  defaultConfig: defaultResumeClassicConfig,
  themes,
  customizableTokens,

  capabilities: {
    atsSafe: true,
    pageSizes: ["A4", "LETTER"],
  },

  // Seeded into a new resume's view, then owned by the user. Education leads
  // because this template's readers are most often screening for it; a partial
  // list is deliberate — everything unlisted follows in canonical order.
  defaultSectionOrder: ["education", "experience", "projects", "skills"],

  document: ResumeDocument,
});

export {
  resumeClassicConfigSchema,
  defaultResumeClassicConfig,
  type ResumeClassicConfig,
} from "./config";
