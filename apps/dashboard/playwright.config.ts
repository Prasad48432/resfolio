/* eslint-disable no-restricted-properties, turbo/no-undeclared-env-vars --
   test tooling runs outside the app; it seeds the env the app will
   validate rather than consuming it. */
import { defineConfig, devices } from "@playwright/test";

const APP_PORT = 3101;
const MOCK_OAUTH_PORT = 4780;
const BASE_URL = `http://localhost:${APP_PORT}`;
const MOCK_ISSUER = `http://localhost:${MOCK_OAUTH_PORT}`;

/** Matches docker-compose.dev.yml (host port 5433); CI overrides it. */
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://resfolio:resfolio@localhost:5433/resfolio";

const appEnv = {
  DATABASE_URL,
  BETTER_AUTH_URL: BASE_URL,
  BETTER_AUTH_SECRET: "e2e-secret-0123456789abcdef0123456789abcdef",
  GOOGLE_CLIENT_ID: "e2e-google",
  GOOGLE_CLIENT_SECRET: "e2e-google-secret",
  GITHUB_CLIENT_ID: "e2e-github",
  GITHUB_CLIENT_SECRET: "e2e-github-secret",
  AUTH_E2E_MOCK_ISSUER: MOCK_ISSUER,
};

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Sign-in journeys share one database; serial keeps them deterministic.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm exec tsx e2e/mock-oauth-server.ts",
      url: `${MOCK_ISSUER}/mock-google/userinfo`,
      // The health probe 401s without a bearer token — that still proves
      // the server is up.
      ignoreHTTPSErrors: true,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      // Production server against the already-built app (`next build` runs
      // in the e2e job / locally before `pnpm test:e2e`).
      command: `pnpm exec next start -p ${APP_PORT}`,
      url: `${BASE_URL}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: appEnv,
    },
  ],
});
