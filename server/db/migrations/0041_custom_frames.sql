ALTER TABLE "templates" ADD COLUMN "price" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "customer_name" text;--> statement-breakpoint
ALTER TABLE "vouchers" ADD COLUMN "frame_id" uuid;
