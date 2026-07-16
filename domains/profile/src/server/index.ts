/**
 * @resfolio/profile/server — database-backed profile operations
 * (docs/architecture/01-profile-engine.md, 07-storage.md). Kept separate
 * from the package root so the pure engine (schema, view, edit helpers) can
 * be imported into client components and tests without pulling in the
 * database client.
 */
export {
  getOrCreateProfile,
  getProfile,
  getProfileVersionById,
  getPublishedProfile,
  publishProfile,
  saveDraft,
  StaleDraftError,
  type ProfileDraft,
  type PublishResult,
} from "./repository";
