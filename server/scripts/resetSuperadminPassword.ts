// CLI: set a new password for an existing superadmin ("admin pusat") account.
//
//   node ./node_modules/tsx/dist/cli.mjs server/scripts/resetSuperadminPassword.ts
//
// The password is typed at a hidden prompt rather than passed as a command-line argument on purpose:
// shells treat characters like $ & ! ` specially, so a password given as an argument can be silently
// altered (and then never matches), and it would also end up in the shell history.
import "dotenv/config";
import readline from "node:readline";
import { eq } from "drizzle-orm";
import { client, db } from "../db/client.js";
import { superadmins } from "../db/schema.js";
import { hashPassword } from "../lib/passwordHash.js";

/** Read one line. With a real terminal the typed characters are not echoed. */
function ask(prompt: string, hidden: boolean): Promise<string> {
  if (!hidden || !process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
    return new Promise((resolve) => {
      process.stdout.write(prompt);
      rl.once("line", (line) => { rl.close(); resolve(line); });
    });
  }
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    let value = "";
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off("data", onData);
          process.stdout.write("\n");
          return resolve(value);
        }
        if (ch === "\u0003") { process.stdout.write("\n"); process.exit(130); } // Ctrl+C
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    process.stdin.on("data", onData);
  });
}

async function main() {
  const accounts = await db.select({ id: superadmins.id, email: superadmins.email }).from(superadmins);
  if (accounts.length === 0) {
    console.error("Belum ada akun superadmin. Buat dulu dengan createSuperadmin.ts.");
    process.exitCode = 1;
    return;
  }

  let email: string;
  if (accounts.length === 1) {
    email = accounts[0].email;
    console.log(`Akun: ${email}`);
  } else {
    console.log("Akun yang ada:\n" + accounts.map((a) => `  - ${a.email}`).join("\n"));
    email = (await ask("Email akun yang direset: ", false)).trim().toLowerCase();
  }
  const account = accounts.find((a) => a.email === email);
  if (!account) {
    console.error(`Tidak ada akun dengan email "${email}".`);
    process.exitCode = 1;
    return;
  }

  const first = await ask("Password baru (minimal 8 karakter, tidak tampil saat diketik): ", true);
  if (first.length < 8) {
    console.error("Password terlalu pendek (minimal 8 karakter). Tidak ada yang diubah.");
    process.exitCode = 1;
    return;
  }
  const second = await ask("Ulangi password baru: ", true);
  if (first !== second) {
    console.error("Kedua password tidak sama. Tidak ada yang diubah.");
    process.exitCode = 1;
    return;
  }

  await db.update(superadmins).set({ passwordHash: hashPassword(first) }).where(eq(superadmins.id, account.id));
  console.log(`\nPassword untuk ${email} berhasil diganti. Silakan login di /#/superadmin.`);
  console.log("Catatan: bila sebelumnya terkunci karena terlalu banyak percobaan, tunggu 5 menit atau restart service server.\n");
}

main()
  .catch((error) => {
    console.error("Gagal:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
