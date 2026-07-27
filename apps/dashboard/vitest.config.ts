import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  // Mirrors the `@/*` path in tsconfig.json. Needed the moment a unit-tested
  // module reaches env or another `@/lib/*` — `lib/ai/rate-limit.ts` is the
  // first — because vitest resolves imports itself and does not read tsconfig
  // paths. Without it the failure is a module-not-found at collection time,
  // which reads as a broken test rather than as a missing alias.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
