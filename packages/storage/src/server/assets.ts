import { and, eq, inArray, isNull, lt } from "drizzle-orm";

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
    await pruneSingletonSlot({ ownerId, kind, keepKey: key });
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
 * Drop every object in a singleton slot except the one just written.
 *
 * Scoped to the slot rather than "delete the key I remember replacing":
 * self-healing, so a slot that already accumulated strays (an interrupted
 * upload, a bug we since fixed) converges to one object on the next upload
 * instead of carrying its history forever.
 */
async function pruneSingletonSlot({
  ownerId,
  kind,
  keepKey,
}: {
  ownerId: string;
  kind: AssetKind;
  keepKey: string;
}): Promise<void> {
  const stale = await db
    .select({ key: schema.asset.key })
    .from(schema.asset)
    .where(and(eq(schema.asset.ownerId, ownerId), eq(schema.asset.kind, kind)));

  const keys = stale.map((row) => row.key).filter((key) => key !== keepKey);
  if (keys.length === 0) {
    return;
  }

  await db.delete(schema.asset).where(inArray(schema.asset.key, keys));
  await deleteObjects(keys);
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
 * Collect uploads that were never committed to content.
 *
 * The grace period is load-bearing. There is a real window between "the upload
 * finished" and "the debounced autosave wrote the key into the profile", and a
 * sweep with no grace would delete live assets out from under users mid-edit.
 * 24 hours is far longer than that window and still bounded.
 */
export async function collectOrphanedAssets({
  olderThanMs = 24 * 60 * 60 * 1000,
  limit = 500,
}: {
  olderThanMs?: number;
  limit?: number;
} = {}): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);

  const orphans = await db
    .select({ key: schema.asset.key })
    .from(schema.asset)
    .where(
      and(
        isNull(schema.asset.referencedAt),
        lt(schema.asset.createdAt, cutoff),
      ),
    )
    .limit(limit);

  if (orphans.length === 0) {
    return 0;
  }

  const keys = orphans.map((row) => row.key);
  await db.delete(schema.asset).where(inArray(schema.asset.key, keys));
  await deleteObjects(keys);
  return keys.length;
}
