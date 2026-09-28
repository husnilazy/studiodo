// CLI: bootstrap a platform ("admin pusat") superadmin account. There is no
// self-registration for this — it's deliberately CLI-only, same reasoning as
// createTenant.ts standing in for a real tenant signup flow.
//
// Usage:
//   npm run superadmin:create -- --email owner@studiodo.id --password secret123
import "dotenv/config";
import { client, db } from "../db/client.js";
import { superadmins } from "../db/schema.js";
import { hashPassword } from "../lib/passwordHash.js";

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "";
    args[key] = value;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = args.email?.trim().toLowerCase();
  const password = args.password ?? "";

  if (!email || password.length < 6) {
    console.error(
      "Usage: npm run superadmin:create -- --email owner@studiodo.id --password secret123\n" +
      "(password minimal 6 karakter)"
    );
    process.exitCode = 1;
    return;
  }

  const [superadmin] = await db.insert(superadmins).values({ email, passwordHash: hashPassword(password) }).returning();

  console.log("\nSuperadmin berhasil dibuat.");
  console.log(`  Superadmin ID : ${superadmin.id}`);
  console.log(`  Email         : ${superadmin.email}`);
  console.log("\nLogin lewat /superadmin di aplikasi (browser biasa, bukan kiosk Electron).\n");
}

main()
  .catch((error) => {
    console.error("Gagal membuat superadmin:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
