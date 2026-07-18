import { getProfileFixture } from "@resfolio/fixtures";
import {
  buildProfileView,
  type Profile,
  type ProfileView,
  type ViewDefinition,
} from "@resfolio/profile";
import { unstable_cache } from "next/cache";

import { env } from "./env";

/**
 * Resolve → Project for public portfolio pages (docs/architecture/04-deployment.md,
 * 09-rendering-pipeline.md): turn a `<username>` into which Site to render,
 * load its **published** profile snapshot, and run the pure `buildProfileView`
 * — the same function the resume path and the dashboard preview run.
 *
 * Two sources, mirroring the resume route: `fixture` (dev/CI, no DB — `ada`
 * and `jun` always resolve so the public route is exercisable without a
 * database) and `db` (the real `sites` table via `@resfolio/portfolio/server`,
 * imported dynamically so the fixture path needs no `DATABASE_URL`). The DB
 * source wins only when the slug isn't a fixture, so CI stays deterministic.
 */

interface FixtureSiteDescriptor {
  /** Stable id used as the cache-invalidation tag (`site:<id>`). */
  siteId: string;
  templateId: string;
  templateMajor: number;
  /** Template-owned presentation config (opaque; the render re-validates it). */
  config: unknown;
  /** ViewDefinition applied by `buildProfileView` (`{}` = the whole profile). */
  view: ViewDefinition;
  discoverable: boolean;
  /** Which fixture profile snapshot to render. */
  fixtureRef: string;
}

/** Dev/CI Sites so `/p/<username>` renders with no database. */
const FIXTURE_SITES: Record<string, FixtureSiteDescriptor> = {
  ada: {
    siteId: "fixture-ada",
    templateId: "dark-anime",
    templateMajor: 1,
    // Exercises the template-config layer locally. No `coverImage`: a fixture
    // can't reference a real image, and a broken <img> in dev teaches nothing.
    config: { quote: "Boring, observable systems win.", quoteAttribution: "Ada" },
    view: {},
    discoverable: true,
    fixtureRef: "ada",
  },
  jun: {
    siteId: "fixture-jun",
    templateId: "dark-anime",
    templateMajor: 1,
    // Deliberately bare — `jun` is the sparse case, and `{}` parsing clean is
    // itself the check that every config field still carries a default.
    config: {},
    view: {},
    discoverable: true,
    fixtureRef: "jun",
  },
};

/** The dev/CI fixture usernames, for the sitemap (they always resolve). */
export const FIXTURE_SITE_USERNAMES = Object.keys(FIXTURE_SITES);

export interface LoadedPortfolio {
  siteId: string;
  templateId: string;
  templateMajor: number;
  config: unknown;
  discoverable: boolean;
  view: ProfileView;
}

function buildFixture(
  descriptor: FixtureSiteDescriptor,
): LoadedPortfolio {
  const profile: Profile = getProfileFixture(descriptor.fixtureRef);
  return {
    siteId: descriptor.siteId,
    templateId: descriptor.templateId,
    templateMajor: descriptor.templateMajor,
    config: descriptor.config,
    discoverable: descriptor.discoverable,
    view: buildProfileView(profile, descriptor.view),
  };
}

/**
 * The DB-backed load for a real published Site. Two steps so the expensive
 * work is cached but the tag is the stable site id (doc 04): a cheap uncached
 * `slug → siteId` lookup derives the `site:<id>` tag, then the profile load +
 * projection runs inside `unstable_cache` keyed by that tag. A publish calls
 * `revalidateTag('site:<id>')`; the 24h `revalidate` is only a fallback
 * against a missed invalidation. Returns null for an unknown/unpublished slug.
 */
async function loadFromDatabase(
  username: string,
): Promise<LoadedPortfolio | null> {
  // No database configured (the fixture/CI path) — every non-fixture slug is a
  // 404, never a 500. Importing `@resfolio/portfolio/server` would validate
  // `DATABASE_URL` and throw, so we don't even try.
  if (!env.DATABASE_URL) {
    return null;
  }

  const { getSiteIdBySlug, getSiteForRender } = await import(
    "@resfolio/portfolio/server"
  );

  const siteId = await getSiteIdBySlug(username);
  if (!siteId) {
    return null;
  }

  const load = unstable_cache(
    async (): Promise<LoadedPortfolio | null> => {
      const data = await getSiteForRender(username);
      if (!data) {
        return null;
      }
      return {
        siteId: data.siteId,
        templateId: data.templateId,
        templateMajor: data.templateMajor,
        config: data.config,
        discoverable: data.discoverable,
        view: buildProfileView(data.profile, data.view),
      };
    },
    ["portfolio-render-db", siteId],
    { tags: [`site:${siteId}`], revalidate: 86400 },
  );

  return load();
}

/**
 * Load everything needed to render a portfolio page for `username`. Fixture
 * Sites resolve first (dev/CI, cached + `site:<id>`-tagged); any other slug
 * falls through to the `sites` table. Returns null for an unknown username
 * (→ 404).
 */
export async function loadPortfolio(
  username: string,
): Promise<LoadedPortfolio | null> {
  const fixture = FIXTURE_SITES[username.toLowerCase()];
  if (fixture) {
    const load = unstable_cache(
      async (): Promise<LoadedPortfolio> => buildFixture(fixture),
      ["portfolio-render", username.toLowerCase()],
      { tags: [`site:${fixture.siteId}`], revalidate: 86400 },
    );
    return load();
  }

  return loadFromDatabase(username);
}
