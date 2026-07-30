CREATE TABLE "ai_usage_counters" (
	"user_id" text NOT NULL,
	"feature" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_usage_counters_user_id_feature_period_start_pk" PRIMARY KEY("user_id","feature","period_start")
);
--> statement-breakpoint
CREATE TABLE "ai_usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"feature" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"reservation_id" uuid NOT NULL,
	"model" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"reasoning_tokens" integer,
	"cost_micros" bigint,
	"cost_units" integer,
	"outcome" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_usage_events_reservation_id_unique" UNIQUE("reservation_id")
);
--> statement-breakpoint
CREATE TABLE "ai_usage_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"feature" text,
	"amount" integer NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"reason" text NOT NULL,
	"reservation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_usage_grants_reservation_id_unique" UNIQUE("reservation_id")
);
--> statement-breakpoint
CREATE TABLE "billing_webhook_events" (
	"provider_event_id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"type" text NOT NULL,
	"event_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_entitlements" (
	"user_id" text NOT NULL,
	"product" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"source" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"provider" text,
	"provider_payment_id" text,
	CONSTRAINT "product_entitlements_user_id_product_pk" PRIMARY KEY("user_id","product"),
	CONSTRAINT "product_entitlements_provider_payment_id_unique" UNIQUE("provider_payment_id")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"user_id" text PRIMARY KEY NOT NULL,
	"plan_id" text DEFAULT 'free' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"interval" text,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider" text,
	"provider_subscription_id" text,
	"provider_customer_id" text,
	"currency" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_provider_subscription_id_unique" UNIQUE("provider_subscription_id")
);
--> statement-breakpoint
ALTER TABLE "ai_usage_counters" ADD CONSTRAINT "ai_usage_counters_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_grants" ADD CONSTRAINT "ai_usage_grants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_entitlements" ADD CONSTRAINT "product_entitlements_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_events_user_created_idx" ON "ai_usage_events" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_usage_events_period_idx" ON "ai_usage_events" USING btree ("user_id","period_start");--> statement-breakpoint
CREATE INDEX "ai_usage_grants_user_expiry_idx" ON "ai_usage_grants" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE INDEX "subscriptions_provider_customer_idx" ON "subscriptions" USING btree ("provider_customer_id");--> statement-breakpoint
-- Backfill (doc 14 §10). Every existing user gets a `free` row so the hottest
-- read in the system is never a LEFT JOIN with a null that means "free".
--
-- **Nothing is charged for retroactively and no counters are seeded**: usage
-- spent before this deploy was free when it was spent, and there is no ledger
-- to charge it from. Everyone starts the first period fresh.
--
-- `period_start` stays NULL on purpose — a free user has no subscription date,
-- so their quota period is the calendar month (doc 14 §5.2).
--
-- Hand-added to a generated migration, which is fine: this is data, not schema,
-- so the drizzle snapshot in `meta/` is unaffected. `ON CONFLICT DO NOTHING`
-- keeps it safe to re-run.
INSERT INTO "subscriptions" ("user_id", "plan_id", "status")
SELECT "id", 'free', 'active' FROM "user"
ON CONFLICT ("user_id") DO NOTHING;