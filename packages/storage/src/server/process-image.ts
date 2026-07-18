import { createHash } from "node:crypto";

import sharp from "sharp";

import {
  ASSET_KIND_SPECS,
  OUTPUT_IMAGE_EXTENSION,
  OUTPUT_IMAGE_TYPE,
  type AssetKind,
} from "../kinds";

/**
 * Decode → resize → re-encode → hash (docs/architecture/07-storage.md).
 *
 * **Re-encoding is a security boundary, not just an optimisation.** Nothing a
 * user uploads is ever served back byte-for-byte: `sharp` decodes the pixels
 * and writes a fresh WebP, so EXIF (including GPS coordinates from a phone
 * photo), colour-profile payloads, trailing appended data, and polyglot files
 * that are simultaneously a valid image and a valid script all cease to exist.
 * A content-type check alone proves nothing about the bytes behind it.
 *
 * It is also where "compress large files without losing quality" happens:
 * quality 82 WebP is visually indistinguishable from the source at these
 * dimensions while typically landing under a third of the bytes.
 */
export interface ProcessedImage {
  bytes: Uint8Array;
  contentType: string;
  extension: string;
  contentHash: string;
  width: number;
  height: number;
}

export class InvalidImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidImageError";
  }
}

export async function processImage(
  input: Uint8Array,
  kind: AssetKind,
): Promise<ProcessedImage> {
  const spec = ASSET_KIND_SPECS[kind];

  let pipeline: sharp.Sharp;
  let metadata: sharp.Metadata;
  try {
    // `failOn: "error"` rejects a truncated or malformed file rather than
    // silently rendering whatever decoded before the corruption.
    pipeline = sharp(input, { failOn: "error" });
    metadata = await pipeline.metadata();
  } catch {
    throw new InvalidImageError("That file isn't a readable image.");
  }

  if (!metadata.width || !metadata.height) {
    throw new InvalidImageError("That file isn't a readable image.");
  }

  const output = await pipeline
    .rotate() // Apply EXIF orientation *before* it is stripped, or portrait
    // photos from a phone come out sideways.
    .resize({
      width: spec.maxDimensions.width,
      height: spec.maxDimensions.height,
      fit: "inside",
      // Never upscale: enlarging a small image to fill the box only produces
      // a bigger, blurrier file.
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  const bytes = new Uint8Array(output.data);

  return {
    bytes,
    contentType: OUTPUT_IMAGE_TYPE,
    extension: OUTPUT_IMAGE_EXTENSION,
    // Hash the *processed* bytes, not the upload: two different JPEGs that
    // normalise to the same image should land on the same key, and the hash
    // must describe what we actually serve.
    contentHash: createHash("sha256").update(bytes).digest("hex").slice(0, 32),
    width: output.info.width,
    height: output.info.height,
  };
}
