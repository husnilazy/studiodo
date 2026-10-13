CREATE TABLE IF NOT EXISTS "marketplace_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marketplace_template_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text,
	"resolved_by" text,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "marketplace_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marketplace_template_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "marketplace_reviews_unique" UNIQUE("marketplace_template_id","tenant_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "marketplace_reports" ADD CONSTRAINT "marketplace_reports_marketplace_template_id_marketplace_templates_id_fk" FOREIGN KEY ("marketplace_template_id") REFERENCES "public"."marketplace_templates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "marketplace_reports" ADD CONSTRAINT "marketplace_reports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "marketplace_reviews" ADD CONSTRAINT "marketplace_reviews_marketplace_template_id_marketplace_templates_id_fk" FOREIGN KEY ("marketplace_template_id") REFERENCES "public"."marketplace_templates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "marketplace_reviews" ADD CONSTRAINT "marketplace_reviews_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_reports_status_idx" ON "marketplace_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_reports_template_idx" ON "marketplace_reports" USING btree ("marketplace_template_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_reviews_template_idx" ON "marketplace_reviews" USING btree ("marketplace_template_id","status");