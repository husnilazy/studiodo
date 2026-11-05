// Empties ONLY the NEW (Singapore) db's public tables so the copy can be re-run. Refuses if NEW host is not ap-southeast-1.
const fs = require("fs"), path = require("path");
const postgres = require(path.join(process.cwd(), "node_modules", "postgres"));
const m = fs.readFileSync(".env", "utf8").match(/^DATABASE_URL_NEW=(.*)$/m);
const url = m[1].trim().replace(/^["']|["']$/g, "");
if (!url.includes("ap-southeast-1")) { console.error("ERR NEW url is not Singapore - abort"); process.exit(1); }
(async () => {
  const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 30 });
  const t = (await sql`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`).map((r) => `"${r.table_name}"`);
  await sql.unsafe(`truncate ${t.join(", ")} restart identity cascade`);
  console.log("truncated", t.length, "tables on NEW");
  await sql.end();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
