# Session Log 5 — Phase 4 (session 2): documents + resumes editor + live preview (4E/4F)

Date: 2026-07-15 · Previous log: [SESSION-LOG-4.md](SESSION-LOG-4.md)

Phase 4 is now **product-complete**. Session 1 built the rendering pipeline
foundation and the local PDF spike (4A–4D). This session shipped the two
editor-facing pieces — **4E** (the `documents` table + a real `/resumes` UI +
the print route resolving a stored document) and **4F** (the in-editor **live
resume preview**, the "never edit blindly" split workspace). Everything left in
Phase 4 is account-gated: the cloud delivery adapters (R2 + Trigger.dev + Redis
nonces) and the CI preview↔PDF parity diff (which lands with template #2 in
Phase 5).

---

## 1. `documents` table + `@resfolio/document` domain (4E)

- **`documents` table** (`packages/database/src/schema/documents.ts`,
  migration `0002_fantastic_echo.sql`) — hand-authored, `timestamptz`, JSONB
  `config` (template presentation) + JSONB `view` (ViewDefinition, `{}` =
  identity), `templateId`/`templateMajor` relational, FK → `profiles`
  (cascade), index on `profile_id`. One-directional `document → profile`
  relation only (adding the reverse `many` would create an eager-relations
  import cycle between the two schema modules).
- **`@resfolio/document`** (`domains/document`) — mirrors the profile domain's
  layering:
  - **Root (`.`, pure):** `documentKindSchema` (`resume` only),
    `DocumentRecord`, `updateDocumentSchema`, and `newResumeDocumentInput`
    (template defaults passed in by the caller so the domain needs **no**
    template dependency — presentation-agnostic).
  - **`./token` (server-only, `node:crypto`):** the signed render token,
    **lifted out of `apps/sites`** so the dashboard mints and `apps/sites`
    verifies with one implementation. New discriminated payload: `{ source,
    ref, document: { kind:'inline', templateId, config, view? } | {
    kind:'stored', id }, exp }`. Inline is the fixture/export-script path (no
    DB); stored is the product path.
  - **`./server` (DB):** `create/list/get/update/delete` all scoped to the
    profile the `userId` owns (ownership enforced via a `requireProfileId`
    lookup, never trusted from the caller). `getDocumentForRender(id)` is the
    one unscoped read — the signed short-TTL token is the capability there.
- **11 unit tests** (`schema.test.ts`, `token.test.ts`): helper defaults +
  update-patch validation; token round-trip (inline + stored), wrong secret,
  tampered body, expiry, malformed, bad shape.

## 2. `apps/sites` — resolve stored documents (4E)

- Deleted `apps/sites/lib/token.ts`; the app now imports the shared
  `@resfolio/document/token`.
- `lib/resolve.ts` split into `resolveProfile(source, ref)` +
  `resolveRenderSpec(document)` (inline → as-is; stored → dynamic
  `getDocumentForRender`) → `resolveRender(payload)`. The fixture + inline path
  still touches no database.
- The print route (`app/render/resume/[documentId]/page.tsx`) resolves the
  render spec and, for a stored token, asserts the URL `documentId` matches the
  token's (defense in depth). `lib/render-key.ts` rehashes from the resolved
  spec (`RenderKeyInput`). The `dev-url` / `export-pdf` / `ats-check` scripts
  use the new token shape; `dev:url --doc <id> --user <userId>` exercises the
  stored path locally.

## 3. Dashboard `/resumes` + the live preview (4E/4F)

- **`/resumes`** (`page.tsx`) lists documents (empty state teaches);
  `CreateResumeButton` creates one and routes into its editor.
- **`/resumes/[id]`** (`page.tsx`) loads the document + the profile draft and
  renders the `ResumeEditor` island.
- **`SplitWorkspace`** (`components/workspace/`) — the doc-08 layout primitive
  (form left, preview right; stacks below `lg`, sticky preview), built once for
  reuse by every future editor.
- **`ResumeEditor`** (`components/resume/`) — a config form over the template's
  own schema (page size, margins, accent, icons) with debounced autosave
  (`mod+s` forces it), delete, and an env-gated "Print view" button that mints
  a stored render token against `apps/sites`.
- **`ResumePreview`** — renders the **real** `resume-classic` component
  in-browser off the draft via the pure `buildProfileView` (same function the
  print route runs = the parity guarantee). The template's physical-unit CSS
  makes a page a known pixel box (`lib/resume-preview.ts`, pure + unit-tested:
  `PX_PER_MM`, `pageDimensionsPx`, `previewScale`, `pageCount`); a
  `ResizeObserver` fits it to the pane and an advisory page-break overlay marks
  page boundaries. Config edits update the preview optimistically, no
  round-trip.
- **Template fix:** `resume-classic`'s stylesheet scoped its two bare selectors
  (`a`, `strong`) to `.rf-page :where(a/strong)` — zero-specificity so the
  existing `.rf-*` link rules still win, but the self-contained sheet no longer
  leaks into the dashboard when the template renders in-browser. PDF/ATS output
  is unchanged (every resume anchor is inside `.rf-page`).
- **Env:** `render.dashboard` slice adds **optional** `PRINT_TOKEN_SECRET` +
  `SITES_URL` (kept separate from `render.server`, which `apps/sites` requires,
  so the dashboard boots without them — the print button just hides).

## 4. Verification (all local, all green)

- `pnpm turbo lint typecheck test` → **31/31 tasks**. New: 11 `@resfolio/document`
  tests + the `resume-preview` helper test; a `resumes.spec.ts` e2e (create →
  editor → preview renders the seeded name → page-size change persists across
  reload → appears in the list).
- Migration generated + applied against local docker Postgres (host port 5433);
  `documents` exists.
- End-to-end: dashboard live preview renders the profile through the real
  template, scales to the pane, updates on accent/page-size change, shows the
  page-break guide; the fixture PDF export + cache-hit + ATS check still pass
  unchanged.

## 5. Docs synchronized

- `07-storage.md` documents sketch gains the `view JSONB` column + a note.
- `DEVELOPMENT-PLAN.md` Phase 4: 4E + 4F marked ✅, status + exit-criteria
  updated (cloud delivery + CI parity are the account-gated remainder).
- Root `CLAUDE.md` (added `@resfolio/document` to the domains inventory), new
  `domains/document/CLAUDE.md`, updated `apps/sites/CLAUDE.md` (stored-document
  resolve + shared token) and `apps/dashboard/CLAUDE.md` (resumes editor +
  split workspace + preview). `apps/dashboard/.env.example` documents the
  optional print vars.

## 6. Next — Phase 5 (portfolio) or the account-gated Phase-4 tail

- **Cloud delivery (needs account access):** `R2ExportStore`, the Trigger.dev
  export task wrapping the existing `export-pdf` flow, the `assets` table,
  Redis token-nonce hardening — all swap behind the 4A–4D seams.
- **CI template harness:** visual snapshots of the print route + the
  preview↔PDF parity diff — lands with template #2 (Phase 5). The ATS check
  exists now (`pnpm --filter sites check:ats`).
- **Phase 5** (`docs/DEVELOPMENT-PLAN.md`): portfolio kind in the SDK, public
  `apps/sites` pages + ISR, the first portfolio template, the draft-preview
  iframe, and the second template that proves the SDK contract.

## 7. Outstanding (carried, need account access)

Unchanged from prior logs: OAuth apps + Vercel env, managed Postgres host
choice, preview-deploy sign-in verification, Sentry source-map upload, and the
Cloudflare R2 + Trigger.dev credentials that gate cloud PDF delivery.
