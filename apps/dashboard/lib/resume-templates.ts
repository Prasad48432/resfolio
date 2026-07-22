import { resumeClassic } from "@resfolio/template-resume-classic";
import { resumeEditorial } from "@resfolio/template-resume-editorial";
import type { ResumeTemplateDefinition } from "@resfolio/template-sdk";

/**
 * The dashboard's resume-template registry — the counterpart to apps/sites'
 * `lib/templates.ts`, kept in sync by hand (both list the same templates). It
 * drives two things the dashboard owns: **creating** a resume (seeding the
 * chosen template's `defaultConfig` + `defaultSectionOrder`) and **previewing**
 * it (rendering the template's own `document`).
 *
 * Templates are opaque here: their config type is erased to `unknown` and
 * re-validated through the template's own `configSchema` at the point of use, so
 * the dashboard stays generic over any resume template. This works only because
 * every resume template shares one **structurally identical** config shape
 * (page size, margin, accent, icons, font scale, hidden links), which is what
 * lets the one resume editor form serve all of them.
 */
export type AnyResumeTemplate = ResumeTemplateDefinition<unknown>;

export interface ResumeTemplateChoice {
  id: string;
  name: string;
  description: string;
}

// The concrete→unknown widening is unprovable to TS at the contravariant
// `document(config)` position; the casts are sound because every consumer parses
// config through this same template's schema before rendering.
const REGISTRY = new Map<string, AnyResumeTemplate>([
  [resumeClassic.id, resumeClassic as unknown as AnyResumeTemplate],
  [resumeEditorial.id, resumeEditorial as unknown as AnyResumeTemplate],
]);

/** Every resume template the dashboard offers, in display order. */
export const RESUME_TEMPLATES: ResumeTemplateChoice[] = [
  {
    id: resumeClassic.id,
    name: resumeClassic.name,
    description: resumeClassic.description,
  },
  {
    id: resumeEditorial.id,
    name: resumeEditorial.name,
    description: resumeEditorial.description,
  },
];

export function getResumeTemplate(id: string): AnyResumeTemplate | undefined {
  return REGISTRY.get(id);
}
