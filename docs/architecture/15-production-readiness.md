# 15 — Production Readiness & Scale

**Status:** Proposed — no code written. Infrastructure confirmed 2026-07-29:
**Vercel (Mumbai) · Neon Postgres (Singapore) · Upstash Redis (Mumbai) ·
Fly (Singapore, PDF) · Vercel AI Gateway.**
**Depends on:** [04](04-deployment.md), [07](07-storage.md),
[11](11-engineering-foundation.md), [13](13-ai-layer.md).
**Constrains:** the pre-launch checklist; the managed-host choice deferred in
[07](07-storage.md); the implementation order in
[14](14-ai-usage-and-billing.md) §11.

---

## Problem Statement

Docs 01–14 decide what the product is. None of them decides whether it
survives its own launch.

That is not an oversight — every one of those documents is about a correctness
property, and each is right on its own terms. But correctness properties are
verified against a single request, and the failures below only appear under
concurrency. The architecture is genuinely simple (Vercel, one Postgres,
Upstash, R2, one Fly machine, models behind the AI Gateway), and that simplicity
is why there are only a handful of findings. It is also why the findings that
do exist are load-bearing: there is no redundancy anywhere to absorb them.

This document is a review of the deployed system as it stands on
2026-07-29, before the first paying user. Each finding names the mechanism, the
symptom it produces, and the fix. They are ordered by what they cost if
ignored, not by effort.

One thing this review deliberately does **not** do is add infrastructure.
Every recommendation is a configuration change, a sizing change, or an alert.
Nothing here proposes a queue, a cache layer, a second region or a service —
the traffic does not justify any of them, and a launch checklist that requires
new moving parts is a launch that slips.

---

## Proposed Architecture

### 1. Severity summary

| #   | Finding                                   | Severity   | Symptom if ignored                           |
| --- | ----------------------------------------- | ---------- | -------------------------------------------- |
| 2.1 | Postgres connection pool sizing           | 🔴 Critic. | Product-wide outage under modest concurrency |
| 2.2 | Serverless compute model for AI streams   | 🟠 High    | Bill scales with concurrency; 60s ceiling    |
| 2.3 | PDF service sizing and cold start         | 🟠 High    | OOM mid-render; slow first export            |
| 2.4 | AI Gateway used only as a credential      | 🟠 High    | No backstop on spend; stale cost data        |
| 2.5 | No anomalous-spend alerting               | 🟡 Med.    | The bill is the alert                        |
| 2.6 | Postgres in a different region to compute | 🟡 Med.    | 40–60ms per query, multiplied by query count |
| 2.7 | Migrations against a live deployment      | 🟡 Med.    | Brief errors on deploy                       |

---

### 2.1 🔴 The Postgres connection pool will exhaust under concurrency

**This is the one finding that takes the whole product down**, and it should be
fixed before anything in doc 14 is built.

`packages/database/src/client.ts` creates the pool with no sizing:

```ts
const pool =
  globalForDb.resfolioPgPool ??
  new Pool({ connectionString: env.DATABASE_URL });
```

`pg` defaults to **`max: 10`**. On Vercel, each concurrent serverless instance
is a separate Node process with its own module registry, so each holds its own
pool of up to ten connections. The `globalThis` cache is explicitly disabled in
production (correctly — it exists for dev HMR), and would not help anyway: it
is per-process.

The arithmetic is unforgiving. Twenty concurrent AI requests can mean twenty
instances, each opening up to ten connections — **200 connections** against a
managed Postgres that permits 60–200 in total, most of which is on the lower
half of that range at the tiers this product will start on.

Three things make the symptom worse than the cause:

- **It presents as a product-wide outage, not as an AI problem.** Connections
  are a shared resource, so the profile editor, the sign-in flow and the
  portfolio renderer all start failing at the same time as the feature that
  exhausted them. Nothing in the error points at the cause.
- **A serverless function handles one request at a time.** Nine of those ten
  connections are idle by construction. The pool is not sized wrong by a small
  factor; it is sized for a model of concurrency that does not apply here.
