import type { ThemePreset } from "@resfolio/template-sdk";

/**
 * Theme presets for `portfolio-minimal`. Tokens are the `--rf-*` custom
 * properties the stylesheet reads via `var()` (doc 03: themes are data, not
 * component variants). `--rf-font-body` / `--rf-font-display` point at the
 * host-provided font slots (self-hosted by apps/sites' `next/font`), each
 * with a standalone fallback so the template still renders anywhere.
 *
 * Two presets ship the same layout in a dark and a light key — light/dark is
 * a token dimension, never a separate template.
 */
export const themes: ThemePreset[] = [
  {
    id: "midnight",
    name: "Midnight",
    tokens: {
      "--rf-bg": "#0a0a0b",
      "--rf-surface": "#151517",
      "--rf-fg": "#f4f2ef",
      "--rf-muted": "#9a958d",
      "--rf-rule": "#26262a",
      "--rf-accent": "#e0603a",
      "--rf-font-body":
        "var(--font-manrope), ui-sans-serif, system-ui, -apple-system, sans-serif",
      "--rf-font-display":
        "var(--font-instrument-serif), Georgia, 'Times New Roman', serif",
    },
  },
  {
    id: "paper",
    name: "Paper",
    tokens: {
      "--rf-bg": "#faf8f4",
      "--rf-surface": "#ffffff",
      "--rf-fg": "#1a1712",
      "--rf-muted": "#6b6459",
      "--rf-rule": "#e7e1d6",
      "--rf-accent": "#d4562f",
      "--rf-font-body":
        "var(--font-manrope), ui-sans-serif, system-ui, -apple-system, sans-serif",
      "--rf-font-display":
        "var(--font-instrument-serif), Georgia, 'Times New Roman', serif",
    },
  },
];
