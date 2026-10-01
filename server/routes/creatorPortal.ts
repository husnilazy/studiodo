import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { creators, creatorTemplates, marketplaceTemplates, siteAssets } from "../db/schema.js";
import { requireCreatorAuth } from "../middleware/creatorAuth.js";
import { hashPassword, verifyPassword } from "../lib/passwordHash.js";
import { signCreatorToken } from "../lib/jwt.js";
import { logEvent } from "../lib/platformEvents.js";
import { sniffImageType } from "./siteAssets.js";
import { MARKETPLACE_CATEGORIES } from "./marketplace.js";
import crypto from "node:crypto";

// --- Marketplace creator portal API (web /kreator/portal) — creator JWT, separate realm ---------

export const creatorPortalRouter = Router();

const UUID_RE = /^[0-9a-f-]{36}$/i;
const CATEGORY_KEYS = MARKETPLACE_CATEGORIES.map((c) => c.key);
const OUTPUT_PRESETS = ["4r", "2r", "a4", "square", "custom"] as const;
const FRAME_MAX_BYTES = 2 * 1024 * 1024;
const MAX_SLOTS = 12;
export const FRAME_ASSET_PREFIX = "creator:";

const DUMMY_HASH = hashPassword(crypto.randomUUID());
const LOGIN_MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;
const attempts = new Map<string, { count: number; lockedUntil: number }>();

/** PNG header → pixel size (frames must be PNG: they need transparent photo windows). */
function pngSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24 || sniffImageType(buf) !== "image/png") return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

creatorPortalRouter.post("/login", async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  if (!email || !password) return res.status(400).json({ error: "Email dan password wajib diisi" });

  const entry = attempts.get(email) ?? { count: 0, lockedUntil: 0 };
  if (entry.lockedUntil > Date.now()) {
    return res.status(429).json({ error: `Terlalu banyak percobaan gagal. Coba lagi dalam ${Math.ceil((entry.lockedUntil - Date.now()) / 60000)} menit.` });
  }
  const [creator] = await db.select().from(creators).where(eq(creators.email, email));
  const valid = verifyPassword(password, creator?.passwordHash ?? DUMMY_HASH);
  if (!creator || !valid || creator.status !== "active") {
    entry.count += 1;
    if (entry.count >= LOGIN_MAX_ATTEMPTS) { entry.lockedUntil = Date.now() + LOCKOUT_MS; entry.count = 0; }
    attempts.set(email, entry);
    return res.status(401).json({ error: "Email atau password salah" });
  }
  attempts.delete(email);
  await db.update(creators).set({ lastLoginAt: new Date() }).where(eq(creators.id, creator.id));
  res.json({ token: signCreatorToken({ creatorId: creator.id }) });
});

creatorPortalRouter.use(requireCreatorAuth);

creatorPortalRouter.get("/me", async (req, res) => {
  const [c] = await db.select({ name: creators.name, email: creators.email, whatsapp: creators.whatsapp }).from(creators).where(eq(creators.id, req.creatorId!));
  res.json(c);
});

creatorPortalRouter.post("/password", async (req, res) => {
  const current = String(req.body?.currentPassword ?? "");
  const next = String(req.body?.newPassword ?? "");
  if (next.length < 8) return res.status(400).json({ error: "Password baru minimal 8 karakter" });
  if (next.length > 200) return res.status(400).json({ error: "Password baru terlalu panjang" });
  const [c] = await db.select().from(creators).where(eq(creators.id, req.creatorId!));
  if (!c || !verifyPassword(current, c.passwordHash)) return res.status(400).json({ error: "Password saat ini salah" });
  if (verifyPassword(next, c.passwordHash)) return res.status(400).json({ error: "Password baru harus berbeda dari yang lama" });
  await db.update(creators).set({ passwordHash: hashPassword(next) }).where(eq(creators.id, c.id));
  res.json({ ok: true });
});

type TemplateRow = typeof creatorTemplates.$inferSelect;
const toDto = (t: TemplateRow, installCount = 0) => ({
  id: t.id, name: t.name, description: t.description, category: t.category, orientation: t.orientation, outputPreset: t.outputPreset,
  canvasWidth: t.canvasWidth, canvasHeight: t.canvasHeight, slots: t.slots,
  frameUrl: t.frameAssetId ? `/api/public/assets/${t.frameAssetId}` : null, frameAssetId: t.frameAssetId,
  status: t.status, reviewNote: t.status === "rejected" ? t.reviewNote : null,
  submittedAt: t.submittedAt, createdAt: t.createdAt, updatedAt: t.updatedAt, installCount,
});

async function ownTemplate(req: { creatorId?: string; params: { id: string } }) {
  if (!UUID_RE.test(req.params.id)) return null;
  const [t] = await db.select().from(creatorTemplates).where(and(eq(creatorTemplates.id, req.params.id), eq(creatorTemplates.creatorId, req.creatorId!)));
  return t ?? null;
}

