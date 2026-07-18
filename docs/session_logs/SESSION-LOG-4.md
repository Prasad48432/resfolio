# Session Log 4 — Phase 4 (session 1): Template SDK + first resume template + PDF spike

Date: 2026-07-15 · Previous log: [SESSION-LOG-3.md](SESSION-LOG-3.md)

Phase 4 of `docs/DEVELOPMENT-PLAN.md` was **started and its foundation
completed (4A–4D)**: the "One Profile, Many Outputs" promise becomes real —
a resume rendered from the profile, identically in a browser and an exported
PDF, through a single rendering pipeline. This session deliberately stopped at
the **foundation + the PDF spike**; the editor UX (4E/4F) and the cloud-gated
delivery adapters are sequenced for next sessions. Began with two small
carried-over fixes.

---

## 0. Two quick fixes (non-phase)

- **better-auth peer-dependency warnings silenced.** `pnpm install` warned
  about unmet peers under `@better-auth/cli`. Root cause: the CLI is
  **codegen-only and versions independently** (CLI still on 1.4.x while
  runtime `better-auth` is 1.6.23), so it hoists a stale `@better-auth/core`
  - `drizzle-orm@0.41.0`. The runtime auth adapter takes its drizzle client
    from `@resfolio/database` (0.45.2), so the mismatches are benign. Silenced
    the official way — `pnpm.peerDependencyRules.allowedVersions` in root
    `package.json` — which changes nothing about resolution or the codegen
    workflow. (Matches the known gotcha in memory.)
- **Landing-page gradient.** Enriched the near-invisible `body::before`
  ambient wash in `apps/web/app/globals.css` into a subtle brand gradient
  (warm burnt-orange glows anchored to the hero, a faint "live"-green whisper
  low on the page, an airy light lift at the top). Kept in `apps/web` per its
  CLAUDE.md convention — **not** the shared `@resfolio/design` package, which
  the dashboard also consumes. Verified with a screenshot.

## 1. New packages / app

- **`@resfolio/template-sdk`** (`packages/template-sdk`) — the template
  contract (doc 05), the choke point between templates and the platform.
  - `defineTemplate(def)` validates (semver, kebab id, `compat`, that
    `defaultConfig` parses its own `configSchema`, `--rf-*` token names,
    customizable-tokens-exist-in-every-theme) and **freezes** the definition;
    a broken template throws `TemplateDefinitionError` at load (CI enforcement,
    doc 05).
  - Types: `ResumeTemplateDefinition`, `ResumeDocumentProps`
    (`{ view, config, theme }`), `ThemeTokens`/`ResolvedTheme` (the `--rf-*`
    CSS-custom-property namespace), `TemplateCapabilities`. Re-exports
    `ProfileView` from `@resfolio/profile` and defines `PROFILE_VIEW_VERSION`
    / `SDK_VERSION` — so templates import the view contract **from the SDK
    only**, never `domains/*`.
  - `resolveTheme(template, { themeId?, overrides? })` merges a preset with
    user overrides, **ignoring any override for a token not marked
    customizable**. Deterministic `format.ts` (date ranges; "ongoing" is a
    data fact, never "now" — no clock, doc 09). `rich-text.tsx` renders the
    Markdown subset to React, **re-checking link schemes on output** with the
    domain's `safeLinkUrlSchema` (doc 10); unsafe links degrade to text.
  - Resume kind only; `portfolio` slots into the discriminated union in
    Phase 5. Framework-light (React _types_ + the rich-text renderer).
- **`@resfolio/template-resume-classic`** (`templates/resume-classic`) — the
  first template. `ResumeDocument` is a **universal RSC** (no `"use client"`,
  zero client JS): semantic single-flow HTML in correct reading order
  (`<h1>` name, `<section>`/`<h2>` per section, `break-inside: avoid` entries,
  `<ul>` bullets), physical-unit CSS (mm/pt) with `@page`, inline SVG icons
  (lucide-react, decorative), visible URLs, self-hosted Manrope via the
  `--rf-font-body` token. Own self-contained `<style>` block so it renders
  identically on any host. Two themes (paper/slate), accent customizable.
