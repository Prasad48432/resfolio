CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"content_hash" text NOT NULL,
	"content_type" text NOT NULL,
	"bytes" bigint NOT NULL,
	"referenced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_owner_id_idx" ON "assets" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_owner_kind_hash_idx" ON "assets" USING btree ("owner_id","kind","content_hash");--> statement-breakpoint
CREATE INDEX "assets_referenced_at_idx" ON "assets" USING btree ("referenced_at");