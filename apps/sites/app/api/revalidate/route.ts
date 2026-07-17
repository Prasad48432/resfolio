import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { env } from "@/lib/env";

/**
 * On-demand cache invalidation for a published Site
 * (docs/architecture/04-deployment.md). The dashboard and `apps/sites` are
 * separate deployments, so a publish can't invalidate this app's ISR cache
 * in-process — it calls this endpoint, which drops the `site:<id>` tag so the
 * next request re-renders from the newly pinned profile version. Everything
 * else stays cached; renders stay proportional to publishes (doc 04). The 24h
 * route `revalidate` is the fallback if this call is ever missed.
 *
 * Guarded by the shared render secret (`RENDER_SECRET`) — the same
 * dashboard↔sites secret that signs print tokens. A bad/missing bearer is a
 * 401; this route is never cached and never indexed.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const auth = request.headers.get("authorization");
  const expected = `Bearer ${env.RENDER_SECRET}`;
  if (!auth || auth !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let siteId: unknown;
  try {
    const body: unknown = await request.json();
    siteId =
      typeof body === "object" && body !== null
        ? (body as { siteId?: unknown }).siteId
        : undefined;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (typeof siteId !== "string" || siteId.length === 0) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // `{ expire: 0 }`: this is an external webhook that needs the published
  // change reflected immediately, not stale-while-revalidate (Next 16 docs).
  revalidateTag(`site:${siteId}`, { expire: 0 });
  return NextResponse.json({ ok: true, revalidated: `site:${siteId}` });
}
