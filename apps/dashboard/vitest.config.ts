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
      // `import "server-only"` is a **build-time assertion**, not a module with
      // behaviour: Next resolves it to a package whose only job is to fail the
      // build if a client component reaches it. Vitest has no such bundler
      // boundary and no such package, so it fails at collection time — which
      // reads as a broken test rather than as a missing alias.
      //
      // Aliased to an empty stub rather than removed from the source, because
      // the import is what keeps the vendored fonts and the letter renderer out
      // of a browser bundle. `lib/pdf/cover-letter-pdf.ts` is the first tested
      // module to carry it; `lib/assets.ts` and `lib/blog-config.ts` also do.
      "server-only": fileURLToPath(
        new URL("./test/server-only-stub.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
