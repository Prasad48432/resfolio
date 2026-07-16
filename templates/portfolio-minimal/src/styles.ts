/**
 * The template's self-contained stylesheet, emitted once by the shell as a
 * `<style>` block so it renders identically on every host (apps/sites public
 * page, the dashboard draft-preview iframe). Every rule is scoped under the
 * `.rf-site` root — including bare element selectors via `:where()` at zero
 * specificity — so the sheet never leaks into a host page when the template
 * renders in-browser (the same discipline resume-classic uses).
 *
 * Colors and fonts come exclusively from `--rf-*` theme tokens; the layout is
 * responsive (max-width container, fluid grids) rather than physical-unit —
 * this is a website, not a paginated document.
 */
export function buildPortfolioStyles(): string {
  return `
.rf-site {
  --rf-container: 60rem;
  background: var(--rf-bg);
  color: var(--rf-fg);
  font-family: var(--rf-font-body);
  font-size: 16px;
  line-height: 1.6;
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}
.rf-site :where(*, *::before, *::after) { box-sizing: border-box; }
.rf-site :where(a) { color: inherit; text-decoration: none; }
.rf-site :where(a:hover) { color: var(--rf-accent); }
.rf-site :where(h1, h2, h3, p, ul, ol, figure) { margin: 0; }
.rf-site :where(strong) { font-weight: 700; color: var(--rf-fg); }
.rf-site :where(em) { font-style: italic; }

.rf-container {
  width: 100%;
  max-width: var(--rf-container);
  margin: 0 auto;
  padding: 0 1.5rem;
}

/* Top navigation */
.rf-nav {
  position: sticky;
  top: 0;
  z-index: 10;
  background: color-mix(in srgb, var(--rf-bg) 88%, transparent);
  backdrop-filter: saturate(140%) blur(8px);
  border-bottom: 1px solid var(--rf-rule);
}
.rf-nav-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  height: 3.75rem;
}
.rf-brand {
  font-family: var(--rf-font-display);
  font-size: 1.25rem;
  letter-spacing: 0.01em;
}
.rf-nav-links {
  display: flex;
  gap: 1.5rem;
  list-style: none;
  padding: 0;
  font-size: 0.95rem;
}
.rf-nav-link { color: var(--rf-muted); padding-bottom: 2px; }
.rf-nav-link:hover { color: var(--rf-fg); }
.rf-nav-link[aria-current="page"] {
  color: var(--rf-fg);
  border-bottom: 2px solid var(--rf-accent);
}

/* Page rhythm */
.rf-main { padding: 4rem 0 5rem; }
.rf-section { margin-top: 4rem; }
.rf-section-title {
  font-family: var(--rf-font-display);
  font-size: 1.9rem;
  font-weight: 400;
  margin-bottom: 1.5rem;
}
.rf-eyebrow {
  font-size: 0.8rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--rf-accent);
  margin-bottom: 0.75rem;
}
.rf-lead { color: var(--rf-muted); font-size: 1.1rem; }

/* Hero */
.rf-hero { display: grid; gap: 2.5rem; align-items: start; }
.rf-hero[data-layout="aside"] { grid-template-columns: 1fr; }
@media (min-width: 48rem) {
  .rf-hero[data-layout="aside"] { grid-template-columns: 1.6fr 1fr; }
}
.rf-hero-name {
  font-family: var(--rf-font-display);
  font-size: clamp(2.5rem, 6vw, 3.75rem);
  font-weight: 400;
  line-height: 1.05;
  letter-spacing: -0.01em;
}
.rf-hero-headline { color: var(--rf-accent); margin-top: 0.5rem; font-size: 1.15rem; }
.rf-hero-summary { color: var(--rf-muted); margin-top: 1.5rem; font-size: 1.1rem; max-width: 34rem; }
.rf-avatar {
  width: 100%;
  max-width: 18rem;
  aspect-ratio: 4 / 5;
  object-fit: cover;
  border-radius: 0.75rem;
  border: 1px solid var(--rf-rule);
  background: var(--rf-surface);
}
.rf-actions { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1.75rem; }
.rf-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid var(--rf-rule);
  background: var(--rf-surface);
  font-size: 0.95rem;
  color: var(--rf-fg);
}
.rf-btn:hover { border-color: var(--rf-accent); color: var(--rf-fg); }
.rf-btn-primary { background: var(--rf-accent); border-color: var(--rf-accent); color: #fff; }
.rf-btn-primary:hover { color: #fff; opacity: 0.92; }
.rf-btn svg { width: 1rem; height: 1rem; }

/* Socials */
.rf-socials { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 1.5rem; }
.rf-social {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid var(--rf-rule);
  font-size: 0.9rem;
  color: var(--rf-muted);
}
.rf-social:hover { color: var(--rf-fg); border-color: var(--rf-accent); }
.rf-social svg { width: 0.95rem; height: 0.95rem; }

/* Project grid + cards */
.rf-grid { display: grid; gap: 1rem; grid-template-columns: 1fr; }
@media (min-width: 40rem) { .rf-grid { grid-template-columns: 1fr 1fr; } }
.rf-card {
  display: block;
  padding: 1.5rem;
  border-radius: 0.75rem;
  border: 1px solid var(--rf-rule);
  background: var(--rf-surface);
  transition: border-color 0.15s ease, transform 0.15s ease;
}
.rf-card:hover { border-color: var(--rf-accent); transform: translateY(-2px); }
.rf-card-title { font-size: 1.15rem; font-weight: 600; color: var(--rf-fg); }
.rf-card-desc { color: var(--rf-muted); margin-top: 0.5rem; font-size: 0.98rem; }
.rf-tags { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 1rem; }
.rf-tag {
  font-size: 0.78rem;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  border: 1px solid var(--rf-rule);
  color: var(--rf-muted);
}
.rf-more { display: inline-block; margin-top: 1.5rem; color: var(--rf-accent); font-size: 0.95rem; }

/* Entry lists (experience / education / writing / detail) */
.rf-entries { display: flex; flex-direction: column; gap: 1.75rem; }
.rf-entry-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.5rem 1rem; }
.rf-entry-title { font-size: 1.1rem; font-weight: 600; }
.rf-entry-org { color: var(--rf-accent); font-weight: 500; }
.rf-entry-meta { color: var(--rf-muted); font-size: 0.92rem; margin-top: 0.15rem; }
.rf-dates { color: var(--rf-muted); font-size: 0.88rem; white-space: nowrap; }
.rf-entry-body { color: var(--rf-muted); margin-top: 0.6rem; }
.rf-highlights { margin-top: 0.6rem; padding-left: 1.1rem; color: var(--rf-muted); }
.rf-highlights li { margin-top: 0.3rem; }

/* Skills */
.rf-skill-groups { display: flex; flex-direction: column; gap: 0.75rem; }
.rf-skill-name { color: var(--rf-fg); font-weight: 600; }
.rf-skill-list { color: var(--rf-muted); }

/* Detail page */
.rf-back { display: inline-block; color: var(--rf-muted); font-size: 0.9rem; margin-bottom: 1.5rem; }
.rf-back:hover { color: var(--rf-accent); }
.rf-detail-title { font-family: var(--rf-font-display); font-size: 2.5rem; font-weight: 400; }
.rf-inline-links { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1.25rem; }

/* Footer */
.rf-footer {
  border-top: 1px solid var(--rf-rule);
  padding: 2rem 0;
  color: var(--rf-muted);
  font-size: 0.88rem;
}

/* Empty state */
.rf-empty { color: var(--rf-muted); font-size: 1.05rem; }
`;
}
