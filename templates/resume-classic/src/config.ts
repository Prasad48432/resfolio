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
});

export type ResumeClassicConfig = z.infer<typeof resumeClassicConfigSchema>;

export const defaultResumeClassicConfig: ResumeClassicConfig =
  resumeClassicConfigSchema.parse({});
