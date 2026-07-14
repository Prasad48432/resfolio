import { createLogger } from "@resfolio/observability";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth } from "better-auth/plugins/generic-oauth";

import { db, schema } from "@resfolio/database";

import { MOCK_PROVIDER_IDS, mockOAuthProviders } from "./e2e-mock";
import { env } from "./env";
import { createRateLimitStorage } from "./rate-limit-storage";

const log = createLogger("auth");

const mockIssuer = env.AUTH_E2E_MOCK_ISSUER;
if (mockIssuer) {
  // e2e runs `next start` (NODE_ENV=production), so the guard is
  // structural instead: the fake authorization server may only ever live
  // on the loopback interface. A deploy with this var set to anything
  // else refuses to boot.
  const hostname = new URL(mockIssuer).hostname;
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    throw new Error(
      "AUTH_E2E_MOCK_ISSUER must point at localhost — it registers fake OAuth providers for e2e tests only.",
    );
  }
}

const rateLimitStorage = createRateLimitStorage();
if (env.NODE_ENV === "production" && !rateLimitStorage) {
  // In-memory counters are per-instance — configure Upstash before real
  // traffic (docs/architecture/10-auth-and-security.md).
  log.warn("Upstash not configured; auth rate limiting is in-memory only");
}

/**
 * The Better Auth server instance (docs/architecture/10-auth-and-security.md):
 * Google + GitHub social login only, account linking on (verified-email
 * keyed, both providers trusted), database sessions with a ~5-minute signed
 * cookie cache, host-only secure cookies (Better Auth defaults — no
 * crossSubDomainCookies, ever). Mounted only by apps/dashboard.
 */
export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
    github: {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    },
  },
  session: {
    // DB sessions with revocation that bites within the cache window.
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  account: {
    // OAuth tokens are AES-256-GCM encrypted at rest — a DB leak must not
    // hand out provider access.
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      // Both providers return provider-verified emails, so one human with a
      // Google and a GitHub account converges on one Resfolio account.
      trustedProviders: [
        "google",
        "github",
        ...(mockIssuer ? MOCK_PROVIDER_IDS : []),
      ],
      // allowUnlinkingAll stays false (default) — the last-provider guard.
    },
  },
  rateLimit: {
    // Better Auth enables this in production only by default; keep that,
    // but back it with Upstash so limits hold across serverless instances.
    // e2e (`next start` + mock issuer) opts out — it would only be testing
    // the in-memory fallback, never the production path.
    ...(mockIssuer ? { enabled: false } : {}),
    ...(rateLimitStorage ? { customStorage: rateLimitStorage } : {}),
    customRules: {
      "/sign-in/*": { window: 60, max: 10 },
    },
  },
  plugins: [
    ...(mockIssuer
      ? [genericOAuth({ config: mockOAuthProviders(mockIssuer) })]
      : []),
    // Must stay last: lets server-side auth calls set cookies in Next.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
export type SessionUser = Session["user"];
