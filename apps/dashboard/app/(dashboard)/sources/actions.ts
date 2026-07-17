"use server";

import { ROUTE_TARGETS } from "@resfolio/integrations";
import {
  ConnectionNotFoundError,
  createConnection,
  deleteConnection,
  dismissItem,
  importItem,
  IntegrationDataError,
  runImport,
  StagedItemNotFoundError,
  TokenKeyMissingError,
} from "@resfolio/integrations/server";
import { CandidateApplyError } from "@resfolio/integrations";
import { getOrCreateProfile } from "@resfolio/profile/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ActionError, createAction } from "@/lib/actions";

/**
 * Sources mutations (docs/architecture/12-integrations-and-sync.md,
 * 06-api-architecture.md): thin adapters over `@resfolio/integrations/server`.
 * Importing an item mutates the profile **draft** through the domain —
 * publish stays a separate act at `/profile`, so `/profile` is revalidated
 * whenever an import lands there. Nothing reaches the profile without one of
 * these explicit user actions.
 */

function toActionError(error: unknown): never {
  if (
    error instanceof IntegrationDataError ||
    error instanceof ConnectionNotFoundError ||
    error instanceof StagedItemNotFoundError ||
    error instanceof CandidateApplyError
  ) {
    throw new ActionError(error.message);
  }
  if (error instanceof TokenKeyMissingError) {
    throw new ActionError(
      "Token storage isn't configured in this environment.",
    );
  }
  throw error;
}

/** The public (no-credential) connectors the gallery can connect directly —
 * in V1 that is every connector there is. The connector's own Zod input schema
 * validates inside `createConnection`. */
const PUBLIC_CONNECTOR_IDS = [
  "github",
  "rss",
  "devto",
  "stackoverflow",
] as const;

export const connectPublicSourceAction = createAction({
  name: "sources.connectPublic",
  input: z.object({
    connectorId: z.enum(PUBLIC_CONNECTOR_IDS),
    input: z.record(z.string(), z.string().trim().min(1).max(2048)),
  }),
  handler: async ({ connectorId, input }, ctx) => {
    // First-visit safety: connections attach to the user's profile.
    await getOrCreateProfile(ctx.userId, {
      name: ctx.session.user.name,
      email: ctx.session.user.email,
    });
    try {
      const connection = await createConnection(ctx.userId, {
        connectorId,
        input,
      });
      // Import immediately — connecting should surface items to triage, not
      // an empty row waiting for a second click.
      const summary = await runImport(ctx.userId, connection.id);
      revalidatePath("/sources");
      return {
        connectionId: connection.id,
        runStatus: summary.status,
        runError: summary.error,
        counts: summary.counts,
      };
    } catch (error) {
      toActionError(error);
    }
  },
});

export const checkForUpdatesAction = createAction({
  name: "sources.checkForUpdates",
  input: z.object({ connectionId: z.string().uuid() }),
  handler: async ({ connectionId }, ctx) => {
    try {
      const summary = await runImport(ctx.userId, connectionId);
      revalidatePath("/sources");
      return {
        runStatus: summary.status,
        runError: summary.error,
        counts: summary.counts,
      };
    } catch (error) {
      toActionError(error);
    }
  },
});

export const removeConnectionAction = createAction({
  name: "sources.remove",
  input: z.object({ connectionId: z.string().uuid() }),
  handler: async ({ connectionId }, ctx) => {
    try {
      await deleteConnection(ctx.userId, connectionId);
      revalidatePath("/sources");
      return { removed: true };
    } catch (error) {
      toActionError(error);
    }
  },
});

export const importItemAction = createAction({
  name: "sources.import",
  input: z.object({
    itemId: z.string().uuid(),
    /** User destination override — required for unrouted items. */
    routeTo: z.enum(ROUTE_TARGETS).optional(),
    /** Inline edit-before-import payload patches (re-validated by the
     * domain's candidate schema before anything reaches the draft). */
    edits: z.record(z.string(), z.string()).optional(),
  }),
  handler: async ({ itemId, routeTo, edits }, ctx) => {
    try {
      const result = await importItem(ctx.userId, itemId, { routeTo, edits });
      revalidatePath("/sources");
      // The import landed in the profile draft — the editor must re-read it.
      revalidatePath("/profile");
      return { appliedItemId: result.appliedItemId };
    } catch (error) {
      toActionError(error);
    }
  },
});

export const dismissItemAction = createAction({
  name: "sources.dismiss",
  input: z.object({ itemId: z.string().uuid() }),
  handler: async ({ itemId }, ctx) => {
    try {
      await dismissItem(ctx.userId, itemId);
      revalidatePath("/sources");
      return { dismissed: true };
    } catch (error) {
      toActionError(error);
    }
  },
});
