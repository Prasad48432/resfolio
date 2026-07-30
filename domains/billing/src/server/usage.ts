import { resolveQuotaPeriod } from "../period";
import { summariseUsage, type UsageSummary } from "../usage";
import { readCounters } from "./quota";
import { getEntitlement } from "./subscription";

/**
 * The Settings → AI Usage screen's single server call
 * (docs/architecture/14-ai-usage-and-billing.md §13).
 *
 * **Two round trips, and it must not become six.** Postgres is in Singapore
 * and compute is in Mumbai (doc 15 §2.6), so a five-feature screen written as
 * a query per feature would cost 250–300ms before rendering anything. The
 * subscription read and one counter read are the whole budget.
 *
 * Everything after that is the pure `summariseUsage`, so the screen, the inline
 * counters beside each AI action and the 402 refusal copy all read from one
 * function and cannot disagree about a number the user is looking at in two
 * places.
 */
export async function getUsageSummary(
  userId: string,
  now: Date = new Date(),
): Promise<UsageSummary> {
  const entitlement = await getEntitlement(userId, now);

  const period = resolveQuotaPeriod({
    planId: entitlement.planId,
    anchor: entitlement.anchor,
    now,
  });

  const used = await readCounters(userId, period.start);

  return summariseUsage({ entitlement, period, used });
}
