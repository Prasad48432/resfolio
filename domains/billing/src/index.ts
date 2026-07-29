/**
 * `@resfolio/billing` — plan entitlements, AI quota rules and the price
 * catalogue (docs/architecture/14-ai-usage-and-billing.md).
 *
 * **Pure root: no database, no network, no clock.** Every function here takes
 * `now` as an argument, which is what makes the money-critical logic —
 * `resolveEntitlement`, `resolveQuotaPeriod` — reachable from a test in every
 * state rather than only the one the machine happens to be in. Safe in a client
 * component, so the upgrade prompt can name the same number the server will
 * enforce.
 *
 * **No prompts, no provider, no model call, no payment SDK.** Same rule
 * `@resfolio/ai` and `@resfolio/job` follow. This package knows a feature was
 * spent; it has no idea what a model is. The Dodo SDK will live behind
 * `./server`, which does not exist yet.
 *
 * See `CLAUDE.md` in this package for what belongs here and what does not.
 */
export * from "./entitlement";
export * from "./features";
export * from "./limits";
export * from "./period";
export * from "./plans";
export * from "./pricing";
export * from "./products";
export * from "./usage";
