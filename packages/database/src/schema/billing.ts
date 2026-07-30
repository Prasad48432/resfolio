import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * Plans, quota and payments (docs/architecture/14-ai-usage-and-billing.md §5).
 *
 * **These tables hang off `user`, not `profile`, and that is a deliberate
 * departure from the rest of the schema.** Every content table here is
 * profile-owned — `job_match_sessions`, `documents`, `sites`, `blog_posts` all
 * cascade from `profile_id`. Billing is not content: a subscription is a fact
 * about an **account**, it survives a profile being rebuilt, and it is resolved
 * on requests that have a session but may not have touched a profile yet.
 * `profiles.user_id` is unique, so the two are 1:1 and either would work
 * mechanically — this picks the one that is semantically true.
 *
 * **`plan_id`, `status`, `feature` and `product` are `text`, not pg enums.**
 * Every one of those sets will grow (a trial status, a fifth AI feature, a new
 * premium product), and adding a value to a pg enum is a migration that takes a
 * lock where adding one to a validated string is a deploy. `@resfolio/billing`
 * owns the vocabulary and validates on write.
 */

/**
 * One row per user, **present even for free users**.
 *
 * The alternative is a `LEFT JOIN` plus a null check on the hottest read in the
 * system, and a null that means "free" is a null somebody eventually forgets to
 * handle.
 */
export const subscription = pgTable(
  "subscriptions",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),

    /** `free | weekly | monthly | yearly` — validated by `planIdSchema`.
     * **Carries the entitlement**: `PLAN_LIMITS[planId]` is the whole rule. */
    planId: text("plan_id").notNull().default("free"),

    /** Dodo's own vocabulary: `active | on_hold | cancelled | expired |
     * failed`. Not translated into Stripe's — see `@resfolio/billing`. */
    status: text("status").notNull().default("active"),

    /** `week | month | year`; null on free. A `week` is a **pass**, not a
     * recurring interval — nothing renews it. Display and renewal only; it is
     * never an input to the allowance lookup. */
    interval: text("interval"),

    /**
     * When the current paid term began — **the quota period's anchor**.
     *
     * Anchoring the allowance on this rather than the calendar is what makes an
     * upgrade grant exactly one period: otherwise a user who upgrades on the
     * 20th gets a full month's allowance for the ten days left in the calendar
     * month and a second one on the 1st.
     */
    periodStart: timestamp("period_start", { withTimezone: true }),

    /**
     * When it ends. **From the provider** (`next_billing_date`) for a recurring
     * plan — proration, a retry after a failed charge and a support credit all
     * move this boundary, and a locally computed `start + 1 month` is wrong
     * from the first edge case onward.
     *
     * The **week pass is the one exception**, and only because none of those
     * forces apply to it: a one-time payment has no provider-side period, so
     * `period_start + 7 days` is computed once at purchase and is then a fact.
     */
    periodEnd: timestamp("period_end", { withTimezone: true }),

    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),

    /**
     * When `status` last changed. **A column of its own, not `updated_at`.**
     *
     * The post-failure grace window (§8.5) is measured from the moment a
     * subscription went `on_hold`, and `updated_at` moves for any write at all
     * — so a row touched for an unrelated reason would silently restart the
     * window and extend paid access for free, indefinitely, with nothing to
     * observe.
     */
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),

    /** `'dodo'`. Null while the user has never paid. */
    provider: text("provider"),

    /** Null for a week pass — a one-time payment has nothing to renew, so
     * there is no subscription object on the provider's side. */
    providerSubscriptionId: text("provider_subscription_id").unique(),

    /** The webhook's primary way home: `customer.customer_id` resolves here,
     * and `metadata.userId` is trusted **only** to create this link on a first
     * purchase (§8.3 rule 5). */
    providerCustomerId: text("provider_customer_id"),

    /** What they were charged in. Pricing is per-currency; **entitlement is
     * not** — `PLAN_LIMITS` has no currency dimension, so "which plan am I on"
     * never has a geographic answer. */
    currency: text("currency"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    // The webhook's lookup when it has a customer but not our user id.
    index("subscriptions_provider_customer_idx").on(table.providerCustomerId),
  ],
);

