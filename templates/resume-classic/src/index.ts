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
  version: "1.0.0",
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

  document: ResumeDocument,
});

export {
  resumeClassicConfigSchema,
  defaultResumeClassicConfig,
  type ResumeClassicConfig,
} from "./config";
