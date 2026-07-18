import { z } from "zod";

/**
 * Template-specific presentation options for `resume-classic`. This is the
 * *template* config (doc 05) — page geometry and look. The Document's
 * content selection/ordering/deltas is a separate `ViewDefinition` applied by
 * `buildProfileView` before the template ever runs (doc 09).
 */
export const resumeClassicConfigSchema = z.object({
  pageSize: z.enum(["A4", "LETTER"]).default("A4"),
  /** Page margin preset — maps to concrete mm in the stylesheet. */
  margin: z.enum(["compact", "normal", "relaxed"]).default("normal"),
  /** Accent color (`#rrggbb`); fed to the `--rf-accent` customizable token. */
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "must be a #rrggbb hex color")
    .default("#f0592b"),
  /** Show the small decorative contact icons (they are ATS-neutral). */
  showIcons: z.boolean().default(true),
  /**
   * Master typography scale. `medium` is the original sizing; `small` shrinks
   * body copy hard and headings gently, so hierarchy survives the squeeze
   * (see `TYPE_SCALE` in `./styles`).
   */
  fontSize: z.enum(["medium", "small"]).default("medium"),
  /**
   * Profile-link ids to **omit** from the contact row, by `basics.links[].id`.
   *
   * A deny list, not an allow list, and that choice is load-bearing: the
   * default must be "show everything" (it is what every existing resume
   * already does), and a link added to the profile later should appear rather
   * than stay invisible until someone remembers to tick it. An allow list
   * would silently drop new links — a bug the user only finds after sending
   * the PDF.
   */
  hiddenLinkIds: z.array(z.string()).max(20).default([]),
});

export type ResumeClassicConfig = z.infer<typeof resumeClassicConfigSchema>;

export const defaultResumeClassicConfig: ResumeClassicConfig =
  resumeClassicConfigSchema.parse({});