/**
 * The decision row: one per (user, feature, quota period).
 *
 * **This is what a request reads — one indexed row, one round trip.** Counting
 * `ai_usage_events` on every request would be correct and would get slower
 * every month.
 *
 * **Rollover is implicit.** A new period is a new `period_start`, which is a
 * new primary key, so the first spend of a period inserts a row at `used = 1`.
 * There is no reset job, nothing to schedule, and no window in which a cron has
 * not run yet. Old rows prune on a retention schedule and their absence means
 * "zero used", which is correct.
 *
 * The primary key is the whole design: §6.3's authorise-and-increment is one
 * `INSERT … ON CONFLICT … DO UPDATE … WHERE used < allowance` against it, so
 * the check and the increment cannot race.
 */
export const aiUsageCounter = pgTable(
  "ai_usage_counters",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    feature: text("feature").notNull(),
    /** Not the billing period — `min(interval, 1 month)` anchored on the
     * subscription date (§5.2). A yearly subscriber resets monthly. */
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    used: integer("used").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.feature, table.periodStart],
    }),
  ],
);

/**
 * The truth: append-only, never updated.
 *
 * This is the table doc 13 promised when it said usage was "logged, not
 * tabled". It is the audit trail, the meter and the analytics source — and it
 * is the answer to "what did this user actually cost us", which is the question
 * that decides whether the prices are the right ones.
 */
export const aiUsageEvent = pgTable(
  "ai_usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    feature: text("feature").notNull(),

    /** Denormalised so a reconcile against the counter is one scan. */
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),

    /**
     * What `authorizeAiSpend` handed out, and what `recordAiSpend` is
     * idempotent on. Unique, so a retried webhook or a double-fired `onError`
     * cannot record one spend twice — or, worse, mint a refund grant twice.
     */
    reservationId: uuid("reservation_id").notNull().unique(),

    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),

    /**
     * **Its own column**, for the reason doc 13 learned the hard way: reasoning
     * is billed and invisible, and a cost model that folds it into output
     * tokens misprices the reasoning-heavy features by a factor that is not
     * small.
     */
    reasoningTokens: integer("reasoning_tokens"),

    /** Integer arithmetic, never a float. Populated from the **AI Gateway's
     * reported cost** rather than a price table in our code — model prices
     * change without notice, and a stale table does not fail, it silently
     * misprices every row written after the change. */
    costMicros: bigint("cost_micros", { mode: "number" }),

    /**
     * The feature's credit weight, written **from day one and read by nothing
     * yet**.
     *
     * Per-feature counters do not scale past six or so features; the escape is
     * weighted credits (one pool, features costing different amounts). Writing
     * this now makes that migration a change to `authorizeAiSpend` and the
     * catalogue, with a full history already in the right shape. Backfilling it
     * later across a year of events, against models whose weights have since
     * changed, is not really possible.
     */
    costUnits: integer("cost_units"),

    /** `ok | error | aborted`. The last two return the credit as a grant
     * (§6.4) — a decrement is a second mutation racing the first. */
    outcome: text("outcome").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // The ledger read and the per-user spend alert.
    index("ai_usage_events_user_created_idx").on(
      table.userId,
      table.createdAt.desc(),
    ),
    // The nightly reconcile of a counter against the log.
    index("ai_usage_events_period_idx").on(table.userId, table.periodStart),
  ],
);

/**
 * Credits outside the plan allowance (§4.4).
 *
 * One extra concept, and only one: support ("your generation failed, here are
 * three back"), promotions, and a future top-up purchase, none of which becomes
 * a special case in the gate. The rule is **spend the plan allowance first,
 * then grants, oldest expiry first**.
 *
 * **A failed generation is refunded as a grant rather than as a decrement**,
 * and that is the point of the table. A decrement is a second mutation racing
 * the first and it can run twice; an insert keyed on the reservation cannot.
 * The ledger then shows what actually happened — a spend and a refund — rather
 * than an event that never occurred.
 */
