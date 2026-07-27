import { z } from "zod";

/**
 * Chat sessions — the pure half (docs/architecture/13-ai-layer.md, Phase 7).
 *
 * A session is **a transcript, not a conversation with the model**. Nothing in
 * this file talks to a provider, and nothing here is sent to one: the request
 * context is still *built* per turn by the dashboard's `chat-request.ts` and
 * `profile-context.ts`, exactly as it was when transcripts were thrown away.
 * What persistence adds is that the user can come back to what was said.
 *
 * Three rules the schema enforces rather than the caller remembering:
 *
 * - **Reasoning is never stored.** Doc 13 does not render chain-of-thought, and
 *   a store is a stronger commitment than a render — it would put the model's
 *   private working about somebody's career in a database, forever, to be
 *   displayed by nothing. `sanitizeMessages` drops those parts on the way in,
 *   which is also where most of the bytes are.
 * - **A transcript is bounded.** Two ceilings, because either alone is
 *   reachable: a great many small turns, or one turn carrying a large tool
 *   result. Over budget, the *oldest* messages go — the same direction
 *   `chat-request.ts` trims in, so a reloaded session and a sent request agree
 *   about which end of a conversation matters.
 * - **The stored shape is validated loosely on purpose.** A `UIMessage` part is
 *   an open union owned by the AI SDK and by whichever tools the app defines
 *   this week; a strict schema here would make adding a tool to the dashboard a
 *   breaking change in a domain package that has no business knowing about it.
 *   What is checked is the envelope — role, id, and that every part is an object
 *   naming its type — which is everything the reader depends on.
 */

/** Messages kept in one stored transcript. Beyond this the oldest go. */
export const MAX_STORED_MESSAGES = 100;

/**
 * The largest transcript this will *accept*, as opposed to keep.
 *
 * **Deliberately much larger than {@link MAX_STORED_MESSAGES}, and the gap is the
 * point.** The client's array grows without bound over a long conversation — it
 * is `chat-request.ts` that trims what reaches the model, not the transcript on
 * screen — so a schema capped at the storage ceiling would start *rejecting*
 * saves at exactly the moment a conversation got interesting, and the history
 * would silently stop updating. Trimming is `sanitizeMessages`' job; this number
 * exists only to bound an absurd payload before it is parsed.
 */
export const MAX_INCOMING_MESSAGES = 1_000;

/**
 * The serialized transcript, in characters. Sized against the request budget it
 * feeds rather than against the column: `MAX_TOTAL_CHARS` (40k) is what any of
 * this can ever reach the model as, and a stored transcript wants headroom over
 * that for the tool outputs a request drops.
 */
export const MAX_SESSION_CHARS = 200_000;

/** Sessions kept per profile. A history list is a tool, not an archive — past
 * this the oldest are deleted on the next save, so the feature cannot become an
 * unbounded table nobody chose to fill. */
export const MAX_SESSIONS_PER_PROFILE = 100;

/** A title has to fit one line of a 16rem rail without a tooltip. */
export const MAX_TITLE_CHARS = 72;

/** What a session with nothing in it is called. Also the fallback for a first
 * message that is somehow all whitespace — a blank row in the rail is a row the
 * user cannot identify or trust enough to click. */
export const UNTITLED_SESSION = "New chat";

/** Parts whose only reader is the model, or which describe stream mechanics
 * rather than content. Dropped before storage: none of them renders, and
 * `reasoning` is the one that would be a privacy commitment as well as a cost. */
const DROPPED_PART_TYPES = new Set(["reasoning", "step-start"]);

/**
 * One stored message. `parts` stays open (`looseObject`) so the app's tool parts
 * survive a round trip unchanged — see the header note on why this is not
 * strict.
 */
export const storedChatPartSchema = z.looseObject({ type: z.string().min(1) });

