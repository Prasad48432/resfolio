import type { AiFeature } from "./features";
import type { PlanId } from "./plans";

/**
 * The allowance table
 * (docs/architecture/14-ai-usage-and-billing.md §4.3).
 *
 * `null` means unlimited. **No plan uses it today** — every plan is a real
 * number, which keeps the usage screen honest and means no account is an
 * uncapped bill. It stays in the type for a future tier.
 */
export type Allowance = number | null;

/**
 * **Every number here is an allowance _per quota period_, and the quota period
 * is not the same length on every plan** (§5.2).
 *
 * Free, monthly and yearly reset **monthly**; weekly resets after **seven
 * days**. The yearly row is therefore a *monthly* allowance that happens to be
 * paid for annually — it is not a year's worth, which is the single most
 * expensive thing to get wrong in this file. See `periodStartFor`.
 *
 * **The free row is generous and that is a known, costed decision.** At current
 * `gpt-5-mini` pricing one fully-consumed free account runs roughly $0.20–0.30
 * a month, so ten thousand free users who all max out is ~$2,500/month. The
 * ceiling is bounded and known, which is the point of metering before
 * enforcing: `jobMatch: 10` buys ten complete "paste a posting → see the score
 * → optimise → watch it move" cycles, which is the product's actual aha and
 * what converts. Step 3 of §11 replaces these with measured numbers before the
 * enforcement switch is thrown.
 */
export const PLAN_LIMITS: Record<PlanId, Record<AiFeature, Allowance>> = {
  // per calendar month
  free: {
    chat: 20,
    jobMatch: 10,
    profileEnhance: 10,
    resumeTailor: 2,
    coverLetter: 5,
  },
  // per 7-day pass
  weekly: {
    chat: 150,
    jobMatch: 25,
    profileEnhance: 25,
    resumeTailor: 20,
    coverLetter: 15,
  },
  // per month
  monthly: {
    chat: 400,
    jobMatch: 60,
    profileEnhance: 60,
    resumeTailor: 50,
    coverLetter: 40,
  },
  // per month
  yearly: {
    chat: 800,
    jobMatch: 120,
    profileEnhance: 120,
    resumeTailor: 100,
    coverLetter: 80,
  },
};

/**
 * When to start warning (§6.6). A limit discovered by being refused is a
 * pricing lesson delivered at the worst possible moment, so the usage screen
 * and the inline counters surface pressure before it becomes a refusal.
 *
 * A constant rather than a literal at two call sites, because the warning and
 * the refusal disagreeing is a bug nobody reports — it just quietly stops
 * meaning anything.
 */
export const NEAR_LIMIT_RATIO = 0.8;

/**
 * How long a paid entitlement survives a failed renewal (§8.5).
 *
 * Card failures are overwhelmingly banks rather than intent, and cutting off a
 * paying user mid-application is a support ticket and a churn event over a
 * retry that would have succeeded. **More forgiving than it looks in India**,
 * deliberately: recurring UPI and RuPay mandate failures are common and
 * frequently transient — a mandate paused by the issuing bank, a device
 * re-registration — rather than a signal of anything.
 *
 * A constant so the banner copy and the enforcement read the same number.
 */
export const GRACE_WINDOW_MS = 72 * 60 * 60 * 1000;

/** How long a week pass lasts. */
export const PASS_DURATION_DAYS = 7;

/** Whether `used` has reached `allowed`. `null` (unlimited) never has. */
export function isExhausted(used: number, allowed: Allowance): boolean {
  return allowed !== null && used >= allowed;
}

/** Whether `used` has crossed {@link NEAR_LIMIT_RATIO} without exhausting. */
export function isNearLimit(used: number, allowed: Allowance): boolean {
  if (allowed === null || allowed === 0) {
    return false;
  }
  return !isExhausted(used, allowed) && used / allowed >= NEAR_LIMIT_RATIO;
}
