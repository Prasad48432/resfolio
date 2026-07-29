# 14 — AI Usage, Quotas & Billing

**Status:** Proposed — no code written. Supersedes the "Billing & plan gating"
entry on `docs/README.md`'s deferred list.
**Depends on:** [06](06-api-architecture.md), [07](07-storage.md),
[10](10-auth-and-security.md), [13](13-ai-layer.md).
**Constrains:** every AI feature; the `/settings/billing` surface; anything
later added to `apps/dashboard/lib/ai/`.

---

## 1. What this decides

1. That a **plan is an entitlement, and a quota is a ledger** — two separate
   things, joined by one function.
2. That **every AI feature spends through one gate**, and that adding a feature
   without one is a compile error rather than a code-review catch.
3. That **usage is metered where the money is spent** — after the model
   answers, from the provider's own token counts — and _authorised_ before.
4. How **Dodo Payments** subscriptions (weekly / monthly / yearly) map onto that
   entitlement, and what happens at every point in a subscription's life.
5. The security posture: what an attacker can do, what it costs them, and where
   the ceiling is that stops it being unbounded.

It does **not** decide prices. Prices are a business input; the catalogue is a
table, and the table is the only thing that changes when they do.

---

## 2. Where the product is today, honestly

Doc 13 shipped seven phases of AI with real cost controls, and they are the
right controls for a product with no plans. They are not a quota system, and
three things are worth stating plainly before designing over them.

**There is no per-user budget, only a per-user _rate_.** `lib/ai/rate-limit.ts`
is a sliding window: 20 chat turns per 10 minutes, 6 analyses, 6 tailorings, 4
letters. A user who sits there all day spends 2,880 chat turns and never trips
it. That is a **burst** control, and it was built as one. It answers "is this a
runaway client?" It does not answer "has this person had their five
enhancements?"

**Nothing is counted.** Usage is _logged_ — `onFinish` writes user, model, mode
and token counts through `createLogger("ai")` — and doc 13 says in as many
words that "a billing meter later reads that call site". A log line is not a
meter: it is in a log aggregator, it is not transactional, it is not readable
from a request, and it is deleted on a retention schedule.

**The rate limiter is inert without Upstash, by design.** Absent credentials
mean no limiting at all, which is the correct trade for a burst control in local
dev and CI, and is the _wrong_ trade for a paid entitlement. A quota that
disappears when a Redis is unreachable is not a quota. **This is the single most
important difference between what exists and what this document specifies:
quota lives in Postgres, and a database that cannot be reached refuses the
request.**

**The gate is duplicated.** `requireAiBudget` in `tailor-actions.ts` is the
action-shaped copy of the ladder the two routes implement inline. Two copies of
a guard is the number that drift; three would be inevitable once billing gives
each of them a reason to grow.

---

## 3. The model: entitlement, ledger, gate

Three concepts, deliberately separate, because collapsing any two of them is how
these systems become unmaintainable.

```
  ENTITLEMENT              LEDGER                  GATE
  what you may do          what you have done      the one place they meet

  plan → limits            append-only rows        authorize → run → record
  (a pure table)           (Postgres, per period)  (one function, all callers)
```

- **Entitlement** is pure data derived from the plan: a table of `feature →
allowance`. It knows nothing about a user. It is unit-testable, it ships in a
  package root, and reading it costs nothing.
- **The ledger** is what happened. Append-only, in Postgres, one row per
  spend, carrying the real token counts and the real cost. It is the audit
  trail, the meter, and the analytics source; it is never the thing a hot path
  counts.
- **The gate** is `consumeAiCredit(userId, feature)` and it is the only way to
  spend. Nothing else in the codebase may call a model.

### 3.1 Why a _counter_ as well as a ledger

Counting `SELECT count(*) FROM ai_usage_events WHERE …` on every request is
correct and gets slower every month. So the design is the standard one: a
**period counter row** that is the authority for the decision, and an
**append-only event log** that is the authority for the truth. The counter is
incremented in the same transaction as the event insert, so they cannot
disagree; a nightly job can reconcile the counter from the log, and if it ever
has to, that is a bug worth an alert.

