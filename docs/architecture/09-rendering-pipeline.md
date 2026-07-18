# 09 — Rendering Pipeline

Status: Accepted

## Problem Statement

Documents 01–08 each decide one area; this document defines the **single
pipeline that ties them together** — the path from stored Profile to every
rendered surface. Without one named pipeline, each output (editor preview,
public site, PDF, OG image) grows its own resolve/format/render code and the
"one profile, many outputs" promise decays into N slightly different
implementations. This is also where preview parity — the dashboard promise
that what you see _is_ what ships — is made structural.

## Proposed Architecture

### Four stages, one direction

```
        RESOLVE                PROJECT              RENDER               DELIVER
  load Profile (draft     buildProfileView(     template renderer     HTML page (ISR/CDN)
  or published version)   profile, document)    (SDK contract)        PDF (Playwright→R2)
  + Document/Site         → ProfileView         → React tree          preview (browser/iframe)
  + template@major        pure, deterministic                         image (screenshot)
```

1. **Resolve** — fetch the inputs: a profile snapshot (**draft** for
   previews, an immutable **published version** for everything public), the
   Document/Site record (selection, deltas, config), and the pinned
   template. The only stage that touches storage.
2. **Project** — `buildProfileView` from `domains/profile`: apply selection,
   ordering, and deltas; emit the versioned, read-only **ProfileView**
   ([01](01-profile-engine.md), [05](05-template-sdk.md)). **Pure and
   deterministic** — same inputs, same view, anywhere it runs (Node, edge,
   browser). This purity is load-bearing: it's what lets the dashboard build
   previews client-side with zero duplicated logic
   ([08](08-dashboard-ux.md)).
3. **Render** — the template's Server Component renders the ProfileView +
   validated config + resolved theme tokens into a React tree. Templates
   know nothing about stages 1, 2, or 4.
4. **Deliver** — surface-specific packaging:
   - **Public site**: `apps/sites` page, ISR-cached, tag-invalidated
     ([04](04-deployment.md)).
   - **Public resume**: `apps/sites` page at a permanent URL, gated by the
     document's own `visibility` ([02](02-resume-rendering.md)).
   - **PDF**: the private draft render in `apps/sites` → Playwright
     `page.pdf()` in Trigger.dev → content-addressed R2 object
     ([02](02-resume-rendering.md), [07](07-storage.md)).
   - **Editor preview**: resume — same template component rendered in the
     browser in a scaled page box; portfolio — iframe of `apps/sites`'
     draft-preview route ([08](08-dashboard-ux.md)).
   - **Images** (OG cards, thumbnails): same print/preview routes via
     `page.screenshot()`.

One rule enforces everything: **surfaces differ only in stages 1 and 4.**
Stages 2 and 3 are shared code — new output types add a Deliver adapter (and
maybe a Document kind), never a new projection or renderer path.

### Where it runs

`apps/sites` is the **rendering host** for every server-side surface —
public pages, draft previews, print routes, screenshots — because parity
means "rendered by the same app with the same bundle, fonts, and CSS."
The dashboard renders resume previews in-browser for keystroke latency
(same component, same SDK contract), and embeds `apps/sites` for portfolio
preview. `apps/dashboard` never re-implements rendering.

### Route postures

There are **three**, not two. The original rule — "`/p/*` is public, everything
else is private and token-guarded" — stopped being true when resumes gained
permanent public URLs ([02](02-resume-rendering.md)).

| Posture               | Routes                                                       | Guard                                         | Indexed                                | Cached                 |
| --------------------- | ------------------------------------------------------------ | --------------------------------------------- | -------------------------------------- | ---------------------- |
| **Public, indexable** | `/p/[username]/[[...slug]]`                                  | none                                          | yes, honoring `discoverable`           | ISR + `site:<id>` tags |
| **Public, unlisted**  | `/render/resume/[documentId]`                                | the row's `visibility`                        | **no** — `X-Robots-Tag` + `robots.txt` | no (see below)         |
| **Private**           | `/render/resume/*/draft`, `/api/export/*`, `/api/revalidate` | the `RENDER_SECRET` bearer (server-to-server) | no                                     | never                  |

Two things this table encodes that are easy to get wrong:

- **Public ≠ indexable.** A resume is shared by link and carries contact
  details; it has no `discoverable` toggle to opt in with.
- **The public resume is not ISR-cached**, even though a published version is
  immutable. Its render also depends on the document's `config`, `view`, and
  `visibility` — all live and autosaved — so it has _two_ invalidation
  triggers (publish, and any editor edit), and `/api/revalidate` only knows
  `site:<id>`. Caching it before that plumbing exists means serving yesterday's
  content, or a private resume that stays readable after being made private.
  ISR + `document:<id>` tags is a fine optimization once publish _and_ the
  editor both drop them; it is not free, and the failure mode is silent.

### Determinism, identity, and caching

Every render's identity is its input hash:

```
renderKey = hash(revision,          // draft:<draftRev> | version:<id> | fixture:<key>
                 documentConfigHash,
                 templateId@resolvedVersion,
                 view,              // the ViewDefinition
                 surface params (pageSize…))
```

**Every input must actually identify content.** `revision` replaced an earlier
`source` + `ref` pair in which `ref` was the owner's userId for a draft — a
value that never changed when the draft did, so an edit-then-re-export was a
silent cache hit on stale bytes. Prefer an identifier that _has_ to move when
the content moves (a monotonic `draftRev`, an immutable version id) over one
that merely looks stable.

- Published surfaces cache on it (ISR tags for pages, R2 keys for
  PDFs/images) — stale output is structurally impossible because a change
  produces a new key or an explicit tag purge, never an in-place mutation.
