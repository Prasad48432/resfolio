import { z } from "zod";

/**
 * Better Auth + OAuth providers (docs/architecture/10-auth-and-security.md).
 * Google + GitHub social login only — no password vars will ever live here.
 *
 * AUTH_E2E_MOCK_ISSUER is test-only: when set, @resfolio/auth registers
 * mock OAuth providers pointing at a local fake authorization server so the
 * CI e2e journey exercises the real OAuth dance without Google/GitHub.
 * It must never be set in production.
 */
export const auth = {
  server: {
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().url(),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    GITHUB_CLIENT_ID: z.string().min(1),
    GITHUB_CLIENT_SECRET: z.string().min(1),
    AUTH_E2E_MOCK_ISSUER: z.string().url().optional(),
  },
} as const;
