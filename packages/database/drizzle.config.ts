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
    url: env.DATABASE_URL,
  },
});
