import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { creatorSubmissions, superadmins } from "../db/schema.js";
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
