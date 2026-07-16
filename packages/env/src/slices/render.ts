import { z } from "zod";

/**
 * Rendering-host secrets (docs/architecture/02-resume-rendering.md,
 * 09-rendering-pipeline.md). `apps/sites` mints and verifies short-lived
 * signed tokens for its private print/preview routes; the dashboard and the
 * export job mint tokens with the same secret. Redis nonce hardening
 * (doc 07) layers on later — the secret is the stable dependency.
 */
export const render = {
  server: {
    PRINT_TOKEN_SECRET: z.string().min(16),
    /**
     * The dashboard origin allowed to frame the private portfolio
     * draft-preview route (CSP `frame-ancestors`, doc 08). Optional — absent,
     * the render host allows only `localhost` dev framing.
     */
    DASHBOARD_URL: z.string().url().optional(),
  },
  /**
   * The dashboard mints stored-document print URLs against `apps/sites`, but
   * that "Open print view" affordance is optional locally — both vars absent
   * simply hides it (full cloud PDF delivery lands later). Kept separate from
   * `server` so the dashboard boots without the secret while `apps/sites`
   * still requires it.
   */
  dashboard: {
    PRINT_TOKEN_SECRET: z.string().min(16).optional(),
    SITES_URL: z.string().url().optional(),
  },
} as const;
