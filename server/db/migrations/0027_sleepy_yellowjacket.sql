CREATE TABLE IF NOT EXISTS "withdrawals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"fee_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"net_amount" numeric(12, 2) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"bank_name" text NOT NULL,
	"account_number" text NOT NULL,
	"account_name" text NOT NULL,
	"request_note" text,
	"admin_note" text,
	"transfer_reference" text,
	"requested_by" text,
	"processed_by" text,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "has_stop_motion" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "qris_fee_percent" numeric(5, 2) DEFAULT '0.70' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "withdrawal_min_amount" integer DEFAULT 50000 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "withdrawal_flat_fee" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "stop_motion_url" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "qris_settlement" text DEFAULT 'direct' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "qris_platform_since" timestamp;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "withdrawals_tenant_id_idx" ON "withdrawals" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "withdrawals_status_idx" ON "withdrawals" USING btree ("status");