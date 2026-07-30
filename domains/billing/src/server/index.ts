/**
 * `@resfolio/billing/server` — the only code that touches the six billing
 * tables (docs/architecture/14-ai-usage-and-billing.md §5).
 *
 * **Server-only**: it imports `@resfolio/database`, so importing it from a
 * client component is a build error rather than a leak. Everything a browser
 * needs — the catalogue, the limits, `summariseUsage` — is in the pure root.
 *
 * **No prompts, no provider, no model call**, and no payment SDK yet: the Dodo
 * seam lands with §11 step 6 and will be the only file importing
 * `dodopayments`.
 */
export { isBillingConfigured, isBillingEnforced } from "./env";
export { getEntitlement, getSubscription } from "./subscription";
export {
  authorizeAiSpend,
  authorizeWithEntitlement,
  BillingError,
  readCounters,
  recordAiSpend,
  refundSpend,
  type RecordSpendInput,
  type SpendReservation,
  type SpendVerdict,
} from "./quota";
export { getUsageSummary } from "./usage";
export { hasProductEntitlement, listProductEntitlements } from "./products";
