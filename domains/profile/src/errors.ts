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

/** A handle another profile already holds — surfaced to the user as "taken". */
export class HandleTakenError extends Error {
  constructor(readonly handle: string) {
    super(`The name "${handle}" is already taken.`);
    this.name = "HandleTakenError";
  }
}
