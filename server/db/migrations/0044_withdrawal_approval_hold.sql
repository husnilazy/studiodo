ALTER TABLE "withdrawals" ADD COLUMN "requires_approval" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD COLUMN "approved_by" text;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD COLUMN "hold_until" timestamp;