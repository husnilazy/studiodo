import { Router, type Request } from "express";
import crypto from "node:crypto";
import { and, desc, eq, gte, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { admins, billingOrders, kioskKeys, packages, platformEvents, platformSettings, plans, sessions, superadmins, tenantApplications, tenantPayments, tenants, tenantSettings, templates, withdrawals } from "../db/schema.js";
import { computeQrisBalance } from "../lib/qrisBalance.js";
import { hashPassword, verifyPassword } from "../lib/passwordHash.js";
import { signSuperadminToken } from "../lib/jwt.js";
import { requireSuperadminAuth } from "../middleware/superadminAuth.js";
import { siteContentAdminRouter } from "./siteContent.js";
import { blogAdminRouter } from "./blog.js";
import { marketplaceAdminRouter } from "./marketplace.js";
import { creatorsAdminRouter } from "./creators.js";
import { siteAssetsAdminRouter } from "./siteAssets.js";
import { paymentGatewaysAdminRouter } from "./paymentGateways.js";
import { reconcileOrder } from "../lib/billing.js";
import { licensesAdminRouter } from "./licenses.js";
import { notificationsAdminRouter } from "./notifications.js";
import { clearLicenseCache, computeKeyLock, extendKeys, getGracePeriodDays, issueKioskKey, resetGraceCache, summarizeLicenses, syncTenantEndsAt } from "../lib/license.js";
import { sanitizeVolumeTiers } from "../lib/boothPricing.js";
import { logEvent } from "../lib/platformEvents.js";
import { createLoginGuard, minutesLabel } from "../lib/loginGuard.js";
import { clientIp } from "../lib/clientIp.js";
import { LOCKOUT_ACTION } from "../lib/securityAlerts.js";
import { deliver, resetLink, SETUP_TTL_MS, welcomeTenantMail } from "../lib/emails.js";
import { syncTenantFeaturesToPlan } from "../lib/planFeatures.js";

export const superadminRouter = Router();

// Constant-cost dummy hash so a lookup for a non-existent email still pays the
// same scrypt cost as a real one (same reasoning as server/routes/auth.ts).
const DUMMY_PASSWORD_HASH = hashPassword(crypto.randomUUID());

// Separate brute-force guard from the tenant-admin login (server/routes/auth.ts) —
// these are two different identity realms and must not share any state.
const loginGuard = createLoginGuard({ maxFailures: 5 });
const loginIpGuard = createLoginGuard({ maxFailures: 20 });

// POST /api/superadmin/login — { email, password } → superadmin login (separate realm from tenant admin)
superadminRouter.post("/login", async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  if (!email || !password) return res.status(400).json({ error: "Email dan password wajib diisi" });

  const ip = clientIp(req);
  const lockedForMs = Math.max(loginGuard.lockedFor(email), loginIpGuard.lockedFor(ip));
  if (lockedForMs > 0) {
    return res.status(429).json({ error: `Terlalu banyak percobaan gagal. Coba lagi dalam ${minutesLabel(lockedForMs)}.`, retryAfterSeconds: Math.ceil(lockedForMs / 1000) });
  }

  const [superadmin] = await db.select().from(superadmins).where(eq(superadmins.email, email));
  const valid = verifyPassword(password, superadmin?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!superadmin || !valid) {
    const lock = loginGuard.fail(email);
    const ipLock = loginIpGuard.fail(ip);
    if (lock || ipLock) logEvent({ level: "error", category: "auth", action: "superadmin.login.lockout", message: `Login Admin Pusat dikunci ${Math.round((lock ?? ipLock)!.lockMs / 60000)} menit setelah percobaan gagal beruntun (email: ${email}, IP: ${ip})`, actorType: "system", actorLabel: email, metadata: { email, ip } });
    return res.status(401).json({ error: "Email atau password salah" });
  }
  loginGuard.succeed(email);

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
superadminRouter.use("/payment-gateways", paymentGatewaysAdminRouter);
superadminRouter.use("/licenses", licensesAdminRouter);
superadminRouter.use("/notifications", notificationsAdminRouter);

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
    db.select({ tenantId: kioskKeys.tenantId, lastUsedAt: kioskKeys.lastUsedAt, licenseType: kioskKeys.licenseType, licenseEndsAt: kioskKeys.licenseEndsAt, revokedAt: kioskKeys.revokedAt }).from(kioskKeys).where(isNull(kioskKeys.revokedAt)),
    db.select({ tenantId: sessions.tenantId, paymentStatus: sessions.paymentStatus, totalAmount: sessions.totalAmount }).from(sessions),
  ]);

  const now = Date.now();
  const kiosksByTenant = new Map<string, { total: number; online: number }>();
  const keysByTenant = new Map<string, { revokedAt: Date | null; licenseType: string; licenseEndsAt: Date | null }[]>();
  for (const row of kioskRows) {
    const list = keysByTenant.get(row.tenantId) ?? [];
    list.push(row);
    keysByTenant.set(row.tenantId, list);
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

  return { kiosksByTenant, sessionsByTenant, keysByTenant };
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
    qrisSettlement: tenants.qrisSettlement,
    createdAt: tenants.createdAt,
  }).from(tenants).orderBy(tenants.createdAt);

  const adminRows = await db.select({ tenantId: admins.tenantId, email: admins.email }).from(admins);
  const firstAdminByTenant = new Map<string, string>();
  for (const admin of adminRows) {
    if (!firstAdminByTenant.has(admin.tenantId)) firstAdminByTenant.set(admin.tenantId, admin.email);
  }

  const { kiosksByTenant, sessionsByTenant, keysByTenant } = await loadCrossTenantAggregates();
  const gracePeriodDays = await getGracePeriodDays();
  const now = Date.now();

  res.json(rows.map((tenant) => {
    const kiosk = kiosksByTenant.get(tenant.id) ?? { total: 0, online: 0 };
    const session = sessionsByTenant.get(tenant.id) ?? { total: 0, paid: 0, revenue: 0 };
    const licenses = summarizeLicenses(tenant.status, keysByTenant.get(tenant.id) ?? [], gracePeriodDays, now);
    return {
      ...tenant,
      adminEmail: firstAdminByTenant.get(tenant.id) ?? null,
      kioskCount: kiosk.total,
      onlineKioskCount: kiosk.online,
      sessionCount: session.total,
      revenue: session.revenue,
      licenses,
      // A tenant counts as locked when it is suspended or none of its booths can run any more.
      locked: tenant.status === "suspended" || (licenses.activeKeys > 0 && licenses.locked === licenses.activeKeys),
      // A simple, cheap "at risk" signal for the tenants table — a booth's licence due within a week (and not already
      // expired/locked, which has its own more urgent treatment) — not a churn model, just a glance-able flag.
      expiringSoon: licenses.expiringSoon > 0,
    };
  }));
});

