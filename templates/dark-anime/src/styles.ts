/**
 * The template's self-contained stylesheet, emitted once by the shell as a
 * `<style>` block so it renders identically on every host (the public page on
 * `apps/sites`, the dashboard's draft-preview iframe). Every rule is scoped
 * under the `.rf-site` root — including bare element selectors, via `:where()`
 * at zero specificity — so the sheet never leaks into a host page.
 *
 * **Why hand-written CSS when the reference uses Tailwind**: a template must
 * render on a host that knows nothing about it. Tailwind classes would only
 * work if every consuming app scanned this package's source and shipped the
 * utilities — coupling every template to every host's build config. The
 * self-contained sheet is what makes a template a drop-in (doc 05). The design
 * is the reference's; the delivery mechanism is ours.
 *
 * **Both palettes live here** rather than in theme presets, because this
 * template is dark/light toggleable at runtime and a preset resolves to an
 * inline style no stylesheet rule could override (see `theme.ts`). The cascade
 * order is load-bearing:
 *   1. `.rf-site`                       → dark, the default (it's dark-anime)
 *   2. `@media (prefers-color-scheme: light)` on `:not([data-theme="dark"])`
 *   3. `.rf-site[data-theme="light"]`   → an explicit choice always wins
 * Reorder 2 and 3 and an explicit Dark on a light OS silently stops working.
 */

/** Dark. The default — the template is called dark-anime. */
const DARK = `
  --rf-bg: #050506;
  --rf-surface: #0d0d0f;
  --rf-surface-2: #141417;
  --rf-fg: #ededef;
  --rf-muted: #8b8b93;
  --rf-faint: #5a5a62;
  --rf-rule: #1e1e22;
`;

/** Light. Not an inversion — a separate key, tuned. */
const LIGHT = `
  --rf-bg: #fcfcfd;
  --rf-surface: #ffffff;
  --rf-surface-2: #f6f6f7;
  --rf-fg: #101012;
  --rf-muted: #6b6b73;
  --rf-faint: #9a9aa2;
  --rf-rule: #e6e6e9;
`;

