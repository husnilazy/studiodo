// Copies all public-schema rows from the OLD DB (.env.bak-20261016) into the NEW DB (.env). Run with cwd = kiosk project.
// Reads only; writes only to NEW. Refuses to run if NEW already has rows.
const fs = require("fs");
const path = require("path");
const postgres = require(path.join(process.cwd(), "node_modules", "postgres"));

const readEnv = (file, key) => {
  const m = fs.readFileSync(file, "utf8").match(new RegExp("^" + key + "=(.*)$", "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
};

(async () => {
  const oldSql = postgres(readEnv(".env", "DATABASE_URL"), { max: 1, connect_timeout: 30, prepare: false });
  const newSql = postgres(readEnv(".env", "DATABASE_URL_NEW"), { max: 1, connect_timeout: 30, prepare: false });
  try {
    const all = (await newSql`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1`).map((r) => r.table_name);
    // Parents before children (foreign keys can't be disabled on this role). Self-references are fine inside one statement.
    const fks = await newSql`select c.conrelid::regclass::text as child, c.confrelid::regclass::text as parent from pg_constraint c join pg_namespace n on n.oid=c.connamespace where c.contype='f' and n.nspname='public'`;
    const deps = new Map(all.map((t) => [t, new Set()]));
    for (const { child, parent } of fks) { const ch = child.replace(/"/g, ""), pa = parent.replace(/"/g, ""); if (ch !== pa && deps.has(ch) && deps.has(pa)) deps.get(ch).add(pa); }
    const tables = [], done = new Set();
    while (tables.length < all.length) {
      const next = all.filter((t) => !done.has(t) && [...deps.get(t)].every((d) => done.has(d)));
      if (!next.length) throw new Error("circular foreign keys among: " + all.filter((t) => !done.has(t)).join(", "));
      for (const t of next) { tables.push(t); done.add(t); }
    }
    let existing = 0;
    for (const t of tables) existing += (await newSql.unsafe(`select count(*)::int c from "${t}"`))[0].c;
    if (existing > 0) throw new Error(`NEW db already has ${existing} rows - refusing to copy`);

    await newSql.begin(async (tx) => {
      for (const t of tables) {
        const exists = await oldSql`select 1 from information_schema.tables where table_schema='public' and table_name=${t}`;
        if (!exists.length) { console.log(`skip ${t} (not in old)`); continue; }
        // Only columns that exist on both sides.
        const oc = (await oldSql`select column_name from information_schema.columns where table_schema='public' and table_name=${t}`).map((r) => r.column_name);
        const nc = (await tx`select column_name from information_schema.columns where table_schema='public' and table_name=${t}`).map((r) => r.column_name);
        const cols = nc.filter((c) => oc.includes(c));
        const sel = cols.map((c) => `"${c}"`).join(", ");
        const rows = await oldSql.unsafe(`select to_jsonb(x) as j from (select ${sel} from "${t}") x`);
        if (!rows.length) continue;
        for (let i = 0; i < rows.length; i += 100) {
          const chunk = rows.slice(i, i + 100).map((r) => r.j);
          await tx.unsafe(`insert into "${t}" (${sel}) select ${sel} from jsonb_populate_recordset(null::"${t}", $1::jsonb)`, [tx.json(chunk)]);
        }
        console.log(`copied ${t}: ${rows.length}`);
      }
    });
    console.log("COMMITTED");
  } finally {
    await oldSql.end({ timeout: 5 });
    await newSql.end({ timeout: 5 });
  }
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
