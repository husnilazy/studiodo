CREATE TABLE IF NOT EXISTS "creator_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'custom' NOT NULL,
	"orientation" text DEFAULT 'portrait' NOT NULL,
	"output_preset" text DEFAULT '4r' NOT NULL,
	"canvas_width" integer DEFAULT 0 NOT NULL,
	"canvas_height" integer DEFAULT 0 NOT NULL,
	"slots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"frame_asset_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"review_note" text,
	"marketplace_template_id" uuid,
	"submitted_at" timestamp,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "creators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"whatsapp" text,
	"status" text DEFAULT 'active' NOT NULL,
	"submission_id" uuid,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "creators_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "creator_templates" ADD CONSTRAINT "creator_templates_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "creator_templates" ADD CONSTRAINT "creator_templates_frame_asset_id_site_assets_id_fk" FOREIGN KEY ("frame_asset_id") REFERENCES "public"."site_assets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creator_templates_creator_idx" ON "creator_templates" USING btree ("creator_id","updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creator_templates_status_idx" ON "creator_templates" USING btree ("status");