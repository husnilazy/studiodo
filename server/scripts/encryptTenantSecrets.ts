// One-off: encrypts tenants' Xendit credentials that were saved as plain text before encryption existed.
// Safe to re-run (already-encrypted values are skipped). New saves are encrypted by the API itself.
//
// Usage:  npx tsx server/scripts/encryptTenantSecrets.ts            (dry run — only reports)
//         npx tsx server/scripts/encryptTenantSecrets.ts --apply
import "dotenv/config";
import { eq } from "drizzle-orm";
import { client, db } from "../db/client.js";
import { tenantSettings } from "../db/schema.js";
import { encryptSecret, isEncryptedSecret } from "../lib/secretBox.js";

const apply = process.argv.includes("--apply");
const rows = await db.select({ tenantId: tenantSettings.tenantId, key: tenantSettings.xenditSecretKey, token: tenantSettings.xenditWebhookToken }).from(tenantSettings);
let touched = 0;
for (const row of rows) {
  const patch: { xenditSecretKey?: string; xenditWebhookToken?: string } = {};
  if (row.key && !isEncryptedSecret(row.key)) patch.xenditSecretKey = encryptSecret(row.key);
  if (row.token && !isEncryptedSecret(row.token)) patch.xenditWebhookToken = encryptSecret(row.token);
  if (Object.keys(patch).length === 0) continue;
  touched += 1;
  console.log(`${apply ? "encrypting" : "would encrypt"} ${Object.keys(patch).join(", ")} for tenant ${row.tenantId}`);
  if (apply) await db.update(tenantSettings).set(patch).where(eq(tenantSettings.tenantId, row.tenantId));
}
console.log(`${touched} tenant(s) ${apply ? "updated" : "need updating (run again with --apply)"}.`);
await client.end();
