ALTER TABLE "profiles" ADD COLUMN "onboarding_completed" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Backfill (hand-appended; data, not schema, so the meta/ snapshot is
-- unaffected — see packages/database/CLAUDE.md).
--
-- Every profile that already exists predates onboarding, which means its owner
-- has already been through the editor and set themselves up. Leaving them at the
-- column default would redirect every existing user into a first-run flow on
-- their next visit — a worse failure than skipping it for a new one, and the
-- kind that arrives all at once on deploy.
--
-- Re-runnable: the predicate is the guard, so a second application is a no-op.
UPDATE "profiles" SET "onboarding_completed" = true WHERE "onboarding_completed" = false;
