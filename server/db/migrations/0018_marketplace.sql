CREATE TABLE IF NOT EXISTS "marketplace_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"creator_name" text,
	"category" text DEFAULT 'custom' NOT NULL,
	"frame_image_url" text NOT NULL,
	"slots" jsonb NOT NULL,
	"canvas_width" integer NOT NULL,
	"canvas_height" integer NOT NULL,
	"orientation" text DEFAULT 'portrait' NOT NULL,
	"output_preset" text DEFAULT '4r' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"install_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "marketplace_template_id" uuid;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_templates_active_idx" ON "marketplace_templates" USING btree ("active","featured");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "templates" ADD CONSTRAINT "templates_marketplace_template_id_marketplace_templates_id_fk" FOREIGN KEY ("marketplace_template_id") REFERENCES "public"."marketplace_templates"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
