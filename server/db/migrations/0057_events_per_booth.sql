ALTER TABLE "kiosk_keys" ADD COLUMN IF NOT EXISTS "booth_mode" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "kiosk_keys" ADD COLUMN IF NOT EXISTS "booth_mode_at" timestamp;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"image_url" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp,
	"ends_at" timestamp,
	"free_entry" boolean DEFAULT true NOT NULL,
	"timer_enabled" boolean DEFAULT true NOT NULL,
	"session_timer_minutes" integer DEFAULT 5 NOT NULL,
	"max_photos" integer DEFAULT 0 NOT NULL,
	"has_gif" boolean DEFAULT false NOT NULL,
	"has_video" boolean DEFAULT true NOT NULL,
	"session_cap" integer,
	"revert_to_standard" boolean DEFAULT false NOT NULL,
	"branding" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_booths" (
	"event_id" uuid NOT NULL,
	"kiosk_key_id" uuid NOT NULL,
	CONSTRAINT "event_booths_event_id_kiosk_key_id_pk" PRIMARY KEY("event_id","kiosk_key_id")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_frames" (
	"event_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	CONSTRAINT "event_frames_event_id_template_id_pk" PRIMARY KEY("event_id","template_id")
);--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "event_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "events" ADD CONSTRAINT "events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_booths" ADD CONSTRAINT "event_booths_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_booths" ADD CONSTRAINT "event_booths_kiosk_key_id_kiosk_keys_id_fk" FOREIGN KEY ("kiosk_key_id") REFERENCES "public"."kiosk_keys"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_frames" ADD CONSTRAINT "event_frames_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_frames" ADD CONSTRAINT "event_frames_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_tenant_idx" ON "events" USING btree ("tenant_id","starts_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_booths_key_idx" ON "event_booths" USING btree ("kiosk_key_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_event_id_idx" ON "sessions" USING btree ("event_id","created_at");--> statement-breakpoint
-- Carry over an event a tenant already switched on in the old single "Event Gratis" setting, so nothing stops mid-event after
-- this update. It runs on every booth (no event_booths rows). The old dates were typed in local time (WIB, UTC+7) without a zone.
INSERT INTO "events" ("tenant_id", "name", "description", "image_url", "enabled", "starts_at", "ends_at", "free_entry", "timer_enabled", "session_timer_minutes", "max_photos", "has_gif", "has_video")
SELECT ts."tenant_id",
  COALESCE(NULLIF(trim(ts."kiosk_config"->>'eventName'), ''), 'Event'),
  COALESCE(ts."kiosk_config"->>'eventDescription', ''),
  NULLIF(ts."kiosk_config"->>'eventImageUrl', ''),
  true,
  CASE WHEN ts."kiosk_config"->>'eventStartAt' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' THEN (ts."kiosk_config"->>'eventStartAt')::timestamp - interval '7 hours' END,
  CASE WHEN ts."kiosk_config"->>'eventEndAt' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' THEN (ts."kiosk_config"->>'eventEndAt')::timestamp - interval '7 hours' END,
  COALESCE((ts."kiosk_config"->>'eventFreeEntry')::boolean, true),
  COALESCE((ts."kiosk_config"->>'eventTimerEnabled')::boolean, true),
  LEAST(30, GREATEST(1, COALESCE(NULLIF(ts."kiosk_config"->>'eventSessionTimerMinutes', '')::numeric::int, 5))),
  LEAST(50, GREATEST(0, COALESCE(NULLIF(ts."kiosk_config"->>'eventMaxPhotosPerSession', '')::numeric::int, 0))),
  COALESCE((ts."kiosk_config"->>'eventHasGif')::boolean, false),
  COALESCE((ts."kiosk_config"->>'eventHasVideo')::boolean, true)
FROM "tenant_settings" ts
WHERE ts."kiosk_config"->>'eventEnabled' = 'true'
  AND NOT EXISTS (SELECT 1 FROM "events" e WHERE e."tenant_id" = ts."tenant_id");
