# 14 — AI Usage, Quotas & Billing

**Status:** Accepted; **§11 steps 0–4 implemented 2026-07-30** (pure root,
tables + migration `0017`, `./server`, the gate wired behind every model call,
and the usage screen — all with `BILLING_ENFORCED=false`, so nothing is refused
yet). Steps 5–8 (enforcement, Dodo, hardening) are still Proposed. Supersedes
the "Billing & plan gating" entry on `docs/README.md`'s deferred list.
**Depends on:** [06](06-api-architecture.md), [07](07-storage.md),
[10](10-auth-and-security.md), [13](13-ai-layer.md);
[15](15-production-readiness.md) §2.1 is a prerequisite for implementation.
**Constrains:** every AI feature; the `/settings/billing` surface; template
selection and publish in `/portfolio` and `/resumes`; anything later added to
`apps/dashboard/lib/ai/`.

---

## 1. What this decides

1. That a **plan is an entitlement, and a quota is a ledger** — two separate
   things, joined by one function.
2. That **every AI feature spends through one gate**, and that adding a feature
   without one is a compile error rather than a code-review catch.
3. That **usage is metered where the money is spent** — after the model
   answers, from the provider's own token counts — and _authorised_ before.
4. How **Dodo Payments** maps onto that entitlement — recurring plans, the
   **week pass as a one-time payment**, and what happens at every point in a
   subscription's life.
5. That **premium templates are a permanent one-time unlock, not a subscription
   feature**, because they render at public URLs that revocation would break.
6. That limits are **hard for discrete artifacts and soft for the chat**, and
   that overage billing is rejected outright.
7. The security posture: what an attacker can do, what it costs them, and where
   the ceiling is that stops it being unbounded.
8. The **shape** of the catalogue and the relationships between its prices
   (§12) — which products exist, which are recurring, and how an India-first
   price list stays global-ready.
9. What the user sees: the **Settings → AI Usage** screen (§13), which is the
   surface that decides whether all of the above reads as fair or as a paywall.

