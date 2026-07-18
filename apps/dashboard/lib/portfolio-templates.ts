import {
  defaultDarkAnimeConfig,
  darkAnime,
  darkAnimeConfigSchema,
} from "@resfolio/template-dark-anime";
import type {
  ConfigFieldMeta,
  TemplateRequirements,
} from "@resfolio/template-sdk";
import type { z } from "zod";

/**
 * The portfolio templates the dashboard offers (docs/architecture/03-portfolio-rendering.md).
 * Mirrors `apps/sites/lib/portfolio-templates.ts` but carries only what the
 * settings UI needs — the pick list, each template's `configSchema` (the
 * settings form is generated from it), its default config, and the declarative
 * bits the schema can't express (`configFields`, `requirements`). `apps/sites`
 * owns the render-time registry; this one owns configuration.
 */
export interface DashboardPortfolioTemplate {
  id: string;
  name: string;
  description: string;
  /** Major version pinned onto a new site (doc 05 compat). */
  major: number;
  configSchema: z.ZodObject<z.ZodRawShape>;
  defaultConfig: Record<string, unknown>;
  /**
   * Gallery thumbnail. The SDK's `preview` field is the template's own asset
   * path; a template that ships none falls back to the placeholder in
   * `public/templates/`, so the picker is a grid of cards either way rather
   * than degrading into a list.
   */
  preview: string;
  /** Presentation hints merged over Zod introspection (`describeConfigSchema`). */
  configFields?: Readonly<Record<string, ConfigFieldMeta>>;
  /** What the template can't look right without (`checkTemplateRequirements`). */
  requirements?: TemplateRequirements;
}

function majorOf(version: string): number {
  return Number.parseInt(version.split(".")[0] ?? "1", 10);
}

/** Until a template ships a real screenshot. Rendering the picker as cards is
 * the point; a missing asset shouldn't collapse it back into a list. */
const PLACEHOLDER_PREVIEW = "/templates/placeholder.svg";

export const PORTFOLIO_TEMPLATES: DashboardPortfolioTemplate[] = [
  {
    id: darkAnime.id,
    name: darkAnime.name,
    description: darkAnime.description,
    major: majorOf(darkAnime.version),
    configSchema: darkAnimeConfigSchema as z.ZodObject<z.ZodRawShape>,
    defaultConfig: { ...defaultDarkAnimeConfig },
    configFields: darkAnime.configFields,
    requirements: darkAnime.requirements,
    preview: darkAnime.preview ?? PLACEHOLDER_PREVIEW,
  },
];

export function getDashboardPortfolioTemplate(
  id: string,
): DashboardPortfolioTemplate | undefined {
  return PORTFOLIO_TEMPLATES.find((template) => template.id === id);
}
