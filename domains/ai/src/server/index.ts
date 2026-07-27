/**
 * @resfolio/ai/server — database-backed chat-session operations
 * (docs/architecture/13-ai-layer.md, 07-storage.md). Kept separate from the
 * package root so the pure half (schema, title derivation, ceilings) can be
 * imported into client components and tests without pulling in the database
 * client.
 */
export {
  ChatSessionError,
  deleteAllChatSessions,
  deleteChatSession,
  getChatSession,
  listChatSessions,
  saveChatSession,
} from "./repository";
