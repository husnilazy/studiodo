CREATE TABLE IF NOT EXISTS "screen_layouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"screen_key" text NOT NULL,
	"orientation" text NOT NULL,
	"elements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "screen_layouts_tenant_screen_orientation_unique" UNIQUE("tenant_id","screen_key","orientation")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "screen_layouts" ADD CONSTRAINT "screen_layouts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "screen_layouts_tenant_id_idx" ON "screen_layouts" USING btree ("tenant_id");