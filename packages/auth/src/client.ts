import { genericOAuthClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * Typed Better Auth client for client components. Same-origin baseURL —
 * auth is mounted in apps/dashboard only. The genericOAuth client plugin
 * exists solely for the e2e mock providers; its endpoints are not
 * registered on the server outside test mode.
 */
export const authClient = createAuthClient({
  plugins: [genericOAuthClient()],
});
