import { Router, type Request } from "express";
import crypto from "node:crypto";
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { db } from "../db/client.js";
import { admins, kioskKeys, packages, platformEvents, platformSettings, plans, sessions, superadmins, tenantApplications, tenantPayments, tenants, tenantSettings, templates } from "../db/schema.js";
import { hashPassword, verifyPassword } from "../lib/passwordHash.js";
import { signSuperadminToken } from "../lib/jwt.js";
import { requireSuperadminAuth } from "../middleware/superadminAuth.js";
import { siteContentAdminRouter } from "./siteContent.js";
import { blogAdminRouter } from "./blog.js";
import { marketplaceAdminRouter } from "./marketplace.js";
import { creatorsAdminRouter } from "./creators.js";
import { siteAssetsAdminRouter } from "./siteAssets.js";
import { extendSubscription } from "../lib/subscription.js";
import { computeLocked } from "../lib/subscription.js";
import { logEvent } from "../lib/platformEvents.js";
import { syncTenantFeaturesToPlan } from "../lib/planFeatures.js";

export const superadminRouter = Router();

// Constant-cost dummy hash so a lookup for a non-existent email still pays the
// same scrypt cost as a real one (same reasoning as server/routes/auth.ts).
const DUMMY_PASSWORD_HASH = hashPassword(crypto.randomUUID());

// Separate brute-force guard from the tenant-admin login (server/routes/auth.ts) —
// these are two different identity realms and must not share any state.
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 5 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();

function isLockedOut(email: string): number {
  const entry = loginAttempts.get(email);
  if (!entry || entry.lockedUntil <= Date.now()) return 0;
  return entry.lockedUntil - Date.now();
}

function recordLoginFailure(email: string) {
  const entry = loginAttempts.get(email) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
    entry.count = 0;
  }
  loginAttempts.set(email, entry);
}

// POST /api/superadmin/login — { email, password } → superadmin login (separate realm from tenant admin)
superadminRouter.post("/login", async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  if (!email || !password) return res.status(400).json({ error: "Email dan password wajib diisi" });

  const lockedForMs = isLockedOut(email);
  if (lockedForMs > 0) {
    return res.status(429).json({ error: `Terlalu banyak percobaan gagal. Coba lagi dalam ${Math.ceil(lockedForMs / 60000)} menit.` });
  }

  const [superadmin] = await db.select().from(superadmins).where(eq(superadmins.email, email));
  const valid = verifyPassword(password, superadmin?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!superadmin || !valid) {
    recordLoginFailure(email);
    return res.status(401).json({ error: "Email atau password salah" });
  }
  loginAttempts.delete(email);

  const token = signSuperadminToken({ superadminId: superadmin.id });
  res.json({ token });
});

superadminRouter.post("/logout", requireSuperadminAuth, (_req, res) => {
  res.json({ ok: true });
});

superadminRouter.get("/me", requireSuperadminAuth, async (req, res) => {
  const [superadmin] = await db.select({ email: superadmins.email }).from(superadmins).where(eq(superadmins.id, req.superadminId!));
  res.json({ email: superadmin?.email });
});

superadminRouter.use(requireSuperadminAuth);
superadminRouter.use("/site-content", siteContentAdminRouter);
superadminRouter.use("/blog", blogAdminRouter);
superadminRouter.use("/marketplace", marketplaceAdminRouter);
superadminRouter.use("/creators", creatorsAdminRouter);
superadminRouter.use("/assets", siteAssetsAdminRouter);

// Snapshot label for platformEvents.actorLabel — resolved once per request
// rather than joined in SQL, since it's only needed for the handful of
// mutating routes that log an event.
async function currentSuperadminEmail(req: Request): Promise<string | null> {
  const [row] = await db.select({ email: superadmins.email }).from(superadmins).where(eq(superadmins.id, req.superadminId!));
  return row?.email ?? null;
}

// Same threshold as client/src/pages/KioskKeys.tsx's ONLINE_THRESHOLD_MS — "online"
// must mean the same thing here as it does on the tenant admin's own device table.
const ONLINE_THRESHOLD_MS = 10 * 60 * 1000;

