import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { env } from "../env";

/**
 * The R2 client (docs/architecture/07-storage.md).
 *
 * R2 speaks the S3 API, so this is `@aws-sdk/client-s3` pointed at
 * `https://<account>.r2.cloudflarestorage.com` with `region: "auto"` — R2
 * ignores the region but the SDK refuses to construct without one.
 *
 * **Storage is optional infrastructure.** Every entry point here answers
 * `isStorageConfigured()` first, so a checkout with no R2 credentials boots,
 * builds, and runs with uploads simply unavailable — the same posture as the
 * PDF export. A thrown "misconfigured" error at the moment a user picks a file
 * would be a worse failure than an upload button that was never shown.
 */
let cached: S3Client | null = null;

export function isStorageConfigured(): boolean {
  return Boolean(
    env.R2_ACCOUNT_ID &&
    env.R2_BUCKET &&
    env.R2_ACCESS_KEY_ID &&
    env.R2_SECRET_ACCESS_KEY &&
    env.R2_PUBLIC_BASE_URL,
  );
}

export class StorageNotConfiguredError extends Error {
  constructor() {
    super("R2 storage is not configured in this environment.");
    this.name = "StorageNotConfiguredError";
  }
}

function client(): S3Client {
  if (!isStorageConfigured()) {
    throw new StorageNotConfiguredError();
  }
  cached ??= new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    },
  });
  return cached;
}

function bucket(): string {
  if (!env.R2_BUCKET) {
    throw new StorageNotConfiguredError();
  }
  return env.R2_BUCKET;
}

/** The configured delivery origin. Never stored — resolved per render. */
export function publicBaseUrl(): string {
  if (!env.R2_PUBLIC_BASE_URL) {
    throw new StorageNotConfiguredError();
  }
  return env.R2_PUBLIC_BASE_URL;
}

export async function putObject({
  key,
  body,
  contentType,
}: {
  key: string;
  body: Uint8Array;
  contentType: string;
}): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
      // Safe precisely because the key contains the content hash: this key's
      // bytes can never change, so there is nothing to revalidate. New content
      // is a new key.
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
}

/** Delete specific keys. Tolerates keys that no longer exist — S3 delete is
 * idempotent, which is what makes cleanup safe to retry. */
export async function deleteObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) {
    return;
  }
  // The API caps a batch at 1000 objects.
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    await client().send(
      new DeleteObjectsCommand({
        Bucket: bucket(),
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }
}

/**
 * Delete everything under a prefix — the "this profile is gone" operation.
 *
 * Paginated deliberately: `ListObjectsV2` returns at most 1000 keys per call,
 * and a truncated first page would leave a partially-deleted profile that
 * *looks* deleted. The loop is the difference between honouring a deletion
 * request and appearing to.
 */
export async function deleteByPrefix(prefix: string): Promise<number> {
  let deleted = 0;
  let continuationToken: string | undefined;

  do {
    const page = await client().send(
      new ListObjectsV2Command({
        Bucket: bucket(),
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    const keys = (page.Contents ?? [])
      .map((object) => object.Key)
      .filter((key): key is string => Boolean(key));

    await deleteObjects(keys);
    deleted += keys.length;
    continuationToken = page.IsTruncated
      ? page.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return deleted;
}
