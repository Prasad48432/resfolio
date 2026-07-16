CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"template_id" text NOT NULL,
	"template_major" integer NOT NULL,
	"config" jsonb NOT NULL,
	"view" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"published_version_id" uuid,
	"discoverable" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sites_profile_id_unique" UNIQUE("profile_id"),
	CONSTRAINT "sites_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sites_profile_id_idx" ON "sites" USING btree ("profile_id");