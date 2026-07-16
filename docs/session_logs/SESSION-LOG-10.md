# Session Log 10 — Phase 6 (session 2): the runtime, the review inbox, and RSS live end-to-end

Date: 2026-07-16 · Previous log: [SESSION-LOG-9.md](SESSION-LOG-9.md)

Session 1 locked the pure contract. This session built everything downstream
of it that isn't account-gated: the **DB runtime** (`./server`), the
**dashboard Sources section with the review inbox**, and a **live end-to-end
proof over RSS** against the local database — plus two dashboard tasks (the
skills tag input and the shadcn Select migration).

---

## 1. `@resfolio/integrations/server` — the runtime (doc 12)

- **Tables + migration `0005_mixed_dracula`** (`packages/database/src/schema/integrations.ts`,
  applied locally): `integration_connections` (per-profile, connector id,
  JSONB `input` for public/file, `encrypted_token` for oauth2/token, status,
  cursor, `auto_accept` default off), `integration_items` (staging; unique
  `(connection_id, external_id)` — the upsert key; full candidate JSONB;
  `fingerprint`, `base_fingerprint` [merge base at last accept],
  `applied_fingerprint` [content as applied — the user-edit detector's
  memory], `applied_item_id`/`applied_section_key`, `last_seen_at`),
  `integration_sync_runs` (status/error/counts — the health surface).
- **`crypto.ts`** — AES-256-GCM token encryption, **pure over an explicit
  key-versioned `TokenKeyring`** (envelope `v<n>.<iv>.<tag>.<ct>` base64url;
  per-value IV; GCM tamper rejection; rotation-ready — v1 rows decrypt under
  a v2-current keyring). Key from the new optional env slice
  `INTEGRATIONS_TOKEN_KEY` (64 hex chars): public connectors need no key;
  storing an oauth2/token connection without one throws.
- **`repository.ts`** — owner-scoped (every function takes `userId`, scoped
  through the profile): `createConnection` (validates public input with the
  connector's schema, encrypts tokens, dedupes identical public inputs,
  coarse **production-only SSRF guard** on user-supplied URLs),
  `listConnections`, `deleteConnection` (cascade staging; applied profile
  items stay — they're the user's content now), `listReviewItems` (the inbox
  query), `dismissItem` (sticks until upstream content changes),
  `listSyncRuns`. No exported record ever carries token material.
- **`sync.ts`** — `syncConnection`: builds the `FetchContext` (token-injecting
  fetch with a per-run request budget that also spots 401/403 →
  `needs_reauth`), drives `fetch` → `normalize`, upserts staging rows,
  **classifies with the stored `baseFingerprint` + a draft-backed user-edit
  check** (`extractAppliedPayload` vs `appliedFingerprint`; a deleted item
  counts as edited), settles unchanged rows back to `accepted`, keeps
  dismissals sticky, and — after full refetches only — marks
  upstream-removed accepted items `archive` (suggestions, never auto-applied)
  and deletes unseen never-accepted rows. Always writes a run row; failure
  flips the connection to `needs_reauth`/`degraded` instead of throwing.
- **`apply.ts` (server)** — `acceptItem`: an **ordinary profile draft
  mutation** via the pure edit helpers (add / update-in-place / archive-
  remove; `talk` → a "Talks" custom section; `profileBasics` →
  `updateBasics`), optional inline `edits` re-validated through the candidate
  schema, optimistic-concurrency retry on `StaleDraftError`, then records
  `baseFingerprint` + `appliedFingerprint` (extracted from the post-apply
  profile, so inline edits and schema defaults are captured exactly).
- **Pure root gained `apply.ts`**: `buildProfileItem` (provenance stamping:
  fresh id, provider → `source`, `externalId` → `sourceId`),
  `buildBasicsPatch` (drops empties so an import never blanks a field),
  `SECTION_FOR_KIND`, `contentFingerprint`, `extractAppliedPayload` — the
  never-overwrite rule's inputs, all unit-testable without a DB.

## 2. Dashboard — the Sources section (`/sources`)

