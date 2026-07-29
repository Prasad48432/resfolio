import { AI_FEATURE_LABELS, AI_FEATURES, type AiFeature } from "./features";
import type { Entitlement } from "./entitlement";
import { type Allowance, isExhausted, isNearLimit } from "./limits";
import type { QuotaPeriod } from "./period";

/**
 * The shape behind Settings → AI Usage
 * (docs/architecture/14-ai-usage-and-billing.md §13).
 *
 * Pure: the server reads counters and an entitlement, and this turns them into
 * what the screen renders. The **same** summary feeds the inline counters
 * beside each AI action and the 402 refusal copy, so all three read from one
 * function and cannot disagree about a number the user is looking at in two
 * places.
 */

export interface FeatureUsage {
  feature: AiFeature;
  /** Product copy, from one place (§4.2). */
  label: string;
  used: number;
  allowed: Allowance;
  /** `null` allowance renders as unlimited rather than as a bar. */
  fraction: number | null;
  exhausted: boolean;
  /** Past {@link NEAR_LIMIT_RATIO} but not spent — the warning band. */
  nearLimit: boolean;
}

export interface UsageSummary {
  planId: Entitlement["planId"];
  features: FeatureUsage[];
  /** When the allowance resets. **The quota period's end, which on a yearly
   * plan is _not_ the renewal date** — those two differing is exactly the
   * confusion the screen exists to prevent, so it is named precisely here. */
  resetsAt: Date;
  /** Any feature spent. Drives the Upgrade button's appearance. */
  anyExhausted: boolean;
  anyNearLimit: boolean;
  /** Whether there is anywhere to upgrade *to* — false on `yearly`, because
   * offering an upgrade to the top tier is how a paying customer discovers you
   * are not tracking what they bought. */
  canUpgrade: boolean;
}

export interface UsageSummaryInput {
  entitlement: Entitlement;
  period: QuotaPeriod;
  /** Counters for the current period. A missing feature means zero — the
   * absence of a counter row *is* "nothing used yet" (§5.2). */
  used: Partial<Record<AiFeature, number>>;
}

/**
 * Build the screen's model.
 *
 * **Every feature is listed, including those at zero.** The list is also how a
 * user learns the product has a tailoring feature at all; a screen rendering
 * only what has been used hides features from exactly the people most likely to
 * try them.
 */
export function summariseUsage({
  entitlement,
  period,
  used,
}: UsageSummaryInput): UsageSummary {
  const features = AI_FEATURES.map<FeatureUsage>((feature) => {
    const spent = used[feature] ?? 0;
    const allowed = entitlement.limits[feature];

    return {
      feature,
      label: AI_FEATURE_LABELS[feature],
      used: spent,
      allowed,
      // Clamped, because §8.4's downgrade case legitimately produces used >
      // allowed and a bar past 100% renders as an overflow bug.
      fraction:
        allowed === null || allowed === 0 ? null : Math.min(1, spent / allowed),
      exhausted: isExhausted(spent, allowed),
      nearLimit: isNearLimit(spent, allowed),
    };
  });

  return {
    planId: entitlement.planId,
    features,
    resetsAt: period.end,
    anyExhausted: features.some((f) => f.exhausted),
    anyNearLimit: features.some((f) => f.nearLimit),
    canUpgrade: entitlement.planId !== "yearly",
  };
}

/**
 * Whole days until the reset, for "Resets in 9 days".
 *
 * Rounded **up**, so a period ending in six hours reads "1 day" rather than
 * "0 days" — a counter that says zero days while still refusing is a counter
 * nobody believes. The screen shows the date alongside it regardless.
 */
export function daysUntilReset(resetsAt: Date, now: Date): number {
  const ms = resetsAt.getTime() - now.getTime();
  if (ms <= 0) {
    return 0;
  }
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}
