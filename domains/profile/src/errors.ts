/** Stored/derived profile data violated the engine's invariants. */
export class ProfileDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileDataError";
  }
}

/** The auth context has no profile row (callers create via getOrCreateProfile). */
export class ProfileNotFoundError extends Error {
  constructor() {
    super("No profile exists for this user.");
    this.name = "ProfileNotFoundError";
  }
}
