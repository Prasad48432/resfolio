"use server";

import { jobStatusSchema, updateJobDetailsInputSchema } from "@resfolio/job";
import {
  deleteJobMatch,
  listJobMatches,
  setJobStatus,
  updateJobDetails,
  JobMatchError,
} from "@resfolio/job/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ActionError, createAction } from "@/lib/actions";
import { toJobCardView } from "@/lib/jobs";

/**
 * Job tracker mutations (docs/architecture/06-api-architecture.md).
 *
 * Thin adapters over `@resfolio/job/server`, like every other `actions.ts` here:
 * no logic, no database, no decision about what a status means. The state
 * machine, the history it records and the refusal to record a no-op move all
 * live in the domain.
 *
 * **These are the *only* writes the tracker has**, and there is no route handler
 * beside them — nothing here streams and nothing here is a download, which is
 * the whole test doc 06 applies.
 */

function toActionError(error: unknown): never {
  if (error instanceof JobMatchError) {
    throw new ActionError(error.message);
  }
  throw error;
}

const jobIdSchema = z.object({ jobId: z.uuid() });

/**
 * Move a card between columns.
 *
 * **No `revalidatePath` on success, deliberately.** The board is optimistic: the
 * card has already moved on screen by the time this resolves, and a route
 * revalidation would re-render the page underneath a drag that is over — which
 * is exactly the serialised-behind-the-wrong-event bug the Sources triage board
 * was rewritten to avoid. The list is re-read on the next navigation, and the
 * client restores the card itself if this fails.
 */
export const moveJobAction = createAction({
  name: "jobs.move",
  input: jobIdSchema.extend({ status: jobStatusSchema }),
  handler: async ({ jobId, status }, ctx) => {
    try {
      const moved = await setJobStatus(ctx.userId, jobId, status);
      if (!moved) {
        throw new ActionError("That job no longer exists.");
      }
      return { moved };
    } catch (error) {
      toActionError(error);
    }
  },
});

export const updateJobAction = createAction({
  name: "jobs.update",
  input: jobIdSchema.extend(updateJobDetailsInputSchema.shape),
  handler: async ({ jobId, ...details }, ctx) => {
    try {
      const job = await updateJobDetails(ctx.userId, jobId, details);
      if (!job) {
        throw new ActionError("That job no longer exists.");
      }
      revalidatePath("/jobs");
      return { job: toJobCardView(job) };
    } catch (error) {
      toActionError(error);
    }
  },
});

export const deleteJobAction = createAction({
  name: "jobs.delete",
  input: jobIdSchema,
  handler: async ({ jobId }, ctx) => {
    try {
      const deleted = await deleteJobMatch(ctx.userId, jobId);
      revalidatePath("/jobs");
      return { deleted };
    } catch (error) {
      toActionError(error);
    }
  },
});

/** Re-read the board. Used after a failed optimistic move, so the client can
 * resynchronise with the truth rather than guessing what it should undo. */
export const listJobsAction = createAction({
  name: "jobs.list",
  input: z.object({}),
  handler: async (_input, ctx) => {
    try {
      const jobs = await listJobMatches(ctx.userId);
      return { jobs: jobs.map(toJobCardView) };
    } catch (error) {
      toActionError(error);
    }
  },
});
