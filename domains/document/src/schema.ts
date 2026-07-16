import { viewDefinitionSchema, type ViewDefinition } from "@resfolio/profile";
import { z } from "zod";

/**
 * The document contract (docs/architecture/07-storage.md, 01-profile-engine.md).
 * A document is `Profile × config`: it names a template, pins its major, and
 * carries the presentation `config` plus the `view` (ViewDefinition — the
 * section selection/order/deltas). Content is never stored here.
 *
 * Pure and framework-free (like the profile engine's root): safe to import for
 * types anywhere. Template `config` is opaque at this layer — each template
 * re-validates it with its own Zod schema at render (doc 05) — so we model it
 * as an arbitrary JSON object and never interpret it here.
 */

export const DOCUMENT_KINDS = ["resume"] as const;
export const documentKindSchema = z.enum(DOCUMENT_KINDS);
export type DocumentKind = z.infer<typeof documentKindSchema>;

export const documentConfigSchema = z.record(z.string(), z.unknown());
export type DocumentConfig = z.infer<typeof documentConfigSchema>;

export interface DocumentRecord {
  id: string;
  profileId: string;
  kind: DocumentKind;
  name: string;
  templateId: string;
  /** The template major the config was authored against (doc 05 compat). */
  templateMajor: number;
  config: DocumentConfig;
  view: ViewDefinition;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewDocumentInput {
  name: string;
  kind?: DocumentKind;
  templateId: string;
  templateMajor: number;
  config: DocumentConfig;
  view?: ViewDefinition;
}

/**
 * A resume document's initial state. Template defaults are passed in by the
 * caller so this package needs no dependency on any template — the domain
 * stays presentation-agnostic (repository principle: templates describe
 * presentation only).
 */
export function newResumeDocumentInput(params: {
  name: string;
  templateId: string;
  templateMajor: number;
  config: DocumentConfig;
}): NewDocumentInput {
  return {
    name: params.name,
    kind: "resume",
    templateId: params.templateId,
    templateMajor: params.templateMajor,
    config: params.config,
    view: {},
  };
}

/** Partial patch for `updateDocument`; every field optional, all validated. */
export const updateDocumentSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  config: documentConfigSchema.optional(),
  templateId: z.string().min(1).optional(),
  templateMajor: z.number().int().positive().optional(),
  view: viewDefinitionSchema.optional(),
});
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
