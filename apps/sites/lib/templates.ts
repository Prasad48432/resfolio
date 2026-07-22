import { resumeClassic } from "@resfolio/template-resume-classic";
import { resumeEditorial } from "@resfolio/template-resume-editorial";
import type { ResumeTemplateDefinition } from "@resfolio/template-sdk";

/**
 * The template registry for the rendering host. Templates are opaque here —
 * their config type is erased to `unknown` and re-validated at render time
 * with the template's own `configSchema`, so the host stays generic over any
 * registered resume template (doc 05/09).
 */
export type AnyResumeTemplate = ResumeTemplateDefinition<unknown>;

// The contravariant `document(config)` position makes the concrete→unknown
// widening unprovable to TS; the cast is sound because the host only ever
// feeds `document` a value it parsed through this same template's schema.
const REGISTRY = new Map<string, AnyResumeTemplate>([
  [resumeClassic.id, resumeClassic as unknown as AnyResumeTemplate],
  [resumeEditorial.id, resumeEditorial as unknown as AnyResumeTemplate],
]);

export function getResumeTemplate(id: string): AnyResumeTemplate | undefined {
  return REGISTRY.get(id);
}
