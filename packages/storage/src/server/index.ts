/**
 * @resfolio/storage/server — the only code that touches R2 or the `assets`
 * table (docs/architecture/07-storage.md).
 *
 * Kept separate from the package root so the pure half (key construction, the
 * kind/policy table, URL resolution) can be imported into client components
 * and tests without pulling in the AWS SDK, `sharp`, or the database client.
 */
export {
  collectOrphanedAssets,
  deleteAllAssetsForOwner,
  markAssetsReferenced,
  releaseAssetKeys,
  storeImageAsset,
  type StoredAsset,
} from "./assets";

export {
  StorageNotConfiguredError,
  deleteByPrefix,
  deleteObjects,
  isStorageConfigured,
  publicBaseUrl,
  putObject,
} from "./client";

export {
  InvalidImageError,
  processImage,
  type ProcessedImage,
} from "./process-image";