// Cross-tenant by design (unlike every other route in this app, which is scoped to
// req.tenantId) — a superadmin is explicitly allowed to see every tenant at once.
// Aggregated in JS after one unscoped fetch per table, not SQL aggregate functions —
// simplest option while tenant/session counts are still small; revisit if this ever
// needs to scale past a few thousand sessions (see Fase 2b plan notes).
async function loadCrossTenantAggregates() {
  const [kioskRows, sessionRows] = await Promise.all([
    db.select({ tenantId: kioskKeys.tenantId, lastUsedAt: kioskKeys.lastUsedAt }).from(kioskKeys).where(isNull(kioskKeys.revokedAt)),
    db.select({ tenantId: sessions.tenantId, paymentStatus: sessions.paymentStatus, totalAmount: sessions.totalAmount }).from(sessions),
  ]);

  const now = Date.now();
  const kiosksByTenant = new Map<string, { total: number; online: number }>();
  for (const row of kioskRows) {
    const entry = kiosksByTenant.get(row.tenantId) ?? { total: 0, online: 0 };
    entry.total += 1;
    if (row.lastUsedAt && now - new Date(row.lastUsedAt).getTime() < ONLINE_THRESHOLD_MS) entry.online += 1;
    kiosksByTenant.set(row.tenantId, entry);
  }

  const sessionsByTenant = new Map<string, { total: number; paid: number; revenue: number }>();
  for (const row of sessionRows) {
    const entry = sessionsByTenant.get(row.tenantId) ?? { total: 0, paid: 0, revenue: 0 };
    entry.total += 1;
    if (row.paymentStatus === "success") {
      entry.paid += 1;
      entry.revenue += Number(row.totalAmount ?? 0);
    }
    sessionsByTenant.set(row.tenantId, entry);
  }

  return { kiosksByTenant, sessionsByTenant };
}

// GET /api/superadmin/tenants — every tenant on the platform, with primary admin
// email + kiosk/session/revenue counts so progress is visible at a glance.
superadminRouter.get("/tenants", async (_req, res) => {
  const rows = await db.select({
    id: tenants.id,
    name: tenants.name,
    slug: tenants.slug,
    plan: tenants.plan,
    status: tenants.status,
    subscriptionEndsAt: tenants.subscriptionEndsAt,
    createdAt: tenants.createdAt,
  }).from(tenants).orderBy(tenants.createdAt);

  const adminRows = await db.select({ tenantId: admins.tenantId, email: admins.email }).from(admins);
  const firstAdminByTenant = new Map<string, string>();
  for (const admin of adminRows) {
    if (!firstAdminByTenant.has(admin.tenantId)) firstAdminByTenant.set(admin.tenantId, admin.email);
  }

  const { kiosksByTenant, sessionsByTenant } = await loadCrossTenantAggregates();
  const { gracePeriodDays } = await getOrCreatePlatformSettings();
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  res.json(rows.map((tenant) => {
    const kiosk = kiosksByTenant.get(tenant.id) ?? { total: 0, online: 0 };
    const session = sessionsByTenant.get(tenant.id) ?? { total: 0, paid: 0, revenue: 0 };
    const endsAt = tenant.subscriptionEndsAt ? new Date(tenant.subscriptionEndsAt).getTime() : null;
    return {
      ...tenant,
      adminEmail: firstAdminByTenant.get(tenant.id) ?? null,
      kioskCount: kiosk.total,
      onlineKioskCount: kiosk.online,
      sessionCount: session.total,
      revenue: session.revenue,
      locked: computeLocked(tenant.status, tenant.subscriptionEndsAt, gracePeriodDays),
      // A simple, cheap "at risk" signal for the tenants table — subscription
      // due within a week (and not already expired/locked, which has its own
      // more urgent treatment) — not a churn model, just a glance-able flag.
      expiringSoon: endsAt !== null && endsAt > now && endsAt - now <= sevenDaysMs,
    };
  }));
});

// GET /api/superadmin/overview — platform-wide stat cards for the superadmin dashboard.
superadminRouter.get("/overview", async (_req, res) => {
  const rows = await db.select({ status: tenants.status, subscriptionEndsAt: tenants.subscriptionEndsAt }).from(tenants);
  const { gracePeriodDays } = await getOrCreatePlatformSettings();
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  const byStatus: Record<string, number> = {};
  let expiringSoon = 0;
  let expired = 0;
  let locked = 0;
  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    if (row.subscriptionEndsAt) {
      const endsAt = new Date(row.subscriptionEndsAt).getTime();
      if (endsAt < now) expired += 1;
      else if (endsAt - now <= sevenDaysMs) expiringSoon += 1;
    }
    if (computeLocked(row.status, row.subscriptionEndsAt, gracePeriodDays)) locked += 1;
  }

  const { kiosksByTenant, sessionsByTenant } = await loadCrossTenantAggregates();
  const kiosks = [...kiosksByTenant.values()].reduce((sum, k) => ({ total: sum.total + k.total, online: sum.online + k.online }), { total: 0, online: 0 });
  const sessionsTotal = [...sessionsByTenant.values()].reduce(
    (sum, s) => ({ total: sum.total + s.total, paid: sum.paid + s.paid, revenue: sum.revenue + s.revenue }),
    { total: 0, paid: 0, revenue: 0 },
  );

  res.json({
    tenants: { total: rows.length, byStatus, expiringSoon, expired, locked },
    kiosks,
    sessions: sessionsTotal,
  });
});

