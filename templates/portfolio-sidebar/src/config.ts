import { z } from "zod";

/**
 * Presentation config for `portfolio-sidebar` (doc 03). Config is knobs, never
 * data — everything the template shows comes from the ProfileView. Like every
 * template it's curated and opinionated: config exposes **content/visibility**
 * choices only (what shows), never styling (colors, layout, density are the
 * template's own), so a published site stays on-brand by default.
 */
export const portfolioSidebarConfigSchema = z.object({
  /** Show the avatar portrait in the sidebar when the profile has one. */
  showAvatar: z.boolean().default(true),
});

export type PortfolioSidebarConfig = z.infer<
  typeof portfolioSidebarConfigSchema
>;

export const defaultPortfolioSidebarConfig: PortfolioSidebarConfig =
  portfolioSidebarConfigSchema.parse({});
