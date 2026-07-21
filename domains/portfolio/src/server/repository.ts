import { and, eq, isNotNull, ne } from "drizzle-orm";

import { db, schema } from "@resfolio/database";
import { getProfileVersionById } from "@resfolio/profile/server";
import {
  viewDefinitionSchema,
  type Profile,
  type ViewDefinition,
} from "@resfolio/profile";

import {
  ProfileNotPublishedError,
  SiteDataError,
  SiteNotFoundError,
  SlugTakenError,
} from "../errors";
import {
  siteConfigSchema,
  siteSlugSchema,
  updateSiteSchema,
  type NewSiteInput,
  type SiteConfig,
  type SiteRecord,
  type UpdateSiteInput,
} from "../schema";

/**
 * Site persistence (docs/architecture/04-deployment.md, 07-storage.md). The
 * only code that touches the `sites` table. Every owner-facing function takes
 * the auth context (`userId`) explicitly and scopes every query to the profile
 * that user owns — ownership is enforced here, never assumed from the caller
 * (docs/architecture/06-api-architecture.md, 10-auth-and-security.md). The one
 * unscoped read is `getSiteForRender(slug)`, called by the public render host:
 * the site is published state, the slug is the capability.
 *
 * A Site is `Profile × (template + config)`. Content is never stored here —
 * publishing **pins** the profile's currently published `profile_versions`
 * snapshot into `published_version_id`, so a cached public page can never show
 * draft state (doc 04).
 */

/** Order-independent JSON, for comparing a config against its JSONB-stored copy
 * (Postgres `jsonb` returns keys in its own order, not insertion order). Sorts
 * object keys at every depth; arrays keep their order, which is meaningful. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, inner]) => [key, sortKeys(inner)]),
    );
  }
  return value;
}

function toRecord(row: typeof schema.site.$inferSelect): SiteRecord {
  return {
    id: row.id,
    profileId: row.profileId,
    slug: row.slug,
    templateId: row.templateId,
    templateMajor: row.templateMajor,
    config: siteConfigSchema.parse(row.config),
    view: viewDefinitionSchema.parse(row.view),
    publishedVersionId: row.publishedVersionId,
    hasUnpublishedChanges: row.hasUnpublishedChanges,
    discoverable: row.discoverable,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** The id + published-version pointer of the profile a user owns (unique
 * `user_id`), or throw. Sites are scoped through this so a user can only ever
 * see or mutate their own. */
async function requireProfile(
  userId: string,
): Promise<{ id: string; publishedVersionId: string | null }> {
  const row = await db.query.profile.findFirst({
    where: eq(schema.profile.userId, userId),
    columns: { id: true, publishedVersionId: true },
  });
  if (!row) {
    throw new SiteDataError("No profile exists for this user.");
  }
  return row;
}

/** The user's Site, or null if they haven't claimed one yet. One site per
 * profile today (unique `profile_id`). */
export async function getSiteForOwner(
  userId: string,
): Promise<SiteRecord | null> {
  const profile = await requireProfile(userId);
  const row = await db.query.site.findFirst({
    where: eq(schema.site.profileId, profile.id),
  });
  return row ? toRecord(row) : null;
}

/**
 * Whether `slug` is free for this user to claim — false if it's reserved
 * (caught earlier by `siteSlugSchema`) or already held by *another* profile.
 * The user's own current slug counts as available (so re-saving is a no-op).
 */
export async function isSlugAvailable(
  userId: string,
  slug: string,
): Promise<boolean> {
  const normalized = siteSlugSchema.parse(slug);
  const profile = await requireProfile(userId);
  const holder = await db.query.site.findFirst({
    where: eq(schema.site.slug, normalized),
    columns: { profileId: true },
  });
  return !holder || holder.profileId === profile.id;
}

/** Postgres unique-violation code — a slug (or profile) raced us to the row. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

/**
 * Claim a Site for the user's profile (doc 04: the slug claim). One per
 * profile — a second attempt throws. `config` is the template's default,
 * already validated by the template's schema in the action.
 */
