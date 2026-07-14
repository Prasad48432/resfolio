import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth, type Session } from "./auth";

/**
 * Session read for optional-auth surfaces. Cached per request (React
 * `cache`), so layout + page + actions share one lookup.
 */
export const getOptionalSession = cache(async (): Promise<Session | null> => {
  return auth.api.getSession({ headers: await headers() });
});

/**
 * The guard every protected page, layout, Server Action, and Route Handler
 * calls itself — entry points never inherit trust from the middleware
 * redirect (docs/architecture/10-auth-and-security.md, defense in depth).
 */
export async function requireSession(): Promise<Session> {
  const session = await getOptionalSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}
