CREATE TABLE IF NOT EXISTS "billing_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid,
	"plan_name" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"period_days" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"snap_token" text,
	"redirect_url" text,
	"payment_type" text,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "billing_orders_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "billing_orders" ADD CONSTRAINT "billing_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "billing_orders" ADD CONSTRAINT "billing_orders_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_orders_tenant_id_idx" ON "billing_orders" USING btree ("tenant_id");