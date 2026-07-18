import type { ThemePreset } from "@resfolio/template-sdk";

/**
 * Theme for `dark-anime`.
 *
 * **This preset carries no colours, and that is deliberate.** The platform's
 * preset mechanism resolves exactly one theme server-side (`resolveTheme` picks
 * `themes[0]`) and the shell applies it as an inline style — which is the right
 * model for a template that ships two fixed looks, and the wrong one for this
 * template, which is light/dark *toggleable at runtime* with system detection.
 * An inline custom property would beat every stylesheet rule, so a runtime
 * toggle physically could not override it.
 *
 * So the split is by what changes: the palettes live in `styles.ts` as the
 * template's own constants, switched by `data-theme` and
 * `prefers-color-scheme`; the preset carries only what is invariant across both
 * keys — the font slots the host provides (self-hosted by `apps/sites`'
 * `next/font`), each with a standalone fallback so the template still renders
 * anywhere.
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
