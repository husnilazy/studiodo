CREATE TABLE IF NOT EXISTS "device_registry" (
	"device_id" text PRIMARY KEY NOT NULL,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"trial_started_at" timestamp,
	"trial_key_id" uuid,
	"trial_tenant_id" uuid,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "kiosk_keys" ADD COLUMN "activated_at" timestamp;--> statement-breakpoint
ALTER TABLE "kiosk_keys" ADD COLUMN "device_token_hash" text;--> statement-breakpoint
ALTER TABLE "kiosk_keys" ADD COLUMN "device_reset_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "kiosk_keys" ADD COLUMN "device_reset_window_start" timestamp;--> statement-breakpoint
-- Keys already bound to a computer keep working: they count as activated, and the computers that already ran a trial are remembered.
UPDATE "kiosk_keys" SET "activated_at" = COALESCE("bound_at", now()) WHERE "bound_device_id" IS NOT NULL AND "activated_at" IS NULL;--> statement-breakpoint
INSERT INTO "device_registry" ("device_id", "trial_started_at", "trial_key_id", "trial_tenant_id")
SELECT DISTINCT ON ("bound_device_id") "bound_device_id", "trial_started_at", "id", "tenant_id" FROM "kiosk_keys"
WHERE "bound_device_id" IS NOT NULL AND "trial_started_at" IS NOT NULL ORDER BY "bound_device_id", "trial_started_at" ON CONFLICT DO NOTHING;