- Determinism is a hard requirement on stages 2–3: no `Date.now()`, no
  locale-of-server formatting, no randomness in templates (CI can literally
  snapshot-test it). Anything time/viewer-dependent (view counters, theme
  toggle) is a client island layered on top, outside the cached render.

### The parity guarantee, stated precisely

Preview equals output because, for any surface pair, the pipeline shares
everything except Resolve inputs and Deliver packaging:

- _Resume preview vs. PDF_: identical component, fonts, physical-unit CSS;
  both laid out by Chromium — browser now, Playwright at export.
- _Portfolio preview vs. live site_: identical app (`apps/sites`), differing
  only in draft-vs-published resolution.
- _Dashboard optimistic preview vs. server render_: identical
  `buildProfileView` function executed client-side on the draft.

## Tradeoffs

- **Determinism constrains templates** (no clever time-relative strings like
  "2 yrs ago" computed at render) — such features must be client islands or
  computed into the view at publish. A real constraint, and the price of
  cacheable, testable renders.
- **`apps/sites` as universal rendering host** concentrates responsibility
  in one app (public traffic + previews + print). It also concentrates the
  parity guarantee; isolation between concerns is route-level (the posture
  table above), which is sufficient and vastly simpler than a third rendering
  service. The host has **no sessions** — a deliberate simplification, and the
  reason ownership checks live in the dashboard and cross-app calls carry the
  `RENDER_SECRET` bearer instead.
- **Client-side Project for optimistic preview** ships `buildProfileView` +
  the resume template to the browser (bundle cost, editor-only) and requires
  those to stay isomorphic — enforced by keeping `domains/profile` and
  templates free of Node-only APIs, which the SDK contract already demands.
- **Content-hash identity everywhere** demands discipline about what counts
  as an input (template version bumps must actually bump), backed by CI
  snapshot tests keyed the same way.

## Future Scalability

- **New outputs** — cover letter PDF, JSON Resume export, DOCX, `llms.txt`,
  a public ProfileView API: each is a Deliver adapter (some without stage 3
  at all — JSON export is just Resolve + Project + serialize).
- **AI features** read and write at the Project boundary: optimization
  scores a ProfileView; rewriting proposes deltas — the pipeline renders the
  proposal instantly with zero new machinery.
- **Blogs/CMS/custom pages** extend Resolve (more content types) and the
  SDK's page map; stages 2–4 are untouched.
- **Render farm** — if screenshot/PDF volume explodes, Deliver's Playwright
  step scales horizontally (warm browser pool) with no pipeline change.

## Implementation Strategy

The pipeline is built by building 01–08 in dependency order; this document
supplies the seam checklist:

1. `domains/profile`: schema + **pure** `buildProfileView` (fixture-tested
   for determinism and isomorphism).
2. `packages/template-sdk` + first resume template.
3. `apps/sites`: print route (Deliver: PDF) before public pages — the
   export path exercises Resolve→Deliver end-to-end earliest.
4. Dashboard editor with in-browser preview (client-side Project).
5. `apps/sites` public pages + ISR tags; then the draft-preview route and
   the dashboard iframe.
6. CI: snapshot tests keyed by renderKey inputs; a parity test that renders
   one fixture through preview and PDF paths and diffs the layout.

## Open Questions

- ~~Draft-preview token design (lifetime, per-user vs. per-session scope).~~
  **Settled, then moot (2026-07-18).** The portfolio draft-preview route was
  removed: iframing it re-rendered the whole portfolio application on every
  save, a cost that scales with the template catalogue to answer a question a
  cheaper artefact can answer. Every private surface here is now
  server-to-server, guarded by the `RENDER_SECRET` bearer — simpler and
  stronger than an expiring URL capability. The signing primitive
  (`@resfolio/portfolio/token`) is parked for whatever replaces the preview,
  since **any** owner-only draft a browser loads will need one again.
- **What replaces the portfolio draft preview?** Open. The dashboard shows a
  placeholder pane today. The likely shape is a server-rendered snapshot
  (screenshot on publish/save, stored in R2) rather than a live iframe — one
  render per meaningful change instead of one per keystroke pause.
- Whether the resume preview's in-browser rendering needs a Web Worker for
  large profiles (measure first; likely not).
- ~~Exact renderKey canonicalization.~~ **Settled** in
  `apps/sites/lib/render-key.ts`: recursively key-sorted `stableStringify` →
  sha256, first 24 hex chars.
- Whether the public resume route earns ISR once `document:<id>` invalidation
  is wired through publish _and_ the resume editor's autosave.

## Alternatives Considered

- **No named pipeline** (each surface assembles its own path from the same
  libraries) — works at N=2 surfaces, decays at N=6; the shared-stage rule
  is cheap to state now and impossible to retrofit after divergence.
- **A dedicated render service** (separate deployable that turns
  Profile+config into HTML/PDF) — clean in theory; in practice it duplicates
  the Next.js rendering stack `apps/sites` already is, and adds a network
  hop inside our own product. Revisit only if a non-Next consumer of renders
  appears.
- **Preview via server round-trip only** (no client-side Project) — simpler
  bundles, but keystroke-latency previews would depend on network + server,
  and the editor experience is the product. The pure-function design makes
  the optimistic path nearly free; keeping it.

## Final Recommendation

Name the pipeline and enforce its one rule: **Resolve → Project → Render →
Deliver, where every surface shares Project and Render.** ProfileView is the
sealed middle, `apps/sites` is the single rendering host, renders are
deterministic and identified by content hash, and previews are the same code
resolving draft instead of published. Every future output is an adapter at
the edges of this pipeline — which is precisely what "One Profile, Many
Outputs" means in engineering terms.
