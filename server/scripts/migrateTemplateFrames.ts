// One-off: convert existing templates.frame_image_url rows that still store
// a raw base64 data URI (the same anti-pattern packages.thumbnailUrl had)
// into real files, so GET /api/frames stops shipping multi-MB payloads for
// templates saved before the frames.ts fix. Writes straight to the local
// storage folder (this tenant's configured driver) with fs/postgres only —
// importing server/storage.ts here pulls in @aws-sdk/client-s3, which made
// this script hang for minutes on a cold tsx run even though this tenant
// never touches R2 at all.
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const localStorageRoot = path.join(process.cwd(), "storage");

const rows = await sql`SELECT id, tenant_id, frame_image_url FROM templates WHERE frame_image_url LIKE 'data:%'`;
console.log(`Found ${rows.length} template(s) with inline base64 frame_image_url`);

for (const row of rows) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(row.frame_image_url);
  if (!match) {
    console.log(`Skipping ${row.id} — not a base64 data URI`);
    continue;
  }
  const [, mimetype, base64] = match;
  const buffer = Buffer.from(base64, "base64");
  const extension = mimetype.split("/")[1] ? `.${mimetype.split("/")[1]}` : ".png";
  const filename = `${nanoid(12)}${extension}`;
  const localDir = path.join(localStorageRoot, row.tenant_id, "templates");
  await fs.mkdir(localDir, { recursive: true });
  await fs.writeFile(path.join(localDir, filename), buffer);
  const url = `/storage/${row.tenant_id}/templates/${filename}`;
  await sql`UPDATE templates SET frame_image_url = ${url} WHERE id = ${row.id}`;
  console.log(`Migrated ${row.id}: ${buffer.length} bytes -> ${url}`);
}

await sql.end();
console.log("Done.");
