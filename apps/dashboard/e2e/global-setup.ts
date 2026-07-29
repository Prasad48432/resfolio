/* eslint-disable no-restricted-properties --
   test tooling, see playwright.config.ts */
import { execSync } from "node:child_process";

/**
 * Applies the committed Drizzle migrations to the e2e database before the
 * suite starts (idempotent), so `pnpm test:e2e` is self-contained given a
 * running Postgres (docker-compose.dev.yml locally, service container in CI).
 */
export default function globalSetup() {
  execSync("pnpm --filter @resfolio/database db:migrate", {
    cwd: "../..",
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgres://resfolio:resfolio@localhost:15432/resfolio",
    },
  });
}
