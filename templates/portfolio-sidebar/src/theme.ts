import type { ThemePreset } from "@resfolio/template-sdk";

/**
 * Theme presets for `portfolio-sidebar`. Like every template, colors and fonts
 * are `--rf-*` tokens (doc 03) — the stylesheet reads them via `var()`. A dark
 * (`slate`) and a light (`ivory`) key ship the same layout; light/dark is a
 * token dimension, not a separate template. This template leans sans-serif for
 * its display type (vs. `portfolio-minimal`'s serif) — a distinct voice on the
 * same contract.
 */
export const themes: ThemePreset[] = [
  {
    id: "slate",
    name: "Slate",
    tokens: {
      "--rf-bg": "#0f1117",
      "--rf-surface": "#161a23",
      "--rf-fg": "#eef1f6",
      "--rf-muted": "#8b93a4",
      "--rf-rule": "#242a37",
      "--rf-accent": "#6366f1",
      "--rf-font-body":
        "var(--font-manrope), ui-sans-serif, system-ui, -apple-system, sans-serif",
      "--rf-font-display":
        "var(--font-manrope), ui-sans-serif, system-ui, -apple-system, sans-serif",
    },
  },
  {
    id: "ivory",
    name: "Ivory",
    tokens: {
      "--rf-bg": "#f7f7f5",
      "--rf-surface": "#ffffff",
      "--rf-fg": "#16181d",
      "--rf-muted": "#5f6572",
      "--rf-rule": "#e4e4e1",
      "--rf-accent": "#4f46e5",
      "--rf-font-body":
        "var(--font-manrope), ui-sans-serif, system-ui, -apple-system, sans-serif",
      "--rf-font-display":
        "var(--font-manrope), ui-sans-serif, system-ui, -apple-system, sans-serif",
    },
  },
];
