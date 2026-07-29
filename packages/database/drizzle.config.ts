// Loads .env from this package's directory for local CLI runs
// (drizzle-kit does not load dotenv itself); CI and production set
// DATABASE_URL in the environment directly.
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

import { env } from "./src/env";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    // **The direct endpoint, not the pooled one** (doc 15 §2.1). A migration is
    // multi-statement DDL holding session-level locks, and a transaction-mode
    // pooler does not keep a session across statements — so running migrations
    // through the pooler fails in ways that read as a broken migration rather
    // than a broken connection string. Falls back to `DATABASE_URL` for local
    // docker and CI, which have no pooler in front of them.
    url: env.DATABASE_URL_DIRECT ?? env.DATABASE_URL,
  },
});
