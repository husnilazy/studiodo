// Usage: node dbcheck.cjs  (run with cwd = kiosk project so ./node_modules resolves)
const fs = require("fs");
const path = require("path");
const postgres = require(path.join(process.cwd(), "node_modules", "postgres"));

function readEnv(file, key) {
  const m = fs.readFileSync(file, "utf8").match(new RegExp("^" + key + "=(.*)$", "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
}

async function summarize(label, url) {
  const sql = postgres(url, { max: 1, connect_timeout: 30, prepare: false });
  try {
    const t0 = Date.now();
    const [{ v }] = await sql`select version() as v`;
    const rtt = Date.now() - t0;
    const tables = await sql`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1`;
    let total = 0;
    const counts = {};
    for (const { table_name } of tables) {
      const [{ c }] = await sql.unsafe(`select count(*)::int as c from "${table_name}"`);
      counts[table_name] = c;
      total += c;
    }
    const mig = await sql`select count(*)::int as c from drizzle.__drizzle_migrations`.catch(() => [{ c: "n/a" }]);
    console.log(`${label}: ${v.split(" on ")[0]} | first query ${rtt}ms | tables=${tables.length} rows=${total} | migrations applied=${mig[0].c}`);
    return counts;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

(async () => {
  const oldUrl = readEnv(".env", "DATABASE_URL");
  const newUrl = readEnv(".env", "DATABASE_URL_NEW");
  const a = await summarize("OLD (us-east-1)", oldUrl);
  const b = await summarize("NEW (singapore)", newUrl);
  if (process.argv[2] === "diff") {
    for (const t of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[t] !== b[t]) console.log(`  DIFF ${t}: old=${a[t]} new=${b[t]}`);
    }
    console.log("diff done");
  }
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
