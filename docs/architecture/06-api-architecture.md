# 06 — API Architecture

Status: Accepted

## Problem Statement

The dashboard needs reads and mutations from day one; a public API and mobile
apps are on the long-term roadmap. The failure modes on each side are well
known: build REST/tRPC infrastructure now and pay abstraction tax on every
feature while serving exactly one first-party web client — or scatter logic
through Server Actions and page files until "add an API" means a rewrite.
We need the simplest architecture that scales, and a clear trigger for when
to extract a formal API.

## Proposed Architecture

### The rule: transport is thin, domains are the product

All business logic lives in `domains/*` packages as plain, framework-free
TypeScript:

```
domains/profile    @resfolio/profile     schema, migrations, views, edit ops
domains/resume     @resfolio/resume      document ops, export orchestration
domains/portfolio  @resfolio/portfolio   site ops, slugs, publish
```

Domain functions take typed inputs (validated with the domain's Zod schemas)
plus an explicit **auth context** (`{ userId }`), enforce **ownership and
invariants themselves**, and return typed results. They never import
`next/*`, never touch cookies/headers, never trust their caller to have
authorized anything.

Transports are adapters over domains:

1. **Reads → Server Components.** Pages call domain read functions directly
   (through a small data layer that supplies the session + caching). No
   client-side fetching for first-party UI, no GET endpoints for ourselves.
2. **Mutations → Server Actions.** Each feature exposes actions in an
   `actions.ts` that do exactly four things: resolve session → parse input
   with the domain schema → call the domain function → revalidate paths/tags
   and return a typed `ActionResult`. Actions contain **no logic** — an
   action body longer than ~15 lines is logic leaking out of the domain.
3. **Route Handlers only where the caller isn't our React app**: auth
   (Better Auth mounts its own handler), webhooks (Stripe, Trigger.dev),
   file download redirects, OG images. Same shape: parse → domain → respond.

### Cross-cutting conventions

- **One `ActionResult<T>` type** (`{ ok: true, data } | { ok: false, error,
fieldErrors? }`) shared across the codebase so forms (React Hook Form +
  `useActionState`) handle every action uniformly. Actions never throw for
  expected failures.
- **Validation at every boundary** — actions re-parse raw input even though
  the client "already validated"; domains validate again by construction
  (their inputs are schema types). Client input is never trusted.
- **Rate limiting** on sensitive actions via Upstash Redis
  ([07-storage](07-storage.md)) inside the action layer.

### When to extract a formal API — explicit triggers

Extract a versioned REST API (`app/api/v1/*` route handlers, OpenAPI-described,
Zod-validated) when the **first external consumer** is scheduled — public API
customers or the mobile app — and not before. Because every endpoint is
`parse → domain call → serialize`, extraction is mechanical: the domains
already are the API; REST just gives them a URL. Until then, adding REST
would duplicate every mutation path for zero users.

tRPC is skipped, not deferred: its payoff is typed client↔server calls,
which Server Components + Server Actions already provide natively; and it
doesn't serve external consumers, which is the only API need we'll ever have
beyond what Next provides.

## Tradeoffs

- **Server Actions are POST-only and Next-coupled.** Fine for a first-party
  dashboard (mutations _should_ be POSTs; reads don't go through actions).
  The Next coupling is confined to the adapter layer by the domain rule.
- **Discipline over framework.** "Actions contain no logic" is a convention,
  not something tRPC-style middleware enforces. We back it with the shared
  `ActionResult` helper, code review, and this document — cheaper than
  adopting a framework to police ourselves.
- **Double validation** (action boundary + domain types) costs a few
  microseconds and some ceremony; it's what makes domains safe to expose to
  any future transport unchanged.
- **No API for power users at launch.** Accepted: JSON export covers early
  data-portability needs; the public API ships when it has customers.

## Future Scalability

- **Public API / mobile**: add `app/api/v1/*` adapters over existing domains;
  auth via Better Auth API keys/bearer tokens. No domain changes.
- **Background jobs** (Trigger.dev) call the same domain functions — jobs are
  just another transport.
- **Teams/organizations**: the explicit auth-context parameter grows from
  `{ userId }` to `{ userId, orgId, role }` in one place; domains already own
  authorization, so permission logic lands where it belongs.
- **Webhooks out** (user-facing) and **AI endpoints** follow the same
  adapter pattern.

## Implementation Strategy

1. Rename existing `@repo/*` packages to `@resfolio/*` (one chore PR) so the
   workspace has a single scope before domains are created.
2. Create `domains/` workspace folder; `@resfolio/profile` first
   ([01-profile-engine](01-profile-engine.md)).
3. Add the shared `ActionResult` + action helper (with session resolution and
   error normalization) in a small `@resfolio/server` utility or per-app
   `lib/` until a second app needs it.
4. First vertical slice: profile editor reads (RSC) + autosave mutation
   (action) through `@resfolio/profile`, establishing the pattern all
   features copy.
5. Document the action conventions in `apps/dashboard/CLAUDE.md` as they solidify.

## Open Questions

- Where the action helper lives long-term (`@resfolio/server` package vs.
  app-local `lib/`) — decide when `apps/sites` needs any of it.
- Idempotency needs for actions invoked from flaky networks (retry-safe
  autosave) — likely content-addressed writes make this moot; verify during
  editor implementation.
- API key model for the eventual public API (Better Auth plugin vs. custom
  table) — decide at extraction time.

## Alternatives Considered

- **tRPC from day one** — typed RPC, middleware, subscriptions; but it
  duplicates what RSC + actions already give a single Next app, adds a
  client/provider layer, pushes toward client-side fetching, and still
  wouldn't serve external consumers. Rejected.
- **REST-first internally** — honest transport, externally consumable from
  day one; but doubles the plumbing for every feature (endpoint + fetch +
  cache management) with zero external users. Rejected until the trigger
  fires.
- **GraphQL** — its strengths (many clients, flexible queries over a large
  graph) match nothing in our V1 shape; heavy server/tooling cost. Rejected.
- **Logic in actions, extract domains "later"** — the default entropy path;
  "later" arrives as a rewrite during the busiest growth phase. The domain
  layer costs nearly nothing now and is the whole reason extraction stays
  mechanical. Rejected.

## Final Recommendation

Server Components for reads, Server Actions for mutations, Route Handlers
only for non-React callers — every one of them a thin, validating adapter
over framework-free `domains/*` packages that own validation, authorization,
and business rules. Skip tRPC permanently, extract versioned REST only when
the first external consumer is scheduled. The API architecture _is_ the
domain layer; everything else is transport.
