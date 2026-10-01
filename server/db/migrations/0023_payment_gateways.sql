CREATE TABLE IF NOT EXISTS "payment_gateways" (
	"provider" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"environment" text DEFAULT 'sandbox' NOT NULL,
	"secret_key_enc" text,
	"secret_key_last4" text,
	"webhook_token_enc" text,
	"last_test_at" timestamp,
	"last_test_ok" boolean,
	"last_test_message" text,
	"last_webhook_at" timestamp,
	"last_webhook_result" text,
	"updated_by" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_orders" ADD COLUMN "provider" text DEFAULT 'midtrans' NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_orders" ADD COLUMN "provider_ref" text;