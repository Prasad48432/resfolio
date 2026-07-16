import { z } from "zod";

/**
 * Integrations runtime secrets (docs/architecture/12-integrations-and-sync.md).
 * `INTEGRATIONS_TOKEN_KEY` encrypts provider tokens at rest (AES-256-GCM):
 * 64 hex chars = 32 bytes. **Optional** — `public`/`file` connectors (RSS,
 * LinkedIn import) store no credentials and must work without it; the domain
 * refuses to store an `oauth2`/`token` connection when the key is absent.
 * Rotation uses the envelope's key-version prefix (doc 12 open question) —
 * this stays a single current key until a second version is actually needed.
 */
export const integrations = {
  server: {
    INTEGRATIONS_TOKEN_KEY: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/, "64 hex characters (32 bytes)")
      .optional(),
  },
} as const;