// POST /api/creator/assets — { filename, dataBase64 } → the frame PNG. Returns pixel size so the editor
// can set the canvas to match the artwork exactly.
creatorPortalRouter.post("/assets", async (req, res) => {
  const filename = typeof req.body?.filename === "string" ? req.body.filename.trim().slice(0, 120) : "";
  const b64 = typeof req.body?.dataBase64 === "string" ? req.body.dataBase64.replace(/^data:[^;]+;base64,/, "") : "";
  if (!filename || !b64) return res.status(400).json({ error: "File frame wajib diisi" });
  if (b64.length > Math.ceil((FRAME_MAX_BYTES * 4) / 3) + 8) return res.status(413).json({ error: "Ukuran frame maksimal 2 MB" });
  const data = Buffer.from(b64, "base64");
  if (data.length === 0 || data.length > FRAME_MAX_BYTES) return res.status(413).json({ error: "Ukuran frame maksimal 2 MB" });
  const size = pngSize(data);
  if (!size) return res.status(400).json({ error: "Frame harus berupa file PNG (dengan area foto transparan)" });
  if (size.width < 600 || size.height < 600 || size.width > 6000 || size.height > 6000) return res.status(400).json({ error: "Ukuran frame harus antara 600 dan 6000 piksel per sisi" });

  const [row] = await db.insert(siteAssets).values({ filename, contentType: "image/png", data, size: data.length, uploadedBy: `${FRAME_ASSET_PREFIX}${req.creatorId}` }).returning({ id: siteAssets.id });
  res.status(201).json({ id: row.id, url: `/api/public/assets/${row.id}`, width: size.width, height: size.height });
});

creatorPortalRouter.get("/templates", async (req, res) => {
  const rows = await db.select().from(creatorTemplates).where(eq(creatorTemplates.creatorId, req.creatorId!)).orderBy(desc(creatorTemplates.updatedAt));
  const installs = new Map<string, number>();
  for (const t of rows) {
    if (!t.marketplaceTemplateId) continue;
    const [m] = await db.select({ n: marketplaceTemplates.installCount }).from(marketplaceTemplates).where(eq(marketplaceTemplates.id, t.marketplaceTemplateId));
    installs.set(t.id, m?.n ?? 0);
  }
  res.json(rows.map((t) => toDto(t, installs.get(t.id) ?? 0)));
});

creatorPortalRouter.post("/templates", async (req, res) => {
  const name = String(req.body?.name ?? "").trim().slice(0, 80) || "Template tanpa judul";
  const existing = await db.select({ id: creatorTemplates.id }).from(creatorTemplates).where(and(eq(creatorTemplates.creatorId, req.creatorId!), eq(creatorTemplates.status, "draft")));
  if (existing.length >= 20) return res.status(400).json({ error: "Maksimal 20 draft sekaligus. Hapus atau kirim draft lama dulu." });
  const [row] = await db.insert(creatorTemplates).values({ creatorId: req.creatorId!, name }).returning();
  res.status(201).json(toDto(row));
});

creatorPortalRouter.get("/templates/:id", async (req, res) => {
  const t = await ownTemplate(req);
  if (!t) return res.status(404).json({ error: "Template tidak ditemukan" });
  res.json(toDto(t));
});

type Slot = { x: number; y: number; w: number; h: number; rotation?: number };
function cleanSlots(raw: unknown, cw: number, ch: number): { ok: true; value: Slot[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "Format slot foto tidak valid" };
  if (raw.length > MAX_SLOTS) return { ok: false, error: `Maksimal ${MAX_SLOTS} slot foto` };
  const out: Slot[] = [];
  for (const s of raw) {
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : NaN);
    const x = n(s?.x), y = n(s?.y), w = n(s?.w), h = n(s?.h);
    if ([x, y, w, h].some(Number.isNaN)) return { ok: false, error: "Posisi slot foto tidak valid" };
    if (w < 40 || h < 40) return { ok: false, error: "Slot foto terlalu kecil (minimal 40 piksel)" };
    if (cw && ch && (x < 0 || y < 0 || x + w > cw + 1 || y + h > ch + 1)) return { ok: false, error: "Slot foto keluar dari area frame" };
    const slot: Slot = { x, y, w, h };
    if (typeof s?.rotation === "number" && Number.isFinite(s.rotation) && s.rotation !== 0) slot.rotation = Math.max(-180, Math.min(180, Math.round(s.rotation * 10) / 10));
    out.push(slot);
  }
  return { ok: true, value: out };
}