- **Doc 14 makes it worse.** Quota is a Postgres write on the hot path of every
  AI request, and it is fail-closed by design (doc 14 §7). Exhaustion therefore
  refuses every AI request rather than allowing them through unmetered — the
  safe direction for the invoice, the worst direction for the user.

`packages/database/CLAUDE.md` already records this as deferred: _"Serverless
sizing (pool max / a pooled connection string) is tied to the managed-host
choice (doc 07 open question) — revisit when the host is picked, before query
volume grows."_ The host is picked, and this is that revisit.

**The host is Neon**, which settles the open question this finding was waiting
on and makes the fix concrete.

**The fix is two changes, and both are needed:**

1. **`max: 1`** (2 at most) per instance. One request per process means one
   connection; the rest are idle sockets held against a global cap.
2. **Use Neon's pooled endpoint** — the host with `-pooler` in it, which is
   PgBouncer in transaction mode run by Neon — so that N function instances
   multiplex onto a bounded set of real backend connections. This is the part
   that actually solves it; `max: 1` alone just moves the ceiling.

```
DATABASE_URL         → ...-pooler.<region>.aws.neon.tech/...   ← runtime
DATABASE_URL_DIRECT  → ...........<region>.aws.neon.tech/...   ← migrations
```

**Two variables, and both are needed.** Migrations must run against the
**direct** endpoint: transaction-mode pooling cannot carry the session-level
locks and multi-statement DDL a migration performs. Drizzle Kit therefore reads
`DATABASE_URL_DIRECT` while the app reads `DATABASE_URL`, and the split is
worth writing into the `billing` env slice work rather than discovering when
migration `0017` fails in CI.

**The constraint transaction-mode pooling imposes** is that a connection is not
stable across statements: no session state, no `SET`, no `LISTEN`, and no
server-side prepared statements. Drizzle's `node-postgres` driver is compatible,
and the repository has no session-state usage to unwind — but this is a property
to preserve deliberately rather than rediscover.

**Neon-specific things worth knowing before launch:**

- **Scale-to-zero cold starts.** A Neon compute that has been idle suspends,
  and the next query pays a resume of a few hundred milliseconds. On a
  low-traffic product that is _most_ first requests after a quiet period —
  including, unavoidably, the first page load of a demo. Either disable
  suspend on the production branch or accept it knowingly; it is frequently
  misdiagnosed as a slow application.
- **Neon's HTTP driver is not needed here.** It sidesteps pooling for one-shot
  queries, but it cannot do transactions the way doc 14 §6.3's counter upsert and
  event insert require, and the pooled endpoint already solves the problem.
  Not worth the driver swap.

---

### 2.2 🟠 AI streams hold a full serverless instance while doing nothing

Every AI route holds a function invocation open for the life of the stream —
up to `maxDuration = 60`. For almost all of that time the function is **idle**,
waiting on tokens from the provider. It is doing no CPU work; it is holding a
socket.

Under the standard serverless model that is one billed instance per in-flight
conversation, and the cost scales linearly with concurrent users rather than
with work performed. It is the single largest avoidable line item this
architecture has, and the shape of the workload — I/O-bound, long-lived, low
CPU — is precisely the case **Fluid Compute** exists for: concurrent
invocations are multiplexed onto one instance, so an idle stream costs almost
nothing.

Enabling it is a configuration change with no code impact. It should be on
before launch.

It also relieves a second problem. **`maxDuration = 60` is already tight**, and
doc 13 documents why: the job analysis was measured at 22.6 seconds to first
chunk before `reasoningEffort` was tuned down, and `tailorResumeAction` runs
twenty-odd seconds with **no stream at all**. The margin on the non-streaming
actions is not large, and when it is exceeded the platform kills the function
mid-flight — which doc 13 records as producing a permanently blank panel,
indistinguishable from a model refusal. Fluid Compute raises the ceiling well
past 60s, converting a hard failure into a slow success.

Note the interaction with §2.1: multiplexing more concurrent requests onto one
instance means one pool serving more concurrent queries. `max: 1` is correct
for the one-request-per-process model and must be revisited — to a small number
rather than back to ten — if Fluid Compute is enabled. **Do §2.1 and §2.2
together, and size the pool for the compute model actually in use.**

---

