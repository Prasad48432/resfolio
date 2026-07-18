import { z } from "zod";

/**
 * Cloudflare R2 — every binary (docs/architecture/07-storage.md).
 *
 * The five values are the S3-compatible credential set plus the delivery
 * origin. `R2_ACCOUNT_ID` builds the API endpoint
 * (`https://<id>.r2.cloudflarestorage.com`); the access key pair should come
 * from a token scoped **Object Read & Write on this bucket only** — an admin
 * or account-wide token hands a leaked credential the whole account.
 *
 * `R2_PUBLIC_BASE_URL` is deliberately separate from the API endpoint and is
 * the *only* thing that decides how a stored key becomes a public URL. Keys go
 * in the database; URLs are resolved at render time (`assetUrl`), so moving
 * from an `r2.dev` development URL to a custom domain on the bucket is a
 * change to this variable and nothing else. Note Cloudflare rate-limits
 * `r2.dev` and advises against it for production traffic — the indirection is
 * what keeps that a cheap decision to revisit.
 *
 * All optional: absent, uploads are unavailable and the dashboard hides the
 * affordance rather than failing at the moment a user picks a file. The
 * rendering host needs none of them — it only ever reads public URLs.
 */
export const r2 = {
  server: {
    R2_ACCOUNT_ID: z.string().min(1).optional(),
    R2_BUCKET: z.string().min(1).optional(),
    R2_ACCESS_KEY_ID: z.string().min(1).optional(),
    R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    R2_PUBLIC_BASE_URL: z.string().url().optional(),
  },
} as const;
