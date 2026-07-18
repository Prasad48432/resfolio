import "server-only";

import { createLogger } from "@resfolio/observability";
import { collectAssetKeys } from "@resfolio/storage";
import {
  isStorageConfigured,
  markAssetsReferenced,
} from "@resfolio/storage/server";

const log = createLogger("dashboard:assets");

/**
 * Record that a saved document points at these uploads (docs/architecture/07-storage.md).
 *
 * The orphan sweep deletes assets nothing references; this is what tells it an
 * asset is in use. It walks the whole saved value rather than reading named
 * fields, so an image added to a future template's config is covered the day
 * it exists rather than the day someone remembers to add it here.
 *
 * **Deliberately best-effort.** A failure to mark must never fail the user's
 * save: the save is the thing they asked for, and a missed mark costs nothing
 * because the next save re-marks the same keys — while the sweep's 24-hour
 * grace period is far longer than the gap between two autosaves. Failing the
 * save instead would trade a harmless retry for lost work.
 */
export async function markReferencedAssets(value: unknown): Promise<void> {
  if (!isStorageConfigured()) {
    return;
  }
  try {
    const keys = collectAssetKeys(value);
    if (keys.length > 0) {
      await markAssetsReferenced(keys);
    }
  } catch (error) {
    log.error({ error }, "failed to mark referenced assets");
  }
}