// PATCH — autosave from the editor. Only drafts and rejected templates are editable.
creatorPortalRouter.patch("/templates/:id", async (req, res) => {
  const t = await ownTemplate(req);
  if (!t) return res.status(404).json({ error: "Template tidak ditemukan" });
  if (t.status === "pending" || t.status === "approved") return res.status(409).json({ error: t.status === "pending" ? "Template sedang ditinjau. Tarik kembali dulu untuk mengedit." : "Template yang sudah terbit tidak bisa diedit." });

  const b = (req.body ?? {}) as Record<string, unknown>;
  const patch: Partial<typeof creatorTemplates.$inferInsert> = { updatedAt: new Date() };
  if (b.name !== undefined) { const v = String(b.name).trim().slice(0, 80); if (!v) return res.status(400).json({ error: "Nama template wajib diisi" }); patch.name = v; }
  if (b.description !== undefined) patch.description = String(b.description).trim().slice(0, 500);
  if (b.category !== undefined) { if (!CATEGORY_KEYS.includes(String(b.category))) return res.status(400).json({ error: "Kategori tidak valid" }); patch.category = String(b.category); }
  if (b.orientation !== undefined) { if (b.orientation !== "portrait" && b.orientation !== "landscape") return res.status(400).json({ error: "Orientasi tidak valid" }); patch.orientation = b.orientation; }
  if (b.outputPreset !== undefined) { if (!(OUTPUT_PRESETS as readonly string[]).includes(String(b.outputPreset))) return res.status(400).json({ error: "Ukuran cetak tidak valid" }); patch.outputPreset = String(b.outputPreset); }

  let cw = t.canvasWidth, ch = t.canvasHeight;
  if (b.frameAssetId !== undefined) {
    const id = String(b.frameAssetId);
    if (!UUID_RE.test(id)) return res.status(400).json({ error: "Frame tidak valid" });
    const [asset] = await db.select({ data: siteAssets.data, uploadedBy: siteAssets.uploadedBy }).from(siteAssets).where(eq(siteAssets.id, id));
    if (!asset || asset.uploadedBy !== `${FRAME_ASSET_PREFIX}${req.creatorId}`) return res.status(400).json({ error: "Frame tidak ditemukan. Unggah ulang." });
    const size = pngSize(asset.data);
    if (!size) return res.status(400).json({ error: "Frame tidak valid" });
    patch.frameAssetId = id; patch.canvasWidth = size.width; patch.canvasHeight = size.height;
    cw = size.width; ch = size.height;
    if (b.orientation === undefined) patch.orientation = size.width > size.height ? "landscape" : "portrait";
    if (b.slots === undefined && t.slots.length) patch.slots = []; // new artwork → old window positions no longer mean anything
  }
  if (b.slots !== undefined) {
    const r = cleanSlots(b.slots, cw, ch);
    if (!r.ok) return res.status(400).json({ error: r.error });
    patch.slots = r.value;
  }
  if (t.status === "rejected") { patch.status = "draft"; }
  const [row] = await db.update(creatorTemplates).set(patch).where(eq(creatorTemplates.id, t.id)).returning();
  res.json(toDto(row));
});

creatorPortalRouter.post("/templates/:id/submit", async (req, res) => {
  const t = await ownTemplate(req);
  if (!t) return res.status(404).json({ error: "Template tidak ditemukan" });
  if (t.status !== "draft" && t.status !== "rejected") return res.status(409).json({ error: "Template ini sudah dikirim" });
  if (t.name.trim().length < 3) return res.status(400).json({ error: "Beri nama template minimal 3 karakter" });
  if (!t.frameAssetId) return res.status(400).json({ error: "Unggah frame PNG dulu" });
  if (t.slots.length === 0) return res.status(400).json({ error: "Tambahkan minimal satu slot foto" });
  if (t.description.trim().length < 10) return res.status(400).json({ error: "Isi deskripsi singkat (minimal 10 karakter)" });
  const [row] = await db.update(creatorTemplates).set({ status: "pending", submittedAt: new Date(), reviewNote: null, updatedAt: new Date() }).where(eq(creatorTemplates.id, t.id)).returning();
  const [c] = await db.select({ name: creators.name }).from(creators).where(eq(creators.id, req.creatorId!));
  logEvent({ category: "system", action: "creator_template.submitted", message: `${c?.name ?? "Kreator"} mengirim template "${t.name}" untuk ditinjau`, actorType: "system" });
  res.json(toDto(row));
});

creatorPortalRouter.post("/templates/:id/withdraw", async (req, res) => {
  const t = await ownTemplate(req);
  if (!t) return res.status(404).json({ error: "Template tidak ditemukan" });
  if (t.status !== "pending") return res.status(409).json({ error: "Hanya template yang sedang ditinjau yang bisa ditarik" });
  const [row] = await db.update(creatorTemplates).set({ status: "draft", updatedAt: new Date() }).where(eq(creatorTemplates.id, t.id)).returning();
  res.json(toDto(row));
});

creatorPortalRouter.delete("/templates/:id", async (req, res) => {
  const t = await ownTemplate(req);
  if (!t) return res.status(404).json({ error: "Template tidak ditemukan" });
  if (t.status === "approved") return res.status(409).json({ error: "Template yang sudah terbit tidak bisa dihapus sendiri. Hubungi tim STUDIODO." });
  await db.delete(creatorTemplates).where(eq(creatorTemplates.id, t.id));
  if (t.frameAssetId) await db.delete(siteAssets).where(eq(siteAssets.id, t.frameAssetId));
  res.json({ ok: true });
});