export const aiUsageGrant = pgTable(
  "ai_usage_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    /** Null means **any** feature — a general top-up. */
    feature: text("feature"),

    amount: integer("amount").notNull(),
    used: integer("used").notNull().default(0),

    /** Null never expires. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),

    /** `generation_failed | generation_aborted | support | promotion | topup`.
     * Text for the same reason every other vocabulary here is. */
    reason: text("reason").notNull(),

    /**
     * The spend this grant refunds, when it refunds one. **Unique**, so the
     * refund path cannot be used to mint credits: a reservation transitions to
     * `error`/`aborted` exactly once, and a second attempt violates this.
     */
    reservationId: uuid("reservation_id").unique(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // "Spend grants, oldest expiry first" — the gate's second lookup.
    index("ai_usage_grants_user_expiry_idx").on(table.userId, table.expiresAt),
  ],
);

/**
 * Non-consumable, non-expiring purchases: premium templates (§4.5).
 *
 * **A separate table from `subscriptions`, deliberately.** A subscription has a
 * period, a status machine, dunning and a renewal; a permanent unlock has none
 * of those and would be four permanently-null columns pretending otherwise.
 * Keeping them apart is also what stops a subscription cancellation from ever
 * being able to touch a template unlock — different rows, different events.
 *
 * **Entitlement is checked on write, never on render.** `apps/sites` has no
 * sessions by design, so the dashboard checks when a template is *selected* and
 * again when a site is *published*, and the render host renders whatever
 * `template_id` says. A billing lookup on the public render path would put a
 * query on every ISR miss and make a refund capable of taking down a live site.
 */
export const productEntitlement = pgTable(
  "product_entitlements",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    /** `premium_resume_templates | premium_portfolio_templates`. Two products,
     * because the two have different buyers on different timelines. */
    product: text("product").notNull(),

    /**
     * `active | revoked`. **A status rather than a delete**, so a refund is
     * auditable and a re-purchase is an update rather than a resurrection.
     *
     * `revoked` blocks new selections and publishes and deliberately has **no
     * effect on any site already published** — the fraud exposure is one
     * template on one site, and the alternative is a mechanism whose whole
     * purpose is breaking public URLs.
     */
    status: text("status").notNull().default("active"),

    /**
     * `purchase | plan | comp`.
     *
     * A `plan` grant is created when a yearly subscription activates, and when
     * that subscription lapses the row is **left alone rather than revoked**,
     * for the same reason. That is a deliberate giveaway — buy one year, keep
     * the template — accepted because the defence against it breaks live sites.
     * Recording the source is what makes the giveaway measurable rather than
     * invisible, and therefore revisitable with data instead of instinct.
     */
    source: text("source").notNull(),

    grantedAt: timestamp("granted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),

    provider: text("provider"),
    /** Idempotency for the one-time `payment.succeeded` webhook. */
    providerPaymentId: text("provider_payment_id").unique(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.product] })],
);

/**
 * Processed webhook deliveries, for idempotency (§8.3 rule 3).
 *
 * Dodo retries, and a second `subscription.active` must not grant a second
 * period. The `webhook-id` header is the key; a duplicate is a 200 and no work.
 *
 * **The payload is deliberately not stored.** It carries customer name, email
 * and payment details, and this table exists to answer one boolean — "have we
 * seen this delivery?" Keeping the body would turn an idempotency ledger into a
 * second, unmanaged copy of customer data with its own retention question.
 * Diagnostics go to the logger, which is already redacted.
 */
export const billingWebhookEvent = pgTable("billing_webhook_events", {
  /** The provider's `webhook-id`. */
  providerEventId: text("provider_event_id").primaryKey(),
  provider: text("provider").notNull(),
  /** `subscription.active`, `payment.succeeded`, … Kept for support triage. */
  type: text("type").notNull(),
  /** The event's own timestamp, which is what **ordering** compares against a
   * row's `updated_at` — otherwise a delayed `active` overwrites a `cancelled`
   * that arrived first and a cancelled user has a live plan. */
  eventAt: timestamp("event_at", { withTimezone: true }).notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const subscriptionRelations = relations(subscription, ({ one }) => ({
  user: one(user, {
    fields: [subscription.userId],
    references: [user.id],
  }),
}));

export const productEntitlementRelations = relations(
  productEntitlement,
  ({ one }) => ({
    user: one(user, {
      fields: [productEntitlement.userId],
      references: [user.id],
    }),
  }),
);
