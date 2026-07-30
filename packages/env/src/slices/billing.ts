import { z } from "zod";

/**
 * Dodo Payments and the quota enforcement switch
 * (docs/architecture/14-ai-usage-and-billing.md §9.4).
 *
 * The three Dodo variables use **the SDK's own names**, so there is no second
 * vocabulary to keep straight between this file, the dashboard and the
 * provider's documentation.
 *
 * All optional: absent, checkout is unavailable and the dashboard hides the
 * affordance, exactly like the R2 slice. **Optional configuration must never
 * mean optional verification** — the webhook route refuses with 503 when the
 * secret is missing rather than skipping the signature check, because a route
 * that no-ops its verification when unconfigured is an unauthenticated write
 * endpoint one misapplied variable away.
 */
export const billing = {
  server: {
    DODO_PAYMENTS_API_KEY: z.string().min(1).optional(),
    DODO_PAYMENTS_WEBHOOK_SECRET: z.string().min(1).optional(),
    DODO_PAYMENTS_ENVIRONMENT: z.enum(["live_mode", "test_mode"]).optional(),

    /**
     * The quota kill switch — the same shape as `AI_ENABLED` and
     * `PDF_EXPORT_ENABLED`.
     *
     * **`"false"` meters without refusing**: counters still increment, the
     * ledger still records, the usage screen still shows real numbers, and
     * nothing is ever denied. That is what makes §11 steps 3 and 4 deployable
     * — real cost data is what should set the limits, rather than the limits
     * being a guess that then sets the cost.
     *
     * It is also the rollback. A limits table that turns out to be wrong
     * becomes a config change instead of a revert, at the one moment when
     * being wrong is most visible to paying users.
     *
     * Unset means **enforced**, so adding the variable is what changes
     * behaviour rather than forgetting it.
     */
    BILLING_ENFORCED: z.enum(["true", "false"]).optional(),
  },
} as const;