// GET /api/superadmin/overview — platform-wide stat cards for the superadmin dashboard.
superadminRouter.get("/overview", async (_req, res) => {
  const rows = await db.select({ id: tenants.id, status: tenants.status }).from(tenants);
  const gracePeriodDays = await getGracePeriodDays();
  const now = Date.now();
  const { kiosksByTenant, sessionsByTenant, keysByTenant } = await loadCrossTenantAggregates();

  const byStatus: Record<string, number> = {};
  let expiringSoon = 0;
  let expired = 0;
  let locked = 0;
  const booths = { total: 0, paid: 0, trial: 0, unpaid: 0, locked: 0, expiringSoon: 0 };
  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    const summary = summarizeLicenses(row.status, keysByTenant.get(row.id) ?? [], gracePeriodDays, now);
    booths.total += summary.activeKeys; booths.paid += summary.paid; booths.trial += summary.trial; booths.unpaid += summary.unpaid;
    booths.locked += summary.locked; booths.expiringSoon += summary.expiringSoon;
    if (summary.expiringSoon > 0) expiringSoon += 1;
    if (summary.activeKeys > 0 && summary.locked === summary.activeKeys) { locked += 1; expired += 1; }
  }

  const kiosks = [...kiosksByTenant.values()].reduce((sum, k) => ({ total: sum.total + k.total, online: sum.online + k.online }), { total: 0, online: 0 });
  const sessionsTotal = [...sessionsByTenant.values()].reduce(
    (sum, s) => ({ total: sum.total + s.total, paid: sum.paid + s.paid, revenue: sum.revenue + s.revenue }),
    { total: 0, paid: 0, revenue: 0 },
  );

  const since30 = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const payments30 = await db.select({ amount: tenantPayments.amount }).from(tenantPayments).where(gte(tenantPayments.createdAt, since30));
  const [pendingOrders] = await db.select({ n: sql<number>`count(*)` }).from(billingOrders).where(eq(billingOrders.status, "pending"));

  res.json({
    tenants: { total: rows.length, byStatus, expiringSoon, expired, locked },
    booths,
    kiosks,
    sessions: sessionsTotal,
    subscriptions: {
      revenue30d: payments30.reduce((sum, p) => sum + Number(p.amount ?? 0), 0),
      payments30d: payments30.length,
      pendingOrders: Number(pendingOrders?.n ?? 0),
    },
  });
});

