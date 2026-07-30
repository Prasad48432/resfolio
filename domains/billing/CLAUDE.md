# @resfolio/billing

Plan entitlements, AI quota rules and the price catalogue —
`docs/architecture/14-ai-usage-and-billing.md`. **Status: pure root + `./server`,
wired (§11 steps 1–4).** The gate runs behind every model call and
`/settings/ai-usage` renders it, with **`BILLING_ENFORCED=false`** so nothing is
refused while the limits table is measured. The Dodo integration (checkout,
webhooks — steps 6–7) is not built.

**The app calls this through one file, never directly**:
`apps/dashboard/lib/ai/billing.ts`. That is where the refusal copy, the
fail-open/fail-closed rule and the token adapter live — six call sites reaching
into `./server` themselves would each invent their own answer to "what if the
counter write fails".

## What belongs here

**The pure root has no database, no network, no payment SDK, and
no clock** — every function takes `now` as an argument. That last one is not
style: `resolveEntitlement` is the function that decides whether somebody has
paid, and taking the time as a parameter is what makes every
`(status, periodEnd, cancelAtPeriodEnd, now)` combination reachable from a test
instead of only the one the machine happens to be in.

Safe in a client component, so an upgrade prompt can name the same number the
server will enforce.

**No prompts, no provider, no model call.** Same rule `@resfolio/ai` and
`@resfolio/job` follow. This package knows a feature was spent; it has no idea
what a model is. `./server` owns the six billing tables, and when the Dodo seam
lands it will be the only file importing `dodopayments`.

## The three things most worth understanding

### 1. The quota period is not the billing period (`period.ts`)

```
quotaPeriodLength = min(billing interval, 1 month)
anchor            = the subscription's start date, not the calendar
```

The obvious rule — "the quota period is `subscriptions.period_start`" — works
for weekly and monthly and **fails badly for yearly**, handing a subscriber
twelve months of allowance on day one. `interval` sets price and renewal
cadence; it never lengthens the allowance period.

Anchoring on the subscription date rather than the calendar is what makes an
upgrade grant exactly one period — otherwise a user who upgrades on the 20th
gets a full allowance for ten days and a second one on the 1st.

Two edge cases are handled and tested, and both are silent if wrong:

- **A 29th–31st anchor clamps** to the last day of shorter months, or a
  subscription started on the 31st has no boundary in February and its
  allowance never resets. The clamp is computed from the **original anchor**
  every time so it is not sticky (Jan 31 → Feb 28 → **Mar 31**).
- **Everything is UTC.** A boundary that moves with a timezone is one that
  occasionally happens twice or not at all.

Rollover is **implicit** — a new period is a new counter primary key, so the
first spend inserts a row at `used = 1`. There is no reset job, so there is
nothing that can fail to run.

### 2. `resolveEntitlement` is the only interpretation of subscription state

Nothing downstream may read `status` and draw its own conclusion. A second
reading of "does cancelled still mean access?" is how two parts of a product
come to disagree about whether somebody has paid.

- The `switch` is **exhaustive with a `never` guard** — adding a status (a
  trial, say) fails to compile until somebody decides what it grants.
- **A week pass expires here and nowhere else.** It is a one-time payment, so
  no renewal event ever arrives to close it: expiry is the absence of a future
  date, checked on read.
- **Grace is a function, not a cron.** There is nothing to run at hour 73, so
  nothing can fail to run and leave paid access granted indefinitely for free.
- `statusChangedAt` is a **dedicated column, not `updated_at`** — grace is
  measured from when the subscription went `on_hold`, and `updated_at` moves
  for any write, so an unrelated touch would silently restart the window.
- **A `free` plan id wins over any status.** A downgraded user keeps their row;
  reading `status: active` off it would hand back a plan they no longer have.

### 3. The catalogue is typed so a gap cannot compile

`PLAN_LIMITS` is `Record<PlanId, Record<AiFeature, Allowance>>`, not a partial.
Adding a feature to `AI_FEATURES` without deciding its allowance on **every**
plan is a type error. That is the entire reason it is a table in code rather
than configuration.

- **`PlanId` carries the entitlement** (`free | weekly | monthly | yearly`).
  An earlier design split entitlement from cadence; the decided product gives
  yearly a larger monthly allowance than monthly, so the four products are four
  levels and the split was an indirection.
