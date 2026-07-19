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

  let body: { siteId?: unknown; profileId?: unknown };
  try {
    const parsed: unknown = await request.json();
    body = typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Two independent tags, because a portfolio render depends on two things
  // that change on different events: the site's pinned profile version
  // (`site:<id>`, a site publish) and the owner's posts (`blog:<id>`, any post
  // write). A caller may drop either or both.
  const tags: string[] = [];
  if (typeof body.siteId === "string" && body.siteId.length > 0) {
    tags.push(`site:${body.siteId}`);
  }
  if (typeof body.profileId === "string" && body.profileId.length > 0) {
    tags.push(`blog:${body.profileId}`);
  }

  if (tags.length === 0) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  for (const tag of tags) {
    // `{ expire: 0 }`: this is an external webhook that needs the published
    // change reflected immediately, not stale-while-revalidate (Next 16 docs).
    revalidateTag(tag, { expire: 0 });
  }
  return NextResponse.json({ ok: true, revalidated: tags });
}
