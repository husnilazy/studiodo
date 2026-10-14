// Where are a session's photos? Looks in every place the server may have stored them: the session's own record, this PC's
// local storage folder, the tenant's R2 bucket and (as a link) Google Drive. Read-only; prints no secrets.
//
// Usage (run in the repo folder on the server PC):
//   node ./node_modules/tsx/dist/cli.mjs server/scripts/findSessionFiles.ts <sessionId or its first 8 characters> [--hours 6]
//
// "--hours" is how far back (before the session started) to look for stray files. Default 2.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { client, db } from "../db/client.js";
import { getStorageSettings } from "../lib/storageConfig.js";

const arg = process.argv[2]?.trim();
if (!arg || !/^[0-9a-f-]{6,36}$/i.test(arg)) {
  console.error("Usage: findSessionFiles.ts <sessionId or prefix> [--hours N]");
  process.exit(1);
}
const hoursArg = process.argv.indexOf("--hours");
const hoursBefore = hoursArg > 0 ? Math.max(0, Number(process.argv[hoursArg + 1]) || 2) : 2;

const rows = (await db.execute(sql`select id, tenant_id, created_at, completed_at, payment_status, photo_urls, strip_url, gif_url, video_url, drive_folder_id, share_url from sessions where id::text like ${arg + "%"} limit 3`)) as unknown as Record<string, unknown>[];
const list = Array.isArray(rows) ? rows : ((rows as { rows?: Record<string, unknown>[] }).rows ?? []);
if (list.length === 0) { console.log("Sesi tidak ditemukan."); await client.end(); process.exit(0); }
if (list.length > 1) { console.log("Awalan itu cocok dengan lebih dari satu sesi, tulis lebih panjang:", list.map((r) => String(r.id).slice(0, 13)).join(", ")); await client.end(); process.exit(0); }

const s = list[0] as { id: string; tenant_id: string; created_at: Date | string; completed_at: Date | null; payment_status: string; photo_urls: string[] | null; strip_url: string | null; gif_url: string | null; video_url: string | null; drive_folder_id: string | null; share_url: string | null };
const started = new Date(s.created_at.toString().endsWith("Z") || s.created_at instanceof Date ? s.created_at : `${s.created_at}Z`);
const since = new Date(started.getTime() - hoursBefore * 3600_000);
const wib = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().replace("T", " ").slice(5, 19) + " WIB";

console.log(`Sesi ${s.id}`);
console.log(`  dimulai ${wib(started)} | bayar: ${s.payment_status} | selesai: ${s.completed_at ? "ya" : "belum"}`);
console.log(`  tercatat di server: ${(s.photo_urls ?? []).length} foto, strip ${s.strip_url ? "ada" : "tidak ada"}, GIF ${s.gif_url ? "ada" : "tidak ada"}, video ${s.video_url ? "ada" : "tidak ada"}`);
for (const u of [...(s.photo_urls ?? []), s.strip_url, s.gif_url, s.video_url]) if (u) console.log("   ", u);
if (s.share_url) console.log("  link QR:", s.share_url);

const settings = await getStorageSettings(s.tenant_id);
console.log(`\nPenyimpanan tenant: ${settings.driver.toUpperCase()}  (R2 terisi: ${settings.r2Bucket && settings.r2AccessKeyId ? "ya" : "tidak"}, Drive terisi: ${settings.gdriveFolderId ? "ya" : "tidak"})`);

// local disk
const root = path.join(process.cwd(), "storage", s.tenant_id);
console.log(`\n[Disk lokal PC ini] ${root}`);
if (!fs.existsSync(root)) console.log("  folder belum ada");
else {
  const hits: { f: string; m: Date; kb: number }[] = [];
  const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { const st = fs.statSync(p); if (st.mtime >= since) hits.push({ f: path.relative(root, p), m: st.mtime, kb: Math.round(st.size / 1024) }); } } };
  walk(root);
  hits.sort((a, b) => a.m.getTime() - b.m.getTime());
  console.log(`  ${hits.length} file sejak ${wib(since)}`);
  for (const h of hits.slice(-30)) console.log("   ", wib(h.m), String(h.kb).padStart(6) + " KB", h.f);
}

// R2
if (settings.r2Bucket && settings.r2AccessKeyId && settings.r2SecretAccessKey) {
  const endpoint = settings.r2Endpoint ?? `https://${settings.r2AccountId}.r2.cloudflarestorage.com`;
  const r2 = new S3Client({ region: "auto", endpoint, credentials: { accessKeyId: settings.r2AccessKeyId, secretAccessKey: settings.r2SecretAccessKey } });
  const prefix = [settings.r2Prefix, s.tenant_id].filter(Boolean).join("/") + "/";
  const found: { k: string; m: Date; kb: number }[] = [];
  let token: string | undefined;
  try {
    do {
      const r = await r2.send(new ListObjectsV2Command({ Bucket: settings.r2Bucket, Prefix: prefix, ContinuationToken: token }));
      for (const o of r.Contents ?? []) if (o.LastModified && o.LastModified >= since) found.push({ k: o.Key!, m: o.LastModified, kb: Math.round((o.Size ?? 0) / 1024) });
      token = r.NextContinuationToken;
    } while (token);
    found.sort((a, b) => a.m.getTime() - b.m.getTime());
    const base = String(settings.r2PublicBaseUrl ?? "").replace(/\/$/, "");
    console.log(`\n[R2] bucket ${settings.r2Bucket}, awalan ${prefix}\n  ${found.length} objek sejak ${wib(since)}`);
    for (const f of found.slice(-30)) console.log("   ", wib(f.m), String(f.kb).padStart(6) + " KB", base ? `${base}/${f.k}` : f.k);
  } catch (e) {
    console.log(`\n[R2] gagal membaca: ${e instanceof Error ? e.message : e}`);
  }
} else console.log("\n[R2] tidak dikonfigurasi untuk tenant ini");

// Drive
if (s.drive_folder_id) console.log(`\n[Google Drive] folder sesi ini: https://drive.google.com/drive/folders/${s.drive_folder_id}`);
else if (settings.gdriveFolderId) console.log(`\n[Google Drive] sesi ini belum punya folder sendiri. Folder induk tenant: https://drive.google.com/drive/folders/${settings.gdriveFolderId} (urutkan menurut "terakhir diubah")`);
else console.log("\n[Google Drive] tidak dikonfigurasi untuk tenant ini");

await client.end();
