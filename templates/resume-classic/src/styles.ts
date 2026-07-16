import type { ResumeClassicConfig } from "./config";

/**
 * The template's self-contained stylesheet, emitted as a `<style>` block by
 * the Document so it renders identically on every host (dashboard preview,
 * apps/sites print route, Playwright PDF). All dimensions are **physical
 * units** (mm/pt) — never viewport units — so layout is resolution-
 * independent (doc 02). Colors and fonts come from `--rf-*` theme tokens.
 *
 * Two contexts share one sheet: on screen, `.rf-page` paints a real page box
 * (page-sized, padded, white) so the preview *looks* like paper; in print,
 * `@page` owns size + margins and the box collapses so nothing doubles up.
 * Because both go through Chromium with the same CSS + fonts, measured
 * boundaries match actual breaks (the parity guarantee, doc 09).
 */

const PAGE = {
  A4: { w: "210mm", h: "297mm", css: "A4" },
  LETTER: { w: "216mm", h: "279mm", css: "Letter" },
} as const;

const MARGIN = {
  compact: "12mm",
  normal: "16mm",
  relaxed: "20mm",
} as const;

export function buildResumeStyles(config: ResumeClassicConfig): string {
  const page = PAGE[config.pageSize];
  const margin = MARGIN[config.margin];

  return `
@page { size: ${page.css}; margin: ${margin}; }

.rf-page {
  box-sizing: border-box;
  width: ${page.w};
  min-height: ${page.h};
  padding: ${margin};
  margin: 0 auto;
  background: #ffffff;
  color: var(--rf-ink);
  font-family: var(--rf-font-body);
  font-size: 10.2pt;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
.rf-page * { box-sizing: border-box; }

.rf-header { margin-bottom: 6pt; }
.rf-name {
  margin: 0;
  font-size: 22pt;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.05;
}
.rf-headline {
  margin: 3pt 0 0;
  font-size: 11pt;
  font-weight: 500;
  color: var(--rf-muted);
}
.rf-contact {
  margin-top: 6pt;
  display: flex;
  flex-wrap: wrap;
  gap: 3pt 12pt;
  font-size: 8.6pt;
  color: var(--rf-muted);
}
.rf-contact-item {
  display: inline-flex;
  align-items: center;
  gap: 3pt;
}
.rf-contact-item svg { width: 10px; height: 10px; flex: none; color: var(--rf-accent); }
.rf-contact a { color: inherit; text-decoration: none; }

.rf-summary { margin: 8pt 0 0; color: var(--rf-ink); }

.rf-section { margin-top: 13pt; }
.rf-section-title {
  margin: 0 0 6pt;
  padding-bottom: 3pt;
  border-bottom: 0.6pt solid var(--rf-rule);
  font-size: 9.6pt;
  font-weight: 700;
  /* No letter-spacing: positive tracking makes Chromium emit each glyph as a
     separate run, so the PDF text layer reads "E X P E R I E N C E" — an ATS
     hazard the ats-check script catches. Uppercase alone extracts cleanly. */
  text-transform: uppercase;
  color: var(--rf-accent);
  break-after: avoid;
}

.rf-entry { margin-top: 9pt; break-inside: avoid; }
.rf-entry:first-of-type { margin-top: 0; }
.rf-entry-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10pt;
}
.rf-entry-title { margin: 0; font-size: 10.6pt; font-weight: 600; }
.rf-entry-org { color: var(--rf-accent); font-weight: 600; }
.rf-entry-meta { margin: 1pt 0 0; font-size: 9pt; color: var(--rf-muted); }
.rf-dates {
  flex: none;
  font-size: 8.8pt;
  color: var(--rf-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.rf-entry-body { margin-top: 3pt; }
.rf-highlights { margin: 3pt 0 0; padding-left: 13pt; }
.rf-highlights li { margin: 1.5pt 0; padding-left: 1pt; }
.rf-highlights li::marker { color: var(--rf-accent); }

.rf-tags { margin-top: 3pt; font-size: 9.4pt; color: var(--rf-muted); }
.rf-skill-group { margin-top: 5pt; break-inside: avoid; }
.rf-skill-group:first-of-type { margin-top: 0; }
.rf-skill-name { font-weight: 600; color: var(--rf-ink); }

.rf-inline-links { display: flex; flex-wrap: wrap; gap: 2pt 10pt; margin-top: 2pt; font-size: 8.8pt; }
.rf-inline-links a { color: var(--rf-accent); text-decoration: none; }

.rf-langs { display: flex; flex-wrap: wrap; gap: 3pt 16pt; }
.rf-lang-name { font-weight: 600; }
.rf-lang-fluency { color: var(--rf-muted); }

/* Scoped to .rf-page (via zero-specificity :where) so the self-contained sheet
   never leaks bare a/strong rules when the template renders in-browser inside
   the dashboard preview — while staying low enough specificity that the
   .rf-contact / .rf-inline-links link rules above still win (doc 08/09). */
.rf-page :where(a) { color: var(--rf-accent); }
.rf-page :where(strong) { font-weight: 600; }

@media print {
  .rf-page {
    width: auto;
    min-height: 0;
    padding: 0;
    margin: 0;
  }
}
`.trim();
}