New nav item ("Sources", Plug icon). Server component reads via
`@resfolio/integrations/server`, maps to plain DTOs in `lib/sources.ts`
(display strings only — **no `raw` provider payloads reach the client**),
renders the `SourcesView` island: left, a connect-RSS card (feed URL →
connect runs the **first sync inline**), connection cards
(status/last-synced/Sync now with result counts/Remove), and a disabled
GitHub teaser (OAuth app pending); right, the **review inbox** — state badges
(New / Updated / Conflict / Removed upstream), kind + connector, title +
outbound link, detail line, tech chips, **Accept** (→ draft, revalidates
`/profile` too) and **Dismiss**. Actions in
`app/(dashboard)/sources/actions.ts` are thin `createAction` adapters.
Field-level diff + edit-before-accept UI is the next polish increment (the
domain's `acceptItem` already takes `edits`).

## 3. Verified — including live end-to-end

- **61 unit tests** in the package (was 39): +12 crypto (round-trip,
  per-encryption IV, tamper, malformed envelopes, rotation), +10 pure apply
  (provenance, section routing, unknown-source rejection, the
  applied-fingerprint round-trip that makes the user-edit detector return
  false right after an accept and true after an edit, talk lookup across
  custom sections, basics extraction).
- **43/43 turbo tasks** (lint + typecheck + test, whole workspace).
- **Live smoke against dev Postgres** (temp script, local HTTP feed, then
  deleted): connect → 2 staged `new` → accept → in the draft with
  `source: "rss"`, `sourceId: "post-1"` → unchanged re-sync doesn't resurface
  it → upstream change → `updated` → accept, then user edits the item, then
  upstream changes again → **`conflict`, and the draft still holds the user's
  words** → upstream removal of a pending row cleans it up. This is the
  doc-6/doc-12 exit-criteria invariant demonstrated on the real runtime.

## 4. Dashboard tasks (user-requested)

- **Skills tag input**: new **`TagInput`** primitive in `@resfolio/ui` — a
  chip editor for `string[]`: Enter (primary, mobile-safe) or comma commits;
  trims; ignores empties; rejects duplicates case-insensitively; every chip
  has a labelled × button; Backspace in an empty input removes the last tag;
  pending text commits on blur so autosave never eats it; data model stays
  `string[]`. `TagsField` (skills, technologies) now binds it via RHF — the
  dashboard's pattern for editing string arrays.
- **shadcn Select migration**: `@resfolio/ui`'s `Select` is now the **full
  Radix shadcn API** (`SelectTrigger`/`SelectValue`/`SelectContent`/
  `SelectItem`/`SelectGroup`/`SelectLabel`/`SelectSeparator`, popover styled
  like `DropdownMenuContent`, `animate-popover-in/out`, transform-origin from
  the trigger). Migrated all three call sites — the portfolio **template
  picker**, portfolio config-fields, resume page-size/margins. Convention:
  `data-testid` on the `SelectTrigger`; e2e opens the trigger and clicks the
  `option` role (`resumes.spec.ts` updated — Playwright's `selectOption` no
  longer applies).

## 5. Docs synchronized

`domains/integrations/CLAUDE.md` (server surface documented), root
`CLAUDE.md` (ui + integrations entries), `apps/dashboard/CLAUDE.md` (Sources
section, TagsField/Select conventions), `DEVELOPMENT-PLAN.md` Phase 6 status,
dashboard `.env.example` (`INTEGRATIONS_TOKEN_KEY`).

## 6. How to run / test what shipped

```bash
pnpm --filter @resfolio/integrations test    # 61 unit tests
pnpm turbo lint typecheck test               # 43/43 tasks
pnpm --filter @resfolio/database db:migrate  # applies 0005 (needs DATABASE_URL)
pnpm dev                                     # → localhost:3001/sources, connect any feed URL
```

## 7. Outstanding

Phase 6, account-gated: the **GitHub OAuth app + routes** (the connector is
ready), **Trigger.dev** scheduled sync (enqueues the same `syncConnection`),
**R2 media rehosting** at stage time, acting on the `auto_accept` column, and
the **LinkedIn `file` import**. Not account-gated, next in line: the inbox's
field-level diff + inline edit-before-accept UI, and Redis-backed sync rate
limits. Carried from earlier sessions: run migrations `0003`–`0005` on the
managed host, verify ISR invalidation on a Vercel preview, OAuth apps +
prod env, Sentry source maps, `resfolio.site` subdomains.
