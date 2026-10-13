CREATE TABLE IF NOT EXISTS "notification_reads" (
	"notification_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"read_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_reads_pk" UNIQUE("notification_id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"kind" text DEFAULT 'platform' NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link_url" text,
	"created_by" text,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_tenant_created_idx" ON "notifications" USING btree ("tenant_id","created_at");