- **`apps/sites`** (`apps/sites`, port **3002**) — the rendering host (doc 09).
  New Next.js App-Router app. Carries **no** marketing theme (templates ship
  their own styles); `app/globals.css` is a reset + an on-screen paper
  backdrop only. Manrope loaded via `next/font` (`display: "block"`,
  self-hosted WOFF2) → `--font-manrope`.

## 2. The rendering pipeline, as built (doc 09)

`Resolve → Project → Render → Deliver`, where surfaces differ **only** in
Resolve and Deliver:

- **Resolve** (`lib/resolve.ts`) — load the profile named by the token. Two
  sources: `fixture` (dev/CI, from `@resfolio/fixtures`) and `draft`/`version`
  (real DB via `@resfolio/profile/server`, **dynamically imported** so the
  fixture path needs no database or `DATABASE_URL`).
- **Project** — `buildProfileView(profile, view)` from `@resfolio/profile`,
  the _same pure function_ the dashboard preview will run client-side.
- **Render** — the template's `document` via the `lib/templates.ts` registry;
  host is generic over any registered resume template, config re-validated
  with the template's own schema, `compat.profileView` asserted.
- **Deliver** — the private print route
  `app/render/resume/[documentId]/page.tsx` (Server Component, zero client JS,
  `dynamic = "force-dynamic"`, `noindex` via metadata + `X-Robots-Tag` in
  `next.config.ts`). Guarded by short-TTL HMAC tokens (`lib/token.ts`).

The signed token **carries** the render (source, ref, `ViewDefinition`,
template config, exp), so this session needs **no `documents` table**; 4E
swaps the token-carried config for a DB lookup, keeping `source`/`ref`.

## 3. PDF export spike + ATS check (doc 02, the mandated highest-risk-first)

- `scripts/export-pdf.mts` — computes the content-hash render key
  (`lib/render-key.ts`; includes `templateId@version`), checks the
  `ExportStore` (**cache hit → no Chromium boot**), else mints a token, drives
  **Playwright** over the real print route, `page.pdf({ preferCSSPageSize:
true, printBackground: true })`, and stores via `LocalFsExportStore`
  (`apps/sites/out/<hash>.pdf`).
- `scripts/ats-check.mts` — extracts the PDF's real text layer (`pdfjs-dist`)
  and asserts name + every section heading + representative content are
  present **in reading order**, plus a visible URL survives.
- **The ATS check earned its keep:** it caught heading `letter-spacing` that
  made Chromium emit each glyph as a separate run (`E X P E R I E N C E` in
  the text layer) — an ATS hazard. Fixed in the template (removed the
  tracking; uppercase alone extracts cleanly).
- `scripts/dev-url.mts` (`pnpm --filter sites dev:url`) prints a ready signed
  URL so a human can view the render in a browser.

**The cloud seam (why stopping at 4D is safe):** `ExportStore`
(`lib/export-store.ts`) and the HMAC token signer are interfaces with local
implementations today. An `R2ExportStore`, a Trigger.dev task wrapping the
export function, and Redis token-nonce hardening swap in behind these seams
with no route/template changes.

## 4. Verification (all local, all green)

- `@resfolio/template-sdk`: **30 unit tests** (defineTemplate accept/reject,
  resolveTheme merge + override gating, format determinism, rich-text safety).
- **Full workspace**: `pnpm turbo lint typecheck test` → **28/28 tasks**;
  `pnpm turbo build` → all 3 apps (web, dashboard, sites) build.
- **End-to-end**: print route renders (browser screenshot — clean resume,
  sections in canonical order, rich-text bold, contact icons + URLs, date
  ranges, custom "Talks" section); PDF exports (2 pages, ~150 KB, extractable
  text, clickable links); **second export = cache hit** (no Chromium boot);
  ATS check passes.
