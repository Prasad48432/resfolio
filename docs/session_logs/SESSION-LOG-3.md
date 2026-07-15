# Session Log 3 — Phase 3: Profile Engine + Profile Editor

Date: 2026-07-15 · Previous log: [SESSION-LOG-2.md](SESSION-LOG-2.md)

Phase 3 of `docs/DEVELOPMENT-PLAN.md` was implemented and marked
**complete**: users now own a real, versioned Profile, edited through a
form-first editor with autosave and publish. Began with a Phase 2 follow-up
fix carried over from the Phase 2 review.

---

## 0. Phase 2 follow-up — redirect-loop fix

A stale-but-present session cookie (revocation from another device, a dev DB
reset) previously ping-ponged between `proxy.ts` (`/login`→app on cookie
presence) and the layout (`requireSession` app→`/login` on invalid session)
until `ERR_TOO_MANY_REDIRECTS` — a full lockout. Fixed by making the proxy
**one-directional** (only redirects _to_ `/login` on a missing cookie) and
moving the signed-in-skips-login redirect into the login page behind a real
`getOptionalSession` check. Regression-tested in `e2e/auth.spec.ts`
(server-side session revoked via `e2e/db.ts`, browser keeps its cookie →
lands on the login screen, no loop).

## 1. New packages

- **`@resfolio/profile`** (`domains/profile`) — the profile engine, the
  first `domains/*` package. Two surfaces:
  - Root (`.`), **pure and framework-free**: Zod schema v1
    (`schema/`), lazy `migrateProfile` (chain + fixture-guarded tests),
    the `buildProfileView` projection (selection / ordering / tailoring
    deltas, deterministic), pure edit helpers (`addItem`/`updateItem`/
    `moveItem`/`removeItem`, all validated + immutable), `createItemId`,
    and the seed/empty profiles.
  - `./server`, the **only DB-aware surface**: draft/publish over
    `@resfolio/database` with `draftRev` optimistic concurrency
    (`StaleDraftError`), `getOrCreateProfile` (seeds on first access),
    `publishProfile` (transactional immutable snapshot).
- **`@resfolio/fixtures`** (`packages/fixtures`) — the shared sample-data
  corpus (realistic Profiles + their ProfileViews), validated through
  `@resfolio/profile`. Depends on profile **one-directionally** (profile
  never depends back — that would cycle the workspace graph); profile's own
  tests use focused inline data + version-specific migration blobs.

## 2. Storage

- **`profiles`** (`id`, `userId` unique, `draft` JSONB, `draftRev`,
  `publishedVersionId`, timestamps) + **`profile_versions`** (append-only,
  `(profileId, version)` unique, `data` JSONB) — matches doc 07's sketch.
  Migration `0001_wet_psynapse.sql` generated + committed, applied cleanly
  against real Postgres.
- **Convention set**: hand-authored tables use `timestamptz` (the generated
  `auth.ts` keeps its naive timestamps). Documented in the new
  `packages/database/CLAUDE.md`.

## 3. Profile editor (`apps/dashboard`)

- `/profile` is now the product's default screen (doc 08), **form-only** —
  the live preview pane is deferred to Phase 4 with the Template SDK.
- Server Component seeds the draft via the domain; the `ProfileEditor`
  client island holds the whole draft in one React Hook Form.
- **Sections are data-driven**: `lib/profile-form.ts` descriptors drive a
  single generic `SectionEditor`, so all eight standard sections (plus
  Basics and custom sections) exist without bespoke components. Drag
  reorder via dnd-kit (maps to RHF `move`); add/remove; rich-text,
  tags, and highlights sub-editors.
- **Autosave** (`use-profile-autosave.ts`): debounced, re-validates with the
  domain schema before every write, carries `draftRev`, `mod+s` forces a
  save, conflict halts autosave and asks for reload. Visible
  Saved/Saving/Offline/Conflict indicator. **Publish** is a separate
  deliberate action snapshotting a version.
- Mutations go through `app/(dashboard)/profile/actions.ts` — thin
  `createAction` adapters over the domain, no business logic (doc 06).
- `@resfolio/ui` gained `Textarea` + `Label`.

## 4. Testing

- **53 domain unit tests** (`domains/profile`): schema validation + URL/
  rich-text/date guards, migration chain + provenance + idempotence, view
  builder (selection/ordering/deltas/determinism/immutability), edit helpers.
- **4 profile e2e journeys** (`e2e/profile.spec.ts`): seeded new profile,
  autosave-survives-reload, add-item autosave, publish v1→v2. Shared sign-in
  helpers extracted to `e2e/helpers.ts`. Full suite: **10/10 green** against
  real Postgres.

## 5. Docs synchronized

- Doc 01 open questions **resolved in place**: field lists (→
  `schema/sections.ts`) and rich-text (Markdown subset); optimistic-
  concurrency note added.
- `DEVELOPMENT-PLAN.md` Phase 3 marked complete.
- New `domains/profile/CLAUDE.md` (domain-layer pattern) and
  `packages/database/CLAUDE.md` (timestamptz + migration conventions);
  root + dashboard CLAUDE.md updated.

## 6. Next

**Phase 4 — Template SDK, first resume template, preview + PDF export**, per
`docs/DEVELOPMENT-PLAN.md`. The editor's preview pane lands here (the split
workspace primitive), consuming `buildProfileView` client-side. Highest-risk
phase (Chromium-in-Trigger.dev) — spike the PDF path first.

## 7. Outstanding (carried from Phase 2, need account access)

Unchanged: OAuth apps + Vercel env, managed Postgres host choice (doc 07),
preview-deploy sign-in verification, Sentry source-map upload. The profile
migration runs via the same deploy/e2e migration step already in place.
