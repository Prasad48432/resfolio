"use server";

import { newResumeDocumentInput } from "@resfolio/document";
import {
  createDocument,
  deleteDocument,
  updateDocument,
} from "@resfolio/document/server";
import { mintRenderToken } from "@resfolio/document/token";
import { getOrCreateProfile } from "@resfolio/profile/server";
import {
  defaultResumeClassicConfig,
  resumeClassic,
  resumeClassicConfigSchema,
} from "@resfolio/template-resume-classic";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ActionError, createAction } from "@/lib/actions";
import { env } from "@/lib/env";

/**
 * Resume document mutations (docs/architecture/06-api-architecture.md): thin
 * adapters over `@resfolio/document/server`. Only `resume-classic` exists, so
 * template choice is fixed here; the config is validated with the template's
 * own schema before it is stored (doc 05).
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
    config: resumeClassicConfigSchema.optional(),
  }),
  handler: async ({ id, name, config }, ctx) => {
    const updated = await updateDocument(ctx.userId, id, { name, config });
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
 * Mint a short-lived signed URL to the `apps/sites` print route for this
 * document, rendering the user's current **draft** (4E: the print route looks
 * the document up by id). Optional — requires `PRINT_TOKEN_SECRET` + `SITES_URL`;
 * absent, the UI hides the affordance and this returns a friendly error.
 */
export const mintResumePrintUrlAction = createAction({
  name: "resume.mintPrintUrl",
  input: z.object({ id: z.string().min(1) }),
  handler: async ({ id }, ctx) => {
    const secret = env.PRINT_TOKEN_SECRET;
    const sitesUrl = env.SITES_URL;
    if (!secret || !sitesUrl) {
      throw new ActionError("Print export isn't configured in this environment.");
    }
    const token = mintRenderToken(
      { source: "draft", ref: ctx.userId, document: { kind: "stored", id } },
      secret,
    );
    const url = `${sitesUrl.replace(/\/$/, "")}/render/resume/${encodeURIComponent(
      id,
    )}?token=${encodeURIComponent(token)}`;
    return { url };
  },
});
