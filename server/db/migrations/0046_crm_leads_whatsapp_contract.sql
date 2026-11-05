CREATE TABLE IF NOT EXISTS "lead_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"meta" jsonb,
	"actor" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"title" text NOT NULL,
	"due_at" timestamp NOT NULL,
	"done_at" timestamp,
	"reminded_at" timestamp,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "wa_provider" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "wa_token_enc" text;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "wa_webhook_key_enc" text;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "lead_templates" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "contract_issuer" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_applications" ADD COLUMN "pipeline_stage" text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_applications" ADD COLUMN "lead_source" text;--> statement-breakpoint
ALTER TABLE "tenant_applications" ADD COLUMN "lost_reason" text;--> statement-breakpoint
ALTER TABLE "tenant_applications" ADD COLUMN "booth_count" integer;--> statement-breakpoint
ALTER TABLE "tenant_applications" ADD COLUMN "booth_location" text;--> statement-breakpoint
ALTER TABLE "tenant_applications" ADD COLUMN "planned_start" text;--> statement-breakpoint
ALTER TABLE "tenant_applications" ADD COLUMN "payment_setup" text;--> statement-breakpoint
ALTER TABLE "tenant_applications" ADD COLUMN "plan_slug" text;--> statement-breakpoint
ALTER TABLE "tenant_applications" ADD COLUMN "contract_months" integer;--> statement-breakpoint
ALTER TABLE "tenant_applications" ADD COLUMN "assigned_to" text;--> statement-breakpoint
ALTER TABLE "tenant_applications" ADD COLUMN "last_contacted_at" timestamp;--> statement-breakpoint
ALTER TABLE "tenant_applications" ADD COLUMN "contract_token" text;--> statement-breakpoint
ALTER TABLE "tenant_applications" ADD COLUMN "contract_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_applications" ADD COLUMN "contract_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "tenant_applications" ADD COLUMN "contract_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "tenant_applications" ADD COLUMN "contract_signed_at" timestamp;--> statement-breakpoint
ALTER TABLE "tenant_applications" ADD COLUMN "contract_signed_name" text;--> statement-breakpoint
ALTER TABLE "tenant_applications" ADD COLUMN "contract_signed_ip" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_tenant_applications_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."tenant_applications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lead_tasks" ADD CONSTRAINT "lead_tasks_lead_id_tenant_applications_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."tenant_applications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_activities_lead_idx" ON "lead_activities" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_tasks_lead_idx" ON "lead_tasks" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_tasks_due_idx" ON "lead_tasks" USING btree ("done_at","due_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_applications_stage_idx" ON "tenant_applications" USING btree ("pipeline_stage");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_applications_contract_token_idx" ON "tenant_applications" USING btree ("contract_token");
--> statement-breakpoint
UPDATE "tenant_applications" SET "pipeline_stage" = 'active' WHERE "status" = 'converted';--> statement-breakpoint
UPDATE "tenant_applications" SET "pipeline_stage" = 'lost' WHERE "status" = 'rejected';
