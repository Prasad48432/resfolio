import { buildPostView, withNativePosts, type PostView } from "@resfolio/blog";
import { getProfileFixture } from "@resfolio/fixtures";
import { createLogger } from "@resfolio/observability";
import {
  buildProfileView,
  type Profile,
  type ProfileView,
  type ViewDefinition,
} from "@resfolio/profile";
import { assetUrl } from "@resfolio/storage";
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
 *
 * Every 404 path here logs *why*. A portfolio that won't load has half a dozen
 * plausible causes (no DB, unknown slug, unpublished, a config the template
 * rejects) and they all render as the same blank "Page Not Found" — which
 * makes the one question the owner actually has, "why is my site missing?",
 * unanswerable from the outside.
 */
const log = createLogger("sites:resolve-site");

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
    config: {
      quote: "Boring, observable systems win.",
      quoteAttribution: "Ada",
    },
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
  /** The owning profile — what a post lookup and the `blog:<id>` tag key off.
   * Absent for fixture sites, which have no database rows behind them. */
  profileId?: string;
  templateId: string;
  templateMajor: number;
  config: unknown;
  discoverable: boolean;
  view: ProfileView;
  /** The favicon's public URL (resolved from the stored key), or undefined.
   * Consumed by `generateMetadata` for the page's `<link rel="icon">`. */
  faviconUrl?: string;
}

function buildFixture(descriptor: FixtureSiteDescriptor): LoadedPortfolio {
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
 *
 * **The unpublished case must resolve inside the cache, not before it.**
 * `getSiteIdBySlug` answers for any *claimed* slug regardless of publish
 * state, so a "not published yet" null is produced within `unstable_cache`
 * and carries the `site:<id>` tag — which is what lets the subsequent publish
 * invalidate it. Returning early on unpublished (as this did) cached the 404
 * with no tag on it, and the site stayed 404 for the full 24-hour window after
 * going live, with nothing able to clear it.
 */
async function loadFromDatabase(
  username: string,
): Promise<LoadedPortfolio | null> {
  // No database configured (the fixture/CI path) — every non-fixture slug is a
  // 404, never a 500. Importing `@resfolio/portfolio/server` would validate
  // `DATABASE_URL` and throw, so we don't even try.
  if (!env.DATABASE_URL) {
    log.debug({ username }, "portfolio 404: no DATABASE_URL configured");
    return null;
  }

  const { getSiteRefBySlug, getSiteForRender } =
    await import("@resfolio/portfolio/server");

  const ref = await getSiteRefBySlug(username);
  if (!ref) {
    log.debug({ username }, "portfolio 404: no site owns this slug");
    return null;
  }
  const { siteId, profileId } = ref;

  const load = unstable_cache(
    async (): Promise<LoadedPortfolio | null> => {
      const data = await getSiteForRender(username);
      if (!data) {
        // Claimed but never published, or the pinned version is gone. Cached
        // under `site:<id>` so `publishSite` clears it.
        log.debug(
          { username, siteId },
          "portfolio 404: site claimed but not published",
        );
        return null;
      }
      // Natively authored posts become Writing entries *before* the
      // projection, so the template reads one Writing list in which a post
      // written here and an article imported from RSS are the same shape
      // (domains/blog). Posts live in their own table, so this is the read
      // that keeps the section in sync with no write-back and no way to drift.
      const { listPublishedPosts } = await import("@resfolio/blog/server");
      const posts = await listPublishedPosts(data.profileId);

      return {
        siteId: data.siteId,
        profileId: data.profileId,
        templateId: data.templateId,
        templateMajor: data.templateMajor,
        config: data.config,
        discoverable: data.discoverable,
        // A key is origin-independent (doc 07); resolve it against the current
        // delivery origin. No R2 configured → no favicon, same as every other
        // stored image.
        faviconUrl:
          data.faviconKey && env.R2_PUBLIC_BASE_URL
            ? assetUrl(data.faviconKey, env.R2_PUBLIC_BASE_URL)
            : undefined,
        view: buildProfileView(
          withNativePosts(data.profile, posts, {
            assetBaseUrl: env.R2_PUBLIC_BASE_URL,
          }),
          data.view,
        ),
      };
    },
    ["portfolio-render-db", siteId],
    // **Two tags, and the second is load-bearing.** This render now depends on
    // the blog table as well as the pinned profile version, and the two change
    // on different events: `site:<id>` drops on a site publish, `blog:<id>` on
    // any post write. Tagging only the site would leave a newly published post
    // invisible for the full 24-hour fallback window, with nothing able to
    // clear it — the same class of bug as caching an unpublished 404.
    {
      tags: [`site:${siteId}`, `blog:${profileId}`],
      revalidate: 86400,
    },
  );

  return load();
}

/**
 * Load one published post for the `/blog/<slug>` route.
 *
 * Separate from `loadPortfolio` and only called on that route, because a post
 * body is unbounded prose: folding every post into the portfolio load would
 * put the whole blog in the cache entry behind every page of the site. This is
 * the one place the Resolve stage differs per page kind.
 *
 * Returns undefined for an unknown or draft slug — `getPublishedPostBySlug`
 * filters by status in the query, so there is no posture in which a draft can
 * be reached by guessing its URL.
 */
export async function loadPost(
  profileId: string,
  slug: string,
): Promise<PostView | undefined> {
  if (!env.DATABASE_URL) {
    return undefined;
  }

  const load = unstable_cache(
    async (): Promise<PostView | null> => {
      const { getPublishedPostBySlug } = await import("@resfolio/blog/server");
      const post = await getPublishedPostBySlug(profileId, slug);
      if (!post) {
        log.debug({ profileId, slug }, "post 404: no published post by slug");
        return null;
      }
      return buildPostView(post, { assetBaseUrl: env.R2_PUBLIC_BASE_URL });
    },
    ["blog-post", profileId, slug],
    // Same `blog:<id>` tag the portfolio load carries, so one revalidation
    // call from the dashboard clears the index and every post together.
    // Unpublishing must take the page down immediately, which is exactly why
    // the null is cached under the tag rather than returned before it.
    { tags: [`blog:${profileId}`], revalidate: 86400 },
  );

  return (await load()) ?? undefined;
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
