CREATE TABLE IF NOT EXISTS "admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "frame_overlays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"image_url" text NOT NULL,
	"orientation" text DEFAULT 'portrait' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kiosk_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"label" text,
	"key_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	"revoked_at" timestamp,
	CONSTRAINT "kiosk_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"photo_count" integer NOT NULL,
	"has_gif" boolean DEFAULT false NOT NULL,
	"has_video" boolean DEFAULT false NOT NULL,
	"extra_prints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"package_id" uuid,
	"orientation" text DEFAULT 'portrait' NOT NULL,
	"payment_method" text DEFAULT 'qris' NOT NULL,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"selected_extras" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"additional_prints_paid" integer DEFAULT 0 NOT NULL,
	"additional_prints_pending" integer DEFAULT 0 NOT NULL,
	"payment_purpose" text DEFAULT 'session' NOT NULL,
	"total_amount" numeric(12, 2),
	"voucher_code" text,
	"xendit_invoice_id" text,
	"filter" text DEFAULT 'normal' NOT NULL,
	"frame_id" uuid,
	"layout" text,
	"visual_template" text,
	"photo_urls" jsonb DEFAULT '[]'::jsonb,
	"gif_url" text,
	"video_url" text,
	"media_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"strip_url" text,
	"drive_folder_id" text,
	"drive_photo_ids" jsonb DEFAULT '[]'::jsonb,
	"drive_strip_id" text,
	"share_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"customer_whatsapp" text,
	"customer_email" text,
	"publish_consent" boolean DEFAULT false NOT NULL,
	"feedback" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"frame_image_url" text NOT NULL,
	"slots" jsonb NOT NULL,
	"canvas_width" integer NOT NULL,
	"canvas_height" integer NOT NULL,
	"orientation" text DEFAULT 'portrait' NOT NULL,
	"category" text DEFAULT 'custom' NOT NULL,
	"style" text DEFAULT 'Custom' NOT NULL,
	"output_preset" text DEFAULT '4r' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"brand_name" text DEFAULT 'STUDIODO' NOT NULL,
	"tagline" text,
	"logo_url" text,
	"contact_whatsapp" text,
	"social_instagram" text,
	"social_tiktok" text,
	"social_facebook" text,
	"website_url" text,
	"address" text,
	"accent_color" text DEFAULT '#7C3AED' NOT NULL,
	"font_family" text DEFAULT 'Inter' NOT NULL,
	"promo_text" text,
	"capture_vibe" text DEFAULT 'Electric' NOT NULL,
	"countdown_seconds" integer DEFAULT 3 NOT NULL,
	"beep_enabled" boolean DEFAULT true NOT NULL,
	"session_timer_minutes" integer DEFAULT 5 NOT NULL,
	"camera_mode" text DEFAULT 'webcam' NOT NULL,
	"tether_bridge_url" text,
	"qris_enabled" boolean DEFAULT true NOT NULL,
	"cash_payment_enabled" boolean DEFAULT false NOT NULL,
	"xendit_secret_key" text,
	"xendit_webhook_token" text,
	"storage_driver" text,
	"r2_account_id" text,
	"r2_endpoint" text,
	"r2_bucket" text,
	"r2_access_key_id" text,
	"r2_secret_access_key" text,
	"r2_public_base_url" text,
	"r2_prefix" text,
	"gdrive_service_account_json" text,
	"gdrive_folder_id" text,
	"additional_print_enabled" boolean DEFAULT true NOT NULL,
	"additional_print_label" text DEFAULT 'Tambah print 4R' NOT NULL,
	"additional_print_price" numeric(12, 2) DEFAULT '15000' NOT NULL,
	"additional_print_max" integer DEFAULT 5 NOT NULL,
	"strip_layout" text DEFAULT 'classic-vertical' NOT NULL,
	"strip_template" text DEFAULT 'solid' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vouchers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"discount_type" text DEFAULT 'percent' NOT NULL,
	"discount_value" numeric(12, 2) DEFAULT '0' NOT NULL,
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp,
	"expires_at" timestamp,
	"voucher_type" text DEFAULT 'discount' NOT NULL,
	"cash_amount" numeric(12, 2),
	"invoice_number" text,
	"customer_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vouchers_tenant_code_unique" UNIQUE("tenant_id","code")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admins" ADD CONSTRAINT "admins_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "frame_overlays" ADD CONSTRAINT "frame_overlays_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kiosk_keys" ADD CONSTRAINT "kiosk_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "packages" ADD CONSTRAINT "packages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "templates" ADD CONSTRAINT "templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admins_tenant_id_idx" ON "admins" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "frame_overlays_tenant_id_idx" ON "frame_overlays" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kiosk_keys_tenant_id_idx" ON "kiosk_keys" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "packages_tenant_id_idx" ON "packages" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_tenant_id_created_at_idx" ON "sessions" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "templates_tenant_id_idx" ON "templates" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vouchers_tenant_id_idx" ON "vouchers" USING btree ("tenant_id");