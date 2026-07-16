import type { ThemePreset, TokenName } from "@resfolio/template-sdk";

/**
 * Theme presets for `resume-classic`. Tokens are the `--rf-*` custom
 * properties the stylesheet reads via `var()`. `--rf-font-body` points at the
 * host-provided `--font-manrope` (self-hosted by apps/sites' `next/font`),
 * with a system fallback so the template still renders standalone.
 */
export const themes: ThemePreset[] = [
  {
    id: "paper",
    name: "Paper",
    tokens: {
      "--rf-accent": "#f0592b",
      "--rf-ink": "#1a1712",
      "--rf-muted": "#5c5348",
      "--rf-rule": "#e4ddd1",
      "--rf-font-body":
        "var(--font-manrope), ui-sans-serif, system-ui, -apple-system, sans-serif",
    },
  },
  {
    id: "slate",
    name: "Slate",
    tokens: {
      "--rf-accent": "#2563eb",
      "--rf-ink": "#0f172a",
      "--rf-muted": "#475569",
      "--rf-rule": "#e2e8f0",
      "--rf-font-body":
        "var(--font-manrope), ui-sans-serif, system-ui, -apple-system, sans-serif",
    },
  },
];

/** The token the user may recolor via `config.accent`. */
export const customizableTokens: TokenName[] = ["--rf-accent"];
