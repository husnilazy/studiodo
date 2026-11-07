CREATE TABLE IF NOT EXISTS "booth_settings" (
	"kiosk_key_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"package_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "booth_settings" ADD CONSTRAINT "booth_settings_kiosk_key_id_kiosk_keys_id_fk" FOREIGN KEY ("kiosk_key_id") REFERENCES "public"."kiosk_keys"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "booth_settings" ADD CONSTRAINT "booth_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "booth_settings_tenant_idx" ON "booth_settings" USING btree ("tenant_id");