// GET /api/superadmin/overview/timeseries?days=30 — daily session count + revenue
// across every tenant, for the trend chart on the dashboard. Bucketed in JS (not
// SQL date_trunc) for the same reason as loadCrossTenantAggregates above — fine
// while session volume is still small.
superadminRouter.get("/overview/timeseries", async (req, res) => {
  const days = Math.max(1, Math.min(180, Number(req.query.days) || 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await db.select({
    createdAt: sessions.createdAt,
    paymentStatus: sessions.paymentStatus,
    totalAmount: sessions.totalAmount,
  }).from(sessions);

  const bucket = new Map<string, { sessions: number; revenue: number }>();
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  for (let i = 0; i < days; i += 1) {
    const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
    bucket.set(dayKey(d), { sessions: 0, revenue: 0 });
  }

  for (const row of rows) {
    const created = new Date(row.createdAt);
    if (created < since) continue;
    const key = dayKey(created);
    const entry = bucket.get(key);
    if (!entry) continue;
    entry.sessions += 1;
    if (row.paymentStatus === "success") entry.revenue += Number(row.totalAmount ?? 0);
  }

  res.json([...bucket.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, ...value })));
});

// PATCH /api/superadmin/tenants/:id — manual override of plan/status/subscriptionEndsAt,
// and editable business profile fields (see tenants schema comment).
const TENANT_PROFILE_FIELDS = ["ownerName", "ownerWhatsapp", "businessType", "city", "address", "website", "instagramHandle", "referralSource", "internalNotes"] as const;
superadminRouter.patch("/tenants/:id", async (req, res) => {
  const patch: Record<string, unknown> = {};
  if (req.body?.plan !== undefined) patch.plan = String(req.body.plan);
  if (req.body?.status !== undefined) patch.status = String(req.body.status);
  for (const field of TENANT_PROFILE_FIELDS) {
    if (req.body?.[field] !== undefined) patch[field] = req.body[field] ? String(req.body[field]).trim() : null;
  }
  if (req.body?.subscriptionEndsAt !== undefined) {
    patch.subscriptionEndsAt = req.body.subscriptionEndsAt ? new Date(req.body.subscriptionEndsAt) : null;
  }
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: "Tidak ada perubahan dikirim" });

  const [row] = await db.update(tenants).set(patch).where(eq(tenants.id, req.params.id)).returning();
  if (!row) return res.status(404).json({ error: "Tenant tidak ditemukan" });
  logEvent({
    tenantId: row.id,
    category: "tenant",
    action: "tenant.updated",
    message: `Tenant "${row.name}" diubah manual: ${Object.keys(patch).join(", ")}`,
    actorType: "superadmin",
    actorLabel: await currentSuperadminEmail(req),
    metadata: patch,
  });
  // Plan changed here (not just status/profile) — bring existing tenant data
  // into line with whatever the new plan no longer includes.
  if (patch.plan !== undefined) await syncTenantFeaturesToPlan(row.id);
  res.json(row);
});

// POST /api/superadmin/tenants/:id/extend — { days } — quick nudge with no
// billing record (e.g. a goodwill trial extension). For an actual payment, use
// POST /tenants/:id/payments instead, which extends AND keeps an audit trail.
superadminRouter.post("/tenants/:id/extend", async (req, res) => {
  const days = Number(req.body?.days);
  if (!Number.isFinite(days) || days <= 0) return res.status(400).json({ error: "Jumlah hari tidak valid" });

  const row = await extendSubscription(req.params.id, days);
  if (!row) return res.status(404).json({ error: "Tenant tidak ditemukan" });
  logEvent({
    tenantId: row.id,
    category: "billing",
    action: "subscription.extended",
    message: `Langganan "${row.name}" diperpanjang ${days} hari (tanpa catatan pembayaran)`,
    actorType: "superadmin",
    actorLabel: await currentSuperadminEmail(req),
    metadata: { days },
  });
  res.json(row);
});

