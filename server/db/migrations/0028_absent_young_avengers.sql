ALTER TABLE "tenant_settings" ADD COLUMN "payment_provider" text DEFAULT 'xendit' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "doku_client_id" text;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "doku_secret_key_enc" text;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "doku_environment" text DEFAULT 'sandbox' NOT NULL;