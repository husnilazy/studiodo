import { Router } from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { sessions, tenants } from "../db/schema.js";
import { saveAssetBuffer } from "../lib/contentStudio/render.js";
import { resolveFrameUrl } from "../lib/frameUrl.js";
import { displayUrls } from "../lib/contentStudio/sourcePhotos.js";

// Superadmin → Konten Instagram → Bahan foto: pick real photos from a tenant's finished sessions (our own booths) as material for
// posts. Customer faces are marketing material only with consent: sessions are listed with their "publish consent" flag, the
// default list shows consented sessions only, and importing a session without consent needs an explicit confirmation that the
// consent was obtained outside the app. Imported files become Content Studio assets (asset:<file>), usable by the generator.

export const contentSourceRouter = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMAGE_TYPES: Record<string, "jpg" | "png" | "webp" | "gif"> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

async function fetchImage(url: string): Promise<{ buf: Buffer; ext: "jpg" | "png" | "webp" | "gif" }> {
  // Local storage driver: stored as /storage/<tenant>/<folder>/<file>. Read from disk, never outside the storage folder.
  if (url.startsWith("/storage/")) {
    const root = path.join(process.cwd(), "storage");
    const file = path.join(root, url.slice("/storage/".length).split("?")[0]);
    if (!file.startsWith(root + path.sep)) throw new Error("Path tidak valid");
    const ext = path.extname(file).toLowerCase().replace(".", "").replace("jpeg", "jpg");
    if (!["jpg", "png", "webp", "gif"].includes(ext)) throw new Error("Bukan file gambar");
    return { buf: await readFile(file), ext: ext as "jpg" | "png" | "webp" | "gif" };
  }
  if (!/^https?:\/\//i.test(url)) throw new Error("URL foto tidak didukung");
  const res = await fetch(url, { signal: AbortSignal.timeout(25_000), redirect: "follow" });
  if (!res.ok) throw new Error(`Foto tidak bisa diunduh (${res.status})`);
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const ext = IMAGE_TYPES[type];
  if (!ext) throw new Error("Sumber foto bukan gambar (mungkin halaman Google Drive). Coba sesi lain.");
  return { buf: Buffer.from(await res.arrayBuffer()), ext };
}

contentSourceRouter.get("/source/tenants", async (_req, res) => {
  const rows = await db.select({ id: tenants.id, name: tenants.name }).from(tenants).orderBy(tenants.name).limit(300);
  res.json(rows);
});

// GET /source/sessions?tenantId=&all=1&before=ISO -> finished sessions that have photos, newest first (30 per page).
contentSourceRouter.get("/source/sessions", async (req, res) => {
  const tenantId = String(req.query.tenantId ?? "");
  if (!UUID.test(tenantId)) return res.status(400).json({ error: "Pilih tenant" });
  const all = req.query.all === "1";
  const before = req.query.before ? new Date(String(req.query.before)) : null;
  const conds = [eq(sessions.tenantId, tenantId), sql`coalesce(jsonb_array_length(${sessions.photoUrls}), 0) > 0`];
  if (!all) conds.push(eq(sessions.publishConsent, true));
  if (before && !Number.isNaN(before.getTime())) conds.push(lt(sessions.createdAt, before));
  const rows = await db.select().from(sessions).where(and(...conds)).orderBy(desc(sessions.createdAt)).limit(30);
  res.json({
    sessions: rows.map((r) => ({ id: r.id, createdAt: r.createdAt.toISOString(), consent: r.publishConsent, orientation: r.orientation, hasVideo: Boolean(r.videoUrl || r.stopMotionUrl), ...displayUrls(r) })),
    next: rows.length === 30 ? rows[rows.length - 1].createdAt.toISOString() : null,
  });
});

// POST { sessionId, photoIndexes?: number[], strip?: boolean, confirmedConsent?: boolean } -> { photos: string[], strip?: string } (asset file names)
contentSourceRouter.post("/source/import", async (req, res) => {
  const id = String(req.body?.sessionId ?? "");
  if (!UUID.test(id)) return res.status(400).json({ error: "Sesi tidak valid" });
  const [s] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  if (!s) return res.status(404).json({ error: "Sesi tidak ditemukan" });
  if (!s.publishConsent && req.body?.confirmedConsent !== true) {
    return res.status(409).json({ error: "Customer ini belum memberi izin publikasi di kiosk. Impor hanya setelah izin didapat di luar aplikasi, lalu centang konfirmasi.", code: "no_consent" });
  }
  const urls = (s.photoUrls ?? []).map((u, i) => s.drivePhotoIds?.[i]?.downloadUrl || resolveFrameUrl(u));
  const wanted: number[] = Array.isArray(req.body?.photoIndexes) ? req.body.photoIndexes.map(Number).filter((n: number) => Number.isInteger(n) && n >= 0 && n < urls.length).slice(0, 6) : [];
  const out: { photos: string[]; strip?: string } = { photos: [] };
  try {
    for (const i of wanted) {
      const { buf, ext } = await fetchImage(urls[i]);
      out.photos.push(await saveAssetBuffer(`sesi-${id.slice(0, 8)}-${i + 1}`, buf, ext));
    }
    if (req.body?.strip === true) {
      const stripUrl = s.driveStripId ? `https://drive.google.com/uc?export=download&id=${s.driveStripId}` : s.stripUrl ? resolveFrameUrl(s.stripUrl) : "";
      if (!stripUrl) return res.status(404).json({ error: "Sesi ini tidak punya strip" });
      const { buf, ext } = await fetchImage(stripUrl);
      out.strip = await saveAssetBuffer(`strip-${id.slice(0, 8)}`, buf, ext);
    }
  } catch (e) { return res.status(502).json({ error: e instanceof Error ? e.message : "Gagal mengimpor foto" }); }
  res.json(out);
});
