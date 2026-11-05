CREATE TABLE IF NOT EXISTS "auth_handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"poll_hash" text NOT NULL,
	"confirm_hash" text,
	"email" text,
	"admin_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"request_ip" text,
	"request_ua" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auth_handoffs" ADD CONSTRAINT "auth_handoffs_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_handoffs_email_idx" ON "auth_handoffs" USING btree ("email","created_at");