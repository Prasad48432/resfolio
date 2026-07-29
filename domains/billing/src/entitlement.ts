import type { AiFeature } from "./features";
import { type Allowance, GRACE_WINDOW_MS, PLAN_LIMITS } from "./limits";
import type { BillingInterval, PlanId, SubscriptionStatus } from "./plans";

/**
 * Resolving what a user may do
 * (docs/architecture/14-ai-usage-and-billing.md §9.5).
 *
 * **This is the function to write tests for first; it is where the money is.**
 * Every path that grants or withholds paid access runs through it, it is pure,
 * and it takes `now` as an argument so every combination is reachable from a
 * test without touching a clock.
 *
 * It is also the only place a subscription's *state* is interpreted. Nothing
 * downstream may read `status` and draw its own conclusion — a second reading
 * of "does cancelled still mean access?" is how two parts of a product come to
 * disagree about whether somebody has paid.
 */

/**
 * The subscription row, as this function needs it.
 *
 * Written as the resolver's *input* rather than derived from the table, because
 * the pure layer decides what the schema must carry rather than the other way
 * round. In particular `statusChangedAt` exists because of {@link GRACE_WINDOW_MS}
 * — see below.
 */
export interface SubscriptionRecord {
  planId: PlanId;
  status: SubscriptionStatus;
  interval: BillingInterval | null;
  /** When the current paid term began — the quota period's anchor (§5.2). */
  periodStart: Date | null;
  /** When it ends. For a week pass this is `periodStart + 7 days`; for a
   * recurring plan it is the provider's `next_billing_date`. */
  periodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  /**
   * When `status` last changed.
   *
   * **A dedicated column, not `updated_at`.** Grace is measured from the moment
   * a subscription went `on_hold`, and `updated_at` moves for any write at all
   * — so a row touched for an unrelated reason would silently restart the
   * grace window and extend free access indefinitely.
   */
  statusChangedAt: Date;
}

/** Why the resolved plan is what it is — for copy, telemetry, and reasoning
 * about a support ticket without re-deriving the logic. */
export type EntitlementReason =
  /** No subscription row at all. */
  | "none"
  /** Paid and current. */
  | "active"
  /** Renewal failed; still inside the grace window (§8.5). */
  | "grace"
  /** Cancelled, but the paid term has not ended yet. */
  | "cancelled_until_period_end"
  /** Was paid; the term ended, grace ran out, or a pass expired. */
  | "lapsed";

export interface Entitlement {
  planId: PlanId;
  limits: Record<AiFeature, Allowance>;
  reason: EntitlementReason;
  /** When paid access ends, when that is a known instant. `null` on free. */
  activeUntil: Date | null;
  /** Inside the post-failure grace window — the banner's condition. */
  inGrace: boolean;
  /** The quota period's anchor: `periodStart` while paid access holds, `null`
   * once it does not, so a lapsed user's counters fall back to the calendar
   * month (§5.2). */
  anchor: Date | null;
}

const FREE: Omit<Entitlement, "reason"> = {
  planId: "free",
  limits: PLAN_LIMITS.free,
  activeUntil: null,
  inGrace: false,
  anchor: null,
};

function free(reason: EntitlementReason): Entitlement {
  return { ...FREE, reason };
}

function paid(
  subscription: SubscriptionRecord,
  reason: EntitlementReason,
  inGrace = false,
): Entitlement {
  return {
    planId: subscription.planId,
    limits: PLAN_LIMITS[subscription.planId],
    reason,
    activeUntil: subscription.periodEnd,
    inGrace,
    anchor: subscription.periodStart,
  };
}

/**
 * What this user may do right now.
 *
 * The `switch` is **exhaustive over {@link SubscriptionStatus}** and the
 * `never` check at the end is load-bearing: adding a status (a trial, say)
 * fails to compile here until somebody decides what it grants. That is the
 * property that keeps this function the single interpretation of a
 * subscription's state.
 */
export function resolveEntitlement(
  subscription: SubscriptionRecord | null,
  now: Date,
): Entitlement {
  if (subscription === null) {
    return free("none");
  }

  // A plan of `free` grants the free entitlement whatever the status says —
  // a downgraded user keeps their row, and reading `status: active` off it
  // would otherwise hand them a paid plan they no longer have.
  if (subscription.planId === "free") {
    return free("none");
  }

  const status: SubscriptionStatus = subscription.status;

  switch (status) {
    case "active": {
      // **The week pass expires here and nowhere else** (§4.1). A one-time
      // payment has no renewal, so nothing ever arrives to move it off
      // `active` — expiry is the absence of a future date, checked on read,
      // rather than an event that has to be delivered.
      if (hasEnded(subscription.periodEnd, now)) {
        return free("lapsed");
      }
      return paid(subscription, "active");
    }

    case "on_hold": {
      // Grace is a function of this resolver, not a scheduled job (§8.5).
      // There is nothing to run at hour 73, so there is nothing that can fail
      // to run and leave paid access granted indefinitely for free.
      const graceEndsAt =
        subscription.statusChangedAt.getTime() + GRACE_WINDOW_MS;
      if (now.getTime() < graceEndsAt) {
        return paid(subscription, "grace", true);
      }
      return free("lapsed");
    }

    case "cancelled": {
      // Cancelling is not the same as ending. A user who cancels on day 2 of a
      // month they paid for keeps it to the end — taking it away immediately
      // would be charging for a period and not delivering it.
      if (
        subscription.cancelAtPeriodEnd &&
        !hasEnded(subscription.periodEnd, now)
      ) {
        return paid(subscription, "cancelled_until_period_end");
      }
      return free("lapsed");
    }

    case "expired":
      return free("lapsed");

    // The mandate was never established, so this never granted anything and
    // there is nothing to lapse *from*.
    case "failed":
      return free("none");

    default: {
      const unhandled: never = status;
      throw new Error(`Unhandled subscription status: ${String(unhandled)}`);
    }
  }
}

/** `null` means no known end — treated as not ended, since a paid row without
 * a period is a provisioning gap rather than an expiry. */
function hasEnded(periodEnd: Date | null, now: Date): boolean {
  return periodEnd !== null && now.getTime() >= periodEnd.getTime();
}

/** The allowance for one feature under a resolved entitlement. */
export function allowanceFor(
  entitlement: Entitlement,
  feature: AiFeature,
): Allowance {
  return entitlement.limits[feature];
}

/** Whether a paid plan is in force — the condition for hiding upgrade
 * prompts, not for granting anything. */
export function isPaid(entitlement: Entitlement): boolean {
  return entitlement.planId !== "free";
}
