// One-off backfill: some sessions finalized from a packaged Electron kiosk
// (window.location.origin === "file://") got "file:///#/share/ID" saved as
// their permanent share_url, before server/routes/sessions.ts's /finalize
// validation was tightened to only accept a real http(s) URL from the
// client. This recomputes share_url from PUBLIC_BASE_URL for exactly the
// rows that don't already look like a real URL — nothing else is touched.
//
// Preview only, by default:
//   node scripts/fixBrokenShareUrls.mjs
// Actually write the fix:
//   node scripts/fixBrokenShareUrls.mjs --apply
import postgres from "postgres";
import "dotenv/config";

const apply = process.argv.includes("--apply");
const sql = postgres(process.env.DATABASE_URL, { prepare: false });
const baseUrl = String(process.env.PUBLIC_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");

const broken = await sql`
  select id, share_url from sessions
  where share_url is not null and share_url !~* '^https?://'
  order by created_at desc
`;

if (broken.length === 0) {
  console.log("Tidak ada share_url yang rusak.");
  await sql.end();
  process.exit(0);
}

console.log(`Ditemukan ${broken.length} sesi dengan share_url rusak:`);
for (const row of broken) {
  console.log(`  ${row.id}: ${row.share_url}  ->  ${baseUrl}/#/share/${row.id}`);
}

if (!apply) {
  console.log("\nIni cuma preview. Jalankan lagi dengan --apply untuk benar-benar menyimpan perubahan.");
  await sql.end();
  process.exit(0);
}

const updated = await sql`
  update sessions
  set share_url = ${baseUrl} || '/#/share/' || id::text
  where share_url is not null and share_url !~* '^https?://'
  returning id, share_url
`;
console.log(`\nSelesai — ${updated.length} sesi diperbaiki.`);
await sql.end();
