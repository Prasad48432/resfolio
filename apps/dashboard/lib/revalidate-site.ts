import "server-only";

import { env } from "@/lib/env";

/**
 * Ask `apps/sites` to drop cached public pages (docs/architecture/04-deployment.md).
 *
 * The dashboard and the render host are separate deployments, so an in-process
 * `revalidateTag` cannot reach the host's ISR cache — we POST its on-demand
 * revalidation route, guarded by the shared render secret.
 *
 * **Two independent tags**, because a portfolio render depends on two things
 * that change on different events:
 * - `siteId` → `site:<id>`, dropped when the *site* is published (it pins a new
 *   profile version).
 * - `profileId` → `blog:<id>`, dropped on any *post* write. Without this, a
 *   newly published post stays invisible for the full 24-hour fallback window,
 *   because nothing else about the site changed.
 *
 * **Best-effort by design.** Absent config (local dev, no render host) this is
 * a no-op, and a failed call never fails the user's action — the fallback TTL
 * covers a missed invalidation. A publish that succeeded must not report
 * failure because a cache did not clear.
 */
export async function revalidatePublicSite(target: {
  siteId?: string;
  profileId?: string;
}): Promise<void> {
  const sitesUrl = env.SITES_URL;
  const secret = env.RENDER_SECRET;
  if (!sitesUrl || !secret) {
    return;
  }
  if (!target.siteId && !target.profileId) {
    return;
  }

  try {
    await fetch(`${sitesUrl.replace(/\/$/, "")}/api/revalidate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(target),
    });
  } catch {
    // Best-effort — the fallback TTL covers a missed invalidation.
  }
}
