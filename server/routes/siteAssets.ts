import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { siteAssets, superadmins } from "../db/schema.js";
import { logEvent } from "../lib/platformEvents.js";

const MAX_BYTES = 600 * 1024; // logos only — keeps rows small and the JSON body well under the server's limit
const UUID_RE = /^[0-9a-f-]{36}$/i;

/** Decide the real image type from the bytes themselves — never trust the filename or the claimed MIME type. */
function sniffImageType(buf: Buffer): "image/png" | "image/jpeg" | "image/webp" | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null; // SVG is deliberately not accepted: an SVG opened directly can run script
}

// --- Public: serve an uploaded image ---------------------------------------------------

export const publicAssetsRouter = Router();

// GET /api/public/assets/:id — ids are random UUIDs and an asset is never edited in place
// (a replacement is a new upload), so the response can be cached forever.
publicAssetsRouter.get("/assets/:id", async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).end();
  const [row] = await db.select({ data: siteAssets.data, contentType: siteAssets.contentType }).from(siteAssets).where(eq(siteAssets.id, req.params.id));
  if (!row) return res.status(404).end();
  res.set({
    "Content-Type": row.contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Security-Policy": "default-src 'none'; sandbox", // belt and braces: nothing here should ever execute
    "Cross-Origin-Resource-Policy": "cross-origin", // the website (another origin) embeds these in <img>
  });
  res.send(row.data);
});

// --- Superadmin upload (mounted under /api/superadmin/assets) ---------------------------

export const siteAssetsAdminRouter = Router();

// POST /api/superadmin/assets — { filename, dataBase64 } → { url }
siteAssetsAdminRouter.post("/", async (req, res) => {
  const filename = typeof req.body?.filename === "string" ? req.body.filename.trim().slice(0, 120) : "";
  const b64 = typeof req.body?.dataBase64 === "string" ? req.body.dataBase64.replace(/^data:[^;]+;base64,/, "") : "";
  if (!filename || !b64) return res.status(400).json({ error: "File gambar wajib diisi" });
  if (b64.length > Math.ceil((MAX_BYTES * 4) / 3) + 8) return res.status(413).json({ error: "Ukuran gambar maksimal 600 KB" });

  const data = Buffer.from(b64, "base64");
  if (data.length === 0 || data.length > MAX_BYTES) return res.status(413).json({ error: "Ukuran gambar maksimal 600 KB" });
  const contentType = sniffImageType(data);
  if (!contentType) return res.status(400).json({ error: "Format harus PNG, JPG, atau WebP" });

  const [admin] = req.superadminId ? await db.select({ email: superadmins.email }).from(superadmins).where(eq(superadmins.id, req.superadminId)) : [];
  const [row] = await db.insert(siteAssets).values({ filename, contentType, data, size: data.length, uploadedBy: admin?.email ?? null }).returning({ id: siteAssets.id });
  logEvent({ category: "system", action: "site_asset.uploaded", message: `Gambar website diunggah: ${filename} (${Math.round(data.length / 1024)} KB)`, actorType: "superadmin", actorLabel: admin?.email ?? undefined });
  res.status(201).json({ id: row.id, url: `/api/public/assets/${row.id}` });
});
