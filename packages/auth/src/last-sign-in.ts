import { cookies } from "next/headers";

/**
 * Which provider this browser signed in with last
 * (docs/architecture/10-auth-and-security.md).
 *
 * Better Auth's `lastLoginMethod` plugin writes it; this is the read. Both
 * sides name the cookie through {@link LAST_SIGN_IN_COOKIE} rather than
 * defaulting to the plugin's own name, because a default that matches by
 * coincidence is a rename away from a badge that silently never appears again.
 *
 * **Read on the server, not in the browser.** The value is a plain cookie and
 * the client plugin would read it just as well — but the login page is already
 * a dynamic Server Component, and reading it there means the badge is in the
 * first paint. Read on the client it can only appear after hydration, which for
 * a decoration on the primary action of the page is a visible flinch on every
 * visit.
 *
 * It is a **hint about a browser, never a claim about a user**. It outlives
 * sign-out on purpose (that is the whole point — the person it helps is signed
 * out), it is not `httpOnly`, and nothing may be authorised by it.
 */
export const LAST_SIGN_IN_COOKIE = "better-auth.last_used_login_method";

/**
 * The provider id — `google`, `github`, or a mock id under the e2e issuer —
 * or null when this browser has never completed a sign-in.
 *
 * Returned raw for the caller to match against its own provider list, which is
 * the only thing that knows what a valid id is. A stale value (a provider that
 * has since been removed) therefore matches nothing and shows no badge, rather
 * than being something this function has to keep a list to detect.
 */
export async function getLastSignInProviderId(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(LAST_SIGN_IN_COOKIE)?.value?.trim();
  return value ? value : null;
}
