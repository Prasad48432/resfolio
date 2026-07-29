/**
 * @resfolio/auth — Better Auth configured once
 * (docs/architecture/10-auth-and-security.md). Server entry point; client
 * components import from `@resfolio/auth/client`.
 */
export { auth, type Session, type SessionUser } from "./auth";
export { authHandlers } from "./handler";
export { getOptionalSession, requireSession } from "./session";
export { getSignInProviders, type SignInProvider } from "./providers";
export { getLastSignInProviderId, LAST_SIGN_IN_COOKIE } from "./last-sign-in";
export { MOCK_PROVIDER_IDS, type MockProviderId } from "./e2e-mock";
