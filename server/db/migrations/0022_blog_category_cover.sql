ALTER TABLE "blog_posts" ADD COLUMN "category" text DEFAULT 'Informasi' NOT NULL;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD COLUMN "cover_url" text;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD COLUMN "position" integer;