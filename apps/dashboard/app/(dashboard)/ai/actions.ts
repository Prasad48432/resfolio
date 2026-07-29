"use server";

import { storedChatMessagesSchema } from "@resfolio/ai";
import {
  deleteAllChatSessions,
  deleteChatSession,
  saveChatSession,
} from "@resfolio/ai/server";
import {
  MAX_PROPOSED_CHANGES,
  applyProfileChanges,
  profileChangeSchema,
  reviewProfileChanges,
} from "@resfolio/profile";
import {
  StaleDraftError,
  getOrCreateProfile,
  saveDraft,
} from "@resfolio/profile/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ActionError, createAction } from "@/lib/actions";
import {
  UNNAMED_POSTING,
  postingsInTranscript,
} from "@/lib/ai/second-posting";

/**
 * Applying accepted AI proposals (docs/architecture/13-ai-layer.md, Phase 3).
 *
 * **The only write in the AI feature, and it is a Server Action rather than
 * part of the streaming route.** Doc 06's rule stands unchanged: the route
 * streams because `useChat` needs a body that is still being written; every
 * mutation is an action. So `LLM → database mutation` has no code path — the
 * model produced an object, a human clicked, and this ran.
 *
 * Three things it deliberately does not do:
 *
 * - **It does not trust the changes it is handed.** They arrive from a browser
 *   and are re-parsed with the domain schema, then re-run through the domain
 *   guard against the profile as it stands *now*. A change validated ninety
 *   seconds ago, against content the user has since edited in another tab, is
 *   caught here rather than written. Model output that has been round-tripped
 *   through a client is not less hostile than model output.
 * - **It does not take a `draftRev` from the client.** The profile editor does,
 *   because it holds a whole form the user has been typing into; this page
 *   holds no draft at all. Reading the current revision and writing it back in
 *   the same request narrows the lost-update window to milliseconds, and a
 *   concurrent editor's own autosave then fails its optimistic check and
 *   rebases — which is the existing behaviour, working in the right direction.
 * - **It does not apply one change per call.** Accept-one and Apply-all are the
 *   same action with a different array, so a batch is one revision and one
 *   round trip instead of six of each. Per-change accept is still the default
 *   the UI leads with — the batching is in the transport, not in the consent.
 */

const applyChangesInput = z.object({
  changes: z.array(profileChangeSchema).min(1).max(MAX_PROPOSED_CHANGES),
});

export const applyProfileChangesAction = createAction({
  name: "ai.applyProfileChanges",
  input: applyChangesInput,
  handler: async ({ changes }, ctx) => {
    const draft = await getOrCreateProfile(ctx.userId);
    const review = reviewProfileChanges(draft.data, changes);

    if (review.valid.length === 0) {
      // Every change was refused against the *current* draft, which for a
      // proposal the server already validated means the profile moved. Say that
      // rather than "invalid": the user did nothing wrong.
      throw new ActionError(
        "Those suggestions no longer match your profile — it changed after they were made. Ask again for fresh ones.",
      );
    }

    const next = applyProfileChanges(
      draft.data,
      review.valid.map((entry) => entry.change),
    );

    try {
      await saveDraft(ctx.userId, next, draft.draftRev);
    } catch (error) {
      if (error instanceof StaleDraftError) {
        throw new ActionError(
          "Your profile was saved somewhere else while this was applying. Try again.",
        );
      }
      throw error;
    }

    // The editor reads its draft on the server, so without this it would show
    // pre-AI content until something else forced a refetch.
    revalidatePath("/profile");

    return {
      applied: review.valid.length,
      skipped: review.rejected.length,
    };
  },
});

/**
 * Saving a transcript (docs/architecture/13-ai-layer.md, Phase 7).
 *
 * **Persistence did not earn a fourth route handler**, and could not have: doc
 * 13's test is that a route exists only where a stream is the product
 * requirement. This is a write of a finished thing, which is the definition of a
 * Server Action.
 *
 * It is called once per **settled turn**, not per token — there is nothing to
 * save mid-stream that will not be truer a second later, and a write per chunk
 * would be a write per chunk. The client mints the session id when the
 * conversation opens, so this is an upsert and the first turn of a new chat and
 * the fortieth turn of an old one are the same call.
 *
 * The transcript is **re-validated by the domain**, not trusted: it arrives from
 * a browser, and `sanitizeMessages` is what drops reasoning parts and enforces
 * the ceilings. Doing that here rather than in the client is the difference
 * between a rule and a request.
 *
 * `revalidatePath` is deliberately **absent**. The chat page is the caller, the
 * history rail keeps its list in client state, and refreshing the route
 * mid-conversation would remount the transcript the user is reading to tell them
 * something they can already see.
 */
export const saveChatSessionAction = createAction({
  name: "ai.saveChatSession",
  input: z.object({
    id: z.uuid(),
    messages: storedChatMessagesSchema,
  }),
  handler: async ({ id, messages }, ctx) => {
    /**
     * What the conversation is *about*, when the transcript says so outright.
     *
     * A chat that analysed a posting is that posting — "Full Stack Developer at
     * Revival Labs" is a better row than any sentence in it, and the sentence
     * this rail used to show was the first 72 characters of a pasted job
     * description. Read here rather than in the domain, and with the module the
     * composer already uses, because knowing that `tool-analyzeJobMatch` exists
     * is the app's business: `@resfolio/ai` stores transcripts and deliberately
     * knows nothing about the tools in them.
     */
    const [posting] = postingsInTranscript(messages);
    const subject =
      posting && posting.title !== UNNAMED_POSTING ? posting.title : null;

    const saved = await saveChatSession(ctx.userId, { id, messages, subject });

    // Null means there was nothing worth saving (no user turn) or the id belongs
    // to someone else — neither is an error the user can act on, and the second
    // must not be distinguishable from the first.
    return { session: saved };
  },
});

/**
 * Delete one saved chat.
 *
 * **No confirmation dialog and no undo, on purpose.** A conversation is not a
 * document: nothing else links to it, deleting it destroys no work the user
 * cannot ask for again, and a modal in front of a row in a history list is a
 * tax on tidying up. What it does get is an honest answer — `deleted: false`
 * when the row was already gone, which is what a double-click produces.
 */
export const deleteChatSessionAction = createAction({
  name: "ai.deleteChatSession",
  input: z.object({ id: z.uuid() }),
  handler: async ({ id }, ctx) => {
    const deleted = await deleteChatSession(ctx.userId, id);

    // Unlike a save, this one *does* revalidate: the deleted session may be the
    // one the URL names, and the page has to stop serving it.
    revalidatePath("/ai");

    return { deleted };
  },
});

/** Delete every saved chat. The one destructive action here that does ask first
 * — it is unbounded in a way deleting a row you are looking at is not. */
export const clearChatSessionsAction = createAction({
  name: "ai.clearChatSessions",
  input: z.object({}),
  handler: async (_input, ctx) => {
    const deleted = await deleteAllChatSessions(ctx.userId);
    revalidatePath("/ai");
    return { deleted };
  },
});
