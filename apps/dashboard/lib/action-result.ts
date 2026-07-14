import { z } from "zod";

/**
 * The one ActionResult shape shared across the codebase
 * (docs/architecture/06-api-architecture.md). Actions never throw for
 * expected failures — forms handle every action uniformly.
 */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * An *expected* failure with a user-facing message (ownership, invariant,
 * conflict…). Thrown by handlers/domains, normalized to `{ ok: false }` —
 * never reported to Sentry.
 */
export class ActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionError";
  }
}

const GENERIC_ERROR = "Something went wrong. Please try again.";

function toFieldErrors(
  error: z.ZodError,
): Record<string, string[]> | undefined {
  const { fieldErrors } = z.flattenError(error);
  const entries = Object.entries(fieldErrors).filter(
    (entry): entry is [string, string[]] => Array.isArray(entry[1]),
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/**
 * Pure action pipeline: parse raw input with the schema, run the handler,
 * normalize every failure mode into ActionResult. Session resolution is the
 * caller's job (`createAction` in actions.ts) so this stays unit-testable.
 */
export async function executeAction<TSchema extends z.ZodType, TData>(config: {
  input: TSchema;
  rawInput: unknown;
  handler: (input: z.output<TSchema>) => Promise<TData>;
  /** Unexpected-failure hook — Sentry + log wiring in production code. */
  onUnexpectedError?: (error: unknown) => void;
}): Promise<ActionResult<TData>> {
  const parsed = config.input.safeParse(config.rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }
  try {
    return { ok: true, data: await config.handler(parsed.data) };
  } catch (error) {
    if (error instanceof ActionError) {
      return { ok: false, error: error.message };
    }
    config.onUnexpectedError?.(error);
    return { ok: false, error: GENERIC_ERROR };
  }
}
