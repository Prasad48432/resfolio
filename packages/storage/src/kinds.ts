import { z } from "zod";

/**
 * What a stored object *is* — the vocabulary the rest of the platform uses to
 * talk about uploads (docs/architecture/07-storage.md).
 *
 * A kind is not a folder name. It is a **policy bundle**: where the object
 * lives, how big it may be, what it may contain, the dimensions it is resized
 * to, and — critically — whether the slot holds one object or many. Everything
 * downstream (the upload route, the cleanup sweep, the UI hints) reads its
 * behaviour from here rather than re-deciding per call site, so adding a kind
 * is one entry in this table and nothing else.
 */
export const ASSET_KINDS = [
  "avatar",
  "portfolioBanner",
  "portfolioImage",
  "blogCover",
  "blogImage",
  "resumeAsset",
] as const;

export type AssetKind = (typeof ASSET_KINDS)[number];

export const assetKindSchema = z.enum(ASSET_KINDS);

/**
 * Image formats we accept on the way *in*. Deliberately short: every one of
 * these is a format `sharp` decodes safely and re-encodes, and re-encoding is
 * what makes the accept-list safe — nothing a user uploads is ever served back
 * byte-for-byte, so a payload smuggled inside a valid image never reaches a
 * viewer's browser.
 *
 * **SVG is excluded on purpose.** It is a document format, not an image
 * format: it can carry `<script>`, and serving one from our own origin would
 * hand a user script execution against that origin.
 */
export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

/** What every image is re-encoded to. WebP holds quality at roughly a third of
 * JPEG's bytes and every browser we target has supported it for years. */
export const OUTPUT_IMAGE_TYPE = "image/webp";
export const OUTPUT_IMAGE_EXTENSION = "webp";

export interface AssetKindSpec {
  /** Second path segment, after the owner. Stable — it is baked into keys. */
  segment: string;
  /** Hard ceiling on the *uploaded* bytes, before re-encoding. */
  maxBytes: number;
  /**
   * The box the image is fitted inside, longest edge wins. Not a crop: the
   * aspect ratio is preserved and the image is never enlarged, so a small
   * upload stays small rather than being blurrily upscaled to fill the box.
   */
  maxDimensions: { width: number; height: number };
  /**
   * A **singleton** slot holds exactly one object per owner: uploading a new
   * avatar replaces the old one, and the old key is deleted. A non-singleton
   * slot accumulates (a portfolio gallery), so cleanup there is driven by
   * reference-counting instead.
   *
   * This flag is why "replace old assets when users upload new ones" is a
   * property of the data model rather than a rule each call site remembers.
   */
  singleton: boolean;
  /** Shown in the uploader as guidance. */
  label: string;
}

export const ASSET_KIND_SPECS: Readonly<Record<AssetKind, AssetKindSpec>> = {
  avatar: {
    segment: "avatar",
    maxBytes: 5 * 1024 * 1024,
    maxDimensions: { width: 512, height: 512 },
    singleton: true,
    label: "Profile photo",
  },
  portfolioBanner: {
    segment: "portfolio/banner",
    maxBytes: 10 * 1024 * 1024,
    maxDimensions: { width: 2400, height: 800 },
    singleton: true,
    label: "Banner image",
  },
  portfolioImage: {
    segment: "portfolio/images",
    maxBytes: 10 * 1024 * 1024,
    maxDimensions: { width: 2000, height: 2000 },
    singleton: false,
    label: "Portfolio image",
  },
  /**
   * A post's cover image.
   *
   * **Not a singleton, despite there being one cover per post.** `singleton`
   * is scoped to the *owner*, not to any narrower thing — `supersedeSingletonSlot`
   * clears `referenced_at` for every key of this kind belonging to the profile.
   * Marked singleton, uploading a cover for a second post would supersede the
   * first post's cover and hand it to the orphan sweep, and the failure would
   * surface a day later as a missing image on a published post.
   *
   * One cover per *post* is enforced where that scope actually exists: the
   * `coverAssetKey` column holds exactly one key, and replacing it routes
   * through the blog domain's reference counting (`domains/blog`), which can
   * see the other posts a key might still be used by. Scope the rule to the
   * thing it is about.
   */
  blogCover: {
    segment: "blog/covers",
    maxBytes: 10 * 1024 * 1024,
    maxDimensions: { width: 2000, height: 1200 },
    singleton: false,
    label: "Cover image",
  },
  /** An image embedded in a post body. Accumulates by nature; cleanup is
   * reference-counted against post bodies by `domains/blog`. */
  blogImage: {
    segment: "blog/images",
    maxBytes: 10 * 1024 * 1024,
    maxDimensions: { width: 2000, height: 2000 },
    singleton: false,
    label: "Post image",
  },
  resumeAsset: {
    segment: "resume-assets",
    maxBytes: 5 * 1024 * 1024,
    maxDimensions: { width: 1600, height: 1600 },
    singleton: false,
    label: "Resume asset",
  },
};

/** The largest upload any kind accepts — the request-level guard, checked
 * before we know which kind we're dealing with. */
export const MAX_UPLOAD_BYTES = Math.max(
  ...Object.values(ASSET_KIND_SPECS).map((spec) => spec.maxBytes),
);

export function isAcceptedImageType(
  contentType: string,
): contentType is (typeof ACCEPTED_IMAGE_TYPES)[number] {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(contentType);
}
