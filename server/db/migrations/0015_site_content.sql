CREATE TABLE IF NOT EXISTS "site_content" (
	"key" text PRIMARY KEY NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer,
	"updated_by" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
