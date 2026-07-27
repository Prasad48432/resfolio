/**
 * A stand-in for the `server-only` package under vitest.
 *
 * `import "server-only"` is a build-time assertion: the real package exports a
 * module that throws if a bundler pulls it into a client graph, which is how Next
 * turns "this file must stay on the server" into a build error rather than a leak
 * discovered in production. Vitest has no client graph, so there is nothing to
 * assert and nothing to import — but the specifier still has to resolve.
 *
 * Empty on purpose. Aliased in `vitest.config.ts`; nothing imports it directly.
 */
export {};