### 2.3 🟠 The PDF service is one small machine that stops

`services/pdf/fly.toml`:

```toml
auto_stop_machines = 'stop'
min_machines_running = 0
[[vm]]
  size = 'shared-cpu-1x'
  memory = '1gb'
```

Two distinct problems.

**Memory.** Chromium rendering a page routinely uses 500MB–1GB on its own,
before the Node process around it. At 1GB total, a single render is close to
the ceiling and **two concurrent renders will OOM** — and an OOM on Fly restarts
the machine, so the second request does not merely fail, it kills the first.
Resume export is exactly the feature people retry when it fails, which turns
one OOM into a loop. Raise to **2GB** and set an explicit HTTP concurrency
limit low enough that requests queue instead of racing.

**Cold start.** `min_machines_running = 0` with `auto_stop_machines` means the
first export after an idle period pays machine boot _plus_ Chromium boot. The
dashboard already handles this better than most — doc 08 records that the
client fetches the blob so there is a real in-flight state and click
suppression, precisely because the export takes seconds — so this is a latency
problem rather than a correctness one. It is worth `min_machines_running = 1`
only if first-export latency matters more than the idle cost of one small
machine; both are defensible and it is a cost decision, not a
correctness one.

Note the region is `sin` while the rest of the system's region is a separate
choice — see §2.6. A resume PDF is a single request with a large payload, so
locality matters much less here than for Redis, but the two should be decided
together.

---

### 2.4 🟠 The AI Gateway is doing one job out of three

`lib/ai/provider.ts` uses the gateway as a credential and nothing else. That is
already worth having — one key, one place spend is visible, provider changes
become env changes — but two of its capabilities are load-bearing for doc 14
and unused.

**A gateway-level spend ceiling is the only backstop that survives a bug in the
quota system.** Everything doc 14 specifies is code that has not been written
yet, and the failure mode of a quota bug is not a wrong number on a screen, it
is an invoice. An application-level limit cannot defend against a missing call
site, a mis-resolved entitlement, or a migration that dropped a constraint; a
hard ceiling at the gateway defends against all three because it is enforced
outside the code that is wrong. Set it above expected spend, alert well below
it, and treat it as a fuse rather than a limit.

**Cost data should come from the gateway, not from a table in our code.** Doc
14's ledger stores `cost_micros` per event, and it is the authority for what a
user costs and therefore for whether the prices are right. Model prices change
without notice, and a hardcoded price table does not fail when they do — it
silently misprices every row written after the change, which corrupts the exact
dataset the pricing decision depends on. Read the gateway's reported cost where
it is available and record which source was used.

Provider failover is the third capability and is genuinely optional. It is
cheap to add later precisely because `provider.ts` is already the only file in
the repository naming a vendor.

---

### 2.5 🟡 Nothing watches spend

Doc 13 logs token counts per completion and doc 14 adds a queryable ledger.
Neither watches anything: there is no threshold, no alert, and no automated
response. In practice that means **the monthly invoice is the monitoring
system**, with up to a month of latency.

The rate limiter bounds a single user's burst but not their sustained spend —
20 chat turns per 10 minutes is 2,880 turns in a day, and doc 13's own note
concedes the limiter "is never reachable by ordinary use", which is to say it
was designed as a runaway control rather than a budget.

Before launch, two alerts on the ledger, both cheap:

- **cost per user per hour** above a threshold → investigate that account;
- **total cost per hour** above a threshold → the fuse in §2.4 is about to blow.

Neither needs new infrastructure; both are queries over `ai_usage_events` on a
schedule, and doc 11 already establishes the observability wiring they report
through.

---

### 2.6 🟡 Postgres is in another country, and the fix is fewer round trips

The confirmed topology:

| Service       | Region                           |
| ------------- | -------------------------------- |
| Vercel        | Mumbai (`bom1`)                  |
| Upstash Redis | Mumbai (`ap-south-1`)            |
| Neon Postgres | **Singapore (`ap-southeast-1`)** |

Compute and Redis are co-located, which is right and removes the concern this
finding was originally written about. **Postgres is not, and cannot be** — Neon
does not offer a Mumbai region, so Singapore is the nearest available and this
is a constraint rather than a mistake.

