/**
 * @resfolio/portfolio — the portfolio domain (docs/architecture/03-portfolio-rendering.md,
 * 04-deployment.md). A **Site** is `Profile × (template + config)`; this domain
 * owns slug rules, the reserved-word blocklist, the platform route table, and
 * (in the `./server` surface, added with the publish flow) the `sites` table.
 *
 * The root is pure and framework-free — safe to import into the sites host, the
 * dashboard, and tests alike.
 */
export {
  RESERVED_SLUGS,
  isReservedSlug,
  siteSlugSchema,
  siteKindSchema,
  siteConfigSchema,
  updateSiteSchema,
  type SiteRecord,
  type SiteConfig,
  type NewSiteInput,
  type UpdateSiteInput,
} from "./schema";
export { resolvePortfolioRoute, type PortfolioRouteMatch } from "./routing";
