import { z } from "zod";

/**
 * Template-specific presentation options for `portfolio-minimal` (doc 03).
 * Config is *presentation only* — knobs, never data. Anything the template
 * needs that isn't here lives in the Profile and arrives via the
 * `ProfileView`; a template never extends the Profile schema.
 *
 * The templates are curated and opinionated: config exposes **content and
 * visibility** choices (what shows), never styling (how it looks — colors,
 * type, layout are the template's own). That keeps every published site
 * on-brand by default. The dashboard renders the settings form from this
 * schema (doc 03), so new options never require dashboard changes.
 */
export const portfolioMinimalConfigSchema = z.object({
  /** Show the avatar portrait in the hero when the profile has one. */
  showAvatar: z.boolean().default(true),
  /** How many projects the home page features before "View all". */
  featuredProjectCount: z.number().int().min(1).max(12).default(4),
});

export type PortfolioMinimalConfig = z.infer<
  typeof portfolioMinimalConfigSchema
>;

export const defaultPortfolioMinimalConfig: PortfolioMinimalConfig =
  portfolioMinimalConfigSchema.parse({});