- CI: added `PRINT_TOKEN_SECRET` to `turbo.json` globalEnv and
  `.github/workflows/ci.yml` env (the new app's build validates it).

## 5. Docs synchronized

- `DEVELOPMENT-PLAN.md` Phase 4: **status block added** marking 4A–4D done
  and 4E/4F/cloud/CI-harness deferred, with exit-criteria progress noted.
- New `packages/template-sdk/CLAUDE.md` and `apps/sites/CLAUDE.md`; root
  `CLAUDE.md` packages/apps inventory updated (template-sdk, resume-classic,
  apps/sites-as-rendering-host).
- `apps/sites/.env.example` (`PRINT_TOKEN_SECRET`, optional DB) and
  `.gitignore` (`/out/`).

## 6. Next — resume Phase 4 here

The pipeline stages (Resolve/Project/Render/Deliver) all exist and are tested;
what remains is the **editor UX** and the **cloud delivery**, in this order:

- **4E — `documents` table + `/resumes` UI.** Add the `documents` table
  (`id, profileId, kind, name, templateId, templateMajor, config JSONB`, per
  doc 07) + a drizzle migration; the `/resumes` screen (currently a
  `ComingSoon` stub) to create/name a resume, pick a template, set A4/Letter.
  Wire the print route's Resolve to look up a `documents` row instead of the
  token-carried config (keep `source`/`ref`; the token now references a
  documentId). Mint tokens from the dashboard/export job.
- **4F — the editor preview pane.** The split-workspace primitive in
  `apps/dashboard` (doc 08): render `resume-classic` **in-browser** on the
  draft via client-side `buildProfileView` in a scaled page box; add the
  advisory pagination overlay (measure DOM vs. page height). This is the
  keystroke-latency preview that shares the exact template + `buildProfileView`
  with the PDF path.
- **Cloud delivery (gated on account access):** `R2ExportStore`, the
  Trigger.dev export task (wraps the existing `exportResumePdf` flow), the
  `assets` table, Redis token-nonce hardening. Swap behind the 4A–4D seams.
- **CI template harness:** visual snapshots of the print route + the
  preview↔PDF parity diff — lands with template #2 (doc 05). The ATS check
  exists now (`pnpm --filter sites check:ats`).

## 7. How to run / test what shipped

No database needed — the `fixture` source (Ada/Jun) drives everything.

```bash
# unit tests (no server)
pnpm --filter @resfolio/template-sdk test

# view the render in a browser (two terminals, matching secret)
#   terminal 1:
PRINT_TOKEN_SECRET=<≥16 chars> pnpm --filter sites dev
#   terminal 2:
PRINT_TOKEN_SECRET=<same> pnpm --filter sites dev:url   # open the printed URL

# PDF export + cache proof + ATS (server running, terminal 2)
PRINT_TOKEN_SECRET=<same> pnpm --filter sites export:pdf   # → apps/sites/out/<hash>.pdf
PRINT_TOKEN_SECRET=<same> pnpm --filter sites export:pdf   # → cache hit, no Chromium
PRINT_TOKEN_SECRET=<same> pnpm --filter sites check:ats
```

(PowerShell: `$env:PRINT_TOKEN_SECRET="…"` on its own line, then the command.)
Tokens last 5 minutes; re-run `dev:url` for a fresh link. Playwright Chromium
is already installed (dashboard e2e).

## 8. Outstanding (carried, need account access)

Unchanged from prior logs: OAuth apps + Vercel env, managed Postgres host
choice, preview-deploy sign-in verification, Sentry source-map upload, plus
the new **Cloudflare R2 + Trigger.dev** credentials that gate the cloud PDF
delivery above.

Note: `apps/web/app/layout.tsx` and `components/landing/hero.tsx` had
pre-existing (pre-session) prettier drift left untouched — they fail
`format:check` until formatted.
