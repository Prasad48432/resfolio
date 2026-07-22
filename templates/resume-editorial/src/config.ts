import { z } from "zod";

/**
 * Template-specific presentation options for `resume-editorial`.
 *
 * **Structurally identical to `resume-classic`'s config on purpose.** The
 * dashboard's resume editor form and preview are generic over "a resume config"
 * with these exact keys (page geometry, master type scale, an accent, an
 * icon toggle, a link deny-list); keeping the shape identical means a second
 * resume template needs no second config form. Only the *defaults* differ — this
 * template is a monochrome serif document, so it defaults to a near-black accent
 * and no contact icons, matching its reference.
 *
 * The Document's content selection/ordering/deltas is a separate `ViewDefinition`
 * applied by `buildProfileView` before the template ever runs (doc 09).
 */
export const resumeEditorialConfigSchema = z.object({
  pageSize: z.enum(["A4", "LETTER"]).default("A4"),
  /** Page margin preset — maps to concrete mm in the stylesheet. */
  margin: z.enum(["compact", "normal", "relaxed"]).default("normal"),
  /**
   * Accent color (`#rrggbb`); fed to the `--rf-accent` customizable token. This
   * template is monochrome by design, so it defaults to near-black — the accent
   * only tints links, and a coloured one is opt-in.
   */
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "must be a #rrggbb hex color")
    .default("#1a1a1a"),
  /**
   * Show small contact icons before each contact item. Off by default: the
   * reference is a text-only masthead with `|` separators, and icons in a
   * centred contact line read as clutter. Kept as a knob so the shared editor's
   * toggle still does something.
   */
  showIcons: z.boolean().default(false),
  /**
   * Master typography scale. `medium` is the reference sizing; `small` shrinks
   * body copy hard and headings gently, so hierarchy survives the squeeze
   * (see `TYPE_SCALE` in `./styles`).
   */
  fontSize: z.enum(["medium", "small"]).default("medium"),
  /**
   * Profile-link ids to **omit** from the contact row, by `basics.links[].id`.
   * A deny list, not an allow list, so a link added to the profile later shows
   * up rather than staying invisible until someone ticks it (see `resume-classic`
   * for the full reasoning — the two templates share this contract exactly).
   */
  hiddenLinkIds: z.array(z.string()).max(20).default([]),
});

export type ResumeEditorialConfig = z.infer<typeof resumeEditorialConfigSchema>;

export const defaultResumeEditorialConfig: ResumeEditorialConfig =
  resumeEditorialConfigSchema.parse({});
