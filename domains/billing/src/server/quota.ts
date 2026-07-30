import { and, eq, lt, sql } from "drizzle-orm";

import { db, schema } from "@resfolio/database";

import type { Entitlement } from "../entitlement";
import type { AiFeature } from "../features";
import type { Allowance } from "../limits";
import { resolveQuotaPeriod } from "../period";
import type { PlanId } from "../plans";
import { isBillingEnforced } from "./env";
import { getEntitlement } from "./subscription";

/**
 * The spend gate (docs/architecture/14-ai-usage-and-billing.md §6).
 *
 * **`authorizeAiSpend` before, `recordAiSpend` after, and they are two
 * functions on purpose.** Authorisation has to be cheap and synchronous with
 * the decision; metering has to carry token counts that do not exist until the
 * model has finished. A single `consume` call would have to either guess the
 * cost or block the response until the stream ended.
 *
 * The reservation is what joins them, and it carries the resolved period — so a
 * generation that straddles a period boundary is recorded against the period it
 * was *authorised* in. Otherwise a request started at 23:59:58 on the last day
 * of a period is a free request.
 */

export class BillingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingError";
  }
}

/** What `authorizeAiSpend` hands to `recordAiSpend`. */
export interface SpendReservation {
  id: string;
  userId: string;
  feature: AiFeature;
  /** The period the spend was authorised in — not the one it finishes in. */
  periodStart: Date;
  planId: PlanId;
}

export type SpendVerdict =
  | {
      ok: true;
      reservation: SpendReservation;
      /** After the increment, so `used`/`allowed` is what the UI should show. */
      used: number;
      allowed: Allowance;
    }
  | {
      ok: false;
      reason: "quota_exhausted";
      planId: PlanId;
      feature: AiFeature;
      used: number;
      allowed: number;
      /** When the allowance resets — the 402's "or wait until…". */
      resetsAt: Date;
    };

/**
 * Reserve one unit of `feature` for `userId`.
 *
 * **The counter increments here, not in `recordAiSpend`, and this is the
 * decision most worth understanding.** The alternative — increment after
 * success — means N concurrent requests all read `used = 4` against a limit of
 * 5 and all proceed. Every quota system that gets this wrong gets it wrong
 * here, and the exploit is a `for` loop.
 *
 * So the check and the increment are **one statement**:
 *
 * ```sql
 * INSERT INTO ai_usage_counters (user_id, feature, period_start, used)
 * VALUES ($1, $2, $3, 1)
 * ON CONFLICT (user_id, feature, period_start)
 * DO UPDATE SET used = ai_usage_counters.used + 1
 *   WHERE ai_usage_counters.used < $4
 * RETURNING used;
 * ```
 *
 * No row returned means the allowance is spent. There is no window between the
 * check and the increment, and no advisory lock to forget.
 *
 * The cost is that a failed generation has consumed a credit, which
 * {@link refundSpend} answers — as an insert, not a decrement.
 *
 * **Two round trips, deliberately, and not one.** Doc 15 §2.6 originally called
 * for a single CTE resolving the plan and applying the increment together, to
 * save a Mumbai→Singapore hop. Implementing it showed the wrong trade: the
 * period boundary needs the anchoring and month-clamping rules in `period.ts`,
 * so a single statement means **re-implementing the most safety-critical pure
 * function in the package in SQL**, where it would have to agree forever with
 * the TypeScript copy the usage screen reads. Two versions of that rule
 * disagreeing is a screen that promises a reset date the gate does not honour.
 * One trip is saved regardless — the naive shape is three (read plan, read
 * counter, write counter) and this is two.
 */
export async function authorizeAiSpend(
  userId: string,
  feature: AiFeature,
  now: Date = new Date(),
): Promise<SpendVerdict> {
  const entitlement = await getEntitlement(userId, now);
  return authorizeWithEntitlement(userId, feature, entitlement, now);
}

/**
 * The same gate, for a caller that has already resolved the entitlement.
 *
 * Exported so a request needing both the verdict and the entitlement (to render
 * an upgrade prompt naming the plan, say) does not pay the subscription read
 * twice.
 */