// GET /api/superadmin/tenants/:id — single tenant detail: profile, kiosk keys,
// tenant admins, and payment history. Powers the detail drawer in the dashboard.
superadminRouter.get("/tenants/:id", async (req, res) => {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, req.params.id));
  if (!tenant) return res.status(404).json({ error: "Tenant tidak ditemukan" });

  const [tenantAdmins, keys, payments, recentEvents, { gracePeriodDays }] = await Promise.all([
    db.select({ id: admins.id, email: admins.email, createdAt: admins.createdAt }).from(admins).where(eq(admins.tenantId, tenant.id)),
    // lastDiagnostics/appVersion were already collected by the kiosk heartbeat
    // (POST /api/kiosk-keys/heartbeat) but never surfaced here — a superadmin
    // previously had no way to see a tenant's fleet camera/printer/network
    // health short of asking the tenant admin to check their own Kiosk page.
    db.select({ id: kioskKeys.id, label: kioskKeys.label, createdAt: kioskKeys.createdAt, lastUsedAt: kioskKeys.lastUsedAt, revokedAt: kioskKeys.revokedAt, boundDeviceId: kioskKeys.boundDeviceId, boundAt: kioskKeys.boundAt, appVersion: kioskKeys.appVersion, lastDiagnostics: kioskKeys.lastDiagnostics }).from(kioskKeys).where(eq(kioskKeys.tenantId, tenant.id)),
    db.select().from(tenantPayments).where(eq(tenantPayments.tenantId, tenant.id)).orderBy(desc(tenantPayments.createdAt)),
    db.select().from(platformEvents).where(eq(platformEvents.tenantId, tenant.id)).orderBy(desc(platformEvents.createdAt)).limit(20),
    getOrCreatePlatformSettings(),
  ]);

  res.json({
    ...tenant,
    locked: computeLocked(tenant.status, tenant.subscriptionEndsAt, gracePeriodDays),
    admins: tenantAdmins,
    kioskKeys: keys,
    payments,
    recentEvents,
  });
});

// POST /api/superadmin/tenants — onboard a new tenant from the dashboard
// (mirrors server/scripts/createTenant.ts, previously the only way to do this).
// Returns the raw kiosk API key once, same as the CLI — it's only ever stored hashed.
superadminRouter.post("/tenants", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const slug = String(req.body?.slug ?? "").trim().toLowerCase();
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  const planSlug = req.body?.plan ? String(req.body.plan) : null;
  // Business/registration profile — all optional today (filled in by whoever
  // runs the onboarding form), and exactly what a future public landing-page
  // signup would also send.
  const profile = {
    ownerName: req.body?.ownerName ? String(req.body.ownerName).trim() : null,
    ownerWhatsapp: req.body?.ownerWhatsapp ? String(req.body.ownerWhatsapp).trim() : null,
    businessType: req.body?.businessType ? String(req.body.businessType).trim() : null,
    city: req.body?.city ? String(req.body.city).trim() : null,
    address: req.body?.address ? String(req.body.address).trim() : null,
    website: req.body?.website ? String(req.body.website).trim() : null,
    instagramHandle: req.body?.instagramHandle ? String(req.body.instagramHandle).trim() : null,
    referralSource: req.body?.referralSource ? String(req.body.referralSource).trim() : null,
    internalNotes: req.body?.internalNotes ? String(req.body.internalNotes).trim() : null,
  };

  if (!name || !slug || !email || password.length < 6) {
    return res.status(400).json({ error: "Nama, slug, email wajib diisi, password minimal 6 karakter" });
  }
  if (!/^[a-z0-9-]+$/.test(slug)) return res.status(400).json({ error: "Slug hanya boleh huruf kecil, angka, dan tanda hubung" });

  const [existingSlug] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug));
  if (existingSlug) return res.status(409).json({ error: "Slug sudah dipakai tenant lain" });
  const [existingEmail] = await db.select({ id: admins.id }).from(admins).where(eq(admins.email, email));
  if (existingEmail) return res.status(409).json({ error: "Email admin sudah dipakai" });

  const { defaultTrialDays } = await getOrCreatePlatformSettings();
  const subscriptionEndsAt = new Date(Date.now() + defaultTrialDays * 24 * 60 * 60 * 1000);

  const [tenant] = await db.insert(tenants).values({ name, slug, subscriptionEndsAt, plan: planSlug ?? "trial", ...profile }).returning();
  await db.insert(admins).values({ tenantId: tenant.id, email, passwordHash: hashPassword(password) });
  await db.insert(tenantSettings).values({ tenantId: tenant.id, brandName: name });
  await db.insert(packages).values([
    { tenantId: tenant.id, name: "Basic Session", price: "50000", photoCount: 3, hasGif: false, hasVideo: false, extraPrints: [], active: true, sortOrder: 1 },
    { tenantId: tenant.id, name: "Premium Session", price: "85000", photoCount: 5, hasGif: true, hasVideo: false, extraPrints: [], active: true, sortOrder: 2 },
  ]);
  await db.insert(templates).values([{
    tenantId: tenant.id,
    name: "Classic Portrait",
    frameImageUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1800" viewBox="0 0 1200 1800"><rect width="1200" height="1800" fill="#f5f1e8"/><rect x="120" y="120" width="960" height="1560" rx="28" fill="#f8f5f0" stroke="#3a2d2d" stroke-width="10"/><rect x="220" y="260" width="760" height="480" rx="20" fill="#e9e2d7" stroke="#3a2d2d" stroke-width="6"/><rect x="220" y="1060" width="760" height="340" rx="20" fill="#f4ede5" stroke="#3a2d2d" stroke-width="6"/><path d="M220 760H980" stroke="#3a2d2d" stroke-width="8"/><path d="M600 260V740" stroke="#3a2d2d" stroke-width="8"/></svg>')}`,
    slots: [{ x: 0.18, y: 0.22, w: 0.28, h: 0.32 }, { x: 0.54, y: 0.22, w: 0.28, h: 0.32 }, { x: 0.18, y: 0.58, w: 0.28, h: 0.32 }],
    canvasWidth: 1200,
    canvasHeight: 1800,
    orientation: "portrait",
    category: "custom",
    style: "Classic",
    outputPreset: "4r",
  }]);

  const rawKioskKey = crypto.randomBytes(32).toString("hex");
  const keyHash = crypto.createHash("sha256").update(rawKioskKey).digest("hex");
  await db.insert(kioskKeys).values({ tenantId: tenant.id, label: "Default kiosk", keyHash, rawKey: rawKioskKey });

  logEvent({
    tenantId: tenant.id,
    category: "tenant",
    action: "tenant.created",
    message: `Tenant baru "${tenant.name}" dibuat (admin: ${email})`,
    actorType: "superadmin",
    actorLabel: await currentSuperadminEmail(req),
  });

  res.status(201).json({ tenant, adminEmail: email, kioskKey: rawKioskKey, trialDays: defaultTrialDays });
});

