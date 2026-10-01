import { Router } from "express";
import { count, desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { creatorSubmissions, creatorTemplates, creators, marketplaceTemplates, superadmins } from "../db/schema.js";
import crypto from "node:crypto";
import { hashPassword } from "../lib/passwordHash.js";
import { resolveFrameUrl } from "../lib/frameUrl.js";
import { clientIp, makeRateLimiter } from "../lib/clientIp.js";
import { logEvent } from "../lib/platformEvents.js";

// --- Public: the website's /kreator form ---------------------------------------------

export const publicCreatorsRouter = Router();
const isRateLimited = makeRateLimiter(3, 60 * 60 * 1000);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/public/creator-submissions — no auth. Throttled per real client IP; a hidden honeypot
// field ("company") that real people never fill makes dumb bots cheap to drop.
publicCreatorsRouter.post("/creator-submissions", async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  // Pretend success to bots so they don't adapt, but store nothing.
  if (typeof b.company === "string" && b.company.trim() !== "") return res.status(201).json({ ok: true });

  if (isRateLimited(clientIp(req))) return res.status(429).json({ error: "Terlalu banyak pengiriman. Coba lagi nanti." });

  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const name = str(b.name, 100);
  const email = str(b.email, 150).toLowerCase();
  const whatsapp = str(b.whatsapp, 40) || null;
  const portfolioUrl = str(b.portfolioUrl, 300);
  const description = str(b.description, 1000);

  if (!name || !email || !portfolioUrl) return res.status(400).json({ error: "Nama, email, dan tautan portofolio wajib diisi" });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Format email tidak valid" });
  let url: URL;
  try { url = new URL(portfolioUrl); } catch { return res.status(400).json({ error: "Tautan portofolio harus berupa alamat lengkap, mis. https://…" }); }
  if (url.protocol !== "https:" && url.protocol !== "http:") return res.status(400).json({ error: "Tautan portofolio harus diawali http:// atau https://" });

  const [row] = await db.insert(creatorSubmissions).values({ name, email, whatsapp, portfolioUrl, description }).returning({ id: creatorSubmissions.id });
  logEvent({ category: "tenant", action: "creator.submitted", message: `Pendaftaran kreator baru: ${name} (${email})`, actorType: "system" });
  res.status(201).json({ ok: true, id: row.id });
});

// --- Superadmin review (mounted under /api/superadmin/creators) -----------------------

export const creatorsAdminRouter = Router();
const STATUSES = ["new", "reviewing", "accepted", "rejected"];
const UUID_RE = /^[0-9a-f-]{36}$/i;

creatorsAdminRouter.get("/", async (_req, res) => {
  const rows = await db.select().from(creatorSubmissions).orderBy(desc(creatorSubmissions.createdAt)).limit(300);
  res.json(rows);
});

// --- Creator accounts + template review -----------------------------------------------

const newPassword = () => crypto.randomBytes(9).toString("base64url"); // 12 chars, shown to the superadmin once

async function actor(req: { superadminId?: string }) {
  if (!req.superadminId) return undefined;
  const [a] = await db.select({ email: superadmins.email }).from(superadmins).where(eq(superadmins.id, req.superadminId));
  return a?.email ?? undefined;
}

// GET /api/superadmin/creators/accounts
creatorsAdminRouter.get("/accounts", async (_req, res) => {
  const rows = await db.select({
    id: creators.id, name: creators.name, email: creators.email, whatsapp: creators.whatsapp, status: creators.status,
    lastLoginAt: creators.lastLoginAt, createdAt: creators.createdAt,
  }).from(creators).orderBy(desc(creators.createdAt));
  const counts = await db.select({ creatorId: creatorTemplates.creatorId, n: count() }).from(creatorTemplates).groupBy(creatorTemplates.creatorId);
  const byCreator = new Map(counts.map((c) => [c.creatorId, Number(c.n)]));
  res.json(rows.map((r) => ({ ...r, templateCount: byCreator.get(r.id) ?? 0 })));
});

