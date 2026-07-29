# @resfolio/billing

Plan entitlements, AI quota rules and the price catalogue —
`docs/architecture/14-ai-usage-and-billing.md`. **Status: the pure root only**
(§11 step 1). The tables, the gate and the Dodo integration are not built yet.

## What belongs here

**Pure root only, today.** No database, no network, no payment SDK, and
**no clock** — every function takes `now` as an argument. That last one is not
style: `resolveEntitlement` is the function that decides whether somebody has
paid, and taking the time as a parameter is what makes every
`(status, periodEnd, cancelAtPeriodEnd, now)` combination reachable from a test
instead of only the one the machine happens to be in.

Safe in a client component, so an upgrade prompt can name the same number the
server will enforce.

**No prompts, no provider, no model call.** Same rule `@resfolio/ai` and
`@resfolio/job` follow. This package knows a feature was spent; it has no idea
what a model is. When `./server` arrives it owns the three tables and the Dodo
SDK, and nothing else may import `dodopayments`.

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
- **Five features, not four.** `resumeTailor` is absent from the product brief
  and present in the product — omitting it would make it free to the user and
  invisible to us.
- **`PLAN_LIMITS` is not keyed by currency** and must not become so. Pricing
  varies by market (`pricing.ts`); entitlement does not. Otherwise "which plan
  am I on" becomes a question with a geographic answer.
- **Prices live in `pricing.ts` and nothing on the enforcement path reads it.**
  Product ids are placeholders until the products exist in Dodo — deliberately
  empty rather than plausibly wrong.

## Not yet built

`./server` (the three tables, `authorizeAiSpend`/`recordAiSpend`, the Dodo
seam) is §11 steps 2–7. Two constraints already decided that it must honour:

- **The counter increments in `authorizeAiSpend`, in one atomic statement**
  (§6.3). Increment-after-success means N concurrent requests all read
  `used = 4` against a limit of 5 and all proceed; the exploit is a `for` loop.
- **Count the round trips.** Postgres is in Singapore and compute is in Mumbai
  (doc 15 §2.6), so every extra query on the AI path costs 40–60ms. Resolving
  the entitlement and applying the increment should be **one** statement, and
  the usage screen should be one query for five features.
