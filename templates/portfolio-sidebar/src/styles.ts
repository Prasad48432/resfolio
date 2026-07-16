/**
 * The template's self-contained stylesheet, emitted once by the shell as a
 * `<style>` block so it renders identically on every host (apps/sites public
 * page, the dashboard draft-preview iframe). Every rule is scoped under the
 * `.rf-site` root — bare element selectors via `:where()` at zero specificity —
 * so the sheet never leaks when the template renders in-browser.
 *
 * Colors and fonts come exclusively from `--rf-*` theme tokens; the layout is a
 * responsive two-column shell (a fixed profile sidebar + scrolling content)
 * that collapses to a single column on narrow viewports.
 */
export function buildPortfolioStyles(): string {
  return `
.rf-site {
  --rf-gap: 2.5rem;
  --rf-sidebar-w: 17rem;
  background: var(--rf-bg);
  color: var(--rf-fg);
  font-family: var(--rf-font-body);
  font-size: 16px;
  line-height: 1.6;
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}
.rf-site[data-density="compact"] { --rf-gap: 1.5rem; line-height: 1.5; }
.rf-site :where(*, *::before, *::after) { box-sizing: border-box; }
.rf-site :where(a) { color: inherit; text-decoration: none; }
.rf-site :where(a:hover) { color: var(--rf-accent); }
.rf-site :where(h1, h2, h3, p, ul, ol, figure) { margin: 0; }
.rf-site :where(strong) { font-weight: 700; color: var(--rf-fg); }
.rf-site :where(em) { font-style: italic; }

.rf-shell {
  display: grid;
  grid-template-columns: var(--rf-sidebar-w) 1fr;
  gap: var(--rf-gap);
  max-width: 72rem;
  margin: 0 auto;
  padding: 2.5rem 2rem;
  align-items: start;
}
.rf-shell[data-side="right"] { grid-template-columns: 1fr var(--rf-sidebar-w); }
.rf-shell[data-side="right"] .rf-sidebar { order: 2; }

/* Sidebar */
.rf-sidebar { position: sticky; top: 2.5rem; align-self: start; }
.rf-sidebar-inner {
  background: var(--rf-surface);
  border: 1px solid var(--rf-rule);
  border-radius: 1rem;
  padding: 1.75rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.rf-avatar {
  width: 4.5rem; height: 4.5rem;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--rf-rule);
}
.rf-brand {
  font-family: var(--rf-font-display);
  font-weight: 800;
  font-size: 1.4rem;
  letter-spacing: -0.02em;
  line-height: 1.15;
}
.rf-tagline { color: var(--rf-muted); font-size: 0.9rem; }
.rf-nav { display: flex; flex-direction: column; gap: 0.15rem; }
.rf-nav-link {
  display: block;
  padding: 0.4rem 0.6rem;
  border-radius: 0.5rem;
  color: var(--rf-muted);
  font-size: 0.92rem;
  font-weight: 600;
}
.rf-nav-link:hover { color: var(--rf-fg); background: var(--rf-bg); }
.rf-nav-link[aria-current="page"] { color: var(--rf-fg); background: var(--rf-bg); box-shadow: inset 2px 0 0 var(--rf-accent); }
.rf-socials { display: flex; flex-direction: column; gap: 0.4rem; }
.rf-social {
  display: inline-flex; align-items: center; gap: 0.4rem;
  color: var(--rf-muted); font-size: 0.85rem;
}
.rf-social:hover { color: var(--rf-accent); }
.rf-social :where(svg) { width: 15px; height: 15px; }

/* Content column */
.rf-content { min-width: 0; display: flex; flex-direction: column; gap: var(--rf-gap); }
.rf-eyebrow {
  text-transform: uppercase; letter-spacing: 0.12em;
  font-size: 0.72rem; font-weight: 700; color: var(--rf-accent);
}
.rf-page-title, .rf-detail-title {
  font-family: var(--rf-font-display);
  font-weight: 800; font-size: 2.1rem; letter-spacing: -0.02em;
  margin-top: 0.25rem;
}
.rf-hero-headline { color: var(--rf-muted); font-size: 1.1rem; margin-top: 0.35rem; }
.rf-lead { color: var(--rf-fg); max-width: 42rem; }
.rf-lead :where(p) + :where(p) { margin-top: 0.75rem; }

.rf-actions { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-top: 0.5rem; }
.rf-btn {
  display: inline-flex; align-items: center; gap: 0.4rem;
  padding: 0.5rem 0.9rem; border-radius: 0.6rem;
  border: 1px solid var(--rf-rule); font-size: 0.9rem; font-weight: 600;
}
.rf-btn:hover { border-color: var(--rf-accent); color: var(--rf-accent); }
.rf-btn-primary { background: var(--rf-accent); border-color: var(--rf-accent); color: #fff; }
.rf-btn-primary:hover { color: #fff; opacity: 0.9; }
.rf-btn :where(svg) { width: 15px; height: 15px; }

/* Sections + entries */
.rf-section { display: flex; flex-direction: column; gap: 1rem; }
.rf-section-title {
  font-family: var(--rf-font-display);
  font-weight: 700; font-size: 1.3rem;
  padding-bottom: 0.5rem; border-bottom: 1px solid var(--rf-rule);
}
.rf-entries { display: flex; flex-direction: column; gap: 1.5rem; }
.rf-entry-head { display: flex; justify-content: space-between; gap: 1rem; align-items: baseline; }
.rf-entry-title { font-size: 1rem; font-weight: 700; }
.rf-entry-org { color: var(--rf-accent); }
.rf-dates { color: var(--rf-muted); font-size: 0.82rem; white-space: nowrap; }
.rf-entry-meta { color: var(--rf-muted); font-size: 0.88rem; margin-top: 0.15rem; }
.rf-entry-body { margin-top: 0.5rem; }
.rf-highlights { margin-top: 0.5rem; padding-left: 1.1rem; display: flex; flex-direction: column; gap: 0.3rem; }
.rf-highlights :where(li) { list-style: disc; }

/* Project grid + cards */
.rf-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); gap: 1rem; }
.rf-card {
  display: block; padding: 1.1rem;
  background: var(--rf-surface); border: 1px solid var(--rf-rule);
  border-radius: 0.75rem;
}
.rf-card:hover { border-color: var(--rf-accent); }
.rf-card-title { font-weight: 700; }
.rf-card-desc { color: var(--rf-muted); font-size: 0.9rem; margin-top: 0.35rem; }
.rf-tags { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.6rem; }
.rf-tag {
  font-size: 0.72rem; padding: 0.15rem 0.5rem;
  border-radius: 0.4rem; background: var(--rf-bg);
  border: 1px solid var(--rf-rule); color: var(--rf-muted);
}

.rf-skill-groups { display: flex; flex-direction: column; gap: 0.5rem; }
.rf-skill-name { font-weight: 700; }
.rf-skill-list { color: var(--rf-muted); }

.rf-more, .rf-back {
  display: inline-flex; align-items: center; gap: 0.35rem;
  color: var(--rf-accent); font-size: 0.9rem; font-weight: 600;
}
.rf-inline-links { display: flex; flex-wrap: wrap; gap: 1rem; margin-top: 0.75rem; }
.rf-empty { color: var(--rf-muted); }
.rf-footer { color: var(--rf-muted); font-size: 0.8rem; margin-top: 1rem; }

@media (max-width: 52rem) {
  .rf-shell, .rf-shell[data-side="right"] { grid-template-columns: 1fr; }
  .rf-shell[data-side="right"] .rf-sidebar { order: 0; }
  .rf-sidebar { position: static; }
}
`;
}
