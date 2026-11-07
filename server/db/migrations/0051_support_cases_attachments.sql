CREATE TABLE IF NOT EXISTS "support_case_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"actor" text,
	"detail" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "support_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_no" serial NOT NULL,
	"tenant_id" uuid NOT NULL,
	"thread_id" uuid,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reported_by" text,
	"resolution_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "support_messages" ADD COLUMN "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "support_messages" ADD COLUMN "case_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "support_case_events" ADD CONSTRAINT "support_case_events_case_id_support_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."support_cases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_thread_id_support_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."support_threads"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_case_events_case_idx" ON "support_case_events" USING btree ("case_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_cases_tenant_idx" ON "support_cases" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_cases_status_idx" ON "support_cases" USING btree ("status","created_at");