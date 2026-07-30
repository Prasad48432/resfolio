import "server-only";

import {
  AI_FEATURE_LABELS,
  FEATURE_COST_UNITS,
  type AiFeature,
} from "@resfolio/billing";
import {
  authorizeAiSpend,
  isBillingEnforced,
  recordAiSpend,
  type RecordSpendInput,
  type SpendReservation,
} from "@resfolio/billing/server";
import { createLogger } from "@resfolio/observability";

import { aiModelId } from "./provider";

/**
 * The app's seam onto the quota gate
 * (docs/architecture/14-ai-usage-and-billing.md §6, §11 step 4).
 *
 * `@resfolio/billing` decides what a plan allows and counts what was spent. This
 * file decides what the *dashboard* does about it: one refusal shape, one
 * sentence, and one place that knows a metering failure is not a user-facing
 * error. Six call sites would otherwise each invent their own answer to "what if
 * the counter write fails", and they would not all pick the same one.
 *
 * ## Fail-open while metering, fail-closed while enforcing
 *
 * This is the decision worth reading, and it is what makes the gate deployable
 * before the billing migrations are applied.
 *
 * - **`BILLING_ENFORCED=false`** — metering only. If the gate throws (the tables
 *   are not there yet; Postgres is briefly unreachable) the request **proceeds**
 *   without a reservation. Nobody is being refused, so a lost counter row is an
 *   accounting gap, and turning it into a 503 would break a working feature to
 *   protect a number nothing reads yet.
 * - **Enforced** — a gate failure **refuses**. You cannot enforce a quota you
 *   cannot read: fail-open there means an outage in Singapore is a free-usage
 *   window, which is precisely the shape of the incident nobody notices until the
 *   invoice.
 *
 * The two branches are the same code with one flag, so the switch that turns
 * enforcement on is also the switch that closes the hole — rather than a second
 * change somebody has to remember.
 */

const log = createLogger("dashboard:ai-billing");

/**
 * A reservation, or `null` for a request that was allowed through without one.
 *
 * **`null` is a real, expected value** and every caller must handle it —
 * `settleAiSpend` does the right thing with it. It means "metering did not
 * happen for this request", which today is the un-migrated database and later
 * would be a transient failure. A non-null type here would have forced a throw
 * at exactly the moment the honest answer is "carry on".
 */
export type AiReservation = SpendReservation | null;

export type AiSpendGate =
  | { ok: true; reservation: AiReservation }
  | {
      ok: false;
      /** 402 for a spent allowance, 503 when the gate itself could not answer.
       * Different causes, different copy, and the client shows both verbatim. */
      status: 402 | 503;
      message: string;
    };

/** The sentence a spent allowance produces.
 *
 * Three things in one line, because a refusal missing any of them provokes a
 * support message: **what** ran out (the shared `AI_FEATURE_LABELS`, so this and
 * the usage screen cannot call it different things), **when** it comes back, and
 * that upgrading is the other answer. No plan name — the user knows what they
 * are on, and naming it reads as a sales pitch inside an error. */
function exhaustedMessage(
  feature: AiFeature,
  allowed: number,
  resetsAt: Date,
): string {
  const label = AI_FEATURE_LABELS[feature].toLowerCase();
  const when = resetsAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
  });
  return `You've used all ${allowed} of your ${label} for this period. They reset on ${when} — or upgrade for more.`;
}

/**
 * Reserve one unit of `feature`, or refuse.
 *
 * Called **after** the cheap guards (session, kill switch, configured, rate
 * limit) and **before** the model, which keeps it in the same cheapest-first
 * ladder every AI route already documents. It is the last rung, because it is the
 * only one that costs a database round trip.
 */
export async function authorizeAiFeature(
  userId: string,
  feature: AiFeature,
): Promise<AiSpendGate> {
  try {
    const verdict = await authorizeAiSpend(userId, feature);

    if (!verdict.ok) {
      log.info(
        { userId, feature, planId: verdict.planId, used: verdict.used },
        "ai quota exhausted",
      );
      return {
        ok: false,
        status: 402,
        message: exhaustedMessage(feature, verdict.allowed, verdict.resetsAt),
      };
    }

    return { ok: true, reservation: verdict.reservation };
  } catch (error) {
    // See the header: which way this falls is decided by the enforcement flag,
    // not by the call site.
    if (isBillingEnforced()) {
      log.error({ err: error, userId, feature }, "ai quota gate failed closed");
      return {
        ok: false,
        status: 503,
        message:
          "We couldn't check your usage just now. Please try again in a moment.",
      };
    }
    log.warn({ err: error, userId, feature }, "ai metering unavailable");
    return { ok: true, reservation: null };
  }
}

/**
 * Record what a reservation cost, once the model has finished.
 *
 * **A failure here never fails the user's request**, and it is worth being
 * explicit about why: by this point the generation has already happened and the
 * user is already reading it. Losing the ledger row is an accounting problem;
 * turning it into an error would throw away an answer that has been paid for
 * either way. The domain's `recordAiSpend` is idempotent on the reservation id,
 * so a double-fired `onError` or a retry writes one row — which is what makes
 * calling this from both `onFinish` and `onError` safe.
 *
 * A non-`ok` outcome also refunds the credit, inside the domain. Aborts included:
 * doc 13 makes Stop a real cost control by passing `request.signal`, so charging
 * for one would turn the honest button into a penalty.
 */
export async function settleAiSpend(
  reservation: AiReservation,
  input: RecordSpendInput,
): Promise<void> {
  if (!reservation) {
    return;
  }
  try {
    await recordAiSpend(reservation, {
      ...input,
      // Both defaulted here rather than at six call sites, because both are facts
      // about the *system* rather than about the call: the model id, and the
      // feature's credit weight. `costUnits` is read by nothing today and is
      // written anyway (`FEATURE_COST_UNITS`) — a weighted credit pool cannot be
      // introduced later against a ledger that never recorded weights.
      model: input.model ?? aiModelId(),
      costUnits: input.costUnits ?? FEATURE_COST_UNITS[reservation.feature],
    });
  } catch (error) {
    log.error(
      { err: error, userId: reservation.userId, feature: reservation.feature },
      "failed to record ai spend",
    );
  }
}

/**
 * Token counts as the ledger wants them, from the AI SDK's `usage`.
 *
 * One adapter rather than six copies of the same optional-chaining, and it
 * carries the one fact that is easy to get wrong: **`reasoningTokens` is counted
 * inside `outputTokens`**, not alongside it. Storing them as siblings without
 * knowing that produces a ledger whose totals are quietly ~30% too high on
 * exactly the calls that cost the most.
 */
export function tokensFrom(usage: {
  inputTokens?: number;
  outputTokens?: number;
  outputTokenDetails?: { reasoningTokens?: number };
}): Pick<RecordSpendInput, "inputTokens" | "outputTokens" | "reasoningTokens"> {
  return {
    inputTokens: usage.inputTokens ?? null,
    outputTokens: usage.outputTokens ?? null,
    reasoningTokens: usage.outputTokenDetails?.reasoningTokens ?? null,
  };
}
