ALTER TABLE "plans" ADD COLUMN "discount_percent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "discount_label" text;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "discount_ends_at" timestamp;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "yearly_discount_percent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "features" jsonb DEFAULT '[]'::jsonb NOT NULL;