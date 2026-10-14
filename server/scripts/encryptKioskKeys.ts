// One-off: encrypts the recoverable copy of kiosk keys (kiosk_keys.raw_key) that was stored as plain text before keys were
// encrypted at rest. After this, a leaked database dump no longer contains working booth keys. New keys are encrypted by
// the API itself. Safe to re-run (already-encrypted values are skipped); "Lihat key" keeps working for both forms.
//
// Usage:  npx tsx server/scripts/encryptKioskKeys.ts            (dry run: only reports)
//         npx tsx server/scripts/encryptKioskKeys.ts --apply
import "dotenv/config";
import { eq } from "drizzle-orm";
import { client, db } from "../db/client.js";
import { kioskKeys } from "../db/schema.js";
import { encryptSecret, isEncryptedSecret } from "../lib/secretBox.js";

const apply = process.argv.includes("--apply");
const rows = await db.select({ id: kioskKeys.id, raw: kioskKeys.rawKey }).from(kioskKeys);
let touched = 0;
for (const row of rows) {
  if (!row.raw || isEncryptedSecret(row.raw)) continue;
  touched += 1;
  if (apply) await db.update(kioskKeys).set({ rawKey: encryptSecret(row.raw) }).where(eq(kioskKeys.id, row.id));
}
console.log(`${touched} kiosk key(s) ${apply ? "encrypted" : "stored as plain text (run again with --apply)"}.`);
await client.end();
