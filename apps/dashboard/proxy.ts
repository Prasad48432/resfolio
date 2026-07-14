import { getSessionCookie } from "@resfolio/auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic redirect on cookie *presence* — UX only, never trusted
 * (docs/architecture/10-auth-and-security.md, route guarding step 1).
 * Real verification happens in the (dashboard) layout and in every Server
 * Action via requireSession. DB-free by design so this can run at the edge.
 */
export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = Boolean(getSessionCookie(request));

  if (pathname === "/login") {
    return hasSessionCookie
      ? NextResponse.redirect(new URL("/profile", request.url))
      : NextResponse.next();
  }

  if (!hasSessionCookie) {
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