The cost is roughly **40–60ms round trip, Mumbai ↔ Singapore, per query**. That
is not a number to optimise away; it is a number to _stop paying repeatedly_.
The design consequence is specific and it lands squarely on doc 14:

- **Every additional query on the AI request path costs another 40–60ms.** A
  naive implementation of doc 14 reads the subscription, then reads the
  counter, then writes the counter — three trips, 120–180ms, before the model
  is called.
- **Doc 14 §6.3's atomic upsert already collapses the check and the increment into
  one statement.** That was written for correctness (no read-then-write race);
  in this topology it is also the latency design, which is a good sign it is
  the right shape.
- **`resolveEntitlement` must not require its own query.** The subscription row
  and the counter upsert should be one round trip — a CTE that resolves the
  plan and applies the increment against that plan's allowance in a single
  statement. Two queries here is the difference between +50ms and +100ms on
  every AI call.
- **Doc 14 §13's usage screen must be one query for five features**, not five.
- **Better Auth's cookie cache is now load-bearing**, not an optimisation.
  Session verification runs on every dashboard request; without the cache each
  one is a Singapore round trip. It is already enabled — do not disable it
  without knowing this.

Nothing here argues for moving Postgres. It argues that the round-trip budget
is real, that doc 14 should be implemented with it in mind, and that the
implementation should be counted in queries rather than assumed.

**A read replica in Mumbai is the escape hatch if it ever bites**, and it is
deliberately not proposed now: it introduces replica lag into a system where
the quota counter must be read-your-own-writes consistent, which is exactly the
kind of correctness problem that is worse than 50ms.

---

### 2.7 🟡 Migrations run against a live deployment

Doc 11 establishes that migrations run as a pre-deploy step and never
implicitly at runtime, which is right. The gap is that there is no stated
policy for **migrations that are not backward-compatible with the currently
deployed code**, and there is a window — however brief — where the old code is
serving traffic against the new schema.

The policy to adopt is the standard expand/contract one, and it is worth
writing down before the first migration that would violate it: additive changes
only in the deploy that introduces them (add a nullable column, backfill,
deploy code that reads it), with drops and renames deferred to a later deploy
once nothing reads the old shape. Doc 14's tables are purely additive, so this
costs nothing today and is cheap insurance for the first schema change that
isn't.

---

## Tradeoffs

**Pooling costs a constraint.** Transaction-mode pooling forecloses session
state and server-side prepared statements permanently — not just until the
traffic justifies revisiting. Nothing in the repository uses either, and the
alternative (raising the connection ceiling) does not scale at all, so the
trade is easy; it is recorded because the constraint is invisible until
something violates it.

**Fluid Compute is a platform commitment.** It makes the cost model depend on a
Vercel-specific capability, which mildly cuts against doc 04's stated
"platform-portable, a default not a lock-in" posture. The application code is
unaffected — this is a deployment setting, and a move off Vercel would change
the economics rather than requiring a rewrite.

**Alerting has a false-positive cost.** Per-user spend thresholds will fire on
legitimate heavy users, and the response has to be investigation rather than an
automatic block; automatically suspending a paying user because they had a
productive afternoon is worse than the spend.

**2GB for the PDF service costs money while idle** if paired with
`min_machines_running = 1`. That is the deliberate trade for first-export
latency and can be reversed with one config value if the idle cost is not worth
it.

---

## Future Scalability

The system after these fixes scales along its natural axes without further
architectural change:

- **Reads** are Server Components against Postgres, and portfolios are ISR at
  `revalidate = 86400` with explicit tag invalidation on publish (doc 04). Page
  views do not touch the database on a cache hit, which is why traffic growth
  on published sites is close to free.
- **The billing hot path** is one indexed upsert on a primary key (doc 14
  §9.6). It does not degrade with history.
- **The ledger** is append-only and partitions by month when it needs to.
- **AI concurrency** is bounded by the gateway ceiling and by the per-user rate
  limiter, which is the correct place for it to be bounded.

The next real bottleneck, well past launch, is **`ai_usage_events` growth** and
whatever analytics get built over it. Partitioning by month is the answer and
the schema already carries `period_start` denormalised to make it cheap.