// --- Tenant applications (inbound leads) --------------------------------

// GET /api/superadmin/tenant-applications?status=pending — review queue for
// leads submitted through POST /api/tenant-applications (public, see
// server/routes/tenantApplications.ts). Defaults to pending only so the
// queue doesn't fill up with already-handled ones.
superadminRouter.get("/tenant-applications", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : "pending";
  const rows = status === "all"
    ? await db.select().from(tenantApplications).orderBy(desc(tenantApplications.createdAt))
    : await db.select().from(tenantApplications).where(eq(tenantApplications.status, status)).orderBy(desc(tenantApplications.createdAt));
  res.json(rows);
});

// POST /api/superadmin/tenant-applications/:id/reject
superadminRouter.post("/tenant-applications/:id/reject", async (req, res) => {
  const note = req.body?.note ? String(req.body.note).trim() : null;
  const actorLabel = await currentSuperadminEmail(req);
  const [row] = await db.update(tenantApplications)
    .set({ status: "rejected", reviewedBy: actorLabel, reviewedAt: new Date(), reviewNote: note })
    .where(and(eq(tenantApplications.id, req.params.id), eq(tenantApplications.status, "pending")))
    .returning();
  if (!row) return res.status(404).json({ error: "Aplikasi tidak ditemukan atau sudah diproses" });
  logEvent({ category: "tenant", action: "application.rejected", message: `Aplikasi tenant "${row.businessName}" ditolak`, actorType: "superadmin", actorLabel });
  res.json(row);
});

// POST /api/superadmin/tenant-applications/:id/convert — turns a lead straight
// into a real tenant (same creation path as POST /tenants) so a superadmin
// doesn't have to re-type everything the applicant already submitted; only
// the login password still needs deciding here, since the form never collects one.
superadminRouter.post("/tenant-applications/:id/convert", async (req, res) => {
  const [application] = await db.select().from(tenantApplications).where(eq(tenantApplications.id, req.params.id));
  if (!application) return res.status(404).json({ error: "Aplikasi tidak ditemukan" });
  if (application.status !== "pending") return res.status(409).json({ error: "Aplikasi sudah diproses" });

  const slug = String(req.body?.slug ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) return res.status(400).json({ error: "Slug wajib diisi, huruf kecil/angka/tanda hubung saja" });
  if (password.length < 6) return res.status(400).json({ error: "Password minimal 6 karakter" });

  const [existingSlug] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug));
  if (existingSlug) return res.status(409).json({ error: "Slug sudah dipakai tenant lain" });
  const [existingEmail] = await db.select({ id: admins.id }).from(admins).where(eq(admins.email, application.ownerEmail));
  if (existingEmail) return res.status(409).json({ error: "Email pemilik sudah dipakai sebagai admin tenant lain" });

  const { defaultTrialDays } = await getOrCreatePlatformSettings();
  const subscriptionEndsAt = new Date(Date.now() + defaultTrialDays * 24 * 60 * 60 * 1000);

  const [tenant] = await db.insert(tenants).values({
    name: application.businessName,
    slug,
    subscriptionEndsAt,
    plan: "trial",
    ownerName: application.ownerName,
    ownerWhatsapp: application.ownerWhatsapp,
    businessType: application.businessType,
    city: application.city,
    address: application.address,
    website: application.website,
    instagramHandle: application.instagramHandle,
    referralSource: application.referralSource,
  }).returning();
  await db.insert(admins).values({ tenantId: tenant.id, email: application.ownerEmail, passwordHash: hashPassword(password) });
  await db.insert(tenantSettings).values({ tenantId: tenant.id, brandName: application.businessName });
  await db.insert(packages).values([
    { tenantId: tenant.id, name: "Basic Session", price: "50000", photoCount: 3, hasGif: false, hasVideo: false, extraPrints: [], active: true, sortOrder: 1 },
    { tenantId: tenant.id, name: "Premium Session", price: "85000", photoCount: 5, hasGif: true, hasVideo: false, extraPrints: [], active: true, sortOrder: 2 },
  ]);

  const rawKioskKey = crypto.randomBytes(32).toString("hex");
  const keyHash = crypto.createHash("sha256").update(rawKioskKey).digest("hex");
  await db.insert(kioskKeys).values({ tenantId: tenant.id, label: "Default kiosk", keyHash, rawKey: rawKioskKey });

  const actorLabel = await currentSuperadminEmail(req);
  await db.update(tenantApplications)
    .set({ status: "converted", convertedTenantId: tenant.id, reviewedBy: actorLabel, reviewedAt: new Date() })
    .where(eq(tenantApplications.id, application.id));

  logEvent({
    tenantId: tenant.id,
    category: "tenant",
    action: "application.converted",
    message: `Aplikasi "${application.businessName}" diterima dan dijadikan tenant`,
    actorType: "superadmin",
    actorLabel,
  });

  res.status(201).json({ tenant, adminEmail: application.ownerEmail, kioskKey: rawKioskKey, trialDays: defaultTrialDays });
});

