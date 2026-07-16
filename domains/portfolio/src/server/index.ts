/**
 * @resfolio/portfolio/server — database-backed Site operations
 * (docs/architecture/04-deployment.md, 07-storage.md). Kept separate from the
 * package root so the pure contract (slug rules, route table, types) can be
 * imported into client components, the render host, and tests without pulling
 * in the database client.
 */
export {
  createSite,
  getSiteForOwner,
  getSiteForRender,
  getSiteIdBySlug,
  isSlugAvailable,
  listDiscoverableSites,
  publishSite,
  updateSite,
  type DiscoverableSite,
  type PublishSiteResult,
  type SiteRenderData,
} from "./repository";
export {
  ProfileNotPublishedError,
  SiteDataError,
  SiteNotFoundError,
  SlugTakenError,
} from "../errors";
