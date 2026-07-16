/**
 * The canonical autosave status vocabulary, shared by every editor.
 *
 * Each editor previously declared its own union and its own label map, so the
 * profile said "Offline — will retry when you edit" while the portfolio said
 * "Offline — will retry" for the identical state. One definition means one
 * wording, and a new editor gets the whole vocabulary for free.
 *
 * Not every editor reaches every state — only the profile validates against a
 * schema (`invalid`) or carries a revision (`conflict`) — but the surplus
 * costs nothing and stops the next editor inventing a sixth spelling.
 */
export type SaveStatus =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "invalid"
  | "offline"
  | "conflict";
