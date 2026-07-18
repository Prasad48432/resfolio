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

/**
 * The master type scale — every font size in this template, in one table.
 *
 * Sizes are emitted as `--rf-size-*` custom properties and referenced by
 * `var()` below, so a rule can never quietly re-introduce a literal: adding a
 * hard-coded `pt` to a rule is visible as an inconsistency rather than
 * invisible as a missed find-and-replace. This is what makes the master font
 * size a single config switch rather than a dozen coordinated edits.
 *
 * `small` is **not** a uniform multiplier. Body copy takes the full ~8%
 * reduction (that is where the space is), while section titles drop only
 * ~4% — shrink the labels at the same rate and the hierarchy that makes the
 * page scannable flattens out, which is exactly what the user is *not* asking
 * for when they ask to fit more in.
 */
const TYPE_SCALE = {
  medium: {
    body: "10.2pt",
    name: "22pt",
    contact: "8.6pt",
    sectionTitle: "9.6pt",
    entryTitle: "10.6pt",
    entryMeta: "9pt",
    dates: "8.8pt",
    tags: "9.4pt",
    inlineLinks: "8.8pt",
  },
  small: {
    body: "9.4pt",
    name: "19pt",
    contact: "8pt",
    sectionTitle: "9.2pt",
    entryTitle: "9.8pt",
    entryMeta: "8.4pt",
    dates: "8.2pt",
    tags: "8.8pt",
    inlineLinks: "8.2pt",
  },
} as const;

export function buildResumeStyles(config: ResumeClassicConfig): string {
  const page = PAGE[config.pageSize];
  const margin = MARGIN[config.margin];
  const type = TYPE_SCALE[config.fontSize];

  return `
@page { size: ${page.css}; margin: ${margin}; }

.rf-page {
  box-sizing: border-box;
  --rf-size-body: ${type.body};
  --rf-size-name: ${type.name};
  --rf-size-contact: ${type.contact};
  --rf-size-section-title: ${type.sectionTitle};
  --rf-size-entry-title: ${type.entryTitle};
  --rf-size-entry-meta: ${type.entryMeta};
  --rf-size-dates: ${type.dates};
  --rf-size-tags: ${type.tags};
  --rf-size-inline-links: ${type.inlineLinks};
  width: ${page.w};
  min-height: ${page.h};
  padding: ${margin};
  margin: 0 auto;
  background: #ffffff;
  color: var(--rf-ink);
  font-family: var(--rf-font-body);
  font-size: var(--rf-size-body);
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
.rf-page * { box-sizing: border-box; }

.rf-header { margin-bottom: 6pt; }
.rf-name {
  margin: 0;
  font-size: var(--rf-size-name);
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.05;
}
.rf-contact {
  margin-top: 6pt;
  display: flex;
  flex-wrap: wrap;
  gap: 3pt 12pt;
  font-size: var(--rf-size-contact);
  color: var(--rf-muted);
}
.rf-contact-item {
  display: inline-flex;
  align-items: center;
  gap: 3pt;
}
.rf-contact-item svg { width: 10px; height: 10px; flex: none; color: var(--rf-accent); }
.rf-contact a { color: inherit; text-decoration: none; }

.rf-section { margin-top: 13pt; }
.rf-section-title {
  margin: 0 0 6pt;
  padding-bottom: 3pt;
  border-bottom: 0.6pt solid var(--rf-rule);
  font-size: var(--rf-size-section-title);
  font-weight: 700;
  /* No letter-spacing: positive tracking makes Chromium emit each glyph as a
     separate run, so the PDF text layer reads "E X P E R I E N C E" — an ATS
     hazard the ats-check script catches. Uppercase alone extracts cleanly. */
  text-transform: uppercase;
  color: var(--rf-accent);
  break-after: avoid;
}

/* Summary is a real section (heading + body), so it reuses .rf-section and
   needs only its own body spacing. */
.rf-summary { margin: 0; color: var(--rf-ink); }

.rf-entry { margin-top: 9pt; break-inside: avoid; }
.rf-entry:first-of-type { margin-top: 0; }
.rf-entry-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10pt;
}
.rf-entry-title { margin: 0; font-size: var(--rf-size-entry-title); font-weight: 600; }
.rf-entry-org { color: var(--rf-accent); font-weight: 600; }
.rf-entry-meta { margin: 1pt 0 0; font-size: var(--rf-size-entry-meta); color: var(--rf-muted); }
.rf-dates {
  flex: none;
  font-size: var(--rf-size-dates);
  color: var(--rf-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.rf-entry-body { margin-top: 3pt; }
.rf-highlights { margin: 3pt 0 0; padding-left: 13pt; }
.rf-highlights li { margin: 1.5pt 0; padding-left: 1pt; }
.rf-highlights li::marker { color: var(--rf-accent); }

/* Markdown lists inside rich text. Styled identically to .rf-highlights so a
   list the user typed and a structured highlight are indistinguishable on the
   page — the distinction is a storage detail, not something a reader should
   be able to see. */
.rf-rich-list { margin: 3pt 0 0; padding-left: 13pt; }
.rf-rich-list li { margin: 1.5pt 0; padding-left: 1pt; }
.rf-rich-list li::marker { color: var(--rf-accent); }

.rf-tags { margin-top: 3pt; font-size: var(--rf-size-tags); color: var(--rf-muted); }
.rf-skill-group { margin-top: 5pt; break-inside: avoid; }
.rf-skill-group:first-of-type { margin-top: 0; }
.rf-skill-name { font-weight: 600; color: var(--rf-ink); }

.rf-inline-links { display: flex; flex-wrap: wrap; gap: 2pt 10pt; margin-top: 2pt; font-size: var(--rf-size-inline-links); }
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
