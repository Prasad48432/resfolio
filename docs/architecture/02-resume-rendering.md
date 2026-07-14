# 02 — Resume Rendering Engine

Status: Accepted

## Problem Statement

The same resume must look **identical** in the dashboard preview, the printed
page, and the downloaded PDF. Users make pixel-level decisions ("does this fit
on one page?") in the preview; if the PDF paginates differently, trust in the
product dies. At the same time the PDF must stay **ATS-parseable** — real text,
sane reading order, standard headings — because a beautiful resume that
applicant tracking systems can't read is worthless.

The classic failure mode is two renderers: a React preview and a separate PDF
generator (react-pdf, LaTeX, docx pipelines). They drift on fonts, spacing,
and line breaks, and every template must be implemented twice.

## Proposed Architecture

### One renderer: HTML + CSS, rendered by Chromium everywhere

A resume template is a **React Server Component** that renders semantic
HTML + CSS sized to a physical page (A4 or Letter). That single component is
consumed by every surface:

- **Preview** — the component rendered in the browser inside a fixed-size
  page box (`width: 210mm`), scaled to fit the editor pane with CSS
  `transform: scale()`. The browser _is_ Chromium-class, so what the user
  sees is what Chromium's print engine will produce.
- **PDF / Download** — headless Chromium (Playwright) loads a private print
  route that server-renders the same component, then calls `page.pdf()`.
- **Print** — the same print route with `@media print` styles; users can also
  just print the PDF.

Pixel parity comes from one fact: **the same engine (Chromium) lays out the
same HTML with the same self-hosted fonts in every path.**

### Templates and typography

- Templates live as packages conforming to the Template SDK
  ([05-template-sdk](05-template-sdk.md)) with `kind: "resume"`. They receive
  a `ProfileView` + validated config and return JSX. No data fetching, no
  client JS required to lay out (a resume is a static document).
- **Fonts are self-hosted** (WOFF2 in the renderer app, loaded with
  `font-display: block` on the print route) so preview, PDF, and print embed
  the exact same font files. No system-font fallbacks in templates.
- All template dimensions use physical units (`mm`, `pt`) — never viewport
  units — so layout is resolution-independent.

### Page size and page breaks

- Page size (A4 / Letter) and margins are Document config, passed to the
  template and emitted as CSS `@page { size: A4; margin: … }` on the print
  route. `page.pdf({ preferCSSPageSize: true })` respects it.
- **Chromium's native fragmentation paginates.** Templates mark atomic blocks
  (`break-inside: avoid` on entries, `break-after: avoid` on headings) and
  let the engine break between them. Templates must be _flow layouts_
  (single- or multi-column via CSS columns/blocks) — no fixed-height page
  frames.
- The **preview shows real page boundaries** by measuring the rendered DOM:
  a thin client-side pagination overlay computes where Chromium will break
  (block positions vs. page height) and draws page edges/numbers. It is a
  visualization only — it never influences the PDF. Because preview and PDF
  share engine, fonts, and CSS, measured boundaries match actual breaks.

### ATS compatibility

- Templates render **semantic, single-flow HTML** (`<h1>` name, `<section>`
  - `<h2>` per section, lists for bullets) in correct reading order even when
    visually multi-column (CSS order, not DOM order, handles visuals).
- Chromium PDFs have a real extractable text layer — no rasterized text ever.
- **Icons are inline SVG** (lucide-react renders SVG natively): crisp in PDF,
  no icon-font glyphs that ATS parsers read as garbage characters. Icons are
  decorative only; the adjacent text carries the information.
- **Hyperlinks stay clickable**: Chromium's `page.pdf()` preserves `<a href>`
  as PDF link annotations (Playwright supports tagged/accessible PDF output).
  Templates also print the visible URL for the paper/ATS case where
  annotations are lost.
- The SDK marks templates with an `atsSafe` capability; every launch template
  is ATS-safe. A per-template automated check (export → extract text →
  verify section headings and content present, in order) runs in CI.

### Where PDFs are generated, and caching

- PDF export runs as a **Trigger.dev task** (already in the stack): it boots
  Playwright + Chromium, renders the print route with a short-lived signed
  token, uploads the PDF to R2, and reports completion. The dashboard shows
  live progress and then the download. Serverless route handlers are the
  wrong home for a ~50MB Chromium dependency and multi-second renders.
- **Cache by content hash.** The render is deterministic, so the R2 key is
  `hash(profileVersionId, documentConfigHash, templateId@version, pageSize)`.
  Cache hit → instant download, no browser boot. Objects are immutable;
  "invalidation" is just a new key. Details in [07-storage](07-storage.md).

## Tradeoffs

- **Headless Chromium is heavyweight** (cold starts, memory) versus a pure-JS
  PDF library — but it is the _only_ approach where preview and PDF share a
  layout engine. We contain the cost with background jobs + aggressive
  caching rather than avoiding the browser.
- **Preview pagination overlay is client-side measurement code** — some
  complexity — but it's isolated, advisory, and replaceable; the alternative
  (implementing our own pagination engine that decides breaks) is a layout
  engine rewrite.
- **Flow-layout constraint on templates** limits exotic designs (e.g., full
  page-frame backgrounds per page). Acceptable: resumes are documents, and
  the constraint is exactly what keeps them ATS-safe.

## Future Scalability

- A pool of warm Chromium workers (or a small dedicated render service)
  replaces per-task boots if export volume grows — the architecture
  (print route + `page.pdf()`) is unchanged.
- The same print-route mechanism produces **OG images and thumbnails**
  (`page.screenshot()`), and later DOCX via a separate exporter if demanded.
- Content-hash caching means cost scales with _distinct published versions_,
  not downloads.
- New page sizes, locales, and RTL are template/CSS concerns; the pipeline is
  agnostic.

## Implementation Strategy

1. Build the **print route** in the renderer app (`/render/resume/[documentId]`,
   token-guarded, Server Component, zero client JS).
2. Ship one resume template through the Template SDK to prove the contract.
3. Dashboard preview: same component client-rendered in a scaled page box;
   add the pagination overlay after the basic editor works.
4. Trigger.dev export task: Playwright → R2 → signed download URL, with the
   content-hash cache check _before_ booting Chromium.
5. CI: Playwright visual regression on the print route per template, plus the
   ATS text-extraction check.

## Open Questions

- Whether the preview should live in an `<iframe>` of the print route (perfect
  isolation, simpler parity) vs. in-place component rendering (faster
  keystroke feedback). Decided in [09-rendering-pipeline](09-rendering-pipeline.md):
  iframe for "page preview", in-place for the editing pane if latency demands.
- Multi-page headers/footers (e.g., "Name — page 2"): Chromium supports
  `displayHeaderFooter`; decide per-template whether to expose it in config.
- Whether V1 offers synchronous export for cache hits only (likely yes —
  serve straight from R2 without a job).

## Alternatives Considered

- **@react-pdf/renderer** — its own layout engine (Yoga) with its own styling
  subset: every template written twice (DOM preview + react-pdf), guaranteed
  drift, no real CSS typography. Rejected — it's the duplicate-renderer trap
  with extra steps.
- **LaTeX / Typst** — superb print typography, but a third language for
  templates, no shared preview, and template authors would need to master it.
  Rejected.
- **Client-side PDF (browser print dialog / jsPDF)** — inconsistent across
  users' browsers/OS fonts, no server cache, poor link/metadata control.
  Kept only as the "Print" affordance, which routes through our print CSS.
- **Custom pagination engine** (JS measures and splits content into absolute
  page divs, PDF renders those) — gives exact WYSIWYG page frames, but we'd
  own a layout engine's edge cases forever. The measurement _overlay_ borrows
  the good idea without owning the layout.

## Final Recommendation

One React template rendered by Chromium everywhere: browser preview in a
scaled page box with a measured pagination overlay, and PDF via Playwright
`page.pdf()` on a token-guarded print route, executed in Trigger.dev and
cached immutably in R2 by content hash. Templates are semantic, flow-layout,
physical-unit documents with inline SVG icons and self-hosted fonts — which
makes pixel parity, clickable links, and ATS safety properties of the
architecture rather than per-template heroics.
