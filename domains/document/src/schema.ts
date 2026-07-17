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

/**
 * Who can read a document at its permanent URL (doc 02). Exactly two states,
 * on purpose: `public` (the default — the URL renders the owner's **published**
 * profile version to anyone) and `private` (the URL says so and renders
 * nothing). There is deliberately no third "unlisted"/"link-only" state — the
 * id is already unguessable, so a token tier would add ceremony without adding
 * a capability anyone asked for.
 */
export const DOCUMENT_VISIBILITIES = ["public", "private"] as const;
export const documentVisibilitySchema = z.enum(DOCUMENT_VISIBILITIES);
export type DocumentVisibility = z.infer<typeof documentVisibilitySchema>;

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
  visibility: DocumentVisibility;
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
  visibility?: DocumentVisibility;
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
    // Identity view: every section on, empty ones dropped by `buildProfileView`
    // — the toggles at /resumes/[id] exist to *hide* content you have.
    view: {},
    // Public by default (doc 02): a resume you can't link to isn't a resume.
    // It renders the published profile version, so a new user with nothing
    // published is not exposed by this default.
    visibility: "public",
  };
}

/** Partial patch for `updateDocument`; every field optional, all validated. */
export const updateDocumentSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  config: documentConfigSchema.optional(),
  templateId: z.string().min(1).optional(),
  templateMajor: z.number().int().positive().optional(),
  view: viewDefinitionSchema.optional(),
  visibility: documentVisibilitySchema.optional(),
});
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
