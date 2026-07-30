import { billing, createAppEnv, sharedRuntime } from "@resfolio/env";

/**
 * The billing domain validates its own configuration on import, so a consumer
 * fails fast on a malformed value rather than at the moment somebody tries to
 * pay (docs/architecture/11-engineering-foundation.md).
 *
 * **Only `./server` reads this.** The pure root has no environment, no clock
 * and no I/O — that is what lets it be imported from a client component.
 */
export const env = createAppEnv({
  server: {
    ...sharedRuntime.server,
    ...billing.server,
  },
  client: {},
  experimental__runtimeEnv: {},
});

/**
 * Whether quota refusals are live.
 *
 * Unset means **enforced** — adding the variable is what changes behaviour,
 * so an environment that forgets it fails closed rather than silently
 * uncapped.
 *
 * When `false`, `authorizeAiSpend` still increments the counter and still
 * writes the ledger; it simply never refuses. Metering without refusing is
 * what §11 steps 3–4 are, and keeping the decision **inside** the gate rather
 * than at each call site is deliberate: five call sites each remembering to
 * check a flag is five chances to forget one.
 */
export function isBillingEnforced(): boolean {
  return env.BILLING_ENFORCED !== "false";
}

/** Whether checkout can run at all. Absent credentials hide the affordance
 * rather than failing at the moment a user picks a plan. */
export function isBillingConfigured(): boolean {
  return Boolean(env.DODO_PAYMENTS_API_KEY);
}