export async function authorizeWithEntitlement(
  userId: string,
  feature: AiFeature,
  entitlement: Entitlement,
  now: Date = new Date(),
): Promise<SpendVerdict> {
  const period = resolveQuotaPeriod({
    planId: entitlement.planId,
    anchor: entitlement.anchor,
    now,
  });

  const allowed = entitlement.limits[feature];
  const enforced = isBillingEnforced();

  // A zero allowance can never be satisfied, and the SQL below would *grant*
  // it: with no existing row the INSERT succeeds at `used = 1` and the
  // `DO UPDATE ... WHERE` guard is never consulted. Refused here, before the
  // database, rather than papered over in the statement.
  if (enforced && allowed === 0) {
    return {
      ok: false,
      reason: "quota_exhausted",
      planId: entitlement.planId,
      feature,
      used: 0,
      allowed: 0,
      resetsAt: period.end,
    };
  }

  // Unlimited plans and unenforced environments still increment — an unlimited
  // plan should know what it used, and "meter but do not refuse" is the whole
  // of §11 steps 3–4. Only the guard is dropped.
  const guarded = enforced && allowed !== null;

  const [row] = await db
    .insert(schema.aiUsageCounter)
    .values({
      userId,
      feature,
      periodStart: period.start,
      used: 1,
    })
    .onConflictDoUpdate({
      target: [
        schema.aiUsageCounter.userId,
        schema.aiUsageCounter.feature,
        schema.aiUsageCounter.periodStart,
      ],
      // `setWhere` is the `WHERE` on `DO UPDATE`, applied to the **existing**
      // row — not `targetWhere`, which describes a partial index. The two read
      // alike and the deprecated plain `where` is why.
      setWhere: guarded
        ? lt(schema.aiUsageCounter.used, allowed as number)
        : undefined,
      set: {
        used: sql`${schema.aiUsageCounter.used} + 1`,
        updatedAt: now,
      },
    })
    .returning({ used: schema.aiUsageCounter.used });

  // No row means `DO UPDATE` was skipped by the guard: the allowance is spent.
  if (!row) {
    return {
      ok: false,
      reason: "quota_exhausted",
      planId: entitlement.planId,
      feature,
      // Reporting the allowance rather than re-reading the counter: they are
      // equal at this point by construction, and a second query to say so is a
      // round trip spent confirming arithmetic.
      used: allowed as number,
      allowed: allowed as number,
      resetsAt: period.end,
    };
  }

  return {
    ok: true,
    reservation: {
      id: crypto.randomUUID(),
      userId,
      feature,
      periodStart: period.start,
      planId: entitlement.planId,
    },
    used: row.used,
    allowed,
  };
}

export interface RecordSpendInput {
  outcome: "ok" | "error" | "aborted";
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  reasoningTokens?: number | null;
  /** From the AI Gateway's reported cost, never a local price table — model
   * prices change without notice and a stale table does not fail, it silently
   * misprices every row written after the change. */
  costMicros?: number | null;
  /** The feature's credit weight. Written from day one and read by nothing
   * yet; backfilling it later is not really possible. */
  costUnits?: number | null;
}

/**
 * Record what a reservation actually cost, once the model has finished.
 *
 * **Idempotent on the reservation id** — `ai_usage_events.reservation_id` is
 * unique, so a retried call or a double-fired `onError` writes one row. That
 * matters more than it looks: without it, the refund path below could mint
 * credits.
 *
 * A failure here must never fail the user's request. The generation succeeded;
 * losing a ledger row is an accounting problem, and turning it into a 500 would
 * throw away the answer the user already paid for. Callers should log and
 * continue.
 */
export async function recordAiSpend(
  reservation: SpendReservation,
  input: RecordSpendInput,
): Promise<void> {
  await db
    .insert(schema.aiUsageEvent)
    .values({
      userId: reservation.userId,
      feature: reservation.feature,
      periodStart: reservation.periodStart,
      reservationId: reservation.id,
      model: input.model ?? null,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      reasoningTokens: input.reasoningTokens ?? null,
      costMicros: input.costMicros ?? null,
      costUnits: input.costUnits ?? null,
      outcome: input.outcome,
    })
    // A retry is not a second spend.
    .onConflictDoNothing({ target: schema.aiUsageEvent.reservationId });

  if (input.outcome !== "ok") {
    await refundSpend(reservation, input.outcome);
  }
}

/**
 * Return a credit for a generation that failed or was stopped.
 *
 * **A grant, not a decrement**, and the difference is the whole point. A
 * decrement is a second mutation racing the first and it can run twice; an
 * insert keyed on the reservation cannot. The ledger then shows what actually
 * happened — a spend and a refund — rather than an event that never occurred.
 *
 * **Aborts are refunded too.** Doc 13 makes Stop a real cost control by passing
 * `request.signal` as `abortSignal`, so a user who stops a generation has
 * genuinely saved money. Charging them for it turns the honest button into a
 * penalty and teaches people to let runaway generations finish.
 */
export async function refundSpend(
  reservation: SpendReservation,
  outcome: "error" | "aborted",
): Promise<void> {
  await db
    .insert(schema.aiUsageGrant)
    .values({
      userId: reservation.userId,
      feature: reservation.feature,
      amount: 1,
      reason:
        outcome === "aborted" ? "generation_aborted" : "generation_failed",
      reservationId: reservation.id,
    })
    // The unique constraint on `reservation_id` is what stops this being a
    // credit mint: one reservation, one refund, however many times this runs.
    .onConflictDoNothing({ target: schema.aiUsageGrant.reservationId });
}

/**
 * Counters for every feature in one period — **one query for five features**,
 * not five (doc 15 §2.6).
 */
export async function readCounters(
  userId: string,
  periodStart: Date,
): Promise<Partial<Record<AiFeature, number>>> {
  const rows = await db
    .select({
      feature: schema.aiUsageCounter.feature,
      used: schema.aiUsageCounter.used,
    })
    .from(schema.aiUsageCounter)
    .where(
      and(
        eq(schema.aiUsageCounter.userId, userId),
        eq(schema.aiUsageCounter.periodStart, periodStart),
      ),
    );

  const counters: Partial<Record<AiFeature, number>> = {};
  for (const row of rows) {
    // The column is `text` so the vocabulary can grow; a feature this deploy
    // does not know about is ignored rather than crashing the usage screen.
    counters[row.feature as AiFeature] = row.used;
  }
  return counters;
}
