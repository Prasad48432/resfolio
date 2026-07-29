import { and, desc, eq, inArray } from "drizzle-orm";

import { db, schema } from "@resfolio/database";

import {
  deriveSessionTitle,
  isWorthSaving,
  sanitizeMessages,
  storedChatMessagesSchema,
  MAX_SESSIONS_PER_PROFILE,
  type ChatSessionRecord,
  type ChatSessionSummary,
  type StoredChatMessage,
} from "../session";

/**
 * Chat-session persistence (docs/architecture/07-storage.md,
 * 13-ai-layer.md). **The only code that touches the `ai_chat_sessions`
 * table.**
 *
 * Every function takes `userId` and resolves it to the profile that user owns
 * before it queries — ownership is enforced here and never assumed from the
 * caller (docs 06, 10). That is the property that makes a session id safe to put
 * in a URL: a stranger's id resolves to nothing rather than to somebody else's
 * conversation.
 */

export class ChatSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatSessionError";
  }
}

/** The id of the profile a user owns, or throw. */
async function requireProfileId(userId: string): Promise<string> {
  const row = await db.query.profile.findFirst({
    where: eq(schema.profile.userId, userId),
    columns: { id: true },
  });
  if (!row) {
    throw new ChatSessionError("No profile exists for this user.");
  }
  return row.id;
}