// --- Activity & error log -------------------------------------------------

// GET /api/superadmin/events?level=&category=&tenantId=&before=&limit= — the
// combined activity/error timeline. Cursor-paginated on createdAt (not
// offset) so "load more" stays correct even as new events keep arriving.
superadminRouter.get("/events", async (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
  const conditions = [];
  if (req.query.level && req.query.level !== "all") conditions.push(eq(platformEvents.level, String(req.query.level)));
  if (req.query.category && req.query.category !== "all") conditions.push(eq(platformEvents.category, String(req.query.category)));
  if (req.query.tenantId) conditions.push(eq(platformEvents.tenantId, String(req.query.tenantId)));
  if (req.query.before) conditions.push(lt(platformEvents.createdAt, new Date(String(req.query.before))));

  const rows = await db.select({
    id: platformEvents.id,
    tenantId: platformEvents.tenantId,
    tenantName: tenants.name,
    level: platformEvents.level,
    category: platformEvents.category,
    action: platformEvents.action,
    message: platformEvents.message,
    actorType: platformEvents.actorType,
    actorLabel: platformEvents.actorLabel,
    metadata: platformEvents.metadata,
    createdAt: platformEvents.createdAt,
  })
    .from(platformEvents)
    .leftJoin(tenants, eq(platformEvents.tenantId, tenants.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(platformEvents.createdAt))
    .limit(limit);
  res.json(rows);
});

// GET /api/superadmin/fleet-alerts — every currently-online-key that's gone
// quiet longer than ONLINE_THRESHOLD_MS, across ALL tenants at once. Uses
// data the kiosk heartbeat has always collected (lastUsedAt, lastDiagnostics)
// but that, before this, only ever showed up one tenant at a time on that
// tenant's own Kiosk page — nothing gave a superadmin the platform-wide
// "which booths are down right now" view a fleet operator actually needs.
superadminRouter.get("/fleet-alerts", async (_req, res) => {
  const rows = await db.select({
    id: kioskKeys.id,
    tenantId: kioskKeys.tenantId,
    tenantName: tenants.name,
    label: kioskKeys.label,
    lastUsedAt: kioskKeys.lastUsedAt,
    lastDiagnostics: kioskKeys.lastDiagnostics,
    boundDeviceId: kioskKeys.boundDeviceId,
  })
    .from(kioskKeys)
    .innerJoin(tenants, eq(kioskKeys.tenantId, tenants.id))
    .where(and(isNull(kioskKeys.revokedAt), eq(tenants.status, "active")));

  const now = Date.now();
  const offline = rows
    .filter((row) => row.boundDeviceId && (!row.lastUsedAt || now - new Date(row.lastUsedAt).getTime() >= ONLINE_THRESHOLD_MS))
    .sort((a, b) => (a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0) - (b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0));
  const diagnosticIssues = rows.filter((row) => {
    const d = row.lastDiagnostics as { cameraOk?: boolean; printerOk?: boolean; networkOk?: boolean } | null;
    return d && (d.cameraOk === false || d.printerOk === false || d.networkOk === false);
  });

  res.json({ offline, diagnosticIssues });
});

// GET /api/superadmin/tenants/:id/payments
superadminRouter.get("/tenants/:id/payments", async (req, res) => {
  const rows = await db.select().from(tenantPayments).where(eq(tenantPayments.tenantId, req.params.id)).orderBy(desc(tenantPayments.createdAt));
  res.json(rows);
});

// POST /api/superadmin/tenants/:id/payments — record a manual payment: logs the
// transaction AND extends the subscription in one step, so "Catat pembayaran" is
// the one action a superadmin needs instead of separately editing the date.
superadminRouter.post("/tenants/:id/payments", async (req, res) => {
  const tenantId = req.params.id;
  const amount = Number(req.body?.amount);
  const periodDays = Number(req.body?.periodDays);
  const method = String(req.body?.method ?? "manual");
  const note = req.body?.note ? String(req.body.note).trim() : null;
  const planId = req.body?.planId ? String(req.body.planId) : null;

  if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: "Nominal tidak valid" });
  if (!Number.isFinite(periodDays) || periodDays <= 0) return res.status(400).json({ error: "Periode (hari) tidak valid" });

  let planName: string | null = null;
  if (planId) {
    const [plan] = await db.select({ name: plans.name, slug: plans.slug }).from(plans).where(eq(plans.id, planId));
    if (plan) {
      planName = plan.name;
      await db.update(tenants).set({ plan: plan.slug }).where(eq(tenants.id, tenantId));
      await syncTenantFeaturesToPlan(tenantId);
    }
  }

  const [superadmin] = await db.select({ email: superadmins.email }).from(superadmins).where(eq(superadmins.id, req.superadminId!));

  const tenant = await extendSubscription(tenantId, periodDays);
  if (!tenant) return res.status(404).json({ error: "Tenant tidak ditemukan" });

  const [payment] = await db.insert(tenantPayments).values({
    tenantId,
    planId,
    planName,
    amount: String(amount),
    method,
    periodDays,
    note,
    recordedBy: superadmin?.email ?? null,
  }).returning();

  logEvent({
    tenantId,
    category: "billing",
    action: "payment.recorded",
    message: `Pembayaran Rp ${amount.toLocaleString("id-ID")} dicatat untuk "${tenant.name}" (${periodDays} hari${planName ? `, plan ${planName}` : ""})`,
    actorType: "superadmin",
    actorLabel: superadmin?.email ?? null,
    metadata: { amount, periodDays, method, planName },
  });

  res.status(201).json({ tenant, payment });
});

