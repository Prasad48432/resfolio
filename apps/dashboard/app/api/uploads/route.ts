import { requireSession } from "@resfolio/auth";
import { createLogger } from "@resfolio/observability";
import { getOrCreateProfile } from "@resfolio/profile/server";
import {
  ASSET_KIND_SPECS,
  assetKindSchema,
  assetUrl,
  isAcceptedImageType,
  MAX_UPLOAD_BYTES,
} from "@resfolio/storage";
import {
  InvalidImageError,
  isStorageConfigured,
  publicBaseUrl,
  storeImageAsset,
} from "@resfolio/storage/server";
import { NextResponse } from "next/server";

/**
 * Image upload (docs/architecture/07-storage.md).
 *
 * A route handler rather than a Server Action because the payload is a binary
 * file: actions serialise their arguments, and pushing megabytes through that
 * path is neither efficient nor able to report progress.
 *
 * **Bytes are proxied through here rather than presigned direct-to-R2**, which
 * is a deliberate reversal of doc 07's original plan. A presigned PUT never
 * lets the server see the file, and everything that makes an upload safe and
 * small — re-encoding away EXIF and embedded payloads, resizing, verifying the
 * bytes are actually the image type they claim — requires the bytes. The cost
 * is our bandwidth on a capped, image-sized payload; the alternative is
 * serving whatever a user chose to upload, unexamined.
 *
 * The owner is the **profile**, resolved from the session — never taken from
 * the request. That is what makes it impossible to write into another user's
 * prefix.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const log = createLogger("dashboard:uploads");

export async function POST(request: Request): Promise<NextResponse> {
  const session = await requireSession();

  if (!isStorageConfigured()) {
    return NextResponse.json(
      { error: "Uploads aren't configured in this environment." },
      { status: 501 },
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const rawKind = form?.get("kind");

  if (!(file instanceof File) || typeof rawKind !== "string") {
    return NextResponse.json(
      { error: "Expected a file and a kind." },
      { status: 400 },
    );
  }

  const kind = assetKindSchema.safeParse(rawKind);
  if (!kind.success) {
    return NextResponse.json(
      { error: "Unknown upload kind." },
      { status: 400 },
    );
  }

  const spec = ASSET_KIND_SPECS[kind.data];

  // Two size checks, both cheap and both necessary: the per-kind limit is the
  // product rule, and MAX_UPLOAD_BYTES guards the general case in case a kind
  // is ever added with a larger ceiling than this route expects.
  if (file.size > spec.maxBytes || file.size > MAX_UPLOAD_BYTES) {
    const mb = Math.round(spec.maxBytes / (1024 * 1024));
    return NextResponse.json(
      { error: `That file is too large — the limit is ${mb}MB.` },
      { status: 413 },
    );
  }

  // The declared type is a hint we reject early on, not something we trust:
  // `processImage` decodes the actual bytes, which is the real check.
  if (!isAcceptedImageType(file.type)) {
    return NextResponse.json(
      { error: "Upload a JPEG, PNG, WebP or AVIF image." },
      { status: 415 },
    );
  }

  // The profile is the owner, and it must exist before anything can be filed
  // under it — a brand-new user uploading an avatar before their first save is
  // an ordinary case, not an error.
  const profile = await getOrCreateProfile(session.user.id);

  try {
    const stored = await storeImageAsset({
      ownerId: profile.profileId,
      kind: kind.data,
      input: new Uint8Array(await file.arrayBuffer()),
    });

    return NextResponse.json({
      key: stored.key,
      url: assetUrl(stored.key, publicBaseUrl()),
      width: stored.width,
      height: stored.height,
      bytes: stored.bytes,
    });
  } catch (error) {
    if (error instanceof InvalidImageError) {
      return NextResponse.json({ error: error.message }, { status: 415 });
    }
    log.error(
      { kind: kind.data, profileId: profile.profileId, error },
      "upload failed",
    );
    return NextResponse.json(
      { error: "Couldn't process that image. Please try again." },
      { status: 500 },
    );
  }
}
