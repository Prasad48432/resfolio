import { ProfileDataError } from "./errors";
import {
  PROFILE_SCHEMA_VERSION,
  profileSchema,
  type Profile,
} from "./schema/profile";

/**
 * Lazy read-time migration (docs/architecture/01-profile-engine.md):
 * readers migrate, writers persist latest. Each step is a pure
 * `v(n) → v(n+1)` function over the stored shape; `migrateProfile` runs the
 * chain and then validates against the current schema, so a bug in any step
 * surfaces as a loud error, never as silently corrupted data.
 */
type StoredProfile = Record<string, unknown>;

interface MigrationStep {
  /** The schemaVersion this step upgrades *from*. */
  from: number;
  migrate: (data: StoredProfile) => StoredProfile;
}

/**
 * One entry per historical version, in order; the first lands when schema
 * v2 exists. `migrateProfile` stamps the new schemaVersion itself, so steps
 * only transform content.
 */
const MIGRATION_STEPS: readonly MigrationStep[] = [];

export function migrateProfile(data: unknown): Profile {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new ProfileDataError("Stored profile data must be an object.");
  }

  let current = data as StoredProfile;
  const version = current["schemaVersion"];
  if (
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < 1
  ) {
    throw new ProfileDataError(
      "Stored profile data has no valid schemaVersion.",
    );
  }
  if (version > PROFILE_SCHEMA_VERSION) {
    throw new ProfileDataError(
      `Stored profile schemaVersion ${version} is newer than the supported ${PROFILE_SCHEMA_VERSION} — deploy the newer code before reading this data.`,
    );
  }

  for (let from = version; from < PROFILE_SCHEMA_VERSION; from += 1) {
    const step = MIGRATION_STEPS.find((candidate) => candidate.from === from);
    if (!step) {
      throw new ProfileDataError(
        `No migration step upgrades profile schemaVersion ${from}.`,
      );
    }
    current = { ...step.migrate(current), schemaVersion: from + 1 };
  }

  const parsed = profileSchema.safeParse(current);
  if (!parsed.success) {
    throw new ProfileDataError(
      `Stored profile failed validation after migration: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}
