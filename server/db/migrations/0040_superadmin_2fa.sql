ALTER TABLE "superadmins" ADD COLUMN "totp_secret_enc" text;--> statement-breakpoint
ALTER TABLE "superadmins" ADD COLUMN "totp_enabled_at" timestamp;--> statement-breakpoint
ALTER TABLE "superadmins" ADD COLUMN "totp_last_step" integer;--> statement-breakpoint
ALTER TABLE "superadmins" ADD COLUMN "recovery_codes" jsonb DEFAULT '[]'::jsonb NOT NULL;