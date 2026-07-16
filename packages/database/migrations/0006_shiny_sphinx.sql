ALTER TABLE "integration_items" ADD COLUMN "route_section_key" text;--> statement-breakpoint
ALTER TABLE "integration_items" ADD COLUMN "route_confidence" text DEFAULT 'certain' NOT NULL;--> statement-breakpoint
-- Import-semantics state migration (doc 12 revision, 2026-07-16): the staged
-- row after import is a receipt, not a live link. `updated`/`conflict`
-- collapse into `refresh_available` (a badge + re-import button), `accepted`
-- becomes `imported`, and `archive` rows (upstream-deletion suggestions)
-- disappear — upstream deletion produces nothing under import semantics.
UPDATE "integration_items" SET "state" = 'refresh_available' WHERE "state" IN ('updated', 'conflict');--> statement-breakpoint
UPDATE "integration_items" SET "state" = 'imported' WHERE "state" = 'accepted';--> statement-breakpoint
DELETE FROM "integration_items" WHERE "state" = 'archive';--> statement-breakpoint
-- Backfill the routing stage's output for existing rows from their kind's
-- default route (mirrors DEFAULT_ROUTE_FOR_KIND in @resfolio/integrations).
UPDATE "integration_items" SET "route_section_key" = CASE "kind"
  WHEN 'project' THEN 'projects'
  WHEN 'contribution' THEN 'projects'
  WHEN 'article' THEN 'writing'
  WHEN 'talk' THEN 'custom'
  WHEN 'experience' THEN 'experience'
  WHEN 'education' THEN 'education'
  WHEN 'skillGroup' THEN 'skills'
  WHEN 'certification' THEN 'certifications'
  WHEN 'profileBasics' THEN 'basics'
  ELSE NULL
END;--> statement-breakpoint
UPDATE "integration_items" SET "route_confidence" = 'suggested' WHERE "kind" IN ('profileBasics', 'unclassified');
