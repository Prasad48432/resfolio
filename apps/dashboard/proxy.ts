import { getSessionCookie } from "@resfolio/auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic redirect on cookie *absence* — UX only, never trusted
 * (docs/architecture/10-auth-and-security.md, route guarding step 1).
 * Real verification happens in the (dashboard) layout and in every Server
 * Action via requireSession. DB-free by design so this can run at the edge.
 *
 * Deliberately one-directional: it never redirects *away* from /login on
 * cookie presence. A cookie can outlive its DB session (revocation from
 * another device, a dev database reset) — bouncing /login → app on presence
 * while the layout bounces app → /login on invalid session would loop until
 * the browser gives up. The signed-in-skips-login redirect lives in the
 * login page itself, backed by a real session check.
 */
export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/login") {
    return NextResponse.next();
  }

  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Everything except the auth API (must stay reachable to create the
  // session), Next internals, and static assets.
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)).*)",
  ],
};
