"use server";

import {
  documentVisibilitySchema,
  newResumeDocumentInput,
} from "@resfolio/document";
import {
  createDocument,
  deleteDocument,
  updateDocument,
} from "@resfolio/document/server";
import { getOrCreateProfile } from "@resfolio/profile/server";
import { viewDefinitionSchema } from "@resfolio/profile";
import {
  defaultResumeClassicConfig,
  resumeClassic,
  resumeClassicConfigSchema,
} from "@resfolio/template-resume-classic";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAction } from "@/lib/actions";

/**
 * Resume document mutations (docs/architecture/06-api-architecture.md): thin
 * adapters over `@resfolio/document/server`. Only `resume-classic` exists, so
 * template choice is fixed here; the config is validated with the template's
 * own schema before it is stored (doc 05), and the `view` with the profile
 * engine's `viewDefinitionSchema`.
 */

const TEMPLATE_MAJOR = Number.parseInt(
  resumeClassic.version.split(".")[0] ?? "1",
  10,
);

export const createResumeAction = createAction({
  name: "resume.create",
  input: z.object({ name: z.string().trim().min(1).max(120) }),
  handler: async ({ name }, ctx) => {
    // Ensure the owning profile exists before attaching a document to it.
    await getOrCreateProfile(ctx.userId, {
      name: ctx.session.user.name,
      email: ctx.session.user.email,
    });
    const doc = await createDocument(
      ctx.userId,
      newResumeDocumentInput({
        name,
        templateId: resumeClassic.id,
        templateMajor: TEMPLATE_MAJOR,
        config: { ...defaultResumeClassicConfig },
        // The template's preferred reading order, seeded once. From here it is
        // the user's data: the Sections panel drags it and nothing re-imposes
        // it — which is also why existing resumes keep the order they have.
        sectionOrder: resumeClassic.defaultSectionOrder,
      }),
    );
    revalidatePath("/resumes");
    return { id: doc.id };
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