export async function createSite(
  userId: string,
  input: NewSiteInput,
): Promise<SiteRecord> {
  const profile = await requireProfile(userId);
  const slug = siteSlugSchema.parse(input.slug);

  const existing = await db.query.site.findFirst({
    where: eq(schema.site.profileId, profile.id),
    columns: { id: true },
  });
  if (existing) {
    throw new SiteDataError("This profile already has a site.");
  }

  try {
    const inserted = await db
      .insert(schema.site)
      .values({
        profileId: profile.id,
        slug,
        templateId: input.templateId,
        templateMajor: input.templateMajor,
        config: siteConfigSchema.parse(input.config),
        view: viewDefinitionSchema.parse(input.view ?? {}),
        discoverable: input.discoverable ?? true,
      })
      .returning();
    const row = inserted[0];
    if (!row) {
      throw new SiteDataError("Failed to create site.");
    }
    return toRecord(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new SlugTakenError(slug);
    }
    throw error;
  }
}

/**
 * Patch the user's Site (slug, template, config, discoverable). Editing config
 * or the slug does **not** republish — the public pages keep rendering the
 * pinned version until an explicit `publishSite` (doc 04: publish is one
 * deliberate action).
 */
export async function updateSite(
  userId: string,
  patch: UpdateSiteInput,
): Promise<SiteRecord> {
  const profile = await requireProfile(userId);
  const validated = updateSiteSchema.parse(patch);

  const current = await db.query.site.findFirst({
    where: eq(schema.site.profileId, profile.id),
  });
  if (!current) {
    throw new SiteNotFoundError();
  }

  // A slug change must not collide with another profile's site.
  if (validated.slug !== undefined) {
    const holder = await db.query.site.findFirst({
      where: and(
        eq(schema.site.slug, validated.slug),
        ne(schema.site.profileId, profile.id),
      ),
      columns: { id: true },
    });
    if (holder) {
      throw new SlugTakenError(validated.slug);
    }
  }

  // Only a change to what the public page renders makes it stale. A save that
  // re-sends identical presentation — an autosave fired by a remount, a config
  // form that rebuilt with the same values — must not flip the flag, or the
  // editor shows "Publish changes" for changes that were never made. Config is
  // compared canonically (keys sorted): `config` is JSONB, which does not
  // preserve key order, so the stored copy comes back reordered and a plain
  // stringify would read an untouched config as "changed".
  const presentationChanged =
    (validated.slug !== undefined && validated.slug !== current.slug) ||
    (validated.templateId !== undefined &&
      validated.templateId !== current.templateId) ||
    (validated.templateMajor !== undefined &&
      validated.templateMajor !== current.templateMajor) ||
    (validated.discoverable !== undefined &&
      validated.discoverable !== current.discoverable) ||
    (validated.config !== undefined &&
      canonicalJson(validated.config) !== canonicalJson(current.config));

  try {
    const updated = await db
      .update(schema.site)
      .set({
        ...validated,
        hasUnpublishedChanges:
          current.hasUnpublishedChanges || presentationChanged,
      })
      .where(eq(schema.site.profileId, profile.id))
      .returning();
    const row = updated[0];
    if (!row) {
      throw new SiteNotFoundError();
    }
    return toRecord(row);
  } catch (error) {
    if (isUniqueViolation(error) && validated.slug) {
      throw new SlugTakenError(validated.slug);
    }
    throw error;
  }
}

export interface PublishSiteResult {
  siteId: string;
  publishedVersionId: string;
}

/**
 * Publish the user's Site: pin the profile's **currently published** version
 * into the site's `published_version_id`, so the public pages render that exact
 * immutable snapshot (doc 04). Requires the profile to have been published
 * first (a site can't go live pointing at draft-only content). The caller
 * invalidates `site:<id>` after this returns (the app layer owns cache
 * invalidation, mirroring the profile/document publish flow).
 */
export async function publishSite(userId: string): Promise<PublishSiteResult> {
  const profile = await requireProfile(userId);
  if (!profile.publishedVersionId) {
    throw new ProfileNotPublishedError();
  }

  const updated = await db
    .update(schema.site)
    // Publishing pins the version and clears the presentation-stale flag: the
    // live cached page now reflects the current template + config.
    .set({
      publishedVersionId: profile.publishedVersionId,
      hasUnpublishedChanges: false,
    })
    .where(eq(schema.site.profileId, profile.id))
    .returning({ id: schema.site.id });
  const row = updated[0];
  if (!row) {
    throw new SiteNotFoundError();
  }
  return { siteId: row.id, publishedVersionId: profile.publishedVersionId };
}

