import { NextResponse } from "next/server";

import { env } from "@/lib/env";

/**
 * GitHub contribution-calendar proxy, adapted from
 * github.com/Ashutoshx7/Portfolio-v2- (`src/app/api/github/route.ts`). The
 * `dark-anime` template's activity-graph island (client/github-graph.tsx) calls
 * this same-origin so the token never reaches the browser.
 *
 * **Two changes from the reference, both deliberate.** The reference proxied an
 * arbitrary `query` from the client; this takes a validated `username` and
 * builds the query server-side, so the deployment's token can't be borrowed to
 * run any GraphQL it likes. And soft failures (no token, upstream error) return
 * `200 { calendar: null }` rather than an error status: the graph is an optional
 * enhancement, and the island degrades to a short note on a null calendar — a
 * 500 would just be noise in the client console for a feature that is allowed to
 * be absent (the `GITHUB_TOKEN` note in the env integrations slice).
 *
 * GitHub's contribution calendar is GraphQL-only and requires a token, so
 * without `GITHUB_TOKEN` there is simply no data to return.
 */
export const dynamic = "force-dynamic";

/** GitHub usernames: 1–39 chars, alphanumeric or single hyphens. Anchored, so a
 * validated handle is safe to interpolate into the GraphQL string below. */
const USERNAME = /^[a-zA-Z0-9-]{1,39}$/;

export async function POST(request: Request): Promise<NextResponse> {
  let username: string;
  try {
    const body = (await request.json()) as { username?: unknown };
    if (typeof body.username !== "string" || !USERNAME.test(body.username)) {
      return NextResponse.json({ calendar: null }, { status: 400 });
    }
    username = body.username;
  } catch {
    return NextResponse.json({ calendar: null }, { status: 400 });
  }

  const token = env.GITHUB_TOKEN;
  if (!token) {
    return NextResponse.json({ calendar: null }, { status: 200 });
  }

  const query = `query { user(login: "${username}") { contributionsCollection { contributionCalendar { totalContributions months { name } weeks { contributionDays { contributionCount date } } } } } }`;

  try {
    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "resfolio",
      },
      body: JSON.stringify({ query }),
      // Don't let a slow upstream hold the request open.
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return NextResponse.json({ calendar: null }, { status: 200 });
    }
    const data = (await response.json()) as {
      data?: {
        user?: {
          contributionsCollection?: { contributionCalendar?: unknown };
        };
      };
    };
    const calendar =
      data.data?.user?.contributionsCollection?.contributionCalendar ?? null;
    return NextResponse.json({ calendar }, { status: 200 });
  } catch {
    return NextResponse.json({ calendar: null }, { status: 200 });
  }
}
