import type { GenericOAuthConfig } from "better-auth/plugins/generic-oauth";

/**
 * Test-only OAuth providers (docs/architecture/11-engineering-foundation.md,
 * "OAuth mocking approach for e2e"): when AUTH_E2E_MOCK_ISSUER is set, the
 * e2e suite runs a tiny local authorization server and these generic OAuth
 * providers point at it, so CI exercises the full redirect → callback →
 * session flow — including account linking — without Google/GitHub.
 *
 * `src/auth.ts` refuses to boot with the issuer set in production.
 */
export const MOCK_PROVIDER_IDS = ["mock-google", "mock-github"] as const;

export type MockProviderId = (typeof MOCK_PROVIDER_IDS)[number];

export function mockOAuthProviders(issuer: string): GenericOAuthConfig[] {
  return MOCK_PROVIDER_IDS.map((providerId) => ({
    providerId,
    clientId: providerId,
    clientSecret: `${providerId}-secret`,
    authorizationUrl: `${issuer}/${providerId}/authorize`,
    tokenUrl: `${issuer}/${providerId}/token`,
    userInfoUrl: `${issuer}/${providerId}/userinfo`,
    scopes: ["openid", "email", "profile"],
    pkce: false,
  }));
}