/**
 * The stable site id for a **claimed** slug — published or not — or null when
 * no site owns that slug at all. A single indexed lookup the render host runs
 * uncached to derive the `site:<id>` cache tag before wrapping the expensive
 * load. The tag can't be the slug (a rename would orphan the cache; the id is
 * stable, doc 04).
 *
 * **It deliberately ignores publish state**, and that is a correctness
 * requirement rather than convenience. It used to return null for a claimed
 * but unpublished site, which meant the render host answered 404 *before* it
 * had a tag to cache that answer under. Next then cached the 404 for the
 * route's full `revalidate` window with no tag attached — so `publishSite`'s
 * `revalidateTag('site:<id>')` could not reach it, and a freshly published
 * site kept serving "not found" for up to 24 hours. The window between
 * claiming a slug and publishing it is exactly when someone loads their own
 * URL to see what it looks like, so this was reliably self-inflicted.
 *
 * Callers still decide what to *render*: `getSiteForRender` returns null for an
 * unpublished site. This only answers "does this slug belong to a site, and
 * which one" — the question the cache tag needs.
 */
export async function getSiteIdBySlug(slug: string): Promise<string | null> {
  const ref = await getSiteRefBySlug(slug);
  return ref?.siteId ?? null;
}

/** A claimed slug's site **and owning profile** ids. The render host needs both
 * to derive its cache tags before the cached work runs: a portfolio render
 * depends on the site (`site:<id>`, dropped on publish) *and* on the owner's
 * posts (`blog:<id>`, dropped on any post write), and a tag can't be read out
 * of the value it is tagging. Answers for any claimed slug regardless of
 * publish state — see `getSiteIdBySlug`. */
export async function getSiteRefBySlug(
  slug: string,
): Promise<{ siteId: string; profileId: string } | null> {
  const row = await db.query.site.findFirst({
    where: eq(schema.site.slug, slug.trim().toLowerCase()),
    columns: { id: true, profileId: true },
  });
  return row ? { siteId: row.id, profileId: row.profileId } : null;
}

export interface SiteRenderData {
  siteId: string;
  /** The owning profile — what the render host keys native blog posts off. */
  profileId: string;
  slug: string;
  templateId: string;
  templateMajor: number;
  config: SiteConfig;
  view: ViewDefinition;
  discoverable: boolean;
  /** The pinned published Profile snapshot, migrated to the current schema. */
  profile: Profile;
}

/**
 * The render inputs for a public site, resolved by slug for the render host.
 * Not user-scoped: this serves published state, the slug is the capability.
 * Returns null when the slug is unknown or the site has never been published
 * (either way → 404). The profile is loaded from the **pinned** version, never
 * the profile's live draft or latest publish.
 */
export async function getSiteForRender(
  slug: string,
): Promise<SiteRenderData | null> {
  const normalized = slug.trim().toLowerCase();
  const row = await db.query.site.findFirst({
    where: eq(schema.site.slug, normalized),
  });
  if (!row || !row.publishedVersionId) {
    return null;
  }
  const profile = await getProfileVersionById(row.publishedVersionId);
  if (!profile) {
    // A pinned version that no longer exists — treat as unpublished.
    return null;
  }
  return {
    siteId: row.id,
    profileId: row.profileId,
    slug: row.slug,
    templateId: row.templateId,
    templateMajor: row.templateMajor,
    config: siteConfigSchema.parse(row.config),
    view: viewDefinitionSchema.parse(row.view),
    discoverable: row.discoverable,
    profile,
  };
}

export interface DiscoverableSite {
  slug: string;
  templateId: string;
  updatedAt: Date;
}

/**
 * Every discoverable, published site's slug + template + last update — the
 * input to the platform sitemap (doc 04). Unscoped read of public state only.
 * The template id lets the sitemap emit only the pages that site's template
 * actually serves.
 */
export async function listDiscoverableSites(): Promise<DiscoverableSite[]> {
  const rows = await db.query.site.findMany({
    where: and(
      eq(schema.site.discoverable, true),
      isNotNull(schema.site.publishedVersionId),
    ),
    columns: { slug: true, templateId: true, updatedAt: true },
  });
  return rows.map((row) => ({
    slug: row.slug,
    templateId: row.templateId,
    updatedAt: row.updatedAt,
  }));
}