// --- Plans -------------------------------------------------------------

// GET /api/superadmin/plans — every plan (active and inactive, for management).
superadminRouter.get("/plans", async (_req, res) => {
  const rows = await db.select().from(plans).orderBy(plans.sortOrder);
  res.json(rows);
});

superadminRouter.post("/plans", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const slug = String(req.body?.slug ?? "").trim().toLowerCase();
  const price = Number(req.body?.price ?? 0);
  const billingInterval = req.body?.billingInterval === "yearly" ? "yearly" : "monthly";
  const kioskLimit = req.body?.kioskLimit === "" || req.body?.kioskLimit == null ? null : Number(req.body.kioskLimit);
  const screenBuilderEnabled = req.body?.screenBuilderEnabled === undefined ? true : Boolean(req.body.screenBuilderEnabled);
  const gifVideoEnabled = req.body?.gifVideoEnabled === undefined ? true : Boolean(req.body.gifVideoEnabled);
  const description = req.body?.description ? String(req.body.description).trim() : null;
  const sortOrder = Number(req.body?.sortOrder ?? 0);

  if (!name || !slug) return res.status(400).json({ error: "Nama dan slug wajib diisi" });
  if (!/^[a-z0-9-]+$/.test(slug)) return res.status(400).json({ error: "Slug hanya boleh huruf kecil, angka, dan tanda hubung" });
  if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: "Harga tidak valid" });

  const [existing] = await db.select({ id: plans.id }).from(plans).where(eq(plans.slug, slug));
  if (existing) return res.status(409).json({ error: "Slug plan sudah dipakai" });

  const [row] = await db.insert(plans).values({
    name, slug, price: String(price), billingInterval,
    kioskLimit: kioskLimit === null || Number.isNaN(kioskLimit) ? null : kioskLimit,
    screenBuilderEnabled, gifVideoEnabled,
    description, sortOrder, active: true,
  }).returning();
  logEvent({ category: "billing", action: "plan.created", message: `Plan "${row.name}" dibuat`, actorType: "superadmin", actorLabel: await currentSuperadminEmail(req) });
  res.status(201).json(row);
});