The counter is what a request reads. It is one indexed row, one round trip.

---

## 4. Plans and the catalogue

### 4.1 Plan identity

```ts
export type PlanId = "free" | "pro" | "career";
export type BillingInterval = "week" | "month" | "year";
```

`PlanId` is **what you get**. `BillingInterval` is **how often you pay for it**.
They are independent, and keeping them independent is what makes the weekly
plan possible without a fourth set of limits: a weekly Pro and a yearly Pro are
the same entitlement bought on different cadences.

> **A weekly subscription is an abuse vector and has to be designed as one.**
> It is the cheapest way to buy a month's allowance, so allowances must be
> **granted per billing period, not per calendar month**. A weekly subscriber
> gets a week's worth every week. See §5.2 — the period boundary comes from the
> subscription, never from the clock.

### 4.2 The feature catalogue

Every AI feature is a member of one enum, and the enum is the thing that makes
"add a feature without a quota" impossible:

```ts
export const AI_FEATURES = [
  "chat", // one assistant turn
  "profileEnhance", // enhance-for-this-job (the propose pass)
  "jobMatch", // analyzeJobMatch
  "resumeTailor", // a tailoring plan
  "coverLetter", // one letter draft
] as const;
export type AiFeature = (typeof AI_FEATURES)[number];
```

`AiMode` in `lib/ai/rate-limit.ts` becomes a projection of this rather than a
parallel list. Four modes and five features is exactly the kind of near-miss
that produces a feature nobody metered.

### 4.3 The limits table

```ts
/** `null` means unlimited — and unlimited is still rate-limited (§7). */
type Allowance = number | null;

export const PLAN_LIMITS: Record<PlanId, Record<AiFeature, Allowance>> = {
  free: {
    chat: 30,
    profileEnhance: 5,
    jobMatch: 2,
    resumeTailor: 2,
    coverLetter: 2,
  },
  pro: {
    chat: 500,
    profileEnhance: 60,
    jobMatch: 60,
    resumeTailor: 60,
    coverLetter: 40,
  },
  career: {
    chat: null,
    profileEnhance: null,
    jobMatch: null,
    resumeTailor: null,
    coverLetter: null,
  },
};
```

The free row is the user's stated intent (5 / 2 / 2) plus the two the request
did not name. `chat: 30` matters: **a chat turn can call `analyzeJobMatch`**, so
leaving chat unmetered would leave the most expensive tool in the product
reachable for free through the cheapest door.

Three notes on the shape:

- **A `Record<PlanId, Record<AiFeature, …>>`, not a partial.** Adding a feature
  to the enum without deciding its allowance on every plan fails to compile.
  That is the entire reason this is a typed table rather than config.
- **`null` = unlimited, not a large number.** A large number is a number
  somebody eventually hits at 3am, and the copy then says "you have used
  999,999 of 1,000,000".
- **The prices are not here.** Price lives with the payment provider and is
  mirrored in `PLAN_PRICING` alongside Dodo's product ids, so a price change is
  a catalogue edit and never touches the enforcement path.

### 4.4 Grants, for the cases a plan cannot express

One extra concept, and only one: a **grant** — a bundle of credits with an
optional expiry, attached to a user.

```
grant := { userId, feature | "any", amount, expiresAt | null, reason }
```

It covers support ("your generation failed, here are three back"), promotions,
and a future top-up purchase, without any of those becoming a special case in
the gate. The gate's rule is: **spend the plan allowance first, then grants,
oldest expiry first.** Refunds on a failed generation are grants too — which is
what makes §6.4's "the model errored" path a single line rather than a
counter-decrement with a race in it.

---

## 5. Data model

Three tables. All owner-scoped, following doc 07's rule that every table hangs
off the user so account deletion stays a cascade.

### 5.1 `subscriptions`

One row per user. Present even for free users — the alternative is `LEFT JOIN`
plus a null check on the hottest read in the system, and a null that means "free"
is a null somebody eventually forgets to handle.