The one thing that would force an architectural change is a second region,
which brings a read-replica question with it. Nothing here anticipates that,
and nothing here forecloses it.

---

## Implementation Strategy

Ordered by cost-if-ignored. Steps 1–3 are pre-launch; 4–6 are pre-launch if
convenient and immediately after if not.

1. **Pool sizing + pooled connection string** (§2.1), with migrations moved to
   the direct connection string. Verify under a load test that opens more
   concurrent AI requests than the old ceiling allowed — this is the one
   finding whose fix must be proven rather than assumed.
2. **Fluid Compute** (§2.2), and re-size the pool for it in the same change.
3. **PDF service: 2GB + concurrency limit** (§2.3).
4. **Gateway spend ceiling + cost passthrough** (§2.4). The ceiling is
   independent of doc 14 and should be set now; the passthrough lands with doc
   14 step 3.
5. **Count the queries on the AI request path** (§2.6). Not a config change —
   a constraint on how doc 14 is implemented, and cheapest to honour while that
   code is being written rather than after.
6. **Spend alerts** (§2.5), which depend on doc 14's ledger existing.
7. **Write down the expand/contract migration policy** (§2.7) in doc 11.

---

## Open Questions

1. **Whether Neon's scale-to-zero stays enabled on production** (§2.1). It
   saves money on a low-traffic product and costs a few hundred milliseconds on
   the first request after idle — which is disproportionately the request a
   new visitor makes. A cost decision, but one to make deliberately.
2. **Whether the PDF service should stay on Fly at all.** It exists because
   Chromium cannot run in a Vercel function on the current plan (doc 02). If
   Fluid Compute changes that calculus, one service disappears — worth checking
   during §2.2 rather than assuming the constraint still holds.
3. **Load-test target.** "More concurrent AI requests than the old ceiling
   allowed" is not a number. Picking one means deciding what launch-day
   concurrency is expected to be, which nobody knows yet; a defensible default
   is 10× the highest concurrency observed in the first week.

### Resolved

- **Which managed Postgres.** **Neon**, confirmed. §2.1 is written against its
  pooled endpoint and its two-connection-string requirement, and doc 07's
  long-standing open question is closed by it.
- **Regions.** Vercel Mumbai, Upstash Mumbai, Neon Singapore. Compute and Redis
  are co-located; Postgres cannot be, since Neon has no Mumbai region. §2.6 is
  rewritten from "co-locate them" to "budget the round trips", which is the
  form the constraint actually takes.

---

## Alternatives Considered

- **Raise the Postgres connection limit instead of pooling.** Treats the
  symptom, costs money at every tier, and fails again at the next concurrency
  step. Pooling is the only fix that scales. Rejected.
- **Move AI routes to the Edge runtime.** Edge has no TCP sockets, so it cannot
  reach Postgres with the current driver — and every AI route reads the profile
  (doc 13) and will write a quota row (doc 14). It would mean an HTTP database
  driver _and_ a split runtime story. Fluid Compute delivers the same cost
  benefit with no code change. Rejected.
- **A queue in front of the PDF service.** Correct at volume and unnecessary
  now: exports are user-initiated, low-frequency, and the client already
  handles multi-second latency with real UI. Revisit if exports become
  bulk-triggered. Deferred, not rejected.
- **Caching model responses.** Attractive for cost, wrong for this product —
  the input to every call includes the user's whole profile, so the hit rate is
  approximately zero and a hit would be a correctness bug (doc 13 re-reads the
  profile per request precisely because it may have changed). Rejected.
- **Self-hosting the model or going direct to the provider.** Removes the
  gateway's spend ceiling and cost reporting, which §2.4 makes load-bearing.
  Rejected.

---

## Final Recommendation

The architecture is sound and the fixes are small. Nothing here proposes new
infrastructure, and only §2.1 is urgent — but §2.1 is genuinely urgent, and it
gets worse rather than better the moment doc 14 puts a database write on every
AI request.

Do §2.1 and §2.2 together, prove them with a load test, and the system is ready
for a launch it can actually survive. Everything else on the list is a
half-day.
