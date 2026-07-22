-- Promote the public username from `sites.slug` to `profiles.handle`.
--
-- The username is an **identity** concept — one handle names the portfolio
-- (`/p/<handle>`), the public resume (`/r/<handle>`), and the future
-- `<handle>.resfolio.site` subdomain — so it belongs on the Profile, not on any
-- one output. `public_resume_id` records which resume renders at `/r/<handle>`.
--
-- **Order matters:** add the columns and backfill `handle` from the existing
-- `sites.slug` values BEFORE dropping that column, or claimed usernames are
-- lost. The unique index goes on after the backfill (the copied values were
-- already unique on `sites`). Hand-edited from the drizzle-kit diff to insert
-- the data step — see packages/database/CLAUDE.md.
ALTER TABLE "profiles" ADD COLUMN "handle" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "public_resume_id" uuid;--> statement-breakpoint
UPDATE "profiles" p SET "handle" = s."slug" FROM "sites" s WHERE s."profile_id" = p."id";--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_handle_unique" UNIQUE("handle");--> statement-breakpoint
ALTER TABLE "sites" DROP CONSTRAINT "sites_slug_unique";--> statement-breakpoint
ALTER TABLE "sites" DROP COLUMN "slug";