// GET /api/superadmin/billing/orders?status=paid|pending|failed|expired — online subscription checkouts
// across all tenants (Midtrans/Xendit), newest first, so failed or stuck payments can be followed up.
superadminRouter.get("/billing/orders", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : "";
  const rows = await db.select({
    orderId: billingOrders.orderId, provider: billingOrders.provider, tenantId: billingOrders.tenantId, tenantName: tenants.name,
    planName: billingOrders.planName, amount: billingOrders.amount, periodDays: billingOrders.periodDays, status: billingOrders.status,
    paymentType: billingOrders.paymentType, createdAt: billingOrders.createdAt, paidAt: billingOrders.paidAt,
    boothCount: billingOrders.boothCount, discountPercent: billingOrders.discountPercent,
  }).from(billingOrders).innerJoin(tenants, eq(tenants.id, billingOrders.tenantId))
    .where(["pending", "paid", "failed", "expired"].includes(status) ? eq(billingOrders.status, status) : undefined)
    .orderBy(desc(billingOrders.createdAt)).limit(200);
  res.json(rows.map((r) => ({ ...r, amount: Number(r.amount) })));
});

// POST /api/superadmin/billing/orders/:orderId/check — re-check a stuck order against the gateway (lost webhook).
superadminRouter.post("/billing/orders/:orderId/check", async (req, res) => {
  const [order] = await db.select().from(billingOrders).where(eq(billingOrders.orderId, req.params.orderId));
  if (!order) return res.status(404).json({ error: "Order tidak ditemukan" });
  try {
    const out = await reconcileOrder(order);
    logEvent({ tenantId: order.tenantId, category: "billing", action: "order.rechecked", message: `Order ${order.orderId} dicek ulang ke gateway: ${out.result} (status ${out.status})`, actorType: "superadmin", actorLabel: await currentSuperadminEmail(req) });
    res.json({ ok: true, ...out });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : "Gagal mengecek status pembayaran" });
  }
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
  // Negotiated discount on every booth this tenant buys (0 = none). Applied on top of the platform volume tiers; the
  // better of the two wins (see lib/boothPricing.ts).
  if (req.body?.boothDiscountPercent !== undefined) {
    const percent = Math.round(Number(req.body.boothDiscountPercent));
    if (!Number.isFinite(percent) || percent < 0 || percent > 90) return res.status(400).json({ error: "Diskon booth harus antara 0 dan 90 persen" });
    patch.boothDiscountPercent = percent;
  }
  if (req.body?.boothDiscountNote !== undefined) patch.boothDiscountNote = req.body.boothDiscountNote ? String(req.body.boothDiscountNote).trim().slice(0, 300) : null;
  // The end date is per booth now; a tenant-level date set here is applied to every running booth of the tenant
  // (trial and paid ones — a booth that was never subscribed stays unpaid) so this keeps working as "set the whole
  // account to end on X".
  let tenantEnd: Date | null | undefined;
  if (req.body?.subscriptionEndsAt !== undefined) {
    tenantEnd = req.body.subscriptionEndsAt ? new Date(req.body.subscriptionEndsAt) : null;
    if (tenantEnd && Number.isNaN(tenantEnd.getTime())) return res.status(400).json({ error: "Tanggal berakhir tidak valid" });
    patch.subscriptionEndsAt = tenantEnd;
  }
  // Where this tenant's kiosk QRIS money lands (see tenants.qrisSettlement). Switching to 'platform' starts the
  // balance from now; payments made before the switch went to the tenant's own account and never count.
  if (req.body?.qrisSettlement !== undefined) {
    const mode = String(req.body.qrisSettlement);
    if (mode !== "direct" && mode !== "platform") return res.status(400).json({ error: "qrisSettlement harus 'direct' atau 'platform'" });
    const [current] = await db.select({ qrisSettlement: tenants.qrisSettlement }).from(tenants).where(eq(tenants.id, req.params.id));
    if (!current) return res.status(404).json({ error: "Tenant tidak ditemukan" });
    if (mode !== current.qrisSettlement) {
      if (mode === "direct") {
        const balance = await computeQrisBalance(req.params.id);
        if (balance.available > 0 || balance.pending > 0) {
          return res.status(409).json({ error: `Masih ada saldo QRIS Rp ${(balance.available + balance.pending).toLocaleString("id-ID")} yang belum dibayarkan ke tenant. Selesaikan penarikannya dulu.` });
        }
      }
      patch.qrisSettlement = mode;
      patch.qrisPlatformSince = mode === "platform" ? new Date() : null;
    }
  }
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: "Tidak ada perubahan dikirim" });

  const [row] = await db.update(tenants).set(patch).where(eq(tenants.id, req.params.id)).returning();
  if (!row) return res.status(404).json({ error: "Tenant tidak ditemukan" });
  if (tenantEnd !== undefined) {
    await db.update(kioskKeys).set({ licenseEndsAt: tenantEnd })
      .where(and(eq(kioskKeys.tenantId, row.id), isNull(kioskKeys.revokedAt), ne(kioskKeys.licenseType, "unpaid")));
  }
  // Suspending/reactivating a tenant or changing a date changes what every booth is allowed to do.
  clearLicenseCache();
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

