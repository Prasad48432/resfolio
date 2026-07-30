/**
 * @resfolio/profile/server — database-backed profile operations
 * (docs/architecture/01-profile-engine.md, 07-storage.md). Kept separate
 * from the package root so the pure engine (schema, view, edit helpers) can
 * be imported into client components and tests without pulling in the
 * database client.
 */
export {
  claimHandle,
  finishOnboarding,
  getOrCreateProfile,
  getProfile,
  getProfileByHandle,
  getProfileVersionById,
  getPublishedProfile,
  isHandleAvailable,
  isOnboardingComplete,
  publishProfile,
  saveDraft,
  setPublicResume,
  StaleDraftError,
  type ProfileDraft,
  type ProfileHandleRef,
  type PublishResult,
} from "./repository";
