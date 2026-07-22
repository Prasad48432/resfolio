import type { ThemePreset } from "@resfolio/template-sdk";

/**
 * Theme for `dark-anime`.
 *
 * **This preset carries no colours, and that is deliberate.** The template is
 * dark-only, so its single palette lives in `styles.ts` as the template's own
 * constants on `.rf-site`. The preset carries only what a stylesheet can't —
 * the font slots the host provides (self-hosted by `apps/sites`' `next/font`),
 * each with a standalone fallback so the template still renders anywhere.
 *
 * Colours being the template's own is doc 03's rule anyway: templates are
 * opinionated, and there are no `customizableTokens` here for the same reason.
 */
export const themes: ThemePreset[] = [
  {
    id: "default",
    name: "Default",
    tokens: {
      "--rf-font-body":
        "var(--font-manrope), ui-sans-serif, system-ui, -apple-system, sans-serif",
      "--rf-font-display":
        "var(--font-instrument-serif), Georgia, 'Times New Roman', serif",
      "--rf-font-mono":
        "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
    },
  },
];