// Which booths a tenant-level action applies to: the ones the caller picked, otherwise every booth that is not revoked.
// (A booth that was never subscribed only gets a licence when picked explicitly, so a blanket goodwill extension
// can't quietly activate a half-set-up key.)
async function targetKeyIds(tenantId: string, requested: unknown): Promise<string[]> {
  if (Array.isArray(requested) && requested.length > 0) {
    const ids = requested.map((v) => String(v));
    const rows = await db.select({ id: kioskKeys.id }).from(kioskKeys)
      .where(and(eq(kioskKeys.tenantId, tenantId), isNull(kioskKeys.revokedAt), inArray(kioskKeys.id, ids)));
    return rows.map((r) => r.id);
  }
  const rows = await db.select({ id: kioskKeys.id }).from(kioskKeys)
    .where(and(eq(kioskKeys.tenantId, tenantId), isNull(kioskKeys.revokedAt), ne(kioskKeys.licenseType, "unpaid")));
  return rows.map((r) => r.id);
}

// POST /api/superadmin/tenants/:id/extend — { days, keyIds? } — quick nudge with no billing record (e.g. a goodwill
// trial extension). Extends the picked booths (default: every subscribed booth). For an actual payment, use
// POST /tenants/:id/payments instead, which extends AND keeps an audit trail.
superadminRouter.post("/tenants/:id/extend", async (req, res) => {
  const days = Number(req.body?.days);
  if (!Number.isFinite(days) || days <= 0) return res.status(400).json({ error: "Jumlah hari tidak valid" });

  const [tenant] = await db.select({ id: tenants.id, name: tenants.name }).from(tenants).where(eq(tenants.id, req.params.id));
  if (!tenant) return res.status(404).json({ error: "Tenant tidak ditemukan" });
  const ids = await targetKeyIds(tenant.id, req.body?.keyIds);
  if (ids.length === 0) return res.status(400).json({ error: "Tenant ini belum punya booth berlangganan. Pilih booth yang mau diperpanjang, atau buat key trial dulu." });
  await extendKeys(ids, days);
  await syncTenantEndsAt(tenant.id);
  logEvent({
    tenantId: tenant.id,
    category: "billing",
    action: "subscription.extended",
    message: `${ids.length} booth "${tenant.name}" diperpanjang ${days} hari (tanpa catatan pembayaran)`,
    actorType: "superadmin",
    actorLabel: await currentSuperadminEmail(req),
    metadata: { days, keyIds: ids },
  });
  const [row] = await db.select().from(tenants).where(eq(tenants.id, tenant.id));
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
    db.select({ id: kioskKeys.id, label: kioskKeys.label, createdAt: kioskKeys.createdAt, lastUsedAt: kioskKeys.lastUsedAt, revokedAt: kioskKeys.revokedAt, boundDeviceId: kioskKeys.boundDeviceId, boundAt: kioskKeys.boundAt, appVersion: kioskKeys.appVersion, lastDiagnostics: kioskKeys.lastDiagnostics, licenseType: kioskKeys.licenseType, licenseEndsAt: kioskKeys.licenseEndsAt, licensePlanSlug: kioskKeys.licensePlanSlug, trialStartedAt: kioskKeys.trialStartedAt }).from(kioskKeys).where(eq(kioskKeys.tenantId, tenant.id)).orderBy(desc(kioskKeys.createdAt)),
    db.select().from(tenantPayments).where(eq(tenantPayments.tenantId, tenant.id)).orderBy(desc(tenantPayments.createdAt)),
    db.select().from(platformEvents).where(eq(platformEvents.tenantId, tenant.id)).orderBy(desc(platformEvents.createdAt)).limit(20),
    getOrCreatePlatformSettings(),
  ]);

  const now = Date.now();
  const keysWithLock = keys.map((key) => {
    const lock = computeKeyLock(tenant.status, key, gracePeriodDays, now);
    return { ...key, locked: lock.locked, lockReason: lock.reason, daysRemaining: lock.daysRemaining, graceDaysRemaining: lock.graceDaysRemaining };
  });
  const licenses = summarizeLicenses(tenant.status, keys, gracePeriodDays, now);
  res.json({
    ...tenant,
    locked: tenant.status === "suspended" || (licenses.activeKeys > 0 && licenses.locked === licenses.activeKeys),
    licenses,
    admins: tenantAdmins,
    kioskKeys: keysWithLock,
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

  // The first booth key is a trial of `trialDays` (default: the platform setting) — the customer pairs it in the
  // kiosk app, and the booth locks by itself when the trial ends. Subscribing later happens from the website.
  const { defaultTrialDays } = await getOrCreatePlatformSettings();
  const requestedTrialDays = req.body?.trialDays === undefined || req.body.trialDays === "" ? defaultTrialDays : Math.round(Number(req.body.trialDays));
  if (!Number.isFinite(requestedTrialDays) || requestedTrialDays < 1 || requestedTrialDays > 3650) return res.status(400).json({ error: "Lama trial harus 1–3650 hari" });
  const subscriptionEndsAt = new Date(Date.now() + requestedTrialDays * 24 * 60 * 60 * 1000);

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

  const { rawKey: rawKioskKey } = await issueKioskKey(tenant.id, { label: "Default kiosk", kind: "trial", days: requestedTrialDays });

  logEvent({
    tenantId: tenant.id,
    category: "tenant",
    action: "tenant.created",
    message: `Tenant baru "${tenant.name}" dibuat (admin: ${email})`,
    actorType: "superadmin",
    actorLabel: await currentSuperadminEmail(req),
  });

  res.status(201).json({ tenant, adminEmail: email, kioskKey: rawKioskKey, trialDays: requestedTrialDays });
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
  const trialDays = req.body?.trialDays === undefined || req.body.trialDays === "" ? defaultTrialDays : Math.round(Number(req.body.trialDays));
  if (!Number.isFinite(trialDays) || trialDays < 1 || trialDays > 3650) return res.status(400).json({ error: "Lama trial harus 1–3650 hari" });
  const subscriptionEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

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

  const { rawKey: rawKioskKey } = await issueKioskKey(tenant.id, { label: "Default kiosk", kind: "trial", days: trialDays });

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

  // Welcome email with a one-time "set your password" link (never the password itself).
  const [createdAdmin] = await db.select({ id: admins.id, hash: admins.passwordHash }).from(admins).where(eq(admins.email, application.ownerEmail));
  if (createdAdmin) void deliver(application.ownerEmail, welcomeTenantMail({ ownerName: application.ownerName, businessName: application.businessName, email: application.ownerEmail, setupUrl: resetLink("tenant", createdAdmin.id, createdAdmin.hash, SETUP_TTL_MS), trialDays }), { tenantId: tenant.id, what: "selamat datang tenant" });

  res.status(201).json({ tenant, adminEmail: application.ownerEmail, kioskKey: rawKioskKey, trialDays });
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
// GET /api/superadmin/security-alerts — recent login lockouts (last 14 days) with the owner's contact details, so the
// Superadmin can follow up on WhatsApp right away. Fed by lib/securityAlerts.ts.
superadminRouter.get("/security-alerts", async (_req, res) => {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const rows = await db.select({ id: platformEvents.id, createdAt: platformEvents.createdAt, message: platformEvents.message, tenantId: platformEvents.tenantId, metadata: platformEvents.metadata })
    .from(platformEvents)
    .where(and(eq(platformEvents.action, LOCKOUT_ACTION), gte(platformEvents.createdAt, since)))
    .orderBy(desc(platformEvents.createdAt)).limit(50);
  res.json(rows.map((r) => {
    const m = (r.metadata ?? {}) as Record<string, unknown>;
    return {
      id: r.id, createdAt: r.createdAt, message: r.message, tenantId: r.tenantId,
      email: (m.email as string) ?? null, ip: (m.ip as string) ?? null, lockMinutes: Number(m.lockMinutes ?? 0), lockoutCount: Number(m.lockoutCount ?? 1),
      tenantName: (m.tenantName as string) ?? null, ownerName: (m.ownerName as string) ?? null, ownerWhatsapp: (m.ownerWhatsapp as string) ?? null,
    };
  }));
});

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
  let planSlugForPayment: string | null | undefined;
  if (planId) {
    const [plan] = await db.select({ name: plans.name, slug: plans.slug }).from(plans).where(eq(plans.id, planId));
    if (plan) {
      planName = plan.name;
      planSlugForPayment = plan.slug;
      await db.update(tenants).set({ plan: plan.slug }).where(eq(tenants.id, tenantId));
      await syncTenantFeaturesToPlan(tenantId);
    }
  }

  const [superadmin] = await db.select({ email: superadmins.email }).from(superadmins).where(eq(superadmins.id, req.superadminId!));

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) return res.status(404).json({ error: "Tenant tidak ditemukan" });
  // A manual payment extends the booths it covers (default: every subscribed booth) and turns trial/unpaid ones into
  // full subscriptions — it is real money, unlike the goodwill "extend" above.
  const ids = await targetKeyIds(tenantId, req.body?.keyIds);
  if (ids.length === 0) return res.status(400).json({ error: "Tidak ada booth untuk diperpanjang. Pilih booth yang dibayar (atau buat booth dulu)." });
  await extendKeys(ids, periodDays, { planSlug: planSlugForPayment, convertTrial: true });
  await syncTenantEndsAt(tenantId);

  const [payment] = await db.insert(tenantPayments).values({
    tenantId,
    planId,
    planName,
    amount: String(amount),
    method,
    periodDays,
    note: note ? `${note} · ${ids.length} booth` : `${ids.length} booth`,
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

// Marketing/pricing fields of a plan (discount, yearly option, highlight, feature bullets). Returns only the fields
// present in the body so PATCH leaves the others alone.
function parsePlanMarketing(body: any): { values: Record<string, unknown> } | { error: string } {
  const values: Record<string, unknown> = {};
  const percent = (raw: unknown, label: string): number | { error: string } => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 90) return { error: `${label} harus antara 0 dan 90` };
    return Math.round(n);
  };
  if (body?.discountPercent !== undefined) {
    const n = percent(body.discountPercent, "Diskon");
    if (typeof n !== "number") return n;
    values.discountPercent = n;
  }
  if (body?.yearlyDiscountPercent !== undefined) {
    const n = percent(body.yearlyDiscountPercent, "Diskon tahunan");
    if (typeof n !== "number") return n;
    values.yearlyDiscountPercent = n;
  }
  if (body?.discountLabel !== undefined) values.discountLabel = body.discountLabel ? String(body.discountLabel).trim().slice(0, 60) : null;
  if (body?.discountEndsAt !== undefined) {
    if (!body.discountEndsAt) values.discountEndsAt = null;
    else {
      const date = new Date(body.discountEndsAt);
      if (Number.isNaN(date.getTime())) return { error: "Tanggal berakhir diskon tidak valid" };
      values.discountEndsAt = date;
    }
  }
  if (body?.featured !== undefined) values.featured = Boolean(body.featured);
  if (body?.features !== undefined) {
    const list = Array.isArray(body.features) ? body.features : String(body.features ?? "").split(/\r?\n/);
    values.features = list.map((line: unknown) => String(line).trim()).filter(Boolean).slice(0, 12).map((line: string) => line.slice(0, 80));
  }
  return { values };
}

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
  const marketing = parsePlanMarketing(req.body);
  if ("error" in marketing) return res.status(400).json({ error: marketing.error });

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
    ...marketing.values,
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
  const marketing = parsePlanMarketing(req.body);
  if ("error" in marketing) return res.status(400).json({ error: marketing.error });
  Object.assign(patch, marketing.values);
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
  if (req.body?.qrisFeePercent !== undefined) {
    const percent = Number(req.body.qrisFeePercent);
    if (!Number.isFinite(percent) || percent < 0 || percent > 50) return res.status(400).json({ error: "Fee QRIS harus antara 0 dan 50 persen" });
    patch.qrisFeePercent = percent.toFixed(2);
  }
  if (req.body?.withdrawalMinAmount !== undefined) {
    const amount = Math.floor(Number(req.body.withdrawalMinAmount));
    if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: "Minimal penarikan tidak valid" });
    patch.withdrawalMinAmount = amount;
  }
  if (req.body?.withdrawalFlatFee !== undefined) {
    const amount = Math.floor(Number(req.body.withdrawalFlatFee));
    if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: "Biaya penarikan tidak valid" });
    patch.withdrawalFlatFee = amount;
  }
  // Volume discount tiers for booth subscriptions: [{ minBooths, percent }, …]
  if (req.body?.volumeDiscounts !== undefined) {
    try {
      patch.volumeDiscounts = sanitizeVolumeTiers(req.body.volumeDiscounts);
    } catch (e) {
      return res.status(400).json({ error: e instanceof Error ? e.message : "Tier diskon tidak valid" });
    }
  }
  patch.updatedAt = new Date();

  const [row] = await db.update(platformSettings).set(patch).where(eq(platformSettings.id, current.id)).returning();
  // The grace period decides when booths lock — apply a change immediately instead of after the cache expires.
  resetGraceCache();
  clearLicenseCache();
  logEvent({ category: "billing", action: "settings.updated", message: `Pengaturan platform diubah: ${Object.keys(patch).filter((k) => k !== "updatedAt").join(", ")}`, actorType: "superadmin", actorLabel: await currentSuperadminEmail(req) });
  res.json(row);
});


