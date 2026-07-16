import { and, desc, eq } from "drizzle-orm";

import { db, schema } from "@resfolio/database";

import { ProfileDataError, ProfileNotFoundError } from "../errors";
import { migrateProfile } from "../migrate";
import { createSeedProfile, type SeedIdentity } from "../seed";
import { profileSchema, type Profile } from "../schema/profile";

/**
 * Draft/publish persistence for the profile engine
 * (docs/architecture/01-profile-engine.md, 07-storage.md). The only code
 * that touches the `profiles`/`profile_versions` tables. Every function
 * takes the auth context (`userId`) explicitly and scopes every query to it
 * — ownership is enforced here, never assumed from the caller
 * (docs/architecture/06-api-architecture.md, 10-auth-and-security.md).
 *
 * Readers migrate (lazy read-time migration); writers persist the latest
 * schema version.
 */

export interface ProfileDraft {
  profileId: string;
  /** Always migrated + validated to the current schema version. */
  data: Profile;
  /** Optimistic-concurrency token — pass the value you edited from back to
   * `saveDraft`; a mismatch means another tab/device wrote first. */
  draftRev: number;
  publishedVersionId: string | null;
  /** The `version` number of the published snapshot, or null if never
   * published — for the editor's publish-state display. */
  publishedVersion: number | null;
  /** Whether the draft differs from the published snapshot (always true when
   * never published) — the editor disables Publish when there is nothing new
   * to snapshot (doc 01). */
  hasUnpublishedChanges: boolean;
  updatedAt: Date;
}

export class StaleDraftError extends Error {
  constructor(
    readonly expectedRev: number,
    readonly actualRev: number,
  ) {
    super(
      `Draft was modified elsewhere (expected revision ${expectedRev}, found ${actualRev}). Reload to get the latest.`,
    );
    this.name = "StaleDraftError";
  }
}

/** The published snapshot's version number and its data, or null if the
 * profile has never been published. */
type PublishedRef = { version: number; data: unknown } | null;

/** Whether the migrated draft diverges from the published snapshot. Never
 * published counts as "has changes" so the first Publish is always enabled.
 * Both sides are normalized through `migrateProfile` so the comparison is over
 * canonical shapes (deterministic key order), not storage artifacts. */
function computeUnpublishedChanges(draft: Profile, published: PublishedRef): boolean {
  if (!published) {
    return true;
  }
  return JSON.stringify(draft) !== JSON.stringify(migrateProfile(published.data));
}

function toDraft(
  row: typeof schema.profile.$inferSelect,
  published: PublishedRef,
): ProfileDraft {
  const data = migrateProfile(row.draft);
  return {
    profileId: row.id,
    data,
    draftRev: row.draftRev,
    publishedVersionId: row.publishedVersionId,
    publishedVersion: published?.version ?? null,
    hasUnpublishedChanges: computeUnpublishedChanges(data, published),
    updatedAt: row.updatedAt,
  };
}

type ProfileRowWithVersion = typeof schema.profile.$inferSelect & {
  publishedVersion: PublishedRef;
};

async function findRow(
  userId: string,
): Promise<ProfileRowWithVersion | undefined> {
  return db.query.profile.findFirst({
    where: eq(schema.profile.userId, userId),
    with: { publishedVersion: { columns: { version: true, data: true } } },
  });
}

/** The published snapshot (version + data) behind a `publishedVersionId` (PK
 * lookup, only when one is set — pre-publish profiles skip the query entirely). */
async function resolvePublished(
  publishedVersionId: string | null,
): Promise<PublishedRef> {
  if (!publishedVersionId) {
    return null;
  }
  const row = await db.query.profileVersion.findFirst({
    where: eq(schema.profileVersion.id, publishedVersionId),
    columns: { version: true, data: true },
  });
  return row ?? null;
}

/**
 * The user's draft, creating a seeded one on first access (doc 08: a new
 * user's editor is pre-seeded with example structure, not a blank void).
 * Idempotent under the unique `user_id` constraint — a concurrent create
 * loses the race and we re-read the winner.
 */
