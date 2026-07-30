import { eq } from "drizzle-orm";

import { db, schema } from "@resfolio/database";

import {
  type Entitlement,
  resolveEntitlement,
  type SubscriptionRecord,
} from "../entitlement";
import {
  billingIntervalSchema,
  planIdSchema,
  subscriptionStatusSchema,
} from "../plans";

/**
 * Subscription reads (docs/architecture/14-ai-usage-and-billing.md §5.1).
 * **The only code that touches the `subscriptions` table**, alongside the
 * webhook writer that will land with §11 step 6.
 */

/**
 * The stored row, parsed into the shape `resolveEntitlement` needs.
 *
 * **Unrecognised values fall back to the safe reading rather than throwing.**
 * `plan_id` and `status` are `text` columns precisely so the vocabulary can
 * grow without a migration, which means an older deploy can legitimately read a
 * value written by a newer one. Throwing there would take the dashboard down
 * for a user whose only crime was subscribing during a rollout; falling back to
 * `free` / `expired` withholds paid access for a few minutes instead, which is
 * the error worth making.
 */
function toRecord(row: {
  planId: string;
  status: string;
  interval: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  statusChangedAt: Date;
}): SubscriptionRecord {
  const planId = planIdSchema.safeParse(row.planId);
  const status = subscriptionStatusSchema.safeParse(row.status);
  const interval = billingIntervalSchema.safeParse(row.interval);

  return {
    planId: planId.success ? planId.data : "free",
    status: status.success ? status.data : "expired",
    interval: interval.success ? interval.data : null,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    statusChangedAt: row.statusChangedAt,
  };
}

/**
 * This user's subscription, or `null` if they have none.
 *
 * **A missing row is a supported state, not an error**, and nothing here
 * creates one. Migration `0017` backfills every existing user and the webhook
 * writes one on first purchase, but correctness does not depend on that
 * invariant holding: `resolveEntitlement(null, now)` returns the free
 * entitlement. Making this a `getOrCreate` would put a write on the hot path of
 * every AI request to maintain a row nothing needs.
 */
export async function getSubscription(
  userId: string,
): Promise<SubscriptionRecord | null> {
  const row = await db.query.subscription.findFirst({
    where: eq(schema.subscription.userId, userId),
    columns: {
      planId: true,
      status: true,
      interval: true,
      periodStart: true,
      periodEnd: true,
      cancelAtPeriodEnd: true,
      statusChangedAt: true,
    },
  });

  return row ? toRecord(row) : null;
}

/**
 * What this user may do right now — one round trip, then pure logic.
 *
 * The interpretation lives entirely in `resolveEntitlement`; this function
 * exists only to fetch its input. Nothing else may read `status` and draw its
 * own conclusion.
 */
export async function getEntitlement(
  userId: string,
  now: Date = new Date(),
): Promise<Entitlement> {
  return resolveEntitlement(await getSubscription(userId), now);
}