| column                        | type                           | notes                                                  |
| ----------------------------- | ------------------------------ | ------------------------------------------------------ |
| `user_id`                     | uuid PK → `user.id` cascade    | one subscription per user                              |
| `plan_id`                     | text not null default `'free'` | validated by `planIdSchema` on write                   |
| `status`                      | text not null                  | `active \| past_due \| canceled \| paused \| trialing` |
| `interval`                    | text null                      | `week \| month \| year`; null on free                  |
| `period_start` / `period_end` | timestamptz null               | **from the provider**, never computed                  |
| `cancel_at_period_end`        | boolean not null default false |                                                        |
| `provider`                    | text null                      | `'dodo'`                                               |
| `provider_subscription_id`    | text null unique               |                                                        |
| `provider_customer_id`        | text null                      |                                                        |
| `updated_at`                  | timestamptz                    |                                                        |

**`period_end` is the provider's number, not ours.** Proration, trial extension,
a retry after a failed charge, a customer-support credit — every one of those
moves the boundary, and a locally computed `start + 1 month` is wrong from the
first edge case onward. It is also the value the quota period is keyed on, so
getting it from the source of truth is not a nicety.

### 5.2 `ai_usage_counters`

The decision row. One per (user, feature, period).

| column         | type                               | notes               |
| -------------- | ---------------------------------- | ------------------- |
| `user_id`      | uuid → cascade                     |                     |
| `feature`      | text                               |                     |
| `period_start` | timestamptz                        | see below           |
| `used`         | integer not null default 0         |                     |
| PK             | `(user_id, feature, period_start)` | one row, one lookup |

**`period_start` is `subscriptions.period_start` for a paid plan, and the start
of the current UTC month for a free one.** That is the whole answer to the
weekly-subscription abuse question in §4.1: the period is the _billing_ period,
so a weekly subscriber's counters reset weekly and their allowance is a week's
worth. A free user has no billing period, so they get a calendar month.

Rollover is **implicit**: a new period means a new primary key, so the first
spend of a period inserts a row at `used = 1`. There is no reset job, nothing to
schedule, and no window in which a cron has not run yet. Old rows are pruned on
a retention schedule and their absence means "zero used", which is correct.

### 5.3 `ai_usage_events`

The truth. Append-only, never updated.

| column                                                | type           | notes                                    |
| ----------------------------------------------------- | -------------- | ---------------------------------------- |
| `id`                                                  | uuid PK        |                                          |
| `user_id`                                             | uuid → cascade |                                          |
| `feature`                                             | text           |                                          |
| `period_start`                                        | timestamptz    | denormalised, so a reconcile is one scan |
| `model`                                               | text           |                                          |
| `input_tokens` / `output_tokens` / `reasoning_tokens` | integer        | from the provider                        |
| `cost_micros`                                         | bigint         | integer arithmetic; never a float        |
| `outcome`                                             | text           | `ok \| error \| aborted`                 |
| `created_at`                                          | timestamptz    |                                          |

This is the table doc 13 promised when it said usage was "logged, not tabled".
It is also the answer to "what did this user actually cost us", which is the
question that decides whether the prices in §4.3 are the right ones.

**`reasoning_tokens` gets its own column** for the reason doc 13 already
learned the hard way: reasoning is billed and invisible, and a cost model that
folds it into output tokens will misprice the reasoning-heavy features by a
factor that is not small.

---

## 6. The gate

### 6.1 One package

`domains/billing` — `@resfolio/billing`, following the repository's layering
rule exactly:

- **Pure root**: `PlanId`, `AiFeature`, `PLAN_LIMITS`, `PLAN_PRICING`,
  `resolveEntitlement(subscription) → Entitlement`, `periodStartFor(...)`, the
  Zod schemas. No I/O, no clock beyond an injected `now`, unit-testable, and
  importable from the client so the upgrade prompt can name the number the
  server will enforce.
- **`./server`**: the only code that touches the three tables.
  `getEntitlement`, `authorizeAiSpend`, `recordAiSpend`, `applyGrant`,
  `applySubscriptionEvent`.
- **No prompts, no provider, no model call.** Same rule `@resfolio/job` and
  `@resfolio/ai` follow. This package knows a feature was spent; it has no idea
  what a model is.

### 6.2 The one call site shape

