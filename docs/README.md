# Resfolio Documentation

This directory is the **source of truth for architecture**. Code implements what
these documents decide; when the two disagree, either the code is wrong or the
document must be updated in the same change.

## Structure

- `architecture/` — one document per architectural area, numbered by dependency
  order (earlier documents constrain later ones).

| #   | Document                                                            | Decides                                                                                 |
| --- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 01  | [Profile Engine](architecture/01-profile-engine.md)                 | The canonical Profile schema, versioning, and how every output derives from it          |
| 02  | [Resume Rendering](architecture/02-resume-rendering.md)             | One renderer for preview / PDF / print, pagination, ATS, caching                        |
| 03  | [Portfolio Rendering](architecture/03-portfolio-rendering.md)       | Templates as packages, configuration, themes                                            |
| 04  | [Deployment](architecture/04-deployment.md)                         | One multi-tenant renderer app, caching, custom domains                                  |
| 05  | [Template SDK](architecture/05-template-sdk.md)                     | The contract every template implements, versioning, backwards compatibility             |
| 06  | [API Architecture](architecture/06-api-architecture.md)             | Server Actions first, domains as the reusable core, when to extract REST                |
| 07  | [Storage](architecture/07-storage.md)                               | PostgreSQL / Redis / R2 responsibilities, caching, generated assets                     |
| 08  | [Dashboard UX](architecture/08-dashboard-ux.md)                     | Information architecture, editor + live preview, design system extraction               |
| 09  | [Rendering Pipeline](architecture/09-rendering-pipeline.md)         | The unified Resolve → Project → Render → Deliver pipeline all outputs share             |
| 10  | [Auth & Security](architecture/10-auth-and-security.md)             | Better Auth (Google + GitHub), cross-app trust model, signed render tokens, UGC safety  |
| 11  | [Engineering Foundation](architecture/11-engineering-foundation.md) | Task vocabulary, env validation, testing pyramid, CI/CD, observability                  |
| 12  | [Data Imports & Sources](architecture/12-integrations-and-sync.md)  | Connector contract, auth modes, routing + staging + review pipeline, import semantics   |
| 13  | [AI Layer](architecture/13-ai-layer.md)                             | Propose → validate → review → apply; no-fabrication as a schema property; provider seam |

## Development plan

[DEVELOPMENT-PLAN.md](DEVELOPMENT-PLAN.md) sequences all of the above into
seven shippable phases with exit criteria and a risk register. Implementation
proceeds phase by phase, in order.

## Deferred designs (known, intentionally undesigned)

These areas are on the roadmap but have **no accepted design yet**. Do not
improvise them from scratch — write the architecture document first:

- **Billing & plan gating** — Stripe integration, plan limits (custom
  domains, version retention, white-label). Referenced by docs 04 and 07.
- **Resume import / onboarding** — PDF import, AI-assisted profile seeding.
  Likely the activation make-or-break; design before building onboarding.
  (The LinkedIn export-file import is designed — doc 12's `file` mode.)
- **Blogs / CMS / custom pages** — extension points reserved in docs 03, 04,
  05, 09.
- **Account deletion & data export** — full cascade (Postgres rows, R2
  objects, integration tokens) and a user-facing data export. The schema
  constraint is already in place — every table hangs off `userId`
  ([07](architecture/07-storage.md)) — so deletion stays a cascade, not an
  archaeology project. Design before public launch.
- **Transactional email** (Resend + React Email) — deliberately absent from
  V1: social-only auth sends no mail, Stripe sends its own receipts. Do not
  build an email layer until a feature needs one (magic links will be the
  trigger).

**AI writing & resume optimization** left this list on 2026-07-27: it is
designed in [13](architecture/13-ai-layer.md) (Phases 1–6 built, plus Phase 7's
saved chat sessions — `@resfolio/ai` and `ai_chat_sessions`, migration 0014; the
`job_applications` half is still to come). It does operate
on deltas and ProfileViews as docs 01 and 09 anticipated — a tailored resume is
a `ViewDefinition`, never a copy of the Profile, and as of Phase 5 that is
implemented rather than only intended. Cover letters (Phase 6) are the one output
with no structural home in the Profile, so they are generated, vocabulary-checked
against the profile and the posting, and not persisted until Phase 7 gives them a
column.

## Document conventions

Every architecture document contains, in order: **Problem Statement, Proposed
Architecture, Tradeoffs, Future Scalability, Implementation Strategy, Open
Questions, Alternatives Considered, Final Recommendation** — and a `Status`
line at the top.

Statuses:

- `Accepted` — decided; implementation must follow it.
- `Draft` — under discussion; do not build against it yet.
- `Superseded` — replaced; the header links to the replacement.

Rules:

- Documents evolve with the codebase. A PR that changes an architectural
  decision updates the relevant document in the same PR.
- Resolved **Open Questions** are moved into the body with their answer, not
  deleted.
- Keep documents decisive. Alternatives live in _Alternatives Considered_;
  the rest of the document describes the one chosen architecture.

## Stack notes (repo-wide decisions)

- **Next.js 16 / React 19.2** — the repo scaffold is already on Next 16.2,
  which is newer than the Next 15 originally specified. There is no reason to
  downgrade; all documents assume Next 16 App Router semantics (async request
  APIs, `next typegen`, cacheComponents-era caching).
- **Workspace package scope** — every package uses `@resfolio/*` (the
  scaffold's `@repo/*` packages were renamed in Phase 1). The dashboard app
  lives at `apps/dashboard` (package name `dashboard`), renamed from the
  scaffold's `apps/app` before Phase 2.
- **Three workspace layers** — `apps/` (thin, user-facing), `packages/`
  (framework-independent infrastructure), `domains/` (business logic). This is
  defined in the root `CLAUDE.md`; the documents here decide what goes where.
