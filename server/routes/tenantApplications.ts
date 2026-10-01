import { Router } from "express";
import { db } from "../db/client.js";
import { tenantApplications } from "../db/schema.js";
import { logEvent } from "../lib/platformEvents.js";
import { clientIp, makeRateLimiter } from "../lib/clientIp.js";

export const tenantApplicationsRouter = Router();

// Simple in-memory per-IP throttle (same pattern as the login lockouts in
// server/routes/superadmin.ts and server/routes/auth.ts) — this endpoint has
// no auth at all by design, so it needs SOME abuse guard against a script
// flooding the review queue with junk applications.
// Keyed on the real client IP (see lib/clientIp.ts) — behind the Cloudflare Tunnel req.ip is the same
// for everyone, which used to turn this into a single global limit that any five requests could exhaust.
const isRateLimited = makeRateLimiter(5, 60 * 60 * 1000);

// POST /api/tenant-applications — PUBLIC, no auth. This is what the future
// STUDIODO landing page's signup form will POST to; a superadmin reviews the
// submission from Admin Pusat → Aplikasi Tenant and either converts it into a
// real tenant or rejects it (see server/routes/superadmin.ts). Kept as a
// separate router (not nested under /api/superadmin) specifically so it's
// reachable without the superadmin auth gate that guards everything else there.
tenantApplicationsRouter.post("/", async (req, res) => {
  const ip = clientIp(req);
  if (isRateLimited(ip)) return res.status(429).json({ error: "Terlalu banyak pengajuan. Coba lagi nanti." });

  const businessName = String(req.body?.businessName ?? "").trim();
  const ownerName = String(req.body?.ownerName ?? "").trim();
  const ownerEmail = String(req.body?.ownerEmail ?? "").trim().toLowerCase();
  if (!businessName || !ownerName || !ownerEmail) {
    return res.status(400).json({ error: "Nama bisnis, nama pemilik, dan email wajib diisi" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    return res.status(400).json({ error: "Format email tidak valid" });
  }

  const optional = (key: string, maxLength = 500) => {
    const value = req.body?.[key];
    return value ? String(value).trim().slice(0, maxLength) || null : null;
  };

  const [row] = await db.insert(tenantApplications).values({
    businessName: businessName.slice(0, 200),
    ownerName: ownerName.slice(0, 200),
    ownerEmail,
    ownerWhatsapp: optional("ownerWhatsapp", 40),
    businessType: optional("businessType", 60),
    city: optional("city", 100),
    address: optional("address", 300),
    website: optional("website", 200),
    instagramHandle: optional("instagramHandle", 100),
    referralSource: optional("referralSource", 200),
    message: optional("message", 2000),
  }).returning({ id: tenantApplications.id });

  logEvent({
    category: "tenant",
    action: "application.submitted",
    message: `Aplikasi tenant baru masuk: "${businessName}" (${ownerEmail})`,
    actorType: "system",
  });

  res.status(201).json({ ok: true, id: row.id });
});