```ts
const spend = await authorizeAiSpend(userId, "coverLetter");
if (!spend.ok) return spend.refusal;          // 402 / ActionError

const result = await streamObject({ … });

await recordAiSpend(spend.reservation, {       // after, with real usage
  model, usage: result.usage, outcome: "ok",
});
```

**Authorize before, record after, and they are two functions on purpose.**
Authorization has to be cheap and synchronous with the decision; metering has to
carry token counts that do not exist until the model has finished. A single
"consume" call would have to either guess the cost or block the response.

The reservation is what joins them. It carries the resolved period, so a
generation that straddles a period boundary is recorded against the period it
was _authorized_ in — otherwise a request started at 23:59:58 on the last day of
a period is a free request.

### 6.3 Where the increment happens

**The counter increments in `authorizeAiSpend`, not in `recordAiSpend`**, and
this is the decision most worth arguing about.

The alternative — increment after success — means N concurrent requests all read
`used = 4` against a limit of 5 and all proceed. Every quota system that gets
this wrong gets it wrong here, and the exploit is a `for` loop.

So authorization is one atomic statement:

```sql
INSERT INTO ai_usage_counters (user_id, feature, period_start, used)
VALUES ($1, $2, $3, 1)
ON CONFLICT (user_id, feature, period_start)
DO UPDATE SET used = ai_usage_counters.used + 1
WHERE ai_usage_counters.used < $4     -- the allowance
RETURNING used;
```

No rows returned means the allowance is spent. The check and the increment are
one statement, so there is no window between them and no advisory lock to
forget. Unlimited plans skip the `WHERE` and still increment — an unlimited plan
should still know what it used.

The cost is that a failed generation has consumed a credit, which §6.4 answers.

### 6.4 Failure returns the credit as a grant, not as a decrement

A decrement is a second mutation racing the first, and it can run twice. A grant
is an insert:

```ts
recordAiSpend(reservation, { outcome: "error" })
  → insert event(outcome: "error")
  → insert grant(feature, amount: 1, reason: "generation_failed")
```

Idempotent by the reservation id, so a retried webhook or a double-fired
`onError` cannot mint credits. The user sees their count go back up; the ledger
shows what actually happened, which is a spend and a refund, not an event that
never occurred.

**Aborts are refunded too.** Doc 13 makes Stop a real cost control by passing
`request.signal` as `abortSignal` — a user who stops a generation has genuinely
saved money, and charging them a credit for it turns the honest button into a
penalty.

### 6.5 The consolidated ladder

The six-rung ladder from doc 13, with quota inserted at the one place where it is
cheaper than a model call and more expensive than everything before it:

```
1. requireSession               cookie + DB session
2. feature kill switch          AI_ENABLED=false          → 503
3. provider configured          no key                    → 501
4. rate limit (burst)           Upstash, per user+mode    → 429  + Retry-After
5. request parse / size         Zod + limits.ts           → 400 / 413
6. QUOTA                        Postgres, atomic          → 402  + upgrade info
7. model
```

Quota is rung 6, after parsing, because refusing an oversized body should not
cost a database write. It is before the model because that is the entire point.

**402 Payment Required, not 429.** They mean different things and the client must
render different things: 429 is "wait", 402 is "upgrade or wait until the 14th".
A 429 with an upgrade link is a lie about time.

### 6.6 Making the gate unavoidable

The rule "every AI feature spends through one gate" is worth nothing if it is
only written down. Three mechanisms, in increasing order of how much they
actually buy:

1. `lib/ai/provider.ts` — already the only file naming a vendor — stops
   exporting a raw model. It exports `withAiBudget(userId, feature, fn)`, and
   the model is only reachable inside the callback. A feature that does not
   spend cannot obtain a model to call.
2. An ESLint rule banning `ai` SDK imports outside `lib/ai/`, mirroring the
   existing `process.env` rule.
3. `AI_FEATURES` being exhaustive in `PLAN_LIMITS` (§4.3), so a new feature
   fails to typecheck until somebody decides what it costs.

---

## 7. Rate limiting and quota are different systems, and both stay

They are frequently conflated and the difference is load-bearing here.

