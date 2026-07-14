import { requireSession, type Session } from "@resfolio/auth";
import { captureError, createLogger } from "@resfolio/observability";
import type { z } from "zod";

import { executeAction, type ActionResult } from "./action-result";

const log = createLogger("actions");

export type ActionContext = {
  userId: string;
  session: Session;
};

/**
 * The action helper every Server Action uses
 * (docs/architecture/06-api-architecture.md): resolve session → parse input
 * → call the (future domain) handler → return a typed ActionResult. Actions
 * built with this contain no logic. Unexpected failures are captured with
 * context; expected ActionErrors are not noise-reported.
 */
export function createAction<TSchema extends z.ZodType, TData>(config: {
  name: string;
  input: TSchema;
  handler: (input: z.output<TSchema>, ctx: ActionContext) => Promise<TData>;
}): (rawInput: unknown) => Promise<ActionResult<TData>> {
  return async (rawInput) => {
    // Actions are entry points — they never inherit trust from the page
    // that rendered them (doc 10, route guarding step 3).
    const session = await requireSession();
    const ctx: ActionContext = { userId: session.user.id, session };
    return executeAction({
      input: config.input,
      rawInput,
      handler: (input) => config.handler(input, ctx),
      onUnexpectedError: (error) => {
        log.error({ err: error, action: config.name }, "action failed");
        captureError(error, { action: config.name, userId: ctx.userId });
      },
    });
  };
}

export { ActionError, type ActionResult } from "./action-result";
