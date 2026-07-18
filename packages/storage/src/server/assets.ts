import { and, eq, inArray, isNull, lt, ne } from "drizzle-orm";

import { db, schema } from "@resfolio/database";

import { ASSET_KIND_SPECS, type AssetKind } from "../kinds";
import { buildAssetKey, ownerPrefix } from "../keys";

import { deleteByPrefix, deleteObjects, putObject } from "./client";
import { processImage } from "./process-image";

/**
 * The asset lifecycle (docs/architecture/07-storage.md).
 *
 * This module owns **both** the R2 objects and the `assets` table, because
 * every operation here has to move the two together — a bucket write with no
 * row is an object nothing can ever find or clean up, and a row with no object
 * is a broken image. Splitting them across two callers would make that
 * pairing a convention instead of a guarantee.
 *
 * Ordering is deliberate throughout: **write the object before the row, delete
 * the row before the object.** Both leave the recoverable failure — an
 * unreferenced object the sweep collects — rather than the unrecoverable one,
 * a row pointing at bytes that aren't there.
 */

export interface StoredAsset {
  key: string;
  kind: AssetKind;
  bytes: number;
  width: number;
  height: number;
}

/**
 * Process, store, and record an uploaded image.
 *
 * Idempotent by construction: the key is the content hash, so re-uploading the
 * same file overwrites the same object with identical bytes and conflicts onto
 * the existing row. A user who double-clicks Upload spends one object, not two.
 *
 * For a **singleton** kind this also removes the previous object in the slot —
 * that is the whole of "replace old assets when users upload new ones", and it
 * lives here rather than at the call site so a new upload surface cannot
 * forget it and quietly leak an object per edit.
 */
export async function storeImageAsset({
  ownerId,
  kind,
  input,
}: {
  ownerId: string;
  kind: AssetKind;
  input: Uint8Array;
}): Promise<StoredAsset> {
  const processed = await processImage(input, kind);
  const key = buildAssetKey({
    ownerId,
    kind,
    contentHash: processed.contentHash,
    extension: processed.extension,
  });

  await putObject({
    key,
    body: processed.bytes,
    contentType: processed.contentType,
  });

  await db
    .insert(schema.asset)
    .values({
      ownerId,
      kind,
      key,
      contentHash: processed.contentHash,
      contentType: processed.contentType,
      bytes: processed.bytes.byteLength,
    })
    .onConflictDoNothing({ target: schema.asset.key });

  if (ASSET_KIND_SPECS[kind].singleton) {
    await supersedeSingletonSlot({ ownerId, kind, keepKey: key });
  }

  return {
    key,
    kind,
    bytes: processed.bytes.byteLength,
    width: processed.width,
    height: processed.height,
  };
}

/**
 * Mark the other objects in a singleton slot as superseded — **without
 * deleting them.**
 *
 * This used to delete them outright, and that was wrong in a way only live
 * data revealed. `profile_versions` are *immutable published snapshots*: a
 * published portfolio renders the avatar URL that was current when it was
 * published, forever. Deleting the previous avatar the moment a new one was
 * uploaded therefore broke the **live** site — the draft looked perfect while
 * the published page served a 404 for its portrait, and nothing anywhere
 * reported it.
 *
 * The invariant this restores: **an asset may only be deleted once no live
 * content references it**, where live content includes every published
 * version, not just the draft. Clearing `referenced_at` makes the old object a
 * *candidate* for collection; `collectOrphanedAssets` decides, and it can only
 * do that safely with the set of keys live content still points at.
 *
 * Scoped to the slot rather than "the key I replaced" so it stays self-healing:
 * a slot that accumulated strays converges on the next upload.
 */
async function supersedeSingletonSlot({
  ownerId,
  kind,
  keepKey,
}: {
  ownerId: string;
  kind: AssetKind;
  keepKey: string;
}): Promise<void> {
  await db
    .update(schema.asset)
    .set({ referencedAt: null })
    .where(
      and(
        eq(schema.asset.ownerId, ownerId),
        eq(schema.asset.kind, kind),
        ne(schema.asset.key, keepKey),
      ),
    );
}

/**
 * Mark keys as live. Called when a key is written into profile or site
 * content — the signal that separates a committed asset from an abandoned
 * upload, and therefore the thing standing between a real asset and the
 * orphan sweep.
 */
export async function markAssetsReferenced(keys: string[]): Promise<void> {
  if (keys.length === 0) {
    return;
  }
  await db
    .update(schema.asset)
    .set({ referencedAt: new Date() })
    .where(inArray(schema.asset.key, keys));
}

/**
 * Delete every object belonging to a profile — the deletion path.
 *
 * A single prefix delete under `u/<ownerId>/`, which is exactly why keys are
 * owner-first. The `assets` rows go by FK cascade when the profile row is
 * deleted; this must be called **before** that, while we can still name the
 * owner. Returns the object count for the audit log.
 */
export async function deleteAllAssetsForOwner(
  ownerId: string,
): Promise<number> {
  const deleted = await deleteByPrefix(ownerPrefix(ownerId));
  await db.delete(schema.asset).where(eq(schema.asset.ownerId, ownerId));
  return deleted;
}

/**
 * Collect uploads that no live content references.
 *
 * **`protectedKeys` is required, and has no default, on purpose.** Deleting a
 * still-referenced asset is silent and unrecoverable — the draft looks fine
 * while a published page serves a broken image — so the API refuses to let a
 * caller sweep without first stating what is live. An optional parameter would
 * make the dangerous call the short one.
 *
 * The caller assembles that set (the app layer, via `collectAssetKeys` over the
 * profile draft, **every published version**, and each site's config). Published
 * versions matter most: they are immutable snapshots that keep rendering the
 * URL they were published with, so an asset one of them points at is live
 * whether or not the draft still uses it — that is precisely the case that got
 * this wrong before.
 *
 * The grace period is the second guard. There is a real window between an
 * upload finishing and the debounced autosave that references it; a sweep with
 * no grace deletes assets out from under a user mid-edit. 24 hours is far
 * longer than that window and still bounded.
 */
export async function collectOrphanedAssets({
  protectedKeys,
  olderThanMs = 24 * 60 * 60 * 1000,
  limit = 500,
}: {
  /** Every key live content still points at. Pass an explicit empty set only
   * when you have genuinely established that nothing references anything. */
  protectedKeys: ReadonlySet<string>;
  olderThanMs?: number;
  limit?: number;
}): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);

  const candidates = await db
    .select({ key: schema.asset.key })
    .from(schema.asset)
    .where(
      and(
        isNull(schema.asset.referencedAt),
        lt(schema.asset.createdAt, cutoff),
      ),
    )
    .limit(limit);

  // `referenced_at` is a hint, not the authority: it is best-effort, cleared on
  // supersede, and can lag. The live key set is the authority, and it wins.
  const keys = candidates
    .map((row) => row.key)
    .filter((key) => !protectedKeys.has(key));

  if (keys.length === 0) {
    return 0;
  }

  await db.delete(schema.asset).where(inArray(schema.asset.key, keys));
  await deleteObjects(keys);
  return keys.length;
}
