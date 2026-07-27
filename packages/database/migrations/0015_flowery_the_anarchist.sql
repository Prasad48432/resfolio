CREATE TABLE "job_match_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"chat_session_id" uuid,
	"job_url" text,
	"job_description" text NOT NULL,
	"role" text,
	"company" text,
	"location" text,
	"initial_score" integer,
	"enhanced_score" integer,
	"analysis" jsonb,
	"profile_changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"resume_document_id" uuid,
	"cover_letter" jsonb,
	"status" text DEFAULT 'saved' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_match_sessions" ADD CONSTRAINT "job_match_sessions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_match_sessions" ADD CONSTRAINT "job_match_sessions_resume_document_id_documents_id_fk" FOREIGN KEY ("resume_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_match_sessions_profile_updated_idx" ON "job_match_sessions" USING btree ("profile_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "job_match_sessions_chat_idx" ON "job_match_sessions" USING btree ("chat_session_id");