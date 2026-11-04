CREATE TABLE IF NOT EXISTS "wallet_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"session_id" uuid,
	"ref" text,
	"gross_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"fee_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"net_amount" numeric(14, 2) NOT NULL,
	"available_at" timestamp DEFAULT now() NOT NULL,
	"note" text,
	"actor" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "withdrawal_policy" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "superadmins" ADD COLUMN "role" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "withdrawal_policy" jsonb;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_ledger_tenant_idx" ON "wallet_ledger" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wallet_ledger_ref_idx" ON "wallet_ledger" USING btree ("tenant_id","kind","ref");--> statement-breakpoint
-- Carry the existing balances over: every successful QRIS payment of a platform-settled tenant becomes a ledger row, with the
-- fee at today's rate (the old derived balance applied the current rate to everything, so balances stay the same).
INSERT INTO "wallet_ledger" ("tenant_id", "kind", "session_id", "ref", "gross_amount", "fee_amount", "net_amount", "available_at", "note", "actor", "created_at")
SELECT s."tenant_id", 'payment', s."id", s."id"::text || ':session', s."total_amount",
  round(s."total_amount" * COALESCE((SELECT "qris_fee_percent" FROM "platform_settings" LIMIT 1), 0.70) / 100, 2),
  s."total_amount" - round(s."total_amount" * COALESCE((SELECT "qris_fee_percent" FROM "platform_settings" LIMIT 1), 0.70) / 100, 2),
  s."created_at", 'Dipindahkan dari saldo lama', 'migrasi', s."created_at"
FROM "sessions" s
JOIN "tenants" t ON t."id" = s."tenant_id"
WHERE t."qris_settlement" = 'platform'
  AND s."payment_method" = 'qris'
  AND s."payment_status" = 'success'
  AND s."total_amount" IS NOT NULL AND s."total_amount" > 0
  AND (t."qris_platform_since" IS NULL OR s."created_at" >= t."qris_platform_since")
ON CONFLICT DO NOTHING;
