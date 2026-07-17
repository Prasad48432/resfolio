import { z } from "zod";

/**
 * Integrations runtime secrets (docs/architecture/12-integrations-and-sync.md).
 *
 * `INTEGRATIONS_TOKEN_KEY` encrypts provider tokens at rest (AES-256-GCM):
 * 64 hex chars = 32 bytes. **Optional** — every V1 connector is `public` and
 * stores no credentials, so the platform must run without it; the domain
 * refuses to store an `oauth2`/`token` connection when the key is absent.
 * Rotation uses the envelope's key-version prefix (doc 12 open question) —
 * this stays a single current key until a second version is actually needed.
 *
 * `GITHUB_TOKEN` is **not** authentication and grants no per-user access — it
 * is a rate-limit lever. Unauthenticated api.github.com allows 60 requests per
 * hour **per IP**, which on a shared host is 60 imports/hour for the whole
 * deployment, failing for everyone at once. Any classic PAT with no scopes
 * lifts that to 5,000/hr. Optional: absent, imports still work and simply
 * carry the lower ceiling.
 */
export const integrations = {
  server: {
    INTEGRATIONS_TOKEN_KEY: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/, "64 hex characters (32 bytes)")
      .optional(),
    GITHUB_TOKEN: z.string().min(1).optional(),
  },
} as const;