export const storedChatMessageSchema = z.object({
  id: z.string().min(1).max(128),
  /** The SDK's own roles. `system` never appears in a transcript this product
   * writes — the system prompt is built per request — but a stored one would be
   * inert rather than dangerous, and rejecting it would fail a whole session. */
  role: z.enum(["user", "assistant", "system"]),
  parts: z.array(storedChatPartSchema).max(200),
  metadata: z.unknown().optional(),
});

/** Bounded by {@link MAX_INCOMING_MESSAGES}, **not** by the storage ceiling —
 * see that constant for why the difference matters. */
export const storedChatMessagesSchema = z
  .array(storedChatMessageSchema)
  .max(MAX_INCOMING_MESSAGES);

export type StoredChatPart = z.infer<typeof storedChatPartSchema>;
export type StoredChatMessage = z.infer<typeof storedChatMessageSchema>;

/** A row of the history rail: everything needed to list and identify a session,
 * and none of its content. Listing fifty sessions must not mean loading fifty
 * transcripts. */
export interface ChatSessionSummary {
  id: string;
  title: string;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** A session with its transcript — what opening one returns. */
export interface ChatSessionRecord extends ChatSessionSummary {
  messages: StoredChatMessage[];
}

/** The visible text of a message, in reading order. Used for titles; also the
 * only place that knows a text part is `{ type: "text", text }`. */
export function messageText(message: StoredChatMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Drop what must not be stored, then trim to budget.
 *
 * **Order matters and is not cosmetic**: dropping reasoning first is what stops
 * a single heavily-reasoned turn evicting real messages from a transcript that
 * would otherwise fit comfortably.
 *
 * Trimming is oldest-first and by whole messages — never by truncating one — for
 * the same reason `profile-context.ts` drops whole items: half a message is a
 * message that says something its author did not.
 */
export function sanitizeMessages(
  messages: StoredChatMessage[],
): StoredChatMessage[] {
  const stripped = messages.map((message) => ({
    ...message,
    parts: message.parts.filter((part) => !DROPPED_PART_TYPES.has(part.type)),
  }));

  const capped = stripped.slice(-MAX_STORED_MESSAGES);

  // Measured on the serialized form, because that is what the column stores and
  // therefore the only measure that cannot be wrong by an encoding.
  let start = 0;
  while (
    start < capped.length - 1 &&
    JSON.stringify(capped.slice(start)).length > MAX_SESSION_CHARS
  ) {
    start += 1;
  }

  return capped.slice(start);
}

/**
 * The title, derived from the first thing the user said.
 *
 * **Derived, never asked for and never generated.** A dialog asking for a name
 * before a conversation exists is a tax on starting one, and spending a model
 * call to name a chat is paying for a summary of something the user is looking
 * at. The first question is what someone actually scans the list for.
 *
 * Cut on a word boundary when there is one to cut on, so the rail shows a phrase
 * rather than a severed word — the ellipsis already says it continues.
 */
export function deriveSessionTitle(messages: StoredChatMessage[]): string {
  const first = messages.find((message) => message.role === "user");
  const text = first ? messageText(first) : "";

  if (text === "") {
    return UNTITLED_SESSION;
  }

  if (text.length <= MAX_TITLE_CHARS) {
    return text;
  }

  const clipped = text.slice(0, MAX_TITLE_CHARS);
  const lastSpace = clipped.lastIndexOf(" ");
  // Only honour a word boundary in the last third; a break at character 4 of 72
  // is a worse title than a clean truncation.
  const cut =
    lastSpace > MAX_TITLE_CHARS * 0.6 ? clipped.slice(0, lastSpace) : clipped;

  return `${cut.trimEnd()}…`;
}

/** Whether a transcript is worth persisting at all. An empty chat the user
 * opened and left is not a session — writing one would fill the rail with rows
 * that say nothing and cannot be told apart. */
export function isWorthSaving(messages: StoredChatMessage[]): boolean {
  return messages.some((message) => message.role === "user");
}
