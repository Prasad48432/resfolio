/**
 * @resfolio/storage — the binary storage layer (docs/architecture/07-storage.md).
 *
 * **This root export is pure.** Key construction, the kind/policy table, and
 * URL resolution — no network, no database, no `node:crypto`, no `sharp`. That
 * is what lets the dashboard's client components compute a display URL and the
 * upload UI read its own size limits from the same table the server enforces,
 * with no second copy to drift.
 *
 * Everything that touches R2 or the `assets` table lives behind
 * `@resfolio/storage/server`, mirroring the layering of `@resfolio/profile`
 * and `@resfolio/document`.
 */
export {
  ACCEPTED_IMAGE_TYPES,
  ASSET_KIND_SPECS,
  ASSET_KINDS,
  MAX_UPLOAD_BYTES,
  OUTPUT_IMAGE_EXTENSION,
  OUTPUT_IMAGE_TYPE,
  assetKindSchema,
  isAcceptedImageType,
  type AssetKind,
  type AssetKindSpec,
} from "./kinds";

export {
  assetKeyFromUrl,
  assetKindPrefix,
  assetUrl,
  buildAssetKey,
  collectAssetKeys,
  ownerPrefix,
  parseAssetKey,
} from "./keys";
