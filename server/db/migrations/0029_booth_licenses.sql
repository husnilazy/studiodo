ALTER TABLE "billing_orders" ADD COLUMN "items" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_orders" ADD COLUMN "booth_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_orders" ADD COLUMN "discount_percent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "kiosk_keys" ADD COLUMN "license_type" text DEFAULT 'unpaid' NOT NULL;--> statement-breakpoint
ALTER TABLE "kiosk_keys" ADD COLUMN "license_ends_at" timestamp;--> statement-breakpoint
ALTER TABLE "kiosk_keys" ADD COLUMN "license_plan_slug" text;--> statement-breakpoint
ALTER TABLE "kiosk_keys" ADD COLUMN "trial_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "volume_discounts" jsonb DEFAULT '[{"minBooths":10,"percent":10}]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "booth_discount_percent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "booth_discount_note" text;--> statement-breakpoint
-- Data step: before this migration the subscription lived on the tenant. Give every existing key the licence its
-- tenant already had so no booth in the field changes state: same end date, 'paid' type (null end = unlimited).
UPDATE "kiosk_keys" k SET "license_type" = 'paid', "license_ends_at" = t."subscription_ends_at" FROM "tenants" t WHERE t."id" = k."tenant_id";