|                            | Rate limit          | Quota                   |
| -------------------------- | ------------------- | ----------------------- |
| Question                   | is this a runaway?  | have you paid for this? |
| Store                      | Redis (Upstash)     | Postgres                |
| Window                     | 10 minutes, sliding | billing period          |
| On store failure           | **allow**           | **refuse**              |
| Applies to unlimited plans | **yes**             | no                      |
| Status                     | 429                 | 402                     |

**"Unlimited" is unlimited entitlement, not unlimited throughput.** The `career`
plan still passes rung 4. Without that, one compromised paid account is an
uncapped bill, and the most expensive account in the system is the one with no
ceiling on it.

**The fail-open / fail-closed split is deliberate and asymmetric.** A Redis
outage should not take the product down for everyone, so the burst limiter fails
open — that is doc 13's existing posture and it is right. A Postgres outage
already means no profile to read, so failing closed on quota costs nothing that
was working anyway.

---

## 8. Dodo Payments

### 8.1 What lives where

Dodo is the source of truth for **money and subscription state**. Resfolio is the
source of truth for **entitlement and usage**. The join is
`subscriptions.provider_subscription_id`, and the direction of trust is one-way:
webhooks write our subscription row, and nothing in our system writes a price.

`domains/billing/server/dodo.ts` is the only file that imports a Dodo SDK or
knows a Dodo URL — the same seam `lib/ai/provider.ts` is for models. Swapping
providers is editing one file and one webhook route.

### 8.2 Checkout

1. `startCheckoutAction(planId, interval)` — a Server Action, session-resolved.
2. Server looks up the product id from `PLAN_PRICING[planId][interval]`.
   **The client sends a plan and an interval, never a price or a product id.**
   A client-supplied product id is a client-supplied price.
3. Creates (or reuses) a Dodo customer keyed on `provider_customer_id`, opens a
   checkout session with `metadata.userId`, returns the URL.
4. Redirect. The success page is **optimistic and says so** — it reads the
   subscription row, and if the webhook has not landed it renders "activating,
   this takes a moment" rather than "free plan". Entitlement changes on the
   webhook, never on the redirect: the redirect is a browser navigation and a
   browser navigation is forgeable.

### 8.3 Webhooks

