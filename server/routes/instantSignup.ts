import crypto from "node:crypto";
import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { admins, packages, platformSettings, tenantApplications, tenants, tenantSettings } from "../db/schema.js";
import { hashPassword } from "../lib/passwordHash.js";
import { issueKioskKey } from "../lib/license.js";
import { clientIp, makeRateLimiter } from "../lib/clientIp.js";
import { deliver, verifyEmailMail, verifyLink } from "../lib/emails.js";
import { logEvent } from "../lib/platformEvents.js";
import { normalizeSignupMode, slugify, validateSignup } from "../lib/instantSignup.js";

// "Daftar langsung": when the platform owner switches sign-up to "instant" (Superadmin -> Pengaturan), a visitor who picks a plan gets a
// real tenant account, a trial booth key and a dashboard login right away, with no review queue. In "pengajuan" mode this route is closed
// and the website keeps sending visitors to POST /api/tenant-applications. Mounted under /api/public.

export const instantSignupRouter = Router();

const perIp = makeRateLimiter(5, 60 * 60_000);
const perEmail = makeRateLimiter(3, 24 * 60 * 60_000);

async function settings() {
  const [row] = await db.select({ mode: platformSettings.signupMode, trialDays: platformSettings.defaultTrialDays, wa: platformSettings.renewalWhatsapp }).from(platformSettings).limit(1);
  return { mode: normalizeSignupMode(row?.mode), trialDays: row?.trialDays && row.trialDays > 0 ? row.trialDays : 7, wa: row?.wa ?? null };
}

// GET /api/public/signup-config: what the website's "Daftar" page should show.
instantSignupRouter.get("/signup-config", async (_req, res) => {
  const s = await settings();
  res.setHeader("Cache-Control", "public, max-age=30");
  res.json({ mode: s.mode, trialDays: s.trialDays });
});

// POST /api/public/signup: create the account now. Public, so it is rate-limited per IP and per email, has a honeypot, and never reveals
// whether an email exists beyond the one message a real visitor needs ("sudah terdaftar").
instantSignupRouter.post("/signup", async (req, res) => {
  const s = await settings();
  if (s.mode !== "instant") return res.status(403).json({ error: "Pendaftaran langsung sedang tidak dibuka. Silakan kirim pengajuan.", code: "signup_closed" });

  // Honeypot: a field real visitors never see. Bots fill it; they get a success-looking answer and nothing is created.
  if (String(req.body?.company ?? "").trim()) return res.status(201).json({ ok: true });

  const ip = clientIp(req);
  if (perIp(ip)) return res.status(429).json({ error: "Terlalu banyak percobaan dari jaringan ini. Coba lagi nanti.", code: "rate_limited" });
  const input = validateSignup((req.body ?? {}) as Record<string, unknown>);
  if (!input.ok) return res.status(400).json({ error: input.error });
  const v = input.value;
  if (perEmail(v.email)) return res.status(429).json({ error: "Terlalu banyak percobaan dengan email ini. Coba lagi besok atau hubungi kami.", code: "rate_limited" });

  const [existing] = await db.select({ id: admins.id }).from(admins).where(sql`lower(${admins.email}) = ${v.email}`);
  if (existing) return res.status(409).json({ error: "Email ini sudah terdaftar. Silakan masuk, atau pakai \"Lupa password\" bila lupa.", code: "email_taken" });

  // A unique, readable slug: the name, plus a random suffix when taken.
  let slug = slugify(v.businessName);
  for (let i = 0; i < 6; i += 1) {
    const [clash] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug));
    if (!clash) break;
    slug = `${slugify(v.businessName).slice(0, 34)}-${crypto.randomBytes(2).toString("hex")}`;
  }

  const trialEnds = new Date(Date.now() + s.trialDays * 24 * 60 * 60 * 1000);
  let tenantId: string;
  try {
    tenantId = await db.transaction(async (tx) => {
      const [tenant] = await tx.insert(tenants).values({
        name: v.businessName, slug, subscriptionEndsAt: trialEnds, plan: "trial",
        ownerName: v.ownerName, ownerWhatsapp: v.whatsapp, businessType: v.businessType, city: v.city, referralSource: "Daftar langsung (website)",
      }).returning({ id: tenants.id });
      await tx.insert(admins).values({ tenantId: tenant.id, email: v.email, passwordHash: hashPassword(v.password) });
      await tx.insert(tenantSettings).values({ tenantId: tenant.id, brandName: v.businessName });
      await tx.insert(packages).values([
        { tenantId: tenant.id, name: "Basic Session", price: "50000", photoCount: 3, hasGif: false, hasVideo: false, extraPrints: [], active: true, sortOrder: 1 },
        { tenantId: tenant.id, name: "Premium Session", price: "85000", photoCount: 5, hasGif: true, hasVideo: false, extraPrints: [], active: true, sortOrder: 2 },
      ]);
      // The same lead record the review flow uses, already "converted", so the sales CRM still sees every sign-up and where it came from.
      await tx.insert(tenantApplications).values({
        businessName: v.businessName, ownerName: v.ownerName, ownerEmail: v.email, ownerWhatsapp: v.whatsapp, businessType: v.businessType, city: v.city,
        referralSource: "Daftar langsung (website)", leadSource: "website", status: "converted", pipelineStage: "active", convertedTenantId: tenant.id, reviewedBy: "auto (daftar langsung)", reviewedAt: new Date(),
        message: [v.plan ? `Paket diminati: ${v.plan}` : "", v.wantsToPay ? "Memilih langsung berlangganan" : "Memilih trial gratis"].filter(Boolean).join("\n"),
      });
      return tenant.id;
    });
  } catch (error) {
    // A parallel sign-up with the same email lost the race on the unique index.
    if (/unique|duplicate/i.test(String((error as Error)?.message ?? ""))) return res.status(409).json({ error: "Email ini sudah terdaftar. Silakan masuk.", code: "email_taken" });
    console.error("[signup] gagal membuat tenant", error);
    return res.status(500).json({ error: "Pendaftaran gagal diproses. Coba lagi sebentar lagi." });
  }

  // The first booth key (trial). A failure here must not undo the account: the key can be created later in the dashboard.
  try { await issueKioskKey(tenantId, { label: "Booth pertama", kind: "trial", days: s.trialDays }); } catch (error) { console.error("[signup] key trial gagal dibuat", error); }

  const [app] = await db.select({ id: tenantApplications.id }).from(tenantApplications).where(eq(tenantApplications.convertedTenantId, tenantId));
  if (app) void deliver(v.email, verifyEmailMail({ name: v.ownerName, url: verifyLink("tenant", app.id, v.email), what: "akun STUDIODO Anda" }), { tenantId, what: "verifikasi email pendaftaran langsung" });
  // Same alert action as a normal application, so the platform team still hears about every new sign-up (and can follow up by WhatsApp).
  logEvent({ tenantId, category: "tenant", action: "application.submitted", message: `Pendaftar baru (langsung aktif): "${v.businessName}" (${v.email})${v.plan ? `, minat paket ${v.plan}` : ""}`, actorType: "system" });

  res.status(201).json({ ok: true, trialDays: s.trialDays });
});