It does **not** decide price _levels_. Those are a business input; the
catalogue is a table, and the table is the only thing that changes when they
move. What §12 fixes are the ratios that have to hold for the catalogue to make
sense at any level.

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
export const PLAN_IDS = ["free", "weekly", "monthly", "yearly"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export type BillingInterval = "week" | "month" | "year";
```

**One plan id per product, and `PlanId` carries the entitlement.** An earlier
draft split these — `free | pro | career` as the entitlement, `week | month |
year` as the cadence — on the theory that a weekly Pro and a yearly Pro are the
same thing bought differently. That theory does not survive the decided
product: **yearly grants a larger monthly allowance than monthly does**, so the
four products are four entitlement levels and the separation was buying an
indirection in which "yearly" secretly meant "the max tier".

`BillingInterval` survives as a display and renewal fact — it is what the
`/settings/billing` copy says and what Dodo renews on — but it is no longer an
input to the allowance lookup. **`PLAN_LIMITS[planId]` is the whole rule.**

The cost of this choice is that a fifth product means a fifth row in the limits
table rather than a reused entitlement. That is the right trade at four
products: the table is exhaustive and type-checked (§4.3), so a new plan cannot
be added without deciding every allowance on it, and a row of numbers is easier
to read than an indirection to a shared tier.

#### The weekly plan is a pass, not a subscription

This section originally modelled `week` as an ordinary recurring interval. That
was wrong, and the difference is a product decision rather than a modelling
detail.

The weekly plan exists for someone in the middle of a job hunt. A **recurring**
weekly charge on that person is a charge they will forget about and resent —
the hunt ends, the card keeps being debited weekly, and the refund request
arrives as a chargeback. A **pass** — one payment, seven days, no renewal, no
cancellation to remember — is the same revenue with none of that, and it is
what the plan was always meant to be.

So a week pass is **a one-time payment that writes an expiring entitlement**:

```
plan_id: "weekly", status: "active", interval: "week",
period_start: now, period_end: now + 7d,
provider_subscription_id: null          ← nothing renews it
```

It is a `subscriptions` row because that is what `resolveEntitlement()` already
reads; it gets counters, grace handling and the whole gate for free. The only
thing it does not have is a renewal. When `period_end` passes,
`resolveEntitlement` returns the free entitlement with no webhook, no job and
no state to clean up — expiry is the absence of a future date, not an event.

Buying a second pass while one is live **extends `period_end`** rather than
opening a second row. Two overlapping entitlements for one user is a question
with no correct answer.

> **A short billing period is still an abuse vector**, and that is what §5.2's
> period rule is for: a week pass grants a week's worth of allowance, never a
> month's. The cheapest path to a month of credits must not be four passes.

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

**Five features, not the four in the product brief.** The plans were specified
as chat / job analysis / profile enhancement / cover letter, and
**`resumeTailor` is missing from that list while existing in the product** —
`tailorResumeAction` is live, it is one of the most expensive calls the app
makes (the whole profile plus a posting, structured output, `reasoningEffort`
untuned until recently), and it is reachable today from the match card's
"This resume only" branch. Leaving it out of the catalogue would not make it
free to run; it would make it free to the user and invisible to us, which is
the one combination worth avoiding.

It is surfaced in the usage screen (§13) as **Resume tailoring**, alongside the
four that were named.

### 4.3 The limits table

**Every number below is an allowance _per quota period_, and the quota period
is not the same length on every plan** (§5.2). Free, monthly and yearly reset
**monthly**; weekly resets after **seven days**. The yearly row is therefore a
monthly allowance that happens to be paid for annually — it is not a year's
worth, and that is the whole of §5.2's rule expressed as data.

```ts
/** `null` means unlimited — and unlimited is still rate-limited (§7). */
type Allowance = number | null;

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
```

`chat` matters more than it looks: **a chat turn can call `analyzeJobMatch`**,
so leaving it generous relative to the tool limits would leave the most
expensive operation in the product reachable through the cheapest door. It is
metered separately and a tool-calling turn spends both (§13, resolved).

#### The free row is the brief's numbers, and it is the expensive decision here

`20 / 10 / 10 / 5` are the figures from the usage-screen mock in the product
brief, adopted as written. They are **considerably more generous than a free
tier normally is**, and the arithmetic should be explicit before launch rather
than discovered on an invoice.

At current `gpt-5-mini` pricing through the gateway, and using doc 13's
measured shapes (a match sends a full posting plus the whole profile and
returns structured output with reasoning; a chat turn re-sends the profile
every time), one fully-consumed free account costs roughly **$0.20–0.30 per
month**. That is:

| Free users | Monthly cost if all max out |
| ---------- | --------------------------- |
| 1,000      | ~$250                       |
| 10,000     | ~$2,500                     |

Not every free user exhausts their allowance — realistically a minority do —
but the ceiling is what has to be affordable, because the users who do exhaust
it are exactly the ones a competitor's free tier would also attract.

Two things make this defensible rather than reckless: the ceiling is **bounded
and known**, which is the entire point of building this before launch; and
`jobMatch: 10` buys ten complete "paste a posting → see the score → optimise →
watch it move" cycles, which is the product's actual aha and the thing that
converts. **Step 3 of §11 exists to replace these numbers with measured ones**
before the enforcement switch is thrown — that is the moment to decide whether
10 matches is generosity or leakage.

Three notes on the shape:

- **A `Record<PlanId, Record<AiFeature, …>>`, not a partial.** Adding a feature
  to the enum without deciding its allowance on every plan fails to compile.
  That is the entire reason this is a typed table rather than config.
- **`null` = unlimited, not a large number.** No plan uses it today — every
  plan is a real number, which keeps the usage screen (§13) honest and means
  no account is an uncapped bill. It stays in the type for a future tier.
- **The prices are not here.** Price lives with Dodo and is mirrored in
  `PLAN_PRICING` alongside its product ids (§12), so a price change is a
  catalogue edit and never touches the enforcement path.

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

### 4.5 Non-consumable entitlements: premium templates

Premium resume and portfolio templates are sold as a **one-time purchase that
never expires**. This is not a simplification, and it is not a pricing
preference — it follows from what a template is attached to.

**A template is attached to a published artifact with a public URL.** A
portfolio at `/p/<handle>` is a link on someone's CV, in their email signature,
in a job application submitted three weeks ago. If premium templates were
gated by a subscription, then a lapsed subscription forces a choice between two
unacceptable outcomes:

- **Revoke** — and a paying customer's public site changes appearance or 404s
  on the day their card expires, without them doing anything. That is a trust
  failure the product does not recover from, and it happens for the most
  mundane possible reason.
- **Don't revoke** — in which case the subscription never gated anything and
  the recurring charge is for nothing.

A permanent unlock means that choice never has to be made. **Anything that
renders at a URL a stranger might hold should be sold once, not rented.** The
same reasoning would apply to a custom domain, and does not apply to AI, whose
output the user already has in hand when the entitlement ends.

Four rules follow from it:

**It is an entitlement, never a copy.** Purchasing unlocks the right to
_select_ a template. Templates stay workspace packages in the static registries
(`apps/sites/lib/templates.ts`, `apps/dashboard/lib/resume-templates.ts`);
nothing is duplicated per user, and a template fix still upgrades everyone in
one deploy, which is the property doc 04 built the multi-tenant renderer for.

**It is checked on write, never on render.** `apps/sites` has no sessions by
design (doc 04, doc 10) — ownership is verified in the dashboard before it
calls the render host. Entitlement follows the same boundary: the dashboard
checks it when a template is **selected** and again when a site is
**published**, and the render host renders whatever `template_id` says. Putting
a billing lookup on the public render path would mean a database read on every
ISR miss, and would make a refund capable of taking down a live site.

**A lapsed or refunded entitlement never breaks a published site.** Refunds and
chargebacks revoke the right to _select_ the template on anything new; they
leave already-published sites alone. This is deliberate asymmetry: the fraud
exposure is one template on one site, and the alternative is a mechanism whose
whole purpose is to break public URLs — which is the mechanism this entire
section exists to avoid building. Flag the account (§8.3) and move on.

**It interacts with a known sharp edge, and must not widen it.** `sites.template_id`
is a text column with nothing enforcing that the template still exists; the
root `CLAUDE.md` records that deleting a template is therefore a data migration
(`0009`), because an orphaned row 404s the live site. Entitlement introduces a
_second_ way to reach that state — a template that exists but may no longer be
selected. The write-time-only check is what keeps those separate: an
unentitled `template_id` on an already-published site renders exactly as it did
before.

#### Two products, one per template kind

**Premium resume templates and premium portfolio templates are sold
separately**, each a one-time purchase unlocking all current and future
templates of that kind, and each independent of any AI plan.

This reverses a recommendation made earlier in the design of this document,
which argued for a single combined "Premium Templates" unlock on conversion
grounds — one price to compare rather than two, and the assumption that
somebody buying a premium resume wants a matching portfolio. That was a
judgement call about buyer behaviour, not an architectural constraint, and it
was decided the other way. The reasoning against the merge is worth recording
because it is the better argument:

**The two products have different buyers.** A resume template is bought by
someone applying for jobs, in the week they are applying. A portfolio template
is bought by someone building a public presence, which is a different activity
on a different timeline and is often not happening at all. Bundling them prices
the resume buyer — the larger and more urgent segment — for a thing they did
not come for, and the most common outcome of that is not a bigger sale but no
sale.

Architecturally the cost of two products over one is a single extra row in an
enum, because §5.4 was already keyed on `(user_id, product)` rather than a
boolean:

```ts
export const PREMIUM_PRODUCTS = [
  "premium_resume_templates",
  "premium_portfolio_templates",
] as const;
export type PremiumProduct = (typeof PREMIUM_PRODUCTS)[number];
```

**"All current _and future_ templates of that kind" is a promise with teeth**,
and it is the reason the entitlement is per-kind rather than per-template: a
buyer is purchasing the category, so every template added later is delivered to
everyone who already paid. That is a deliberate constraint on the business —
new premium templates generate no new revenue from existing buyers — and it is
what makes the one-time price defensible to the buyer. If that becomes
untenable, the escape is a **new** product id (a "2027 collection"), never a
retroactive narrowing of the one already sold.

Both unlocks are included in the yearly plan (§12) — the marginal cost of
granting them is zero, which makes it the cheapest conversion lever available
and the one thing that makes yearly obviously worth more than twelve months of
monthly.

---

## 5. Data model

**Six tables**, all owner-scoped so account deletion stays a cascade. Four are
described below; the other two exist because §4.4 and §8.3 each need one, and
they are built in the same migration so that step 3 needs no second one:

- **`ai_usage_grants`** (§4.4) — credits outside the plan allowance, and the
  mechanism by which a failed generation is refunded. `reservation_id` is
  unique, which is what stops the refund path being a way to mint credits.
- **`billing_webhook_events`** (§8.3) — processed deliveries, keyed on the
  provider's `webhook-id`. **The payload is deliberately not stored**: it
  carries customer name, email and payment details, and this table exists to
  answer one boolean. Keeping the body would turn an idempotency ledger into a
  second, unmanaged copy of customer data with its own retention question.

**They hang off `user`, not `profile`, and that is a deliberate departure from
the rest of the schema.** Every content table in the repository is
profile-owned — `job_match_sessions`, `documents`, `sites`, `blog_posts` all
cascade from `profile_id`. Billing is not content: a subscription is a fact
about an **account**, it survives a profile being rebuilt, and it is resolved
on requests that have a session but may not have touched a profile yet.
`profile.user_id` is unique, so the two are 1:1 and either would work
mechanically — this picks the one that is semantically true. (An earlier draft
claimed this followed doc 07's rule; doc 07's rule as implemented is
profile-ownership, so the claim was wrong even though the choice was right.)

### 5.1 `subscriptions`

One row per user. Present even for free users — the alternative is `LEFT JOIN`
plus a null check on the hottest read in the system, and a null that means "free"
is a null somebody eventually forgets to handle.

| column                        | type                           | notes                                                  |
| ----------------------------- | ------------------------------ | ------------------------------------------------------ |
| `user_id`                     | uuid PK → `user.id` cascade    | one subscription per user                              |
| `plan_id`                     | text not null default `'free'` | validated by `planIdSchema` on write                   |
| `status`                      | text not null                  | Dodo's vocabulary — see below                          |
| `interval`                    | text null                      | `week \| month \| year`; null on free. `week` = a pass |
| `period_start` / `period_end` | timestamptz null               | **from the provider**, never computed                  |
| `cancel_at_period_end`        | boolean not null default false |                                                        |
| `status_changed_at`           | timestamptz not null           | **not `updated_at`** — see below                       |
| `currency`                    | text null                      | what they were charged in; entitlement ignores it      |
| `provider`                    | text null                      | `'dodo'`                                               |
| `provider_subscription_id`    | text null unique               | null for a week pass — nothing renews it               |
| `provider_customer_id`        | text null                      |                                                        |
| `updated_at`                  | timestamptz                    |                                                        |

**`status_changed_at` is a column of its own, and `updated_at` cannot stand in
for it.** Grace (§8.5) is measured from the moment a subscription went
`on_hold`. `updated_at` moves for _any_ write — a currency correction, a
customer-id capture, a re-sync — so using it would silently restart the grace
window and extend paid access for free, indefinitely, with nothing to observe.
This requirement came out of writing `resolveEntitlement` before the table,
which is the argument for doing it in that order.

**`status` uses Dodo's own vocabulary, not a translated one:**

```ts
export const SUBSCRIPTION_STATUSES = [
  "active",
  "on_hold", // renewal payment failed — this is Dodo's name for past_due
  "cancelled", // cancelled; access may run to period_end
  "expired", // term ended
  "failed", // mandate creation failed; never became active
] as const;
```

An earlier draft of this table invented `past_due | canceled | paused |
trialing` — Stripe's vocabulary, from habit. **Dodo does not emit any of
those.** Its failed-renewal state is `on_hold`, and `cancelled` carries the
British spelling in both the event name and the payload. A translation layer
between the provider's words and ours would be four lines of mapping whose only
function is to make the webhook handler harder to check against the provider's
documentation, so there isn't one: what the event says is what the column
holds.

Note `trialing` is absent because no plan offers a trial (§12). Dodo supports
`subscription_data.trial_period_days` if that changes, at which point the
status is added here and to `resolveEntitlement`'s exhaustive switch — which
will fail to compile until it is handled, by design.

**`period_end` is the provider's number, not ours.** Proration, trial extension,
a retry after a failed charge, a customer-support credit — every one of those
moves the boundary, and a locally computed `start + 1 month` is wrong from the
first edge case onward. Dodo supplies it as `next_billing_date` on
`subscription.active` and `subscription.renewed`.

The **week pass is the one exception**, and it is an exception precisely
because none of those forces apply to it: there is no renewal to prorate, no
dunning, and no proration event, so `period_end = period_start + 7 days` is
computed once at purchase and is then simply a fact. A one-time payment has no
provider-side period to read.

### 5.2 `ai_usage_counters`

The decision row. One per (user, feature, period).

| column         | type                               | notes               |
| -------------- | ---------------------------------- | ------------------- |
| `user_id`      | uuid → cascade                     |                     |
| `feature`      | text                               |                     |
| `period_start` | timestamptz                        | see below           |
| `used`         | integer not null default 0         |                     |
| PK             | `(user_id, feature, period_start)` | one row, one lookup |

#### `period_start`: the quota period is not the billing period

This is the one rule in the document most worth reading twice, because the
obvious version of it is wrong in a way that costs money.

The obvious version — and this section's first draft — was "`period_start` is
`subscriptions.period_start`". That works for weekly and monthly and **fails
badly for yearly**: a yearly subscriber whose billing period is a year gets
twelve months of allowance available on day one, and can spend all of it in
the first week. (This was Open Question 3; it is resolved here.)

The rule is:

```
quotaPeriodLength = min(billing interval, 1 month)
anchor            = the subscription's start date, not the calendar
```

- **Weekly pass** → resets every 7 days from the pass start. A week's
  allowance for a week, which is what §4.1's abuse note requires.
- **Monthly** → resets monthly, on the subscription's own day of month.
- **Yearly** → also resets **monthly**. `interval` sets the price and the
  renewal cadence; it never lengthens the allowance period. An annual plan is a
  discount for paying up front, not twelve months of credit granted at once.
- **Free** → the calendar month, since there is no subscription date to anchor
  to.

**Anchored on the subscription date, not the calendar**, because otherwise a
user who upgrades on the 20th gets a full month's allowance for the ten days
remaining in the calendar month, and then a second full month's allowance on
the 1st. The anchor is what makes an upgrade grant exactly one period.

Two edge cases that must be handled in `periodStartFor()` rather than
discovered later:

- **A subscription starting on the 29th–31st.** Clamp to the last day of
  shorter months, or a user who subscribed on the 31st has no period boundary
  in February and their allowance never resets.
- **DST and timezones.** Every instant is `timestamptz` and every computation
  is in UTC. A period boundary that moves by an hour twice a year is a period
  that occasionally has two boundaries or none.

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
| `cost_units`                                          | integer        | the feature's credit weight (§5.3.1)     |
| `reservation_id`                                      | uuid unique    | what `recordAiSpend` is idempotent on    |
| `outcome`                                             | text           | `ok \| error \| aborted`                 |
| `created_at`                                          | timestamptz    |                                          |

This is the table doc 13 promised when it said usage was "logged, not tabled".
It is also the answer to "what did this user actually cost us", which is the
question that decides whether the prices in §4.3 are the right ones.

**`reasoning_tokens` gets its own column** for the reason doc 13 already
learned the hard way: reasoning is billed and invisible, and a cost model that
folds it into output tokens will misprice the reasoning-heavy features by a
factor that is not small.

**`cost_micros` is populated from the AI Gateway's own reported cost**, not
from a price table in our code. Model prices change without notice; a hardcoded
table does not fail when they do, it silently misprices every row written after
the change — and it misprices the ledger that is supposed to be the authority
on what a user costs. Where a provider returns no cost, fall back to a table
and record which source was used.

### 5.3.1 `cost_units`, and the counter model this is insurance against

Per-feature counters (§4.3) are the right model **now**: five features, each
mapping to a distinct user intention, and a pricing page that can honestly say
"5 enhancements, 2 matches". They are legible, and legibility converts.

They do not scale to arbitrary feature counts. At eight or ten features the
pricing page is a spreadsheet, every new feature is a pricing negotiation on
every plan row, and users cannot hold their own allowance in their head.

The escape is **weighted credits**: one pool per period, each feature costing a
number of units (chat 1, match 10, letter 15). One number on the pricing page
forever, and expensive features are automatically expensive. Note this is
**not** the single shared pool that was rejected at the top of this document —
weighting is exactly what makes a shared pool honest, and an unweighted pool is
what makes it dishonest.

`cost_units` is written on every event **from day one** so that migration is a
change to `authorizeAiSpend` and the catalogue, with a full history already in
the shape the new model needs. Writing a column costs nothing today;
backfilling one across a year of events against models whose weights have since
changed is not really possible.

The decision point is around six features. Until then the column is recorded
and unread.

### 5.4 `product_entitlements`

Non-consumable, non-expiring purchases (§4.5). One row per (user, product).

| column                | type                     | notes                                     |
| --------------------- | ------------------------ | ----------------------------------------- |
| `user_id`             | uuid → `user.id` cascade |                                           |
| `product`             | text                     | one of `PREMIUM_PRODUCTS` (§4.5)          |
| `status`              | text not null            | `active \| revoked`                       |
| `source`              | text not null            | `purchase \| plan \| comp` — see below    |
| `granted_at`          | timestamptz not null     |                                           |
| `revoked_at`          | timestamptz null         | refund / chargeback; sites keep rendering |
| `provider`            | text null                | `'dodo'`; null for a comped grant         |
| `provider_payment_id` | text null unique         | idempotency for the webhook               |
| PK                    | `(user_id, product)`     | one lookup, no history to scan            |

**`source` exists because the yearly plan grants both unlocks** (§4.5), and a
plan-granted unlock is not the same fact as a purchased one. A `purchase` is
permanent by §4.5's argument. A `plan` grant is created when a yearly
subscription activates — and when that subscription later lapses, the row is
**left alone rather than revoked**, for exactly the reason §4.5 gives: the
alternative breaks a public URL.

That is a deliberate giveaway. Someone can buy one year, publish a premium
portfolio, and keep the template after lapsing. It is accepted because the
defence against it is a mechanism that breaks live sites, and because a
subscriber who paid for a year is not the adversary worth designing against.
`source` is recorded so the giveaway is **measurable** rather than invisible,
which is what makes it possible to revisit with data instead of instinct.

**A separate table from `subscriptions`, deliberately.** A subscription has a
period, a status machine, dunning and a renewal; a permanent unlock has none of
those and would be four permanently-null columns pretending otherwise. Keeping
them apart is also what stops a subscription cancellation from ever being able
to touch a template unlock — they are different rows written by different
webhook events.

**`status` rather than a delete**, so a refund is auditable and a re-purchase
is an update rather than a resurrection. `revoked` blocks new selections and
publishes; it deliberately has no effect on any site already published (§4.5).

The read is one primary-key lookup and is cached with the entitlement resolve —
it is on the template picker's path, not on any render path.

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

### 6.6 Soft limits: the chat degrades, the artifacts refuse

Everything above describes a **hard** limit — rung 6 refuses and the model is
never called. That is right for most of this product, but applying it uniformly
gets one case badly wrong.

**No overage billing.** The obvious soft limit — let them exceed it and charge
for the excess — is rejected outright. On a consumer product bought by people
who are between jobs, a bill larger than the one they agreed to is a support
ticket at best and a chargeback at worst, and a chargeback against a merchant
of record costs more than the sale. Hard caps with a one-click upgrade is the
honest posture: the user always knows what they will be charged.

**But the chat degrades rather than refusing.** Running out mid-conversation is
the single worst moment this product could choose to show a paywall — the user
is mid-thought, has just asked a follow-up, and the assistant simply stops
talking. Past the `chat` allowance, the chat continues at reduced cost:
`reasoningEffort: "minimal"` and a lower `maxOutputTokens`, with a quiet note
that answers are shorter until the period resets. It still spends, it spends
much less, and the conversation survives.

The discrete artifacts — `jobMatch`, `resumeTailor`, `coverLetter`,
`profileEnhance` — refuse hard. Each is one deliberate click on something
expensive, the refusal lands _before_ the user has invested anything, and "0
cover letters left" is a sentence that makes sense at the moment it is read.

> The rule generalises: **degrade what is conversational, refuse what is
> discrete.** A user cannot be halfway through a cover letter; they are
> routinely halfway through a conversation.

**Refuse at the start of a unit of work, never inside one.** Authorization
already happens once, before the model call (§6.2), so this is free — but it
has to stay that way. Nothing may re-check quota mid-stream. A user with one
letter left who clicks generate gets a whole letter.

**Warn at 80%.** A limit discovered by being refused is a pricing lesson
delivered at the worst possible moment. §10 makes counts visible before
enforcement is switched on as a rollout tactic; this makes it permanent — the
count sits beside every AI action, and crossing 80% surfaces it. The number is
a constant in the pure root so the warning and the refusal cannot disagree.

### 6.7 Making the gate unavoidable

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

|                       | Rate limit          | Quota                   |
| --------------------- | ------------------- | ----------------------- |
| Question              | is this a runaway?  | have you paid for this? |
| Store                 | Redis (Upstash)     | Postgres                |
| Window                | 10 minutes, sliding | billing period          |
| On store failure      | **allow**           | **refuse**              |
| Applies to every plan | **yes**             | yes                     |
| Status                | 429                 | 402                     |

**Rung 4 applies to paid plans exactly as it does to free ones.** No plan is
unlimited today (§4.3), so quota bounds every account — but the burst limiter
still has to run on the highest tier, because a compromised yearly account with
800 chat turns a month can spend them in ten minutes, and the ten-minute
version is a script while the month-long version is a user. Should an unlimited
tier ever exist, rung 4 becomes the _only_ ceiling on it, which is the reason
it is written as a rule rather than an optimisation.

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

`domains/billing/server/dodo.ts` is the only file that imports the
`dodopayments` SDK or knows a Dodo URL — the same seam `lib/ai/provider.ts` is
for models. Swapping providers is editing one file and one webhook route.

#### Why Dodo's credit entitlements are not used

Dodo ships a credit system — balances attached to products, `credit.added` /
`credit.deducted` webhooks, rollover, overage, low-balance alerts. It is a good
fit for products metered on one number, and it is deliberately **not** used
here, for two reasons of different weight.

The decisive one is structural: **Dodo allows at most three credit entitlements
per product, and this product meters five features** (§4.2). The model does not
fit, and the workaround — collapsing five features into three balances — is
exactly the shared-pool design §5.3.1 explains the product is not ready for.

The second is the one that would still apply if the limit were ten: **quota
would become a provider round trip on the hot path of every AI request.** §9.5
holds that entitlement is read from our database precisely so a provider outage
cannot decide whether a paying user may work, and §2 makes the same argument
against Redis. A remote balance is a remote dependency in front of the model
call, in a different region, on a request that already has a latency problem
(doc 15 §2.6).

Dodo therefore does what it is best at — taking money and reporting what
happened — and Resfolio owns entitlement and metering. This is the same
division of labour as §8.1's first paragraph, applied to a feature that is
tempting precisely because it looks like it would save work.

### 8.2 Checkout

```ts
const session = await dodo.checkoutSessions.create({
  product_cart: [{ product_id, quantity: 1 }],
  customer: { customer_id } | { email, name },
  metadata: { userId, purchasable },
  return_url: `${APP_URL}/settings/billing?checkout=complete`,
});
// → session.checkout_url
```

1. **`startCheckoutAction(purchasable)`** — a Server Action, session-resolved.
   A `purchasable` is one of three shapes, and the catalogue knows which are
   recurring:
   - `{ kind: "subscription", planId: "monthly" | "yearly" }` → recurring
   - `{ kind: "pass", planId: "weekly" }` → **one-time payment** (§4.1)
   - `{ kind: "product", product: PremiumProduct }` → **one-time payment**
     (§4.5)
2. The server resolves the Dodo `product_id` from `PLAN_PRICING`.
   **The client sends a plan or a product _name_ from a closed set — never a
   price, never a Dodo product id.** A client-supplied product id is a
   client-supplied price.
3. Creates or reuses the Dodo customer (`provider_customer_id` on our row; on
   first purchase we have none, so `customer: { email, name }` is sent and the
   id is captured from the webhook).
4. **`metadata.userId` is set on every session**, and it is the only thing that
   links a first-time payment back to an account — see §8.3 rule 5.
5. Redirect to `session.checkout_url`.

**The return URL is optimistic and says so.** Dodo appends `status=success` and
a session id, and **neither is proof of anything** — it is a browser navigation,
and a browser navigation is forgeable and also frequently _early_: the webhook
may not have landed. The settings page reads our own subscription row and, if
it still says free, renders "activating — this usually takes a few seconds"
rather than either lying about the plan or showing the user the tier they just
paid to leave. Entitlement changes on the webhook, never on the redirect.

### 8.2.1 The customer portal

`dodo.customers.createPortalSession({ customer_id, return_url })` returns a URL
where a subscriber can update their payment method, view invoices and cancel.

**This is deliberately the whole of subscription self-service** — there is no
in-app cancel flow, no payment-method form, and no invoice list. Every one of
those is a surface that handles money, has to be kept in sync with the
provider, and would need its own PCI story; the portal is maintained by the
party whose job that is. `/settings/billing` links to it and otherwise reports
state.

Note it is unavailable to a user who has only ever bought a one-time product
and has no `provider_customer_id` yet — the link is conditioned on that column,
not on plan.

### 8.3 Webhooks

`POST /api/billing/webhook` — a route handler, not an action, because the caller
is not our React app (doc 06's stated exception).

Dodo signs with **Standard Webhooks** headers:

```http
webhook-id:        evt_xxxxx
webhook-signature: v1,<base64>
webhook-timestamp: 1234567890      ← Unix seconds
```

> **Use the `standardwebhooks` package to verify. Do not hand-roll the HMAC.**
>
> This is not fastidiousness. The Dodo integration skills bundled in `.claude`
> show a hand-written verifier that signs `${timestamp}.${payload}`, while the
> Standard Webhooks specification those same skills link to signs
> `${webhook-id}.${timestamp}.${payload}`. **One of those produces a signature
> that never matches**, and the failure mode is every webhook 401ing in
> production while working perfectly against hand-made test payloads — which
> means subscriptions silently never activate after someone has paid.
>
> The sample also calls `crypto.timingSafeEqual` on two buffers without
> comparing lengths first, which **throws `RangeError`** rather than returning
> false when a malformed signature arrives — turning a rejected request into a
> 500, and a 500 into a provider retry loop.
>
> The official library is maintained against the spec by the party that
> defines it. Use it, and treat the skill samples as illustrative of the
> _shape_ rather than the bytes.

The security requirements are not optional and are listed in the order they must
execute:

1. **Verify the signature over the raw body.** `await request.text()` before any
   JSON parsing; a framework that re-serialises changes the bytes and every
   signature fails. Reject with 401 and no detail.
2. **Reject stale timestamps** (> 5 minutes) — replay defence. The library does
   this given the timestamp header; do not skip passing it.
3. **Idempotency on `webhook-id`.** It is stored as a unique column
   (`provider_event_id`); a duplicate is a 200 and no work. Dodo retries, and a
   second `subscription.active` must not grant a second period.
4. **Ordering.** Events arrive out of order. Every write carries the event's own
   `timestamp` and is applied only if it is **newer than the row's
   `updated_at`** — otherwise a delayed `active` overwrites a `cancelled` that
   arrived first, and a cancelled user has a live plan.
5. **Never trust `metadata.userId` on an event that could have been replayed
   into an existing customer.** Resolve `customer.customer_id` →
   `provider_customer_id` → our row; use `metadata.userId` **only** to create
   that link on a first purchase, when no mapping exists yet.
6. **Respond 200 fast, do the work in one transaction, and never 500 on a
   business rule.** A 500 makes Dodo retry a message that will never succeed. A
   payload we do not recognise is a 200 and a log line.

**Subscription events** (Dodo's real names — an earlier draft of this section
guessed some of them wrong):

| Event                       | What we do                                                                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `subscription.active`       | set `plan_id`, `status: active`, period window from `next_billing_date`; capture `provider_customer_id`; grant §5.4 rows on yearly |
| `subscription.renewed`      | advance `period_start` / `period_end`; counters roll implicitly                                                                    |
| `subscription.plan_changed` | new `plan_id` + new period window (§8.4)                                                                                           |
| `subscription.on_hold`      | `status: on_hold` — entitlement **retained** through grace (§8.5)                                                                  |
| `subscription.cancelled`    | `cancel_at_period_end` from `cancel_at_next_billing_date`; access runs to `next_billing_date`                                      |
| `subscription.expired`      | → `free`                                                                                                                           |
| `subscription.failed`       | mandate never established — leave the row on `free`, no access ever granted                                                        |
| `refund.succeeded`          | → `free` immediately; flag the account                                                                                             |
| `dispute.opened`            | → `free` immediately; flag the account                                                                                             |

`payment.succeeded` and `payment.failed` are **recorded, not acted on**, for
subscriptions: the subscription events above are the authoritative signal, and
acting on both is how a renewal gets processed twice. For **one-time**
purchases, `payment.succeeded` is the only signal there is — see below.

**One-time payments** arrive as `payment.succeeded` with no subscription
attached, so they are resolved by the **`product_id` on the payment** mapped
back through `PLAN_PRICING`:

- a **week pass** → upsert the `subscriptions` row: `plan_id: "weekly"`,
  `period_end = max(now, existing period_end) + 7 days` (§4.1 — a second pass
  extends rather than opening a second row). No `provider_subscription_id` is
  written; there is nothing to renew.
- **premium resume or portfolio templates** → insert `product_entitlements`
  with `source: "purchase"` and `provider_payment_id` as the idempotency key
  (§5.4).
- **`refund.succeeded` / `dispute.opened` on either** → the pass is revoked
  outright (it is consumable, and there is no public URL behind it); the
  template entitlement moves to `revoked`, and **published sites keep
  rendering** (§4.5).

That last line is the one place the two product kinds behave differently under
the same event, and it is why they are two tables rather than one with a
`kind` column.

### 8.4 Downgrade is the case everyone gets wrong

A user on `monthly` who has used 45 job matches downgrades to `free`, whose
allowance is 10. Their counter says 45.

**Nothing is clawed back and nothing is reset.** The counter is a fact about a
period, and the entitlement is evaluated against it: `45 >= 10`, so they are out
until the next period. That is the correct outcome and it needs no special
handling — which is exactly why "used" and "allowed" are separate values rather
than a single "remaining" that would have gone negative.

The corollary: **upgrading mid-period must move the period boundary**, because
Dodo issues a new period on `subscription.plan_changed`. `period_start` changes,
the counter's primary key changes, counters start at zero. The upgraded user
gets the full new allowance immediately, which is what they just paid for.

**A week pass bought by an existing subscriber is not an upgrade** and must not
reset anything — it extends `period_end` on a row whose `plan_id` is already
higher. The checkout action refuses to sell a pass to an active monthly or
yearly subscriber for that reason: it is strictly worse than what they have,
and the only thing it could do is confuse the period boundary.

### 8.5 Grace, and what `on_hold` means

A failed renewal does **not** revoke entitlement on the spot. Card failures are
overwhelmingly banks, not fraud, and cutting off a paying user mid-application is
a support ticket and a churn event over a retry that would have succeeded.
`on_hold` keeps the paid entitlement for a **72-hour grace window**, shows a
persistent banner with a link to the customer portal (§8.2.1), and falls to
`free` after. The window is a constant in the pure root, so the banner copy and
the enforcement read the same number.

**Grace is a function of `resolveEntitlement`, not a scheduled job.** There is
nothing to run at hour 73: the resolver compares `now` against the time the
status changed and returns the free entitlement once the window has passed.
A cron that downgrades accounts is a cron that can fail to run, and the failure
mode is paying-tier access granted indefinitely for free.

**This is more forgiving in India than the 72 hours suggests**, and
deliberately so: recurring-mandate failures on UPI and RuPay are common and
frequently transient — a mandate paused by the issuing bank, a device
re-registration — rather than a signal of intent to leave. The window is a
constant precisely so it can be raised once there is real dunning data.

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
- **Shared paid account.** The `yearly` plan's throughput ceiling (§7) is what
  bounds this. Seat enforcement is deliberately **not** built: it costs real
  product complexity to defend against a behaviour that has not been observed.
- **Prompt-driven cost inflation** — a pasted "posting" engineered to maximise
  reasoning tokens. Bounded by `MAX_JD_CHARS`, `MAX_CHARS_PER_MESSAGE`, and the
  output ceilings in `limits.ts`. This is why those ceilings are billing
  controls and not validation, and why raising one is a pricing decision.
- **The refund path as a credit mint.** The only way to gain credits is a
  reservation transitioning to `error`/`aborted` exactly once. Idempotent on the
  reservation id.
- **Buy a template, publish, refund.** Accepted, knowingly. §4.5 grandfathers
  published sites through a revocation, so this attack yields one template on
  one site per verified payment method, and the defence against it would be a
  mechanism that breaks public URLs — costing far more in legitimate trust than
  it saves in fraud. Chargebacks flag the account, which is what stops it being
  repeatable.
- **Pass stacking.** Buying several week passes to accumulate allowance does
  not work: a pass extends `period_end` (§4.1) but the quota period is capped
  at seven days and re-anchors, so allowance accrues with time rather than with
  purchases.

### 9.4 API protection

- Every AI route and action already resolves the session itself (doc 10's
  three-layer guarding). Quota is _inside_ that, never in front of it.
- **The webhook is the one unauthenticated write in the system**, so it is the
  one that gets signature verification over raw bytes, timestamp rejection,
  idempotency, and monotonic ordering (§8.3). Everything it may write is a
  `subscriptions` or `product_entitlements` row; it cannot touch a counter, a
  profile, or a document. **It must never be able to increase an allowance
  directly** — it sets a plan, and the plan implies the allowance through the
  pure catalogue.
- **A spend ceiling at the AI Gateway is the real backstop, and it is not
  optional.** Everything above is code that has yet to be written, and a quota
  system is exactly the kind of code whose bugs are discovered by their cost. A
  hard monthly limit configured at the gateway cannot be bypassed by a defect
  in `authorizeAiSpend`, a missing call site, or a migration that dropped a
  constraint. It fails the whole feature closed rather than billing without
  bound, which is the correct failure for a product where the alternative is an
  invoice. Set it above expected spend and alert well below it.
- **Kill switches stay.** `AI_ENABLED=false` refuses at rung 2. A billing system
  is a new way to be wrong about money, and the lever that stops all spend must
  remain in front of it.
- **No client-supplied prices, product ids, plan limits or periods.** The client
  sends a plan, an interval, or a product _name_ from a closed set (§8.2), and
  that is the whole surface.
- Env: a `billing` slice in `@resfolio/env`, using the SDK's own variable names
  so there is no second vocabulary to keep straight —
  `DODO_PAYMENTS_API_KEY`, `DODO_PAYMENTS_WEBHOOK_SECRET`,
  `DODO_PAYMENTS_ENVIRONMENT` (`live_mode | test_mode`). All optional, so a
  dev or CI environment without them still builds and runs, exactly like the
  R2 and Upstash slices.
  **The webhook route refuses with 503 when the secret is absent**, rather than
  skipping verification. Optional configuration must never mean optional
  verification — a route that no-ops its signature check when unconfigured is
  an unauthenticated write endpoint one misapplied env var away.
  **`BILLING_ENFORCED=false` is the kill switch**, the same shape as
  `AI_ENABLED` and `PDF_EXPORT_ENABLED`: quota is still metered and still
  displayed, but rung 6 never refuses. It is what makes §11 steps 3–4
  deployable, and what turns a bad limits table into a config change rather
  than a rollback.

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
- **The one thing that does not scale is underneath all of it.** This design
  adds a Postgres write to the hot path of every AI request, and the connection
  pool as currently configured cannot support that under concurrency — see
  [15](15-production-readiness.md) §2.1. Quota is fail-closed (§7), so
  exhausting connections does not overcharge anyone; it refuses everyone. The
  pooling fix is a prerequisite for step 2 of §11, not a follow-up to it.

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

0. **Fix the connection pool** ([15](15-production-readiness.md) §2.1). Not
   part of billing, and a prerequisite for it: every step from 2 onward adds
   database work to the AI request path, and the pool as configured today
   cannot carry it.
1. **`@resfolio/billing` pure root.** Types, catalogue, `resolveEntitlement`,
   `periodStartFor` (including §5.2's clamping and anchoring rules), schemas.
   All tests, no I/O, nothing wired.
2. **Tables + migration `0017`.** (`0016` is taken by `@resfolio/job`.) All six
   at once, so step 3 needs no second migration. Backfill free rows — and
   **seed no counters**: usage spent before the deploy was free when it was
   spent. Nothing reads any of it yet.
3. **Meter only.** `recordAiSpend` behind every model call; `authorizeAiSpend`
   returns "allowed" unconditionally. Now there is real data about what a user
   actually costs — which is what should set the prices in §4.3 and §12, rather
   than the other way round.

   **Done 2026-07-30, and three things about it were decided in the doing:**
   - **`apps/dashboard/lib/ai/billing.ts` is the app's seam**, not six call
     sites each calling the domain. It owns one refusal shape, one sentence, and
     one answer to "what if the counter write fails" — six call sites would each
     have invented their own and they would not all have picked the same one.
   - **The gate fails _open_ while metering and _closed_ while enforcing**, and
     that is what makes this step deployable before `0017` is applied. Nobody is
     being refused yet, so a missing table is an accounting gap rather than a
     reason to break a working feature; once enforcement is on, a quota you
     cannot read is not one you can enforce, and the same code path refuses. One
     flag flips both, so the switch that turns enforcement on is also the switch
     that closes the hole.
   - **The `jobMatch` half of a tool-calling turn asks through a callback the
     route supplies.** `TOOL_CALLING_SPENDS_BOTH` requires the tool to spend, but
     `lib/ai/tools.ts`' rule is that a tool validates and returns — no I/O — and
     a counter is a write. So `AiToolContext.authorizeJobMatch` is a closure
     owned by the route, and the tool learns only yes or no. A refusal is a
     `quota-exhausted` tool _result_ rather than a throw, so the assistant can
     say what ran out in the same breath as the request that hit it. Metering it
     post-hoc in `onFinish` was the alternative and it is a hole: a post-hoc
     increment can push `used` past `allowed`.

   **A sixth feature arrived with it**: `resumeIntake` (doc 16). The catalogue's
   typing is what surfaced it — `PLAN_LIMITS` is a total `Record`, so the new
   member did not compile until every plan had a number. It is the one row that
   deliberately barely scales with the tier (3/3/5/5), because a resume import is
   a once-per-account operation rather than a recurring workflow.

4. **Surface it.** The `/settings/ai-usage` screen (§13) and a counter beside
   each AI action. Still no refusals — this step is what stops a limit being
   discovered by being refused.

   **The screen is done 2026-07-30**; the inline counters beside each AI action
   are not. Two things the screen decided:
   - **It says so on the page while `BILLING_ENFORCED=false`.** Bars that look
     like ceilings over a product that refuses nothing teach a rule we are not
     applying, and then surprise the user twice — once when they believe it, and
     again when it becomes true.
   - **There is no Upgrade button**, because checkout is step 6 and does not
     exist. A button that opens nothing is worse than a sentence saying where
     things stand.

   Settings also gained its **first sub-navigation** (`SettingsNav`), because it
   is now the first section with two pages and the sidebar deliberately carries
   one row for the whole section. `/settings/ai-usage` is also
   `PALETTE_EXTRA_ITEMS`' first real entry — a destination people look for by
   name that does not earn a permanent row.

5. **Enforce.** Turn on the `WHERE used < allowance`. Add the 402 path, the
   upgrade prompt, the soft-limit behaviour (§6.6) and the consolidated ladder
   (§6.5).
6. **Dodo — one-time products first.** Premium templates (§4.5) and the week
   pass (§4.1) are one-time payments with no renewal, no dunning, no proration
   and no `on_hold`; they exercise checkout, the webhook, signature
   verification and idempotency against the simplest possible state machine.
   Recurring subscriptions land after, on plumbing that has already handled
   real money.
7. **Recurring plans.** Monthly and yearly, the portal link, grace handling
   (§8.5), the downgrade and upgrade paths (§8.4).
8. **Harden.** Reconcile job, abuse alerting, retention/pruning, the gateway
   spend ceiling (§9.4).

Steps 1–5 deliver a scalable architecture for AI limits and are independent of
the payment provider. If Dodo is replaced, nothing above step 6 changes.

**Step 6 before step 7 is the deliberate part.** The instinct is to build
subscriptions first because they are the main product; the argument against it
is that a subscription is the hardest thing in this document to get right and
the one-time products are the easiest, so building them in that order means
learning the provider's webhook semantics on a product where a bug costs a
single unlock rather than a recurring charge on a live customer.

---

## 12. Packaging

§1 says this document does not decide prices, and it still doesn't — prices are
a business input and belong with the payment provider. What it decides here is
the **shape** of the catalogue and the **relationships between the numbers**,
because those are structural: they determine which rows exist, which are
recurring, and what the entitlement resolver has to answer.

### 12.1 The six things that can be bought

| Product                         | Kind            | What it is for                              |
| ------------------------------- | --------------- | ------------------------------------------- |
| **Free**                        | —               | Reaching the aha at zero cost               |
| **Week Pass**                   | One-time (§4.1) | An active job hunt, right now               |
| **Monthly**                     | Recurring       | A hunt that is going to take a while        |
| **Yearly**                      | Recurring       | Keeping the career record and the site live |
| **Premium Resume Templates**    | One-time (§4.5) | Permanent; included in Yearly               |
| **Premium Portfolio Templates** | One-time (§4.5) | Permanent; included in Yearly               |

### 12.2 India first, global-ready

The primary market is **India**, and the architecture must not have to change
when that widens. Those two requirements pull in opposite directions if pricing
is treated as a single number, and in the same direction if it is treated as a
table.

**The catalogue is keyed by currency, and nothing downstream knows about it:**

```ts
// One Dodo product id per (plan × currency). The enforcement path never
// reads this table — it exists to answer "what do we charge" and
// "which product id does checkout send".
PLAN_PRICING: Record<PlanId | PremiumProduct, Record<Currency, PriceRef>>;
```

Three properties this buys, each of which is expensive to retrofit:

- **`PLAN_LIMITS` is not keyed by currency.** An Indian monthly subscriber and
  an American one get the same allowances. Pricing varies; entitlement does
  not. Doing it the other way makes "which plan am I on" a question with a
  geographic answer, and every usage screen and support conversation inherits
  that.
- **`PlanId` is currency-independent**, so the `subscriptions` row, the
  counters, the resolver and the whole gate never learn where anyone lives.
  Adding a currency is a row in one table and a product in the Dodo dashboard.
- **Dodo is a merchant of record**, which is what makes this tractable at all:
  it handles GST registration and remittance for Indian sales and VAT/sales tax
  everywhere else. That is the single largest reason to use an MoR over a
  payment gateway for this product, and it is worth more than the transaction
  fee difference — an Indian entity selling software to EU consumers without
  one has a compliance problem long before it has a scale problem.

**Price levels are set per currency, not converted.** ₹ pricing is set against
what Indian consumers pay for comparable software, and $ pricing against what
US consumers do; a spot-rate conversion of one into the other produces a number
that is wrong in both markets. The ratios in §12.3 hold **within** a currency.

**UPI is the payment method that matters**, and it has a consequence for §4.1
rather than only for the checkout page: one-time UPI payments are frictionless
and near-universal, while **recurring UPI mandates are a real drop-off point** —
they need explicit mandate authorisation, and banks pause them. That asymmetry
is an argument the week pass was already the right lead product for this market,
and it is why §8.5's grace window is generous.

### 12.3 The relationships that must hold

**A week pass costs 40–50% of a month.** Below that, four passes are cheaper
than a month and nobody subscribes; far above it, the pass stops being an
attractive answer to "I just need this for a fortnight" and the segment it
exists for buys nothing at all. At the midpoint, a month bought as passes runs
roughly double the monthly plan — a real convenience premium, with heavy users
self-selecting into the subscription.

**Yearly is roughly ten months of monthly, and it includes both template
unlocks.** The discount alone is a weak lever on a product a job seeker expects
to use for three months. Bundling the unlocks costs nothing marginal, makes
yearly visibly the best deal without discounting AI further, and is the only
place in the catalogue where products reinforce each other.

**Each template unlock is priced as a one-off purchase, not as a fraction of a
subscription** — comparable to what a good template costs elsewhere. They are
the products bought by people who will never subscribe, and they are the only
revenue from a user who wants a portfolio and no AI at all.

**The free tier is tight on AI and generous on everything else.** Profile,
editing, one resume, a published portfolio on a free template and the blog cost
essentially nothing to serve and are the retention hook; the AI allowance is
the part that costs money per use. §4.3's free row is calibrated to let a user
reach the product's actual aha — paste a posting, see a match score, optimise,
see it move — **twice**. Once is a demo; twice is a habit.

### 12.4 What each plan is sold on

Worth stating because it is not obvious from the limits table, and it changes
the copy rather than the code:

- **Week Pass and Monthly** are sold on the AI: match, optimise, tailor, write.
  The buyer is mid-hunt and the value is measured in applications sent.
- **Yearly is not sold on the AI.** Nobody needs a year of cover letters. Its
  buyer wants the portfolio to stay up, the custom domain to keep resolving,
  and the profile to remain the durable record it claims to be — which is the
  Career OS positioning in the root `CLAUDE.md` rather than a resume tool's.
  Selling yearly on credits invites the obvious objection that the hunt will be
  over in three months.

### 12.5 The consequence to accept

A job hunt is six to twelve weeks. If the week pass is good, most users will
buy two or three and never subscribe. At the ratio in §12.3 that is
approximately 1.5 months of revenue per hunt, which is sound on unit economics
and **poor on predictability** — revenue tracks hiring seasons rather than
accruing as MRR. That is the correct trade for this product and this buyer, but
it should be a known one rather than a surprise on the first quarterly chart.

---

## 13. The usage screen — Settings → AI Usage

The one surface a user has for all of this, and the place the whole design
either reads as fair or reads as a paywall. `/settings/ai-usage`, a Server
Component reading `@resfolio/billing/server` — no client fetch, because the
numbers are known at render and a usage meter that arrives after the page is a
usage meter that flashes "0 of 20".

```
Monthly plan · renews 12 August                          [ Manage billing ]

  General chat            ████████░░░░░░░░░░░░    142 / 400
  Job analysis            ██████████████░░░░░░     41 / 60
  Profile enhancements    ███░░░░░░░░░░░░░░░░░      9 / 60
  Resume tailoring        ████████████████████     50 / 50   Limit reached
  Cover letters           ██████░░░░░░░░░░░░░░     12 / 40

  Resets in 9 days · 12 August                          [ Upgrade plan ]
```

**Everything on it comes from one server call**, `getUsageSummary(userId)`,
which resolves the entitlement and reads the counters for the current period in
a single round trip (doc 15 §2.6 — round trips to Singapore are the latency
budget here, and a five-feature screen must not be five queries).

Rules that are not cosmetic:

- **Show the whole plan, not only what is spent.** Every feature is listed even
  at zero, because the list is also how a user learns the product has a
  tailoring feature at all. A screen that renders only what has been used is a
  screen that hides features from the people most likely to try them.
- **`used / allowed`, never "remaining".** §8.4's downgrade case produces
  `45 / 10`, which is a true and comprehensible sentence; the same state as
  "-35 remaining" is neither. This is the same reason the two values are stored
  separately rather than as one decrementing number.
- **The reset date is a date, not a duration alone.** "Resets in 9 days" is
  what a person wants at a glance and "12 August" is what they need to plan
  around; the screen shows both, and it is the **quota** period boundary
  (§5.2), which on a yearly plan is _not_ the renewal date. Those two dates
  differing is exactly the confusion this screen exists to prevent, so it
  labels them distinctly and never shows only one.
- **The Upgrade button appears when any feature is at or near its limit**, not
  permanently. A perpetual upgrade button is furniture and stops being read;
  one that appears when a bar fills is information.
- **A user already on `yearly` sees no Upgrade button** — there is nowhere to
  go, and offering one is how a paying customer discovers you are not tracking
  what they bought.
- **The bar at 100% says "Limit reached" in words.** A full bar is ambiguous
  between "done" and "at the cap", and colour alone cannot carry it (doc 08).

The same summary feeds the **inline counters** beside each AI action (§11 step 4) and the 402 refusal copy, so all three read from one function and cannot
disagree about a number the user is looking at in two places.

---

## 14. Open questions

1. **Absolute price levels in ₹.** The ratios in §12.3 hold at any level; the
   level itself is a business input. Step 3 of §11 produces the cost data that
   should set it — and note that the free tier's ceiling (§4.3) is the number
   most worth revisiting once real usage exists.
2. **Which second currency, and when.** §12.2 makes adding one a table row, so
   this is a go-to-market question rather than an architectural one. It should
   still be answered before the first priced release, because retrofitting
   regional pricing onto existing subscribers means either grandfathering them
   or raising their price.
3. **Where the chat's degraded mode bottoms out** (§6.6). Reduced reasoning and
   a lower output ceiling still cost something per turn, so an abandoned tab
   with a scripted client is still spending. Proposed: degradation applies for
   a bounded multiple of the allowance, then refuses like everything else.
   Needs a number, and step 3's data is what should set it.
4. **Whether the yearly plan's template grant should convert on lapse.** §5.4
   accepts the giveaway and records `source` so it can be measured. Revisit
   with data, not instinct.
5. **Team/seat plans.** Out of scope. Recorded here so it is not improvised.

### Resolved

- **Does a chat turn that calls a tool spend twice?** **Yes.** The turn spends
  `chat`, the tool spends its own feature. It is what actually costs money and
  it is explicable to a user, provided the UI shows both decrements — a single
  message silently costing two credits reads as a bug. The alternative makes
  the chat the cheapest route to every expensive feature in the product.
- **Annual plans and the period boundary.** Resolved in §5.2: allowances accrue
  **monthly** regardless of interval, anchored on the subscription date rather
  than the calendar, with the quota period capped at `min(interval, 1 month)`.
  `interval` sets price and renewal cadence only. The original §5.2 text said
  the opposite and has been corrected.
- **Whether premium templates should be subscription-gated.** No — one-time and
  permanent (§4.5). Anything that renders at a URL a stranger may hold cannot
  have its entitlement revoked without breaking that URL.
- **One template product or two.** **Two** — resume and portfolio unlock
  independently (§4.5). This reverses an earlier recommendation in this
  document for a single combined unlock; the decisive argument is that the two
  have different buyers on different timelines, so bundling prices the larger
  and more urgent segment for something they did not come for.
- **Whether `PlanId` and `BillingInterval` stay independent.** No — the decided
  product gives yearly a larger monthly allowance than monthly, so the four
  products are four entitlement levels (§4.1). `BillingInterval` survives as a
  display and renewal fact only.
- **Whether to use Dodo's credit entitlements instead of our own ledger.** No
  (§8.1). Dodo caps credit entitlements at three per product and this product
  meters five features; and it would put a provider round trip on the hot path
  of every AI request, which §9.5 exists to prevent.
- **Target market.** India first, global-ready — resolved into §12.2 as a
  currency-keyed price catalogue over a currency-independent entitlement.