// ---------------------------------------------------------------------------------------------------------------
// QRIS withdrawals. Tenants settled on STUDIODO's Xendit account ask for their balance (routes/withdrawals.ts); the
// superadmin follows each request up here: pending → processing (being transferred) → paid, or rejected with a reason.
// ---------------------------------------------------------------------------------------------------------------

// GET /api/superadmin/withdrawals?status=pending|processing|paid|rejected|open
superadminRouter.get("/withdrawals", async (req, res) => {
  const status = String(req.query.status ?? "open");
  const condition = status === "open"
    ? sql`${withdrawals.status} in ('pending', 'processing')`
    : ["pending", "processing", "paid", "rejected"].includes(status) ? eq(withdrawals.status, status) : undefined;
  const items = await db
    .select({
      id: withdrawals.id,
      tenantId: withdrawals.tenantId,
      tenantName: tenants.name,
      amount: withdrawals.amount,
      feeAmount: withdrawals.feeAmount,
      netAmount: withdrawals.netAmount,
      status: withdrawals.status,
      bankName: withdrawals.bankName,
      accountNumber: withdrawals.accountNumber,
      accountName: withdrawals.accountName,
      requestNote: withdrawals.requestNote,
      adminNote: withdrawals.adminNote,
      transferReference: withdrawals.transferReference,
      requestedBy: withdrawals.requestedBy,
      processedBy: withdrawals.processedBy,
      requestedAt: withdrawals.requestedAt,
      processedAt: withdrawals.processedAt,
    })
    .from(withdrawals)
    .innerJoin(tenants, eq(tenants.id, withdrawals.tenantId))
    .where(condition)
    .orderBy(desc(withdrawals.requestedAt))
    .limit(200);
  const [totals] = await db
    .select({
      open: sql<number>`count(*) filter (where ${withdrawals.status} in ('pending', 'processing'))::int`,
      openAmount: sql<string>`coalesce(sum(${withdrawals.netAmount}) filter (where ${withdrawals.status} in ('pending', 'processing')), 0)`,
      paidAmount: sql<string>`coalesce(sum(${withdrawals.netAmount}) filter (where ${withdrawals.status} = 'paid'), 0)`,
    })
    .from(withdrawals);
  res.json({ items, summary: { open: totals.open, openAmount: Number(totals.openAmount), paidAmount: Number(totals.paidAmount) } });
});

