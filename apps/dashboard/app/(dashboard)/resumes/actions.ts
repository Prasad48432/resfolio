"use server";

import {
  documentVisibilitySchema,
  DuplicateTemplateError,
  newResumeDocumentInput,
  type DocumentConfig,
} from "@resfolio/document";
import {
  createDocument,
  deleteDocument,
  getDocument,
  updateDocument,
} from "@resfolio/document/server";
import {
  getOrCreateProfile,
  setPublicResume,
} from "@resfolio/profile/server";
import { viewDefinitionSchema } from "@resfolio/profile";
import { resumeClassicConfigSchema } from "@resfolio/template-resume-classic";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ActionError, createAction } from "@/lib/actions";
import { getResumeTemplate } from "@/lib/resume-templates";

/**
 * Resume document mutations (docs/architecture/06-api-architecture.md): thin
 * adapters over `@resfolio/document/server`. The caller picks a template by id;
 * its `defaultConfig` + `defaultSectionOrder` seed the new document, and the
 * `view` is validated with the profile engine's `viewDefinitionSchema`. Config
 * is validated on update with a resume config schema — every resume template
 * shares one config shape (`resume-classic` and `resume-editorial` are
 * structurally identical), so one schema validates them all (doc 05).
 */

export const createResumeAction = createAction({
  name: "resume.create",
  input: z.object({
    name: z.string().trim().min(1).max(120),
    templateId: z.string().min(1),
  }),
  handler: async ({ name, templateId }, ctx) => {
    const template = getResumeTemplate(templateId);
    if (!template) {
      throw new ActionError("That template isn't available.");
    }
    // Ensure the owning profile exists before attaching a document to it.
    await getOrCreateProfile(ctx.userId, {
      name: ctx.session.user.name,
      email: ctx.session.user.email,
    });
    const templateMajor = Number.parseInt(
      template.version.split(".")[0] ?? "1",
      10,
    );
    try {
      const doc = await createDocument(
        ctx.userId,
        newResumeDocumentInput({
          name,
          templateId: template.id,
          templateMajor,
          config: { ...(template.defaultConfig as DocumentConfig) },
          // The template's preferred reading order, seeded once. From here it is
          // the user's data: the Sections panel drags it and nothing re-imposes
          // it — which is also why existing resumes keep the order they have.
          sectionOrder: template.defaultSectionOrder,
        }),
      );
      revalidatePath("/resumes");
      return { id: doc.id };
    } catch (error) {
      if (error instanceof DuplicateTemplateError) {
        throw new ActionError(
          "You already have a resume using this template. Please edit your existing resume instead.",
        );
      }
      throw error;
    }
  },
});

export const updateResumeAction = createAction({
  name: "resume.update",
  input: z.object({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(120).optional(),
    /** Presentation: page size, margins, accent, icons (doc 05). */
    config: resumeClassicConfigSchema.optional(),
    /**
     * What this resume *shows*: section visibility, item selection and order
     * (doc 01's ViewDefinition). Content itself is never here — it stays in the
     * Profile, and this only projects it.
     */
    view: viewDefinitionSchema.optional(),
    visibility: documentVisibilitySchema.optional(),
  }),
  handler: async ({ id, name, config, view, visibility }, ctx) => {
    const updated = await updateDocument(ctx.userId, id, {
      name,
      config,
      view,
      visibility,
    });
    if (visibility !== undefined) {
      // The list shows each resume's visibility.
      revalidatePath("/resumes");
    }
    return { updatedAt: updated.updatedAt.toISOString() };
  },
});

export const deleteResumeAction = createAction({
  name: "resume.delete",
  input: z.object({ id: z.string().min(1) }),
  handler: async ({ id }, ctx) => {
    await deleteDocument(ctx.userId, id);
    revalidatePath("/resumes");
    return { deleted: true as const };
  },
});

/**
 * Pin which resume renders at the profile's public `/r/<handle>` route (doc 02).
 * Passing null clears the pin, falling the route back to the sole-resume
 * auto-pick. Ownership is verified here via the user-scoped `getDocument` — the
 * profile pointer carries no FK, so a stranger's document id must be rejected
 * before it can be written.
 */
export const setPublicResumeAction = createAction({
  name: "resume.setPublic",
  input: z.object({ documentId: z.string().min(1).nullable() }),
  handler: async ({ documentId }, ctx) => {
    if (documentId !== null) {
      // Throws DocumentNotFoundError (→ generic action error) if it isn't the
      // caller's — `getDocument` is scoped to the user's own profile.
      await getDocument(ctx.userId, documentId);
    }
    await setPublicResume(ctx.userId, documentId);
    revalidatePath("/resumes");
    return { documentId };
  },
});
