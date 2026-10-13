ALTER TABLE "creators" ADD COLUMN "email_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "email_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL;