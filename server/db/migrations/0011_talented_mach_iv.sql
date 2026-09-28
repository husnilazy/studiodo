CREATE TABLE IF NOT EXISTS "platform_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"level" text DEFAULT 'info' NOT NULL,
	"category" text NOT NULL,
	"action" text NOT NULL,
	"message" text NOT NULL,
	"actor_type" text,
	"actor_label" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_name" text NOT NULL,
	"owner_name" text NOT NULL,
	"owner_email" text NOT NULL,
	"owner_whatsapp" text,
	"business_type" text,
	"city" text,
	"address" text,
	"website" text,
	"instagram_handle" text,
	"referral_source" text,
	"message" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"converted_tenant_id" uuid,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"review_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "owner_name" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "owner_whatsapp" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "business_type" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "instagram_handle" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "referral_source" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "internal_notes" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform_events" ADD CONSTRAINT "platform_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant_applications" ADD CONSTRAINT "tenant_applications_converted_tenant_id_tenants_id_fk" FOREIGN KEY ("converted_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_events_tenant_id_idx" ON "platform_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_events_created_at_idx" ON "platform_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_applications_status_idx" ON "tenant_applications" USING btree ("status");