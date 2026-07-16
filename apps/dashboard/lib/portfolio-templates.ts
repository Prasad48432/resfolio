import {
  defaultPortfolioMinimalConfig,
  portfolioMinimal,
  portfolioMinimalConfigSchema,
} from "@resfolio/template-portfolio-minimal";
import {
  defaultPortfolioSidebarConfig,
  portfolioSidebar,
  portfolioSidebarConfigSchema,
} from "@resfolio/template-portfolio-sidebar";
import type { z } from "zod";

/**
 * The portfolio templates the dashboard offers (docs/architecture/03-portfolio-rendering.md).
 * Mirrors `apps/sites/lib/portfolio-templates.ts` but carries only what the
 * settings UI needs — the pick list, each template's `configSchema` (the
 * settings form is generated from it) and default config. `apps/sites` owns
 * the render-time registry; this one owns configuration.
 */
export interface DashboardPortfolioTemplate {
  id: string;
  name: string;
  description: string;
  /** Major version pinned onto a new site (doc 05 compat). */
  major: number;
  configSchema: z.ZodObject<z.ZodRawShape>;
  defaultConfig: Record<string, unknown>;
}

function majorOf(version: string): number {
  return Number.parseInt(version.split(".")[0] ?? "1", 10);
}

export const PORTFOLIO_TEMPLATES: DashboardPortfolioTemplate[] = [
  {
    id: portfolioMinimal.id,
    name: portfolioMinimal.name,
    description: portfolioMinimal.description,
    major: majorOf(portfolioMinimal.version),
    configSchema: portfolioMinimalConfigSchema as z.ZodObject<z.ZodRawShape>,
    defaultConfig: { ...defaultPortfolioMinimalConfig },
  },
  {
    id: portfolioSidebar.id,
    name: portfolioSidebar.name,
    description: portfolioSidebar.description,
    major: majorOf(portfolioSidebar.version),
    configSchema: portfolioSidebarConfigSchema as z.ZodObject<z.ZodRawShape>,
    defaultConfig: { ...defaultPortfolioSidebarConfig },
  },
];

export function getDashboardPortfolioTemplate(
  id: string,
): DashboardPortfolioTemplate | undefined {
  return PORTFOLIO_TEMPLATES.find((template) => template.id === id);
}
