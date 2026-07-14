import { authHandlers } from "@resfolio/auth";

/**
 * The only auth handler in the platform — neither apps/web nor apps/sites
 * mounts one (docs/architecture/10-auth-and-security.md).
 */
export const { GET, POST } = authHandlers;
