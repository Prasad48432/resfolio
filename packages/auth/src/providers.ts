import { MOCK_PROVIDER_IDS, type MockProviderId } from "./e2e-mock";
import { env } from "./env";

/**
 * The sign-in/link surface rendered by the dashboard. Exactly Google +
 * GitHub in real mode (docs/architecture/10-auth-and-security.md — social
 * login only, V1); the mock pair in e2e test mode. Serializable so server
 * components can pass it to client islands.
 */
export type SignInProvider =
  | { kind: "social"; id: "google" | "github" }
  | { kind: "mock"; id: MockProviderId };

export function getSignInProviders(): SignInProvider[] {
  if (env.AUTH_E2E_MOCK_ISSUER) {
    return MOCK_PROVIDER_IDS.map((id) => ({ kind: "mock" as const, id }));
  }
  return [
    { kind: "social", id: "google" },
    { kind: "social", id: "github" },
  ];
}