// PATCH /api/superadmin/withdrawals/:id — { status, adminNote?, transferReference? }
superadminRouter.patch("/withdrawals/:id", async (req, res) => {
  const next = String(req.body?.status ?? "");
  if (!["processing", "paid", "rejected"].includes(next)) return res.status(400).json({ error: "Status harus processing, paid, atau rejected" });
  const adminNote = req.body?.adminNote !== undefined ? String(req.body.adminNote).trim().slice(0, 300) || null : undefined;
  const transferReference = req.body?.transferReference !== undefined ? String(req.body.transferReference).trim().slice(0, 100) || null : undefined;
  if (next === "rejected" && !adminNote) return res.status(400).json({ error: "Tulis alasan penolakan supaya tenant tahu." });

  const [current] = await db.select().from(withdrawals).where(eq(withdrawals.id, String(req.params.id)));
  if (!current) return res.status(404).json({ error: "Permintaan tidak ditemukan" });
  if (current.status === "paid" || current.status === "rejected") return res.status(409).json({ error: "Permintaan ini sudah final dan tidak bisa diubah lagi." });
  if (next === "processing" && current.status !== "pending") return res.status(409).json({ error: "Permintaan ini sudah diproses." });

  const email = await currentSuperadminEmail(req);
  const patch: Partial<typeof withdrawals.$inferInsert> = { status: next, processedBy: email, processedAt: next === "processing" ? null : new Date() };
  if (adminNote !== undefined) patch.adminNote = adminNote;
  if (transferReference !== undefined) patch.transferReference = transferReference;
  const [row] = await db.update(withdrawals).set(patch).where(eq(withdrawals.id, current.id)).returning();

  const label = next === "paid" ? "dibayar" : next === "rejected" ? "ditolak" : "diproses";
  logEvent({
    tenantId: current.tenantId,
    category: "billing",
    action: `withdrawal.${next}`,
    message: `Penarikan QRIS Rp ${Number(current.amount).toLocaleString("id-ID")} ${label}${adminNote ? ` — ${adminNote}` : ""}.`,
    actorType: "superadmin",
    actorLabel: email,
    metadata: { withdrawalId: current.id, status: next },
  });
  res.json(row);
});

// GET /api/superadmin/tenants/:id/qris-balance — balance of one tenant (for the tenant detail panel)
superadminRouter.get("/tenants/:id/qris-balance", async (req, res) => {
  res.json(await computeQrisBalance(String(req.params.id)));
});
