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
   - **PDF**: token-guarded print route in `apps/sites` → Playwright
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

Draft-preview and print routes are **private**: short-lived signed tokens
minted by the dashboard/export job, `noindex`, never cached by ISR.

### Determinism, identity, and caching

Every render's identity is its input hash:

```
renderKey = hash(profileVersionId | draftRev,
                 documentConfigHash,
                 templateId@resolvedVersion,
                 surface params (pageSize…))
```

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
  parity guarantee; isolation between concerns is route-level (tokens,
  noindex, no shared cache), which is sufficient and vastly simpler than a
  third rendering service.
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

- Draft-preview token design (lifetime, per-user vs. per-session scope) —
  settle when the iframe ships; Redis nonce machinery from
  [07-storage](07-storage.md) is available.
- Whether the resume preview's in-browser rendering needs a Web Worker for
  large profiles (measure first; likely not).
- Exact renderKey canonicalization (stable JSON hashing of config) — define
  once in a shared utility when the first two cache consumers exist.

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
