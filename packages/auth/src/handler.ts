import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "./auth";

/**
 * Next.js Route Handler pair for `app/api/auth/[...all]/route.ts` in
 * apps/dashboard — the only app that mounts an auth handler
 * (docs/architecture/10-auth-and-security.md).
 */
export const authHandlers = toNextJsHandler(auth);