// POST /api/superadmin/creators/accounts — { submissionId } or { name, email, whatsapp? } → creates the login.
// The generated password is returned ONCE; the superadmin passes it to the designer (WhatsApp/email).
creatorsAdminRouter.post("/accounts", async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  let name = typeof b.name === "string" ? b.name.trim().slice(0, 100) : "";
  let email = typeof b.email === "string" ? b.email.trim().toLowerCase().slice(0, 150) : "";
  let whatsapp = typeof b.whatsapp === "string" ? b.whatsapp.trim().slice(0, 40) || null : null;
  let submissionId: string | null = null;
  if (typeof b.submissionId === "string" && b.submissionId) {
    if (!UUID_RE.test(b.submissionId)) return res.status(404).json({ error: "Pendaftaran tidak ditemukan" });
    const [sub] = await db.select().from(creatorSubmissions).where(eq(creatorSubmissions.id, b.submissionId));
    if (!sub) return res.status(404).json({ error: "Pendaftaran tidak ditemukan" });
    name = name || sub.name; email = email || sub.email.toLowerCase(); whatsapp = whatsapp ?? sub.whatsapp; submissionId = sub.id;
  }
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Nama dan email yang valid wajib diisi" });
  const [dup] = await db.select({ id: creators.id }).from(creators).where(eq(creators.email, email));
  if (dup) return res.status(409).json({ error: "Email ini sudah punya akun kreator" });

  const password = newPassword();
  const [row] = await db.insert(creators).values({ name, email, whatsapp, passwordHash: hashPassword(password), submissionId }).returning({ id: creators.id, name: creators.name, email: creators.email });
  if (submissionId) await db.update(creatorSubmissions).set({ status: "accepted", reviewedBy: (await actor(req)) ?? null, reviewedAt: new Date() }).where(eq(creatorSubmissions.id, submissionId));
  logEvent({ category: "system", action: "creator.account_created", message: `Akun kreator dibuat: ${name} (${email})`, actorType: "superadmin", actorLabel: await actor(req) });
  res.status(201).json({ creator: row, password });
});

creatorsAdminRouter.patch("/accounts/:id", async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: "Akun tidak ditemukan" });
  const status = req.body?.status;
  if (status !== "active" && status !== "suspended") return res.status(400).json({ error: "Status tidak valid" });
  const [row] = await db.update(creators).set({ status }).where(eq(creators.id, req.params.id)).returning({ id: creators.id });
  if (!row) return res.status(404).json({ error: "Akun tidak ditemukan" });
  res.json({ ok: true });
});

creatorsAdminRouter.post("/accounts/:id/reset-password", async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: "Akun tidak ditemukan" });
  const password = newPassword();
  const [row] = await db.update(creators).set({ passwordHash: hashPassword(password) }).where(eq(creators.id, req.params.id)).returning({ id: creators.id });
  if (!row) return res.status(404).json({ error: "Akun tidak ditemukan" });
  res.json({ password });
});

// GET /api/superadmin/creators/templates?status=pending|approved|rejected|draft
creatorsAdminRouter.get("/templates", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : "";
  const rows = await db.select({
    t: creatorTemplates, creatorName: creators.name, creatorEmail: creators.email,
  }).from(creatorTemplates).innerJoin(creators, eq(creators.id, creatorTemplates.creatorId))
    .where(["draft", "pending", "approved", "rejected"].includes(status) ? eq(creatorTemplates.status, status) : undefined)
    .orderBy(desc(creatorTemplates.submittedAt), desc(creatorTemplates.updatedAt)).limit(200);
  res.json(rows.map(({ t, creatorName, creatorEmail }) => ({
    id: t.id, name: t.name, description: t.description, category: t.category, orientation: t.orientation, outputPreset: t.outputPreset,
    canvasWidth: t.canvasWidth, canvasHeight: t.canvasHeight, slots: t.slots, frameUrl: t.frameAssetId ? `/api/public/assets/${t.frameAssetId}` : null,
    status: t.status, reviewNote: t.reviewNote, submittedAt: t.submittedAt, reviewedAt: t.reviewedAt, creatorName, creatorEmail,
  })));
});

