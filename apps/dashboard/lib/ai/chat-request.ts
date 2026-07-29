import type { UIMessage } from "ai";
import { z } from "zod";

import { MAX_CHARS_PER_MESSAGE, MAX_MESSAGES, MAX_TOTAL_CHARS } from "./limits";

/**
 * The `POST /api/ai/chat` request boundary (docs/architecture/13-ai-layer.md).
 *
 * Pure — no env, no session, no SDK calls — so the enforcement can be unit
 * tested without a model or a Redis. The route composes it; this file decides
 * what a valid request *is*.
 *
 * Two things are being checked, and they are not the same thing:
 *
 * 1. **Shape.** `useChat` posts `UIMessage[]`, whose parts are an open union
 *    that grows with every SDK feature. Re-declaring that union here would be
 *    a copy of the SDK's type that goes stale on the next upgrade, so this
 *    validates the narrow subset the server actually consumes — a role and text
 *    parts — and passes the rest through. Doc 06's rule is that client input is
 *    never trusted; it is not that every field must be re-modelled.
 * 2. **Size.** Enforced separately from shape because an oversized request is
 *    perfectly well-formed. This is the cost control (see `limits.ts`), and it
 *    has to run before anything reaches the model.
 *
 * Trimming is deliberately **oldest-first, never newest**: the newest message
 * is the instruction the user just typed, and silently dropping it would answer
 * a question they didn't ask. A conversation that exceeds the character budget
 * even after trimming is rejected rather than truncated mid-message, because a
 * half-sentence prompt produces a confidently wrong answer instead of an error.
 */

const textPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

/** Non-text parts (files, tool calls, data parts) are structurally accepted and
 * ignored by this phase's handler — Phase 3+ reads them. `passthrough` keeps
 * them intact rather than stripping fields the SDK put there. */
const messagePartSchema = z.union([
  textPartSchema,
  z.looseObject({ type: z.string() }),
]);

const uiMessageSchema = z.looseObject({
  id: z.string().optional(),
  role: z.enum(["system", "user", "assistant"]),
  parts: z.array(messagePartSchema).min(1),
});

export const chatRequestSchema = z.object({
  messages: z.array(uiMessageSchema).min(1).max(MAX_MESSAGES),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export type ChatRequestProblem =
  | { kind: "invalid"; message: string }
  | { kind: "too-large"; message: string };

export type ChatRequestResult =
  | { ok: true; messages: UIMessage[] }
  | { ok: false; problem: ChatRequestProblem };

/** Characters a message contributes. Only text is counted — a file part's
 * bytes are not what the model is billed for, and this phase sends none. */
function messageChars(message: ChatRequest["messages"][number]): number {
  return message.parts.reduce(
    (total, part) =>
      part.type === "text" &&
      typeof (part as { text?: unknown }).text === "string"
        ? total + (part as { text: string }).text.length
        : total,
    0,
  );
}

/**
 * Parse and budget a chat request body. The single entry point the route calls;
 * it returns a discriminated result rather than throwing, so the route maps
 * each problem onto its own status code (400 vs 413) without a try/catch.
 */
export function parseChatRequest(body: unknown): ChatRequestResult {
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      problem: { kind: "invalid", message: "That request wasn't understood." },
    };
  }

  const { messages } = parsed.data;

  const oversized = messages.find(
    (message) => messageChars(message) > MAX_CHARS_PER_MESSAGE,
  );
  if (oversized) {
    return {
      ok: false,
      problem: {
        kind: "too-large",
        // Phrased for the case that actually produces it. Nobody types 12,000
        // characters; they paste a careers page, and "your message is too long"
        // sends them looking for a message they did not write.
        message: `That's longer than a job posting — keep it under ${MAX_CHARS_PER_MESSAGE.toLocaleString()} characters. Paste the role, responsibilities and requirements; leave out benefits and company history.`,
      },
    };
  }

  // Drop from the front while over budget. The loop always leaves at least one
  // message, so the newest turn survives by construction.
  const kept = [...messages];
  let total = kept.reduce((sum, message) => sum + messageChars(message), 0);
  while (total > MAX_TOTAL_CHARS && kept.length > 1) {
    const dropped = kept.shift();
    total -= dropped ? messageChars(dropped) : 0;
  }

  if (total > MAX_TOTAL_CHARS) {
    return {
      ok: false,
      problem: {
        kind: "too-large",
        message: "That conversation is too long. Start a new one to continue.",
      },
    };
  }

  // The cast is the deliberate counterpart to the loose part schema above: we
  // validated the fields the server reads and left the SDK's own union intact.
  return { ok: true, messages: kept as unknown as UIMessage[] };
}