`POST /api/billing/webhook` — a route handler, not an action, because the caller
is not our React app (doc 06's stated exception).

The security requirements are not optional and are listed in the order they must
execute:

1. **Verify the signature over the raw body.** Read the body as text before any
   JSON parsing; a framework that re-serialises changes the bytes and every
   signature fails. Reject on failure with 401 and no detail.
2. **Reject stale timestamps** (> 5 minutes) — replay defence.
3. **Idempotency.** `provider_event_id` is a unique column; a duplicate insert
   is a 200 and no work. Providers retry, and a second `subscription.created`
   must not grant a second period of credits.
4. **Ordering.** Events arrive out of order. Every write carries the provider's
   own event timestamp and is applied only if it is **newer than the row's
   `updated_at`** — otherwise a delayed `created` overwrites a `canceled` that
   arrived first, and a cancelled user has a live plan.
5. **Never trust the payload's `userId` alone.** Resolve through
   `provider_customer_id` → our row; use the metadata only to _create_ the link
   on first checkout.
6. **Respond 200 fast, do work in the transaction, and never 500 on a business
   rule.** A 500 makes the provider retry a message that will never succeed.

Events handled: `subscription.active` / `renewed` (set plan, status, period
window), `payment.failed` (→ `past_due`, keep entitlement through a grace
period), `subscription.cancelled` (→ `cancel_at_period_end`; entitlement runs to
`period_end`), `subscription.expired` (→ `free`), `refund` / `dispute` (→ `free`
immediately, and flag the account).

### 8.4 Downgrade is the case everyone gets wrong

A user on Pro who has used 40 enhancements downgrades to Free, whose allowance is 5. Their counter says 40.

**Nothing is clawed back and nothing is reset.** The counter is a fact about a
period, and the entitlement is evaluated against it: `40 >= 5`, so they are out
until the next period. That is the correct outcome and it needs no special
handling — which is exactly why "used" and "allowed" are separate values rather
than a single "remaining" that would have gone negative.

The corollary: **upgrading mid-period must move the period boundary**, because
the provider issues a new period on the plan change. `period_start` changes, the
primary key changes, counters start at zero. The upgraded user gets the full new
allowance immediately, which is what they just paid for.

### 8.5 Grace, and what "past due" means

A failed renewal does **not** revoke entitlement on the spot. Card failures are
overwhelmingly banks, not fraud, and cutting off a paying user mid-application is
a support ticket and a churn event over a retry that would have succeeded.
`past_due` keeps the paid entitlement for a **72-hour grace window**, shows a
persistent banner with a link to the portal, and falls to `free` after. The
window is a constant in the pure root, so the banner copy and the enforcement
read the same number.

---

## 9. Security review

### 9.1 Usage tracking

| Risk                           | Answer                                                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Client reports its own usage   | It never does. Metering is server-side, from the provider's `usage`, in a package the browser cannot reach.             |
| User forges a lower count      | Counters are keyed on the session-resolved `userId`; nothing in the request body names a user.                          |
| Double-spend on retry          | Reservation id is unique; `recordAiSpend` is idempotent on it.                                                          |
| Counter drifts from reality    | Same transaction as the event insert; nightly reconcile from the append-only log; drift is an alert, not a silent skew. |
| Enumeration via error messages | A 402 says what _your_ plan allows. It never says anything about another account.                                       |

### 9.2 Rate limiting

Unchanged in mechanism, extended in reach: keyed per user and per feature,
sliding window, Upstash, fails open. What changes is that **rung 4 now applies to
unlimited plans too** (§7), and that `AiMode` stops being a second list of
features.

One addition: **an unauthenticated ceiling in the proxy.** Every AI path is
behind `requireSession`, so the expensive surface is already authenticated — but
the sign-in path is where free accounts come from, and Better Auth's own limiter
(`/sign-in/*`, 10/60s) is the thing standing between a script and a thousand
free plans. It is already there; this document's contribution is to say that it
is now a **billing** control and must not be relaxed without that in mind.

### 9.3 Abuse prevention

The real economics: a free account is worth 5 enhancements + 2 matches + 2
letters + 30 chat turns. Signup is Google/GitHub OAuth only, so an account costs
an attacker a real, provider-verified email — which is the strongest anti-abuse
property this product has, and it comes for free from doc 10's decision to ship
social-only auth.

What remains, and the answer to each:

- **Account farming.** Mitigated by OAuth-only signup. Monitored, not blocked:
  an alert on N new accounts from one IP in an hour. Not a hard block, because
  university and corporate NAT are real.
- **Email aliasing** (`me+1@gmail.com`). Both providers return one canonical
  address per account and account linking is already keyed on verified email
  (doc 10), so plus-addressing does not produce a second Google account.
- **Shared paid account.** The `career` plan's throughput ceiling (§7) is what
  bounds this. Seat enforcement is deliberately **not** built: it costs real
  product complexity to defend against a behaviour that has not been observed.
- **Prompt-driven cost inflation** — a pasted "posting" engineered to maximise
  reasoning tokens. Bounded by `MAX_JD_CHARS`, `MAX_CHARS_PER_MESSAGE`, and the
  output ceilings in `limits.ts`. This is why those ceilings are billing
  controls and not validation, and why raising one is a pricing decision.
- **The refund path as a credit mint.** The only way to gain credits is a
  reservation transitioning to `error`/`aborted` exactly once. Idempotent on the
  reservation id.

### 9.4 API protection

- Every AI route and action already resolves the session itself (doc 10's
  three-layer guarding). Quota is _inside_ that, never in front of it.
- **The webhook is the one unauthenticated write in the system**, so it is the
  one that gets signature verification over raw bytes, timestamp rejection,
  idempotency, and monotonic ordering (§8.3). Everything it may write is a
  subscription row; it cannot touch a counter, a profile, or a document.
- **Kill switches stay.** `AI_ENABLED=false` refuses at rung 2. A billing system
  is a new way to be wrong about money, and the lever that stops all spend must
  remain in front of it.
- **No client-supplied prices, product ids, plan limits or periods.** The client
  sends a `planId` and an `interval` and that is the whole surface.
- Env: a `billing` slice in `@resfolio/env` — `DODO_API_KEY`,
  `DODO_WEBHOOK_SECRET`, `DODO_ENVIRONMENT`. **The webhook route refuses with
  503 when the secret is absent**, rather than skipping verification. Optional
  configuration must never mean optional verification.

### 9.5 Subscription enforcement

- Entitlement is read from **our** database, never from a provider API call on
  the request path. A provider outage must not decide whether a paying user may
  work.
- The subscription row is the only authority. A client that says it is Pro is a
  client.
- Trials, cancellations and downgrades all resolve through
  `resolveEntitlement()` — one pure function, exhaustively tested against every
  `(status, period_end, cancel_at_period_end, now)` combination. That is the
  function to write tests for first; it is where the money is.

### 9.6 Future scalability

- The hot path is **one indexed upsert on a primary key**. It does not degrade
  with history.
- Events are append-only and partition cleanly by month when they need to.
- `feature` and `plan_id` are text columns, not enums, so adding a feature or a
  plan is a code deploy and not a migration with a lock on it.
- The design is per-request-count today. Moving to **token-based metering**
  (`cost_micros` against a budget, rather than calls against a count) is a change
  to `authorizeAiSpend` and the catalogue only — the events table already carries
  the numbers, which is why it carries them from day one rather than when
  somebody asks.
- Nothing here is dashboard-specific. When a second app needs to spend AI credit,
  it imports the same package.

---

## 10. Migration

Existing users get a `free` row backfilled with `period_start` = the start of the
current UTC month and `used = 0` — **everyone starts the first period fresh**.
Retroactively charging people for usage that was free when they spent it is both
unfair and unenforceable, since there is no ledger to charge from.

The features ship enforcing quota from the first deploy, with the counts visible
in the UI for a period **before** the refusal is switched on. A user who
discovers a limit by being refused mid-application is a user who learns about
your pricing at the worst possible moment.

---

## 11. Implementation order

Each step is shippable and reversible.

1. **`@resfolio/billing` pure root.** Types, catalogue, `resolveEntitlement`,
   `periodStartFor`, schemas. All tests, no I/O, nothing wired.
2. **Tables + migration `0016`.** Backfill free rows. Nothing reads them yet.
3. **Meter only.** `recordAiSpend` behind every model call; `authorizeAiSpend`
   returns "allowed" unconditionally. Now there is real data about what a user
   actually costs — which is what should set the prices in §4.3, rather than the
   other way round.
4. **Surface it.** Usage on `/settings`, and a counter beside each AI action.
   Still no refusals.
5. **Enforce.** Turn on the `WHERE used < allowance`. Add the 402 path, the
   upgrade prompt, and the consolidated ladder (§6.5).
6. **Dodo.** Checkout, webhook, portal link, the three intervals.
7. **Harden.** Reconcile job, abuse alerting, retention/pruning.

Steps 1–5 deliver the user's actual request ("a scalable architecture for AI
limits, before pricing") and are independent of the payment provider. If Dodo is
replaced, nothing above step 6 changes.

---

## 12. Open questions

1. **Prices, and whether `career` should be unlimited at all.** Step 3 answers
   this with data rather than a guess. Unlimited is a strong promise to make
   against a variable cost.
2. **Does a chat turn that calls a tool spend twice?** Proposed: **yes** — the
   turn spends `chat`, the tool spends its own feature. It is what actually
   costs money and it is explicable. The alternative makes the chat the cheapest
   route to every expensive feature.
3. **Annual plans and the period boundary.** A yearly subscriber with a yearly
   counter gets 12× the monthly allowance available on day one. Proposed:
   **allowances always accrue monthly**, and `interval` affects only price. The
   billing period sets the _reset cadence_ for weekly plans specifically because
   a week is shorter than a month; it must not be allowed to make a year longer.
   This needs deciding before §5.2 is implemented — it is the one place the two
   readings of "period" genuinely conflict.
4. **Team/seat plans.** Out of scope. Recorded here so it is not improvised.
