import { z } from "zod";

/**
 * Rendering-host secrets (docs/architecture/02-resume-rendering.md,
 * 09-rendering-pipeline.md).
 *
 * `RENDER_SECRET` is a **server-to-server** secret — never handed to a user,
 * never placed in a user-facing URL. It bears the two dashboard→sites API
 * calls: `POST /api/revalidate` (publish invalidation) and
 * `POST /api/export/resume/[documentId]` (PDF).
 *
 * It was `PRINT_TOKEN_SECRET` until resume print tokens were removed: a resume
 * now has a permanent URL gated by its own `visibility` (doc 02), so there is
 * no print token left to name it after. Redis nonce hardening (doc 07) layers
 * on later — the secret is the stable dependency.
 *
 * `DASHBOARD_URL` went with the portfolio draft-preview route (2026-07-18):
 * it existed solely to widen that route's `frame-ancestors` allowlist, and
 * nothing frames `apps/sites` any more.
 */
export const render = {
  server: {
    RENDER_SECRET: z.string().min(16),
  },
  /**
   * The dashboard calls `apps/sites` for the resume PDF export. Optional
   * locally — both vars absent simply hides that affordance. Kept separate
   * from `server` so the dashboard boots without the secret while
   * `apps/sites` still requires it.
   */
  dashboard: {
    RENDER_SECRET: z.string().min(16).optional(),
    SITES_URL: z.string().url().optional(),
  },
} as const;
