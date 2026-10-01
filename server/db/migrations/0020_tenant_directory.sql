ALTER TABLE "tenants" ADD COLUMN "directory_listed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "directory_description" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "directory_show_whatsapp" boolean DEFAULT false NOT NULL;