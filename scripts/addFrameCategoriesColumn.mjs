// One-off, targeted alternative to `npm run db:push` for this single column —
// db:push diffs the WHOLE schema.ts against the live DB and choked on some
// unrelated table's primary key (PostgresError 42P16) before it ever got to
// tenant_settings. This statement only ever adds one new nullable jsonb
// column; IF NOT EXISTS makes it safe to re-run.
import postgres from "postgres";
import "dotenv/config";

const sql = postgres(process.env.DATABASE_URL, { prepare: false });
await sql`ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS frame_categories jsonb`;
console.log("Kolom frame_categories sudah ada di tenant_settings.");
await sql.end();
