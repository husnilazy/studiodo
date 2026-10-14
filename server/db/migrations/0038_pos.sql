CREATE TABLE IF NOT EXISTS "pos_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"shift_id" uuid,
	"order_number" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL,
	"discount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"payment_method" text DEFAULT 'cash' NOT NULL,
	"cash_received" numeric(12, 2),
	"change_given" numeric(12, 2),
	"status" text DEFAULT 'paid' NOT NULL,
	"refunded_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"customer_name" text,
	"customer_whatsapp" text,
	"kiosk_voucher_code" text,
	"queue_ticket_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pos_orders_tenant_number_unique" UNIQUE("tenant_id","order_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pos_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pos_queue_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"queue_date" text NOT NULL,
	"seq" integer NOT NULL,
	"label" text NOT NULL,
	"customer_name" text,
	"customer_whatsapp" text,
	"party_size" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"kiosk_key_id" uuid,
	"order_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"called_at" timestamp,
	"done_at" timestamp,
	CONSTRAINT "pos_queue_tenant_day_seq_unique" UNIQUE("tenant_id","queue_date","seq")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pos_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"shift_id" uuid,
	"amount" numeric(12, 2) NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pos_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"supervisor_pin_hash" text,
	"receipt_header" text DEFAULT '' NOT NULL,
	"receipt_footer" text DEFAULT 'Terima kasih!' NOT NULL,
	"queue_prefix" text DEFAULT 'A' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pos_shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"cashier_name" text NOT NULL,
	"opening_cash" numeric(12, 2) DEFAULT '0' NOT NULL,
	"opened_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp,
	"expected_cash" numeric(12, 2),
	"counted_cash" numeric(12, 2),
	"note" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pos_orders" ADD CONSTRAINT "pos_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pos_orders" ADD CONSTRAINT "pos_orders_shift_id_pos_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."pos_shifts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pos_products" ADD CONSTRAINT "pos_products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pos_queue_tickets" ADD CONSTRAINT "pos_queue_tickets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pos_queue_tickets" ADD CONSTRAINT "pos_queue_tickets_kiosk_key_id_kiosk_keys_id_fk" FOREIGN KEY ("kiosk_key_id") REFERENCES "public"."kiosk_keys"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pos_refunds" ADD CONSTRAINT "pos_refunds_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pos_refunds" ADD CONSTRAINT "pos_refunds_order_id_pos_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."pos_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pos_refunds" ADD CONSTRAINT "pos_refunds_shift_id_pos_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."pos_shifts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pos_settings" ADD CONSTRAINT "pos_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pos_shifts" ADD CONSTRAINT "pos_shifts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pos_orders_tenant_idx" ON "pos_orders" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pos_orders_shift_idx" ON "pos_orders" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pos_products_tenant_idx" ON "pos_products" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pos_queue_tenant_day_idx" ON "pos_queue_tickets" USING btree ("tenant_id","queue_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pos_refunds_order_idx" ON "pos_refunds" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pos_refunds_tenant_idx" ON "pos_refunds" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pos_shifts_tenant_idx" ON "pos_shifts" USING btree ("tenant_id","opened_at");