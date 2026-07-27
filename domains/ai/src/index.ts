/**
 * @resfolio/ai — the AI domain (docs/architecture/13-ai-layer.md).
 *
 * Deliberately small, and deliberately **not** where the model lives. Prompts,
 * provider selection, guards and every model call stay in `apps/dashboard`'s
 * `lib/ai/` where the product decisions are; what belongs in a domain is the
 * part that owns a table, which is the chat transcript.
 *
 * The root is pure — schema, title derivation, the storage ceilings — so it can
 * be imported by a client component and by tests without pulling in the database
 * client. `@resfolio/ai/server` is the only code that touches
 * `ai_chat_sessions`.
 */
export {
  deriveSessionTitle,
  isWorthSaving,
  messageText,
  sanitizeMessages,
  storedChatMessageSchema,
  storedChatMessagesSchema,
  storedChatPartSchema,
  MAX_INCOMING_MESSAGES,
  MAX_SESSION_CHARS,
  MAX_SESSIONS_PER_PROFILE,
  MAX_STORED_MESSAGES,
  MAX_TITLE_CHARS,
  UNTITLED_SESSION,
  type ChatSessionRecord,
  type ChatSessionSummary,
  type StoredChatMessage,
  type StoredChatPart,
} from "./session";
