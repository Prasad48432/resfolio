import type { PlanId } from "./plans";

/**
 * The quota period
 * (docs/architecture/14-ai-usage-and-billing.md §5.2).
 *
 * **The quota period is not the billing period, and the obvious version of this
 * rule is wrong in a way that costs money.**
 *
 * The obvious version — "the quota period is `subscriptions.period_start`" —
 * works for weekly and monthly and fails badly for yearly: a subscriber whose
 * billing period is a year would get twelve months of allowance available on
 * day one, and could spend all of it in the first week.
 *
 * The rule is:
 *
 * ```
 * quotaPeriodLength = min(billing interval, 1 month)
 * anchor            = the subscription's start date, not the calendar
 * ```
 *
 * - **weekly** → resets every 7 days from the pass start
 * - **monthly** → resets monthly, on the subscription's own day of month
 * - **yearly** → also resets **monthly**; the interval sets price and renewal
 *   cadence, never the allowance period
 * - **free** → the calendar month, since there is no subscription date to
 *   anchor to
 *
 * **Anchored on the subscription date rather than the calendar**, because
 * otherwise a user who upgrades on the 20th gets a full month's allowance for
 * the ten days left in the calendar month and a second full allowance on the
 * 1st. The anchor is what makes an upgrade grant exactly one period.
 *
 * Everything here is UTC. A period boundary that moves with a timezone is a
 * boundary that occasionally happens twice or not at all.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Days in a given UTC month. Day 0 of the *next* month is the last day of
 * this one. */
function daysInUtcMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * `anchor` plus `months`, keeping the anchor's day-of-month and time-of-day,
 * **clamped to the last day of shorter months**.
 *
 * The clamp is what stops a subscription started on the 31st from having no
 * period boundary in February — which would mean an allowance that never
 * resets. It is deliberately computed from the **original anchor** every time
 * rather than by stepping month to month, so the clamp is not sticky: an
 * anchor of Jan 31 yields Feb 28 and then Mar 31, not Feb 28 and then Mar 28.
 */
export function addUtcMonthsClamped(anchor: Date, months: number): Date {
  const absoluteMonth = anchor.getUTCMonth() + months;
  const year = anchor.getUTCFullYear() + Math.floor(absoluteMonth / 12);
  const monthIndex = ((absoluteMonth % 12) + 12) % 12;

  const day = Math.min(anchor.getUTCDate(), daysInUtcMonth(year, monthIndex));

  return new Date(
    Date.UTC(
      year,
      monthIndex,
      day,
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds(),
    ),
  );
}

/** Midnight UTC on the first of `now`'s month. */
export function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export interface QuotaPeriod {
  /** The counter's primary-key component. */
  start: Date;
  /** When the allowance resets — shown on the usage screen. */
  end: Date;
}

export interface QuotaPeriodInput {
  planId: PlanId;
  /**
   * `subscriptions.period_start`: when the current paid term began. `null` for
   * a free user, who has no subscription date and therefore uses the calendar.
   */
  anchor: Date | null;
  now: Date;
}

/**
 * The quota period containing `now`.
 *
 * Rollover is **implicit**: a new period is a new `start`, which is a new
 * primary key, so the first spend of a period inserts a row at `used = 1`.
 * There is no reset job, nothing to schedule, and no window in which a cron has
 * not run yet.
 */
export function resolveQuotaPeriod({
  planId,
  anchor,
  now,
}: QuotaPeriodInput): QuotaPeriod {
  // No subscription date to anchor to — the calendar month is the period.
  if (planId === "free" || anchor === null) {
    const start = startOfUtcMonth(now);
    return {
      start,
      end: new Date(
        Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1),
      ),
    };
  }

  // A `now` before the anchor means a future-dated row or a clock problem, not
  // a period. Treat the anchor as the start rather than counting backwards
  // forever into negative periods.
  if (now.getTime() < anchor.getTime()) {
    return periodFrom(planId, anchor, 0);
  }

  if (planId === "weekly") {
    const elapsed = now.getTime() - anchor.getTime();
    return periodFrom(planId, anchor, Math.floor(elapsed / WEEK_MS));
  }

  // monthly and yearly both accrue monthly.
  let steps =
    (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - anchor.getUTCMonth());

  // The calendar-month difference overshoots when `now` is earlier in the month
  // than the anchor's day — e.g. anchor on the 20th, now the 3rd.
  if (addUtcMonthsClamped(anchor, steps).getTime() > now.getTime()) {
    steps -= 1;
  }

  return periodFrom(planId, anchor, steps);
}

function periodFrom(planId: PlanId, anchor: Date, steps: number): QuotaPeriod {
  if (planId === "weekly") {
    const start = new Date(anchor.getTime() + steps * WEEK_MS);
    return { start, end: new Date(start.getTime() + WEEK_MS) };
  }
  return {
    start: addUtcMonthsClamped(anchor, steps),
    end: addUtcMonthsClamped(anchor, steps + 1),
  };
}

/** The counter key for the period containing `now`. */
export function periodStartFor(input: QuotaPeriodInput): Date {
  return resolveQuotaPeriod(input).start;
}
