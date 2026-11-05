ALTER TABLE "platform_settings" ADD COLUMN "doku_client_id" text;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "doku_secret_key_enc" text;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "doku_environment" text DEFAULT 'sandbox' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "doku_qris_mode" text DEFAULT 'checkout' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "doku_merchant_id" text;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "doku_terminal_id" text;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "doku_postal_code" text;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "doku_snap_private_key_enc" text;