import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL belum di-set. Salin .env.example ke .env dan isi koneksi PostgreSQL kamu."
  );
}

// Tuned for Neon (serverless Postgres, compute auto-suspends when idle): a
// smaller pool plus idle/connect timeouts so the driver reconnects cleanly
// instead of handing back a dead socket after a suspend, and `prepare: false`
// because Neon's pooled ("-pooler") connection string routes through pgbouncer
// in transaction mode, which doesn't support prepared statements.
export const client = postgres(connectionString, {
  max: 5,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,
});
export const db = drizzle(client, { schema });