export function buildPortfolioStyles(): string {
  return `
.rf-site {
  ${DARK}
  --rf-col: 46rem;
  background: var(--rf-bg);
  color: var(--rf-fg);
  font-family: var(--rf-font-body);
  font-size: 15px;
  line-height: 1.6;
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}
@media (prefers-color-scheme: light) {
  .rf-site:not([data-theme="dark"]) { ${LIGHT} }
}
.rf-site[data-theme="light"] { ${LIGHT} }

.rf-site :where(*, *::before, *::after) { box-sizing: border-box; }
.rf-site :where(a) { color: inherit; text-decoration: none; }
.rf-site :where(h1, h2, h3, h4, p, ul, ol, figure, blockquote) { margin: 0; }
.rf-site :where(ul, ol) { padding: 0; list-style: none; }
.rf-site :where(strong) { font-weight: 600; color: var(--rf-fg); }
.rf-site :where(em) { font-style: italic; }
.rf-site :where(img) { max-width: 100%; display: block; }
.rf-site :where(button) { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
.rf-site :where(:focus-visible) { outline: 1px solid var(--rf-fg); outline-offset: 2px; }

/* ── Dotted rule frame ────────────────────────────────────────────────
   The reference's signature: a dashed vertical rule down both sides of the
   reading column. Decorative — pure borders, nothing to read. */
.rf-shell { position: relative; }
.rf-col {
  position: relative;
  width: 100%;
  max-width: var(--rf-col);
  margin: 0 auto;
  padding: 0 1.5rem;
  border-left: 1px dashed var(--rf-rule);
  border-right: 1px dashed var(--rf-rule);
  min-height: 100vh;
}
@media (max-width: 48rem) { .rf-col { border: 0; } }

.rf-label {
  font-family: var(--rf-font-mono);
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--rf-faint);
}

/* ── Banner ──────────────────────────────────────────────────────── */
.rf-banner {
  position: relative;
  width: 100%;
  max-width: var(--rf-col);
  margin: 0 auto;
  aspect-ratio: 1200 / 260;
  overflow: hidden;
  border-bottom: 1px dashed var(--rf-rule);
  background: var(--rf-surface);
}
.rf-banner img { width: 100%; height: 100%; object-fit: cover; }

/* ── Topbar ──────────────────────────────────────────────────────── */
.rf-topbar {
  position: absolute;
  top: 0.75rem;
  right: 1.5rem;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 0.375rem;
}
.rf-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.875rem;
  height: 1.875rem;
  border-radius: 0.375rem;
  color: var(--rf-muted);
  transition: background 120ms ease, color 120ms ease;
}
.rf-icon-btn:hover { background: var(--rf-surface-2); color: var(--rf-fg); }
.rf-icon-btn svg { width: 0.9375rem; height: 0.9375rem; }
.rf-kbd-hint {
  display: none;
  align-items: center;
  gap: 0.25rem;
  height: 1.875rem;
  padding: 0 0.5rem;
  border: 1px solid var(--rf-rule);
  border-radius: 0.375rem;
  background: var(--rf-surface);
  font-family: var(--rf-font-mono);
  font-size: 0.625rem;
  color: var(--rf-muted);
}
@media (min-width: 40rem) { .rf-kbd-hint { display: inline-flex; } }
.rf-kbd-hint:hover { color: var(--rf-fg); }

/* ── Index rail ──────────────────────────────────────────────────── */
.rf-rail {
  display: none;
  position: fixed;
  top: 22vh;
  left: calc(50% + (var(--rf-col) / 2) + 2rem);
  flex-direction: column;
  gap: 0.875rem;
  z-index: 10;
}
@media (min-width: 72rem) { .rf-rail { display: flex; } }
.rf-rail-link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.05em;
  color: var(--rf-faint);
  transition: color 300ms ease;
}
.rf-rail-link:hover { color: var(--rf-muted); }
.rf-rail-link[data-active="true"] { color: var(--rf-fg); }
.rf-rail-dash { width: 0; height: 1px; background: transparent; transition: width 300ms ease, background 300ms ease; }
.rf-rail-link[data-active="true"] .rf-rail-dash { width: 0.75rem; background: var(--rf-rule); }

/* ── Hero ────────────────────────────────────────────────────────── */
.rf-hero { padding: 2rem 0; }
.rf-hero-id { display: flex; align-items: flex-end; gap: 1rem; }
.rf-avatar {
  width: 5.25rem;
  height: 5.25rem;
  border-radius: 0.25rem;
  object-fit: cover;
  border: 1px solid var(--rf-rule);
  background: var(--rf-surface-2);
  flex-shrink: 0;
}
/* The avatar breaks the banner's lower edge — but *only* when there is a
   banner. Unconditionally, the negative margin drags it off the top of the
   page, which is what happens to every site before its owner uploads one.
   Keyed off the banner's presence as a sibling so no prop has to carry it. */
.rf-banner + .rf-col .rf-hero { padding-top: 0; }
.rf-banner + .rf-col .rf-avatar { margin-top: -2.5rem; }
.rf-hero-name { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.01em; line-height: 1.15; }
.rf-hero-tagline { font-size: 0.8125rem; color: var(--rf-muted); }
.rf-hero-summary { margin-top: 0.5rem; color: var(--rf-muted); }

.rf-cta { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 1.25rem; }
.rf-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4375rem;
  padding: 0.375rem 0.75rem;
  border-radius: 0.375rem;
  border: 1px solid var(--rf-rule);
  background: var(--rf-surface-2);
  font-size: 0.8125rem;
  color: var(--rf-fg);
  transition: background 140ms ease, border-color 140ms ease;
}
.rf-btn:hover { background: var(--rf-surface); border-color: var(--rf-faint); }
.rf-btn svg { width: 0.875rem; height: 0.875rem; }
.rf-btn-primary { background: var(--rf-fg); color: var(--rf-bg); border-color: var(--rf-fg); }
.rf-btn-primary:hover { opacity: 0.88; background: var(--rf-fg); }

.rf-socials-label { margin-top: 1.5rem; font-size: 0.8125rem; color: var(--rf-muted); }
.rf-socials { display: flex; flex-wrap: wrap; gap: 0.375rem; margin-top: 0.5rem; }
.rf-social {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.3125rem 0.625rem;
  border: 1px solid var(--rf-rule);
  border-radius: 0.375rem;
  background: var(--rf-surface-2);
  font-size: 0.75rem;
  color: var(--rf-muted);
  transition: color 140ms ease, border-color 140ms ease;
}
.rf-social:hover { color: var(--rf-fg); border-color: var(--rf-faint); }
.rf-social svg { width: 0.8125rem; height: 0.8125rem; }

/* ── Sections ────────────────────────────────────────────────────── */
.rf-section { padding: 2.5rem 0; border-top: 1px dashed var(--rf-rule); scroll-margin-top: 2rem; }
.rf-section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; margin-bottom: 1.25rem; }
.rf-section-title { font-size: 1.0625rem; font-weight: 700; letter-spacing: -0.01em; }
.rf-link-more { font-size: 0.75rem; color: var(--rf-muted); }
.rf-link-more:hover { color: var(--rf-fg); }

/* ── Experience rows ─────────────────────────────────────────────── */
.rf-exp { display: flex; flex-direction: column; }
.rf-exp-row { display: flex; align-items: flex-start; gap: 0.875rem; padding: 0.875rem 0; border-top: 1px dashed var(--rf-rule); }
.rf-exp-row:first-child { border-top: 0; padding-top: 0; }
.rf-exp-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  border: 1px solid var(--rf-rule);
  border-radius: 0.375rem;
  background: var(--rf-surface-2);
  font-family: var(--rf-font-mono);
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--rf-muted);
}
.rf-exp-main { flex: 1; min-width: 0; }
.rf-exp-title { font-size: 0.875rem; font-weight: 600; }
.rf-exp-role { font-size: 0.8125rem; color: var(--rf-muted); }
.rf-exp-body { margin-top: 0.5rem; font-size: 0.8125rem; color: var(--rf-muted); }
.rf-exp-meta { text-align: right; flex-shrink: 0; }
.rf-exp-when { font-size: 0.75rem; color: var(--rf-muted); white-space: nowrap; }
.rf-exp-where { font-size: 0.75rem; color: var(--rf-faint); }

/* ── Project cards ───────────────────────────────────────────────── */
.rf-cards { display: grid; gap: 0.75rem; grid-template-columns: 1fr; }
@media (min-width: 40rem) { .rf-cards { grid-template-columns: 1fr 1fr; } }
.rf-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.875rem;
  border: 1px solid var(--rf-rule);
  border-radius: 0.5rem;
  background: var(--rf-surface);
  transition: border-color 140ms ease, background 140ms ease;
}
.rf-card:hover { border-color: var(--rf-faint); background: var(--rf-surface-2); }
.rf-card-title { font-size: 0.875rem; font-weight: 600; }
.rf-card-desc { font-size: 0.8125rem; color: var(--rf-muted); }
.rf-tags { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: auto; padding-top: 0.375rem; }
.rf-tag {
  padding: 0.0625rem 0.375rem;
  border: 1px solid var(--rf-rule);
  border-radius: 0.25rem;
  font-family: var(--rf-font-mono);
  font-size: 0.625rem;
  color: var(--rf-faint);
}

/* ── Skills ──────────────────────────────────────────────────────── */
.rf-skill-group + .rf-skill-group { margin-top: 1rem; }
.rf-skill-name { font-size: 0.8125rem; font-weight: 600; margin-bottom: 0.375rem; }
.rf-chips { display: flex; flex-wrap: wrap; gap: 0.375rem; }
.rf-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--rf-rule);
  border-radius: 0.375rem;
  background: var(--rf-surface-2);
  font-size: 0.75rem;
  color: var(--rf-muted);
}

/* ── Quote ───────────────────────────────────────────────────────── */
.rf-quote-text { font-family: var(--rf-font-display); font-size: 1.375rem; line-height: 1.35; color: var(--rf-fg); }
.rf-quote-attr { margin-top: 0.625rem; }

/* ── Lists ───────────────────────────────────────────────────────── */
.rf-list { display: flex; flex-direction: column; }
.rf-list-row { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; padding: 0.625rem 0; border-top: 1px dashed var(--rf-rule); }
.rf-list-row:first-child { border-top: 0; }
.rf-list-main { min-width: 0; }
.rf-list-title { font-size: 0.875rem; font-weight: 500; }
.rf-list-detail { font-size: 0.75rem; color: var(--rf-muted); }
.rf-list-when { font-family: var(--rf-font-mono); font-size: 0.6875rem; color: var(--rf-faint); white-space: nowrap; }

.rf-highlights { display: flex; flex-direction: column; gap: 0.25rem; margin-top: 0.5rem; }
.rf-highlights li { position: relative; padding-left: 0.875rem; font-size: 0.8125rem; color: var(--rf-muted); }
.rf-highlights li::before { content: "•"; position: absolute; left: 0; color: var(--rf-faint); }

/* Markdown lists from the SDK's rich-text renderer. The site-wide
   :where(ul, ol) list-style reset above would otherwise strip these to
   unmarked lines, so they re-state the bullet in this template's own voice —
   matching .rf-highlights, since a typed list and a structured highlight
   should be indistinguishable to a reader. */
.rf-rich-list { display: flex; flex-direction: column; gap: 0.25rem; margin: 0.5rem 0 0; }
.rf-rich-list li { position: relative; padding-left: 0.875rem; }
.rf-rich-list li::before { content: "•"; position: absolute; left: 0; color: var(--rf-faint); }

.rf-prose { color: var(--rf-muted); display: flex; flex-direction: column; gap: 0.625rem; }
.rf-empty { font-size: 0.8125rem; color: var(--rf-faint); }
.rf-back { font-size: 0.75rem; color: var(--rf-muted); }
.rf-back:hover { color: var(--rf-fg); }
.rf-detail-title { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.01em; margin: 0.5rem 0; }

/* ── Footer ──────────────────────────────────────────────────────── */
.rf-footer {
  padding: 1.5rem 0 2.5rem;
  border-top: 1px dashed var(--rf-rule);
  font-size: 0.75rem;
  color: var(--rf-faint);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}
.rf-footer-nav { display: flex; gap: 0.875rem; }
.rf-footer-nav a { color: var(--rf-muted); }
.rf-footer-nav a:hover { color: var(--rf-fg); }

/* ── Command palette ─────────────────────────────────────────────── */
.rf-palette-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 6rem 1rem 1rem;
}
.rf-palette {
  width: 100%;
  max-width: 28rem;
  background: var(--rf-surface);
  border: 1px solid var(--rf-rule);
  border-radius: 0.625rem;
  box-shadow: 0 24px 60px -12px rgba(0, 0, 0, 0.6);
  overflow: hidden;
}
.rf-palette-input {
  width: 100%;
  padding: 0.75rem 0.875rem;
  border: 0;
  border-bottom: 1px solid var(--rf-rule);
  background: transparent;
  color: var(--rf-fg);
  font: inherit;
  font-size: 0.875rem;
  outline: none;
}
.rf-palette-list { max-height: 17rem; overflow-y: auto; padding: 0.25rem; }
.rf-palette-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.4375rem 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.8125rem;
  text-align: left;
  color: var(--rf-muted);
}
.rf-palette-item[data-active="true"] { background: var(--rf-surface-2); color: var(--rf-fg); }
.rf-palette-item svg { width: 0.8125rem; height: 0.8125rem; flex-shrink: 0; }
.rf-palette-empty { padding: 1rem; text-align: center; color: var(--rf-faint); font-size: 0.8125rem; }

/* Motion is a courtesy, never a requirement (doc 08: gentler, not none). This
   is the CSS half, covering the case where an island never hydrates at all. */
@media (prefers-reduced-motion: reduce) {
  .rf-site :where(*) {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
`;
}
