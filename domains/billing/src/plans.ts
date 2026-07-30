import { z } from "zod";

/**
 * Plan identity and subscription state
 * (docs/architecture/14-ai-usage-and-billing.md §4.1, §5.1).
 */

/**
 * **One plan id per product, and the plan id carries the entitlement.**
 *
 * An earlier design split these — `free | pro | career` as the entitlement,
 * `week | month | year` as the cadence — on the theory that a weekly Pro and a
 * yearly Pro are the same thing bought differently. The decided product does
 * not work that way: **yearly grants a larger monthly allowance than monthly
 * does**, so the four products are four entitlement levels, and the separation
 * was buying an indirection in which "yearly" secretly meant "the max tier".
 *
 * The cost is that a fifth product means a fifth row in {@link PLAN_LIMITS}
 * rather than a reused tier. At four products that is the better trade: the
 * table is exhaustive and type-checked, so a new plan cannot be added without
 * deciding every allowance on it.
 *
 * Order is ascending by entitlement, and {@link planRank} depends on it.
 */
export const PLAN_IDS = ["free", "weekly", "monthly", "yearly"] as const;

export type PlanId = (typeof PLAN_IDS)[number];

export const planIdSchema = z.enum(PLAN_IDS);

/**
 * How often the plan is paid for. **Not an input to the allowance lookup** —
 * `PLAN_LIMITS[planId]` is the whole rule. This survives as a display and
 * renewal fact: it is what the billing copy says and what Dodo renews on.
 *
 * `week` is a **pass**, not a recurring interval: one payment, seven days, no
 * renewal (§4.1). It appears here because the row still needs to describe what
 * was bought.
 */
export const BILLING_INTERVALS = ["week", "month", "year"] as const;

export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export const billingIntervalSchema = z.enum(BILLING_INTERVALS);

/**
 * **Dodo's own vocabulary, not a translated one.**
 *
 * An earlier draft invented `past_due | canceled | paused | trialing` — Stripe's
 * words, from habit. Dodo emits none of them: its failed-renewal state is
 * `on_hold`, and `cancelled` carries the British spelling in both the event
 * name and the payload. A translation layer between the provider's words and
 * ours would be a few lines of mapping whose only effect is to make the webhook
 * handler harder to check against the provider's documentation, so there is
 * none: what the event says is what the column holds.
 *
 * `trialing` is absent because no plan offers a trial. If that changes, adding
 * it here makes {@link resolveEntitlement}'s switch fail to compile until it is
 * handled — which is the point.
 */
export const SUBSCRIPTION_STATUSES = [
  /** Paid and current. */
  "active",
  /** A renewal payment failed. Entitlement is **retained** through a grace
   * window (§8.5) — card failures are overwhelmingly banks, not intent. */
  "on_hold",
  /** Cancelled by the user. Access may still run to `periodEnd`. */
  "cancelled",
  /** The term ended. */
  "expired",
  /** Mandate creation failed; this never became active and never granted
   * anything. */
  "failed",
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const subscriptionStatusSchema = z.enum(SUBSCRIPTION_STATUSES);

/**
 * Display names, for the same reason {@link AI_FEATURE_LABELS} exists: the usage
 * screen, the upgrade prompt and the eventual pricing page must not each invent
 * their own word for the plan somebody is paying for.
 *
 * **"Free" is a plan, not the absence of one**, and it is named rather than left
 * blank — a usage screen whose plan line is empty reads as a page that failed to
 * load. The paid names describe what was bought (a pass, a subscription) rather
 * than inventing a tier vocabulary the checkout does not use.
 */
export const PLAN_LABELS: Record<PlanId, string> = {
  free: "Free",
  weekly: "Week pass",
  monthly: "Monthly",
  yearly: "Yearly",
};

/**
 * Position in {@link PLAN_IDS}, for "is this an upgrade?" comparisons.
 *
 * Used to refuse selling a week pass to someone already on monthly or yearly
 * (§8.4): a pass is strictly worse than what they have, and the only thing it
 * could accomplish is confusing the period boundary.
 */
export function planRank(planId: PlanId): number {
  return PLAN_IDS.indexOf(planId);
}

/** Whether moving to `next` is an upgrade from `current`. */
export function isUpgrade(current: PlanId, next: PlanId): boolean {
  return planRank(next) > planRank(current);
}