function toSummary(row: {
  id: string;
  title: string;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
}): ChatSessionSummary {
  return {
    id: row.id,
    title: row.title,
    messageCount: row.messageCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * This profile's sessions, newest activity first.
 *
 * **Columns are listed explicitly so `messages` is not among them.** The rail
 * renders a title and a date; selecting the transcripts too would make opening
 * the chat page cost every conversation the user has ever had.
 */
export async function listChatSessions(
  userId: string,
): Promise<ChatSessionSummary[]> {
  const profileId = await requireProfileId(userId);

  const rows = await db
    .select({
      id: schema.aiChatSession.id,
      title: schema.aiChatSession.title,
      messageCount: schema.aiChatSession.messageCount,
      createdAt: schema.aiChatSession.createdAt,
      updatedAt: schema.aiChatSession.updatedAt,
    })
    .from(schema.aiChatSession)
    .where(eq(schema.aiChatSession.profileId, profileId))
    .orderBy(desc(schema.aiChatSession.updatedAt))
    .limit(MAX_SESSIONS_PER_PROFILE);

  return rows.map(toSummary);
}

/**
 * One session with its transcript, or `null`.
 *
 * Null rather than a throw for a missing id, because the common way to reach
 * this is a stale link or a session deleted in another tab — neither is an
 * error, and both should land the user in a working chat rather than on an error
 * page.
 */
export async function getChatSession(
  userId: string,
  sessionId: string,
): Promise<ChatSessionRecord | null> {
  const profileId = await requireProfileId(userId);

  const row = await db.query.aiChatSession.findFirst({
    where: and(
      eq(schema.aiChatSession.id, sessionId),
      eq(schema.aiChatSession.profileId, profileId),
    ),
  });

  if (!row) {
    return null;
  }

  // Re-validated on the way out as well as in: a transcript written before a
  // schema change should fail loudly here rather than reach the chat as a
  // message it cannot render.
  const parsed = storedChatMessagesSchema.safeParse(row.messages);

  return {
    ...toSummary(row),
    // A transcript that no longer validates is shown as empty rather than
    // throwing the page it was opened from. The session's existence, title and
    // date are still true; only its content is unreadable.
    messages: parsed.success ? parsed.data : [],
  };
}

/**
 * Create or update a session, and keep the history bounded.
 *
 * **An upsert on a client-generated id**, which is what lets the chat start
 * talking before anything has been saved: the browser mints the id when the
 * conversation opens, the first save creates the row, and every later save
 * updates it. There is no create-then-adopt step and therefore no window in
 * which a turn belongs to no session.
 *
 * The title is derived on **every** write rather than only on insert. That
 * costs nothing and covers the case where the first message is edited or a
 * transcript is trimmed past its original opening — a rail row that no longer
 * matches the conversation it names is worse than no rail.
 */
export async function saveChatSession(
  userId: string,
  input: {
    id: string;
    messages: StoredChatMessage[];
    /** A name the caller derived from something this package cannot read — the
     * posting a conversation is about. Optional, and beaten by nothing: see
     * `deriveSessionTitle`. */
    subject?: string | null;
  },
): Promise<ChatSessionSummary | null> {
  const profileId = await requireProfileId(userId);

  const messages = sanitizeMessages(input.messages);

  // Nothing the user said, nothing to save. Returning null rather than throwing:
  // the client saves on every settled turn and an empty one is ordinary.
  if (!isWorthSaving(messages)) {
    return null;
  }

  const title = deriveSessionTitle(messages, { subject: input.subject });
  const now = new Date();

  const [row] = await db
    .insert(schema.aiChatSession)
    .values({
      id: input.id,
      profileId,
      title,
      messages,
      messageCount: messages.length,
    })
    .onConflictDoUpdate({
      target: schema.aiChatSession.id,
      // **Scoped to the owner.** Without this, a request naming somebody else's
      // session id would update their row: `id` is the conflict target and the
      // primary key, so the insert's own `profile_id` never gets a say. This is
      // `setWhere` — the `WHERE` on `DO UPDATE`, applied to the *existing* row —
      // not `targetWhere`, which describes a partial index. The plain `where`
      // key is deprecated precisely because the two read alike.
      setWhere: eq(schema.aiChatSession.profileId, profileId),
      set: {
        title,
        messages,
        messageCount: messages.length,
        updatedAt: now,
      },
    })
    .returning({
      id: schema.aiChatSession.id,
      title: schema.aiChatSession.title,
      messageCount: schema.aiChatSession.messageCount,
      createdAt: schema.aiChatSession.createdAt,
      updatedAt: schema.aiChatSession.updatedAt,
    });

  // The conflict target matched a row this profile does not own, so nothing was
  // written and nothing is returned. Silent by design: telling the caller that
  // an id exists elsewhere is telling them something about another account.
  if (!row) {
    return null;
  }

  await pruneOldestSessions(profileId);

  return toSummary(row);
}

/**
 * Drop everything past the per-profile ceiling, oldest first.
 *
 * Runs after a save rather than on a schedule, because the only moment the count
 * can grow is the moment one is written — and a cron for a bound that one line
 * of SQL maintains is infrastructure bought for nothing.
 */
async function pruneOldestSessions(profileId: string): Promise<void> {
  const keep = await db
    .select({ id: schema.aiChatSession.id })
    .from(schema.aiChatSession)
    .where(eq(schema.aiChatSession.profileId, profileId))
    .orderBy(desc(schema.aiChatSession.updatedAt))
    .limit(MAX_SESSIONS_PER_PROFILE);

  if (keep.length < MAX_SESSIONS_PER_PROFILE) {
    return;
  }

  const doomed = await db
    .select({ id: schema.aiChatSession.id })
    .from(schema.aiChatSession)
    .where(eq(schema.aiChatSession.profileId, profileId))
    .orderBy(desc(schema.aiChatSession.updatedAt))
    .offset(MAX_SESSIONS_PER_PROFILE);

  if (doomed.length === 0) {
    return;
  }

  await db.delete(schema.aiChatSession).where(
    and(
      eq(schema.aiChatSession.profileId, profileId),
      inArray(
        schema.aiChatSession.id,
        doomed.map((row) => row.id),
      ),
    ),
  );
}

/**
 * Delete one session.
 *
 * Returns whether a row went, so the caller can tell "deleted" from "already
 * gone" — the second is what a double-click produces and is not a failure.
 * There is no soft delete and no undo: the user asked for a conversation to stop
 * existing, and a trash bin for chat history is a second list to explain.
 */
export async function deleteChatSession(
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const profileId = await requireProfileId(userId);

  const deleted = await db
    .delete(schema.aiChatSession)
    .where(
      and(
        eq(schema.aiChatSession.id, sessionId),
        eq(schema.aiChatSession.profileId, profileId),
      ),
    )
    .returning({ id: schema.aiChatSession.id });

  return deleted.length > 0;
}

/** Delete every session this profile has. The "clear history" affordance; the
 * count is returned so the confirmation can say what it did. */
export async function deleteAllChatSessions(userId: string): Promise<number> {
  const profileId = await requireProfileId(userId);

  const deleted = await db
    .delete(schema.aiChatSession)
    .where(eq(schema.aiChatSession.profileId, profileId))
    .returning({ id: schema.aiChatSession.id });

  return deleted.length;
}
