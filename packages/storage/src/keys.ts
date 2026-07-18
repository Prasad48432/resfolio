import { ASSET_KIND_SPECS, assetKindSchema, type AssetKind } from "./kinds";

/**
 * Object key construction (docs/architecture/07-storage.md).
 *
 * The layout is **owner-first**:
 *
 *     u/<ownerId>/<kind-segment>/<contentHash>.<ext>
 *
 * That ordering is the whole cleanup story. "Delete everything belonging to
 * this profile" — the one storage operation we are legally obliged to get
 * right — becomes a single prefix delete under `u/<ownerId>/`, with no index
 * to consult and nothing to miss. A type-first layout (`avatars/`,
 * `banners/`) reads more naturally in a bucket browser and makes that same
 * deletion a full scan of every prefix, forever. We optimise for the operation
 * that must not fail.
 *
 * The filename is the **sha256 of the processed bytes**, which buys three
 * things at once: re-uploading an identical file is idempotent and free, the
 * object can be served `immutable` for a year because a given key's content
 * can never change, and "replace" is unambiguous — a different image is a
 * different key, so there is no window where a stale byte range is served
 * under a name that now means something else.
 *
 * Doc 07 originally specified `uploads/{userId}/{ulid}`. A ULID is unique but
 * says nothing about content, which forfeits both the dedupe and the immutable
 * cache header, and buys only creation-ordering we get from the `assets` row
 * anyway. Changed 2026-07-18; the doc is updated to match.
 */

/** Everything owned by one profile. The unit of "delete this user's data". */
export function ownerPrefix(ownerId: string): string {
  return `u/${ownerId}/`;
}

/** One kind's slot for one owner. The unit of "replace this singleton". */
export function assetKindPrefix(ownerId: string, kind: AssetKind): string {
  return `${ownerPrefix(ownerId)}${ASSET_KIND_SPECS[kind].segment}/`;
}

export function buildAssetKey({
  ownerId,
  kind,
  contentHash,
  extension,
}: {
  ownerId: string;
  kind: AssetKind;
  contentHash: string;
  extension: string;
}): string {
  return `${assetKindPrefix(ownerId, kind)}${contentHash}.${extension}`;
}

/**
 * Recover the owner and kind from a key.
 *
 * This exists so that **a key can be authorized without a database round
 * trip**: a delete request naming someone else's key is rejected by comparing
 * the parsed owner to the session, which makes cross-tenant deletion a
 * structural impossibility rather than a query someone might forget to scope.
 * Returns `null` for anything that isn't one of our keys — never throws, never
 * guesses.
 */
export function parseAssetKey(
  key: string,
): { ownerId: string; kind: AssetKind } | null {
  const withoutPrefix = key.startsWith("u/") ? key.slice(2) : null;
  if (!withoutPrefix) {
    return null;
  }
  const slash = withoutPrefix.indexOf("/");
  if (slash <= 0) {
    return null;
  }
  const ownerId = withoutPrefix.slice(0, slash);
  const rest = withoutPrefix.slice(slash + 1);

  // Segments contain slashes (`portfolio/banner`), so match on the segment
  // rather than splitting — and match the *longest* first, or `portfolio/…`
  // would shadow nothing today but will the moment a segment becomes a prefix
  // of another.
  const entries = Object.entries(ASSET_KIND_SPECS).sort(
    ([, a], [, b]) => b.segment.length - a.segment.length,
  );
  for (const [kind, spec] of entries) {
    if (rest.startsWith(`${spec.segment}/`)) {
      const filename = rest.slice(spec.segment.length + 1);
      // A filename with its own slash means a deeper path than we ever write.
      if (filename.length === 0 || filename.includes("/")) {
        return null;
      }
      return { ownerId, kind: assetKindSchema.parse(kind) };
    }
  }
  return null;
}

/** Resolve a stored key to a public URL. */
export function assetUrl(key: string, publicBaseUrl: string): string {
  return `${publicBaseUrl.replace(/\/$/, "")}/${key}`;
}

/**
 * Recover our object key from a stored URL — **origin-agnostic, deliberately.**
 *
 * Profile and site content store absolute URLs, because `basics.avatarUrl`
 * flows through the pure `buildProfileView` and `config.bannerImage` is read
 * by templates, and neither may know what R2 is. The durable identity of an
 * object is its key, held in the `assets` table; this is the bridge back.
 *
 * It matches on the **key portion only**, ignoring the origin entirely. That
 * is not tidiness — it is what makes the delivery origin safe to change. The
 * orphan sweep deletes assets nothing references, and it learns what is
 * referenced by parsing URLs out of content. Anchor that parse to the *current*
 * base URL and the day the origin moves from `r2.dev` to a custom domain,
 * every already-stored URL stops matching, every live asset looks abandoned,
 * and the sweep deletes users' images. Matching the key suffix means old and
 * new URLs both resolve, so the origin swap is a cosmetic string change
 * followed by nothing at all.
 *
 * Returns `null` for URLs that aren't ours (a hand-pasted external image is
 * still perfectly valid content — it simply owns no asset row).
 */
export function assetKeyFromUrl(url: string): string | null {
  const match = /(u\/[^/\s]+\/[^\s]+)$/.exec(url.trim());
  if (!match?.[1]) {
    return null;
  }
  const key = match[1];
  return parseAssetKey(key) ? key : null;
}

/**
 * Every asset key referenced anywhere inside a JSON document.
 *
 * Walks the value rather than naming fields: asset URLs live in
 * `basics.avatarUrl`, in a site's `config.bannerImage`, and in whatever a
 * future template calls its cover image. A field list would need updating
 * every time one is added — and the failure mode of forgetting is that the
 * sweep deletes a live image, which is exactly the bug worth designing out.
 */
export function collectAssetKeys(value: unknown): string[] {
  const keys = new Set<string>();

  const walk = (node: unknown): void => {
    if (typeof node === "string") {
      const key = assetKeyFromUrl(node);
      if (key) {
        keys.add(key);
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === "object") {
      Object.values(node).forEach(walk);
    }
  };

  walk(value);
  return [...keys];
}
