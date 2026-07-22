import type { ThemePreset, TokenName } from "@resfolio/template-sdk";

/**
 * Theme presets for `resume-editorial`. Tokens are the `--rf-*` custom
 * properties the stylesheet reads via `var()`.
 *
 * **Typography** — this template is set in **Lora** (a serif), with **Georgia**
 * in the fallback stack for the italic passages the reference uses (degree,
 * employer, tech list). `--rf-font-body` points at the host-provided
 * `--font-lora` (self-hosted by the apps via `next/font`) so the same font backs
 * the in-browser preview and the PDF — that identity is where resume pixel-parity
 * comes from (doc 09). Lora ships an italic, so italics render consistently on
 * every host; where the host offers no Lora at all, the stack falls to Georgia,
 * then a generic serif, so the template still renders standalone.
 */
const FONT_SERIF =
  "var(--font-lora), Georgia, 'Times New Roman', 'Times', serif";

export const themes: ThemePreset[] = [
  {
    id: "ink",
    name: "Ink",
    tokens: {
      "--rf-accent": "#1a1a1a",
      "--rf-ink": "#141414",
      "--rf-muted": "#3a3a3a",
      "--rf-rule": "#8a8a8a",
      "--rf-font-body": FONT_SERIF,
    },
  },
];

/** The token the user may recolor via `config.accent`. */
export const customizableTokens: TokenName[] = ["--rf-accent"];
