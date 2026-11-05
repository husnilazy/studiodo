// Stores the DOKU SNAP RSA private key (.secrets/doku-snap-private.pem) ENCRYPTED in tenant_settings, so the server can sign QRIS requests.
// Usage (from the project root):  node ./node_modules/tsx/dist/cli.mjs server/scripts/set-doku-snap-key.ts <tenantId>
// The key never leaves this PC except into the database, encrypted with lib/secretBox. The .pem file stays out of git (.secrets/).
import fs from "node:fs";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { tenantSettings } from "../db/schema.js";
import { encryptSecret } from "../lib/secretBox.js";

const tenantId = process.argv[2];
if (!tenantId) {
  console.error("Pakai: set-doku-snap-key.ts <tenantId>");
  process.exit(1);
}
const pem = fs.readFileSync(".secrets/doku-snap-private.pem", "utf8");
const key = crypto.createPrivateKey(pem);
if (key.asymmetricKeyType !== "rsa") throw new Error("Kunci harus RSA");

const result = await db.update(tenantSettings).set({ dokuSnapPrivateKeyEnc: encryptSecret(pem), updatedAt: new Date() }).where(eq(tenantSettings.tenantId, tenantId)).returning({ id: tenantSettings.tenantId });
console.log(result.length ? "Kunci privat tersimpan (terenkripsi)." : "Tenant tidak ditemukan - tidak ada yang berubah.");
process.exit(0);