superadminRouter.patch("/plans/:id", async (req, res) => {
  const patch: Record<string, unknown> = {};
  if (req.body?.name !== undefined) patch.name = String(req.body.name).trim();
  if (req.body?.price !== undefined) {
    const price = Number(req.body.price);
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: "Harga tidak valid" });
    patch.price = String(price);
  }
  if (req.body?.billingInterval !== undefined) patch.billingInterval = req.body.billingInterval === "yearly" ? "yearly" : "monthly";
  if (req.body?.kioskLimit !== undefined) {
    patch.kioskLimit = req.body.kioskLimit === "" || req.body.kioskLimit == null ? null : Number(req.body.kioskLimit);
  }
  if (req.body?.screenBuilderEnabled !== undefined) patch.screenBuilderEnabled = Boolean(req.body.screenBuilderEnabled);
  if (req.body?.gifVideoEnabled !== undefined) patch.gifVideoEnabled = Boolean(req.body.gifVideoEnabled);
  if (req.body?.description !== undefined) patch.description = req.body.description ? String(req.body.description).trim() : null;
  if (req.body?.sortOrder !== undefined) patch.sortOrder = Number(req.body.sortOrder) || 0;
  if (req.body?.active !== undefined) patch.active = Boolean(req.body.active);
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: "Tidak ada perubahan dikirim" });

  const [row] = await db.update(plans).set(patch).where(eq(plans.id, req.params.id)).returning();
  if (!row) return res.status(404).json({ error: "Plan tidak ditemukan" });
  logEvent({ category: "billing", action: "plan.updated", message: `Plan "${row.name}" diubah`, actorType: "superadmin", actorLabel: await currentSuperadminEmail(req), metadata: patch });

  // A plan's own features changed (not a tenant being moved between plans) —
  // cascade the sync to every tenant currently on this plan, so tightening a
  // plan takes effect immediately instead of only on the next reassignment.
  if (patch.screenBuilderEnabled !== undefined || patch.gifVideoEnabled !== undefined) {
    const affectedTenants = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.plan, row.slug));
    await Promise.all(affectedTenants.map((t) => syncTenantFeaturesToPlan(t.id)));
  }

  res.json(row);
});

// DELETE /api/superadmin/plans/:id — hard-delete only if no tenant is currently
// on it (by slug — tenants.plan isn't a FK); otherwise deactivate so it drops out
// of the "assign a plan" picker without breaking tenants already on it.
superadminRouter.delete("/plans/:id", async (req, res) => {
  const [plan] = await db.select({ id: plans.id, slug: plans.slug }).from(plans).where(eq(plans.id, req.params.id));
  if (!plan) return res.status(404).json({ error: "Plan tidak ditemukan" });

  const [inUse] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.plan, plan.slug)).limit(1);
  const actorLabel = await currentSuperadminEmail(req);
  if (inUse) {
    const [row] = await db.update(plans).set({ active: false }).where(eq(plans.id, plan.id)).returning();
    logEvent({ category: "billing", action: "plan.deactivated", message: `Plan "${row.name}" dinonaktifkan (masih dipakai tenant)`, actorType: "superadmin", actorLabel });
    return res.json({ ok: true, deactivated: true, plan: row });
  }

  await db.delete(plans).where(eq(plans.id, plan.id));
  logEvent({ category: "billing", action: "plan.deleted", message: `Plan "${plan.slug}" dihapus`, actorType: "superadmin", actorLabel });
  res.json({ ok: true, deleted: true });
});

async function getOrCreatePlatformSettings() {
  const [existing] = await db.select().from(platformSettings).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(platformSettings).values({}).returning();
  return created;
}

// GET /api/superadmin/settings — platform-wide defaults (trial length, renewal links)
superadminRouter.get("/settings", async (_req, res) => {
  res.json(await getOrCreatePlatformSettings());
});

// PATCH /api/superadmin/settings
superadminRouter.patch("/settings", async (req, res) => {
  const current = await getOrCreatePlatformSettings();
  const patch: Record<string, unknown> = {};
  if (req.body?.defaultTrialDays !== undefined) {
    const days = Number(req.body.defaultTrialDays);
    if (!Number.isFinite(days) || days < 0) return res.status(400).json({ error: "defaultTrialDays tidak valid" });
    patch.defaultTrialDays = days;
  }
  if (req.body?.renewalWhatsapp !== undefined) patch.renewalWhatsapp = String(req.body.renewalWhatsapp).trim() || null;
  if (req.body?.renewalCheckoutUrl !== undefined) patch.renewalCheckoutUrl = String(req.body.renewalCheckoutUrl).trim() || null;
  if (req.body?.gracePeriodDays !== undefined) {
    const days = Number(req.body.gracePeriodDays);
    if (!Number.isFinite(days) || days < 0) return res.status(400).json({ error: "gracePeriodDays tidak valid" });
    patch.gracePeriodDays = days;
  }
  patch.updatedAt = new Date();

  const [row] = await db.update(platformSettings).set(patch).where(eq(platformSettings.id, current.id)).returning();
  res.json(row);
});