// POST /api/superadmin/creators/templates/:id/approve — publishes a copy into the curated marketplace.
creatorsAdminRouter.post("/templates/:id/approve", async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: "Template tidak ditemukan" });
  const [row] = await db.select({ t: creatorTemplates, creatorName: creators.name }).from(creatorTemplates).innerJoin(creators, eq(creators.id, creatorTemplates.creatorId)).where(eq(creatorTemplates.id, req.params.id));
  if (!row) return res.status(404).json({ error: "Template tidak ditemukan" });
  const t = row.t;
  if (t.status !== "pending") return res.status(409).json({ error: "Hanya template yang sedang ditinjau yang bisa disetujui" });
  if (!t.frameAssetId) return res.status(400).json({ error: "Template tidak punya frame" });
  const frameImageUrl = resolveFrameUrl(`/api/public/assets/${t.frameAssetId}`);
  if (!/^https?:/i.test(frameImageUrl)) return res.status(500).json({ error: "PUBLIC_BASE_URL belum diatur di server, sehingga alamat frame tidak bisa dibuat absolut." });

  const [m] = await db.insert(marketplaceTemplates).values({
    name: t.name, description: t.description, creatorName: row.creatorName, category: t.category, frameImageUrl, slots: t.slots,
    canvasWidth: t.canvasWidth, canvasHeight: t.canvasHeight, orientation: t.orientation, outputPreset: t.outputPreset, featured: req.body?.featured === true,
  }).returning({ id: marketplaceTemplates.id });
  await db.update(creatorTemplates).set({ status: "approved", marketplaceTemplateId: m.id, reviewNote: null, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(creatorTemplates.id, t.id));
  logEvent({ category: "system", action: "creator_template.approved", message: `Template "${t.name}" oleh ${row.creatorName} disetujui dan terbit di marketplace`, actorType: "superadmin", actorLabel: await actor(req) });
  res.json({ ok: true, marketplaceTemplateId: m.id });
});

// POST /api/superadmin/creators/templates/:id/reject — { note } shown to the creator so they can fix and resubmit.
creatorsAdminRouter.post("/templates/:id/reject", async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: "Template tidak ditemukan" });
  const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 600) : "";
  if (note.length < 5) return res.status(400).json({ error: "Tulis alasan penolakan agar kreator tahu apa yang perlu diperbaiki" });
  const [t] = await db.select().from(creatorTemplates).where(eq(creatorTemplates.id, req.params.id));
  if (!t) return res.status(404).json({ error: "Template tidak ditemukan" });
  if (t.status !== "pending") return res.status(409).json({ error: "Hanya template yang sedang ditinjau yang bisa ditolak" });
  await db.update(creatorTemplates).set({ status: "rejected", reviewNote: note, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(creatorTemplates.id, t.id));
  logEvent({ category: "system", action: "creator_template.rejected", message: `Template "${t.name}" ditolak: ${note}`, actorType: "superadmin", actorLabel: await actor(req) });
  res.json({ ok: true });
});

creatorsAdminRouter.patch("/:id", async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: "Data tidak ditemukan" });
  const b = (req.body ?? {}) as Record<string, unknown>;
  const patch: { status?: string; note?: string | null; reviewedBy?: string | null; reviewedAt?: Date } = {};
  if (b.status !== undefined) {
    if (typeof b.status !== "string" || !STATUSES.includes(b.status)) return res.status(400).json({ error: "Status tidak valid" });
    patch.status = b.status;
  }
  if (b.note !== undefined) {
    const note = typeof b.note === "string" ? b.note.trim() : "";
    if (note.length > 1000) return res.status(400).json({ error: "Catatan maksimal 1000 karakter" });
    patch.note = note || null;
  }
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: "Tidak ada perubahan" });

  const [admin] = req.superadminId ? await db.select({ email: superadmins.email }).from(superadmins).where(eq(superadmins.id, req.superadminId)) : [];
  patch.reviewedBy = admin?.email ?? null;
  patch.reviewedAt = new Date();
  const [row] = await db.update(creatorSubmissions).set(patch).where(eq(creatorSubmissions.id, req.params.id)).returning();
  if (!row) return res.status(404).json({ error: "Data tidak ditemukan" });
  res.json(row);
});

creatorsAdminRouter.delete("/:id", async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: "Data tidak ditemukan" });
  const [row] = await db.delete(creatorSubmissions).where(eq(creatorSubmissions.id, req.params.id)).returning({ id: creatorSubmissions.id });
  if (!row) return res.status(404).json({ error: "Data tidak ditemukan" });
  res.json({ ok: true });
});
