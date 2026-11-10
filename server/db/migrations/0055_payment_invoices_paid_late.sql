ALTER TABLE "sessions" ADD COLUMN "payment_invoices" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "paid_late_at" timestamp;
