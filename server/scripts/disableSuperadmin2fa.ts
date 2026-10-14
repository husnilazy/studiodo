// Emergency: turns two-factor sign-in OFF for one Admin Pusat account (phone lost AND recovery codes lost). Run it on the
// server PC only; whoever can run it already controls the database. Sign in with password, then enable 2FA again.
//
// Usage:  npx tsx server/scripts/disableSuperadmin2fa.ts you@example.com
import "dotenv/config";
import { eq } from "drizzle-orm";
import { client, db } from "../db/client.js";
import { superadmins } from "../db/schema.js";

const email = String(process.argv[2] ?? "").trim().toLowerCase();
if (!email) {
  console.error("Usage: npx tsx server/scripts/disableSuperadmin2fa.ts <email>");
  process.exit(1);
}
const updated = await db.update(superadmins).set({ totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null, recoveryCodes: [] }).where(eq(superadmins.email, email)).returning({ id: superadmins.id });
console.log(updated.length ? `2FA dimatikan untuk ${email}. Masuk dengan password lalu aktifkan lagi.` : `Tidak ada akun Admin Pusat dengan email ${email}.`);
await client.end();