export async function getOrCreateProfile(
  userId: string,
  identity: SeedIdentity = {},
): Promise<ProfileDraft> {
  const existing = await findRow(userId);
  if (existing) {
    return toDraft(existing, existing.publishedVersion ?? null);
  }

  const seed = createSeedProfile(identity);
  const inserted = await db
    .insert(schema.profile)
    .values({ userId, draft: seed, draftRev: 0 })
    .onConflictDoNothing({ target: schema.profile.userId })
    .returning();

  // A freshly inserted profile has no published version yet; on a lost
  // insert race, re-read (which includes the published-version join).
  const insertedRow = inserted[0];
  if (insertedRow) {
    return toDraft(insertedRow, null);
  }
  const row = await findRow(userId);
  if (!row) {
    throw new ProfileDataError("Failed to create profile.");
  }
  return toDraft(row, row.publishedVersion ?? null);
}

export async function getProfile(userId: string): Promise<ProfileDraft> {
  const row = await findRow(userId);
  if (!row) {
    throw new ProfileNotFoundError();
  }
  return toDraft(row, row.publishedVersion ?? null);
}

/**
 * Persist a new draft. `baseRev` is the revision the edit started from;
 * the write only lands if the stored revision still matches, and it bumps
 * `draftRev` atomically — two open tabs can never silently clobber each
 * other (doc 01, optimistic concurrency). Returns the new draft state.
 */
export async function saveDraft(
  userId: string,
  data: Profile,
  baseRev: number,
): Promise<ProfileDraft> {
  const validated = profileSchema.parse(data);

  const updated = await db
    .update(schema.profile)
    .set({ draft: validated, draftRev: baseRev + 1 })
    .where(
      and(
        eq(schema.profile.userId, userId),
        eq(schema.profile.draftRev, baseRev),
      ),
    )
    .returning();

  const row = updated[0];
  if (row) {
    return toDraft(row, await resolvePublished(row.publishedVersionId));
  }

  // No row updated: either the profile is gone or the revision moved on.
  const current = await findRow(userId);
  if (!current) {
    throw new ProfileNotFoundError();
  }
  throw new StaleDraftError(baseRev, current.draftRev);
}

export interface PublishResult {
  versionId: string;
  version: number;
}

/**
 * Snapshot the current draft into an immutable `profile_versions` row and
 * point the profile at it (doc 01). Runs in one transaction so the version
 * number and the pointer can never diverge. The published data is the draft
 * migrated + validated to the latest schema.
 */
export async function publishProfile(userId: string): Promise<PublishResult> {
  return db.transaction(async (tx) => {
    const row = await tx.query.profile.findFirst({
      where: eq(schema.profile.userId, userId),
    });
    if (!row) {
      throw new ProfileNotFoundError();
    }

    const data = migrateProfile(row.draft);

    const latest = await tx.query.profileVersion.findFirst({
      where: eq(schema.profileVersion.profileId, row.id),
      orderBy: desc(schema.profileVersion.version),
    });
    const version = (latest?.version ?? 0) + 1;

    const inserted = await tx
      .insert(schema.profileVersion)
      .values({ profileId: row.id, version, data })
      .returning({ id: schema.profileVersion.id });

    const versionId = inserted[0]?.id;
    if (!versionId) {
      throw new ProfileDataError("Failed to write profile version.");
    }

    await tx
      .update(schema.profile)
      .set({ publishedVersionId: versionId })
      .where(eq(schema.profile.id, row.id));

    return { versionId, version };
  });
}

/** The currently published Profile, or null if never published. */
export async function getPublishedProfile(
  userId: string,
): Promise<Profile | null> {
  const row = await findRow(userId);
  if (!row?.publishedVersionId) {
    return null;
  }
  const version = await db.query.profileVersion.findFirst({
    where: eq(schema.profileVersion.id, row.publishedVersionId),
  });
  return version ? migrateProfile(version.data) : null;
}

/**
 * An immutable published Profile snapshot by version id, or null if it's gone
 * (migrated to the current schema). Used by other domains that **pin** a
 * specific version — e.g. a Site renders the exact `profile_versions` row it
 * was published against, never whatever the profile's draft or latest publish
 * happens to be (doc 04). Not user-scoped: the caller already owns the pin.
 */
export async function getProfileVersionById(
  versionId: string,
): Promise<Profile | null> {
  const version = await db.query.profileVersion.findFirst({
    where: eq(schema.profileVersion.id, versionId),
  });
  return version ? migrateProfile(version.data) : null;
}