- **Six features, not four.** `resumeTailor` is absent from the product brief
  and present in the product — omitting it would make it free to the user and
  invisible to us. `resumeIntake` (doc 16) joined for the same reason, and the
  typed table is what caught it: the new member did not compile until every plan
  had a number. It is the one row that deliberately **barely scales with the
  tier** (3/3/5/5) — a resume import is a once-per-account operation, so a paid
  tier's larger number would buy a capability nobody consumes — and the one that
  is reachable by an account with no content at all, which is why it is not
  generous.
- **`PLAN_LIMITS` is not keyed by currency** and must not become so. Pricing
  varies by market (`pricing.ts`); entitlement does not. Otherwise "which plan
  am I on" becomes a question with a geographic answer.
- **Prices live in `pricing.ts` and nothing on the enforcement path reads it.**
  Product ids are placeholders until the products exist in Dodo — deliberately
  empty rather than plausibly wrong.

## `./server`

The only code that touches the six billing tables. Five things not to break:

### The counter increments in `authorizeAiSpend`, in one statement

Increment-after-success means N concurrent requests all read `used = 4` against
a limit of 5 and all proceed; the exploit is a `for` loop. So the check and the
increment are one `INSERT … ON CONFLICT … DO UPDATE … WHERE used < allowance`,
with **no row returned meaning the allowance is spent**. There is no window
between them and no advisory lock to forget.

`setWhere`, not `targetWhere` — the former is the `WHERE` on `DO UPDATE`
(applied to the existing row), the latter describes a partial index. They read
alike, which is why the plain `where` key is deprecated.

**A zero allowance is refused before the database.** With no existing row the
`INSERT` succeeds at `used = 1` and the guard is never consulted, so SQL alone
would _grant_ a zero allowance.

### Two round trips, deliberately, not one

Doc 15 §2.6 originally asked for a single CTE resolving the plan and
incrementing together, to save a Mumbai→Singapore hop. It is the wrong trade:
`period_start` needs `period.ts`'s anchoring and clamping, so one statement
means re-implementing the most safety-critical pure function in the package in
SQL, where it would have to agree forever with the copy the usage screen reads.
Two versions of that rule disagreeing is a screen promising a reset date the
gate does not honour. The doc has been corrected. One trip _is_ saved — the
naive shape is three.

`getUsageSummary` is likewise two, never six: **one counter query for all five
features**.

### A refund is an insert, never a decrement

A decrement is a second mutation racing the first and it can run twice. Failed
and aborted generations insert an `ai_usage_grants` row keyed on the
reservation, whose **unique `reservation_id` is what stops the refund path
being a credit mint**. The ledger then shows a spend and a refund, rather than
an event that never occurred. Aborts are refunded too — Stop is a real cost
control, and charging for it turns the honest button into a penalty.

### Enforcement is decided inside the gate

`BILLING_ENFORCED=false` meters without refusing: counters still increment, the
ledger still records, nothing is denied. That is what makes §11 steps 3–4
deployable and is the rollback for a wrong limits table. The check lives in
`authorizeAiSpend` rather than at each call site — five call sites each
remembering a flag is five chances to forget one. Unset means **enforced**.

### A missing subscription row is a supported state

`resolveEntitlement(null, now)` returns free, so nothing here creates a row on
read. Migration `0017` backfills existing users and the webhook writes one on
first purchase, but **correctness does not depend on that invariant** — making
it a `getOrCreate` would put a write on the hot path of every AI request to
maintain a row nothing needs.

Unrecognised `plan_id` / `status` / `feature` values fall back rather than
throw: those columns are `text` so the vocabulary can grow, which means an
older deploy can legitimately read a value a newer one wrote. Throwing would
take the dashboard down for a user whose only crime was subscribing during a
rollout.

## Not yet built

Checkout, the webhook route and the Dodo seam (§11 steps 6–7); enforcement
itself (step 5 — the flag is `false` everywhere today); the inline counters
beside each AI action (the other half of step 4); and `./server` still has **no
tests**, because every function in it needs a live Postgres. The atomic upsert,
refund idempotency and counter read are verified by typecheck and by reading
only — prove the concurrency behaviour with parallel requests before enforcement
goes live.
