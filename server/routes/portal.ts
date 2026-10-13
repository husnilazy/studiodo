import { Router } from "express";
import crypto from "node:crypto";
import { and, count, desc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { priceForInterval } from "../lib/planPricing.js";
import { admins, billingOrders, kioskKeys, packages, plans, platformSettings, sessions, tenantPayments, tenants } from "../db/schema.js";
import { requireAdminAuth } from "../middleware/adminAuth.js";
import { hashPassword, verifyPassword } from "../lib/passwordHash.js";
import { computeKeyLock, getGracePeriodDays, summarizeLicenses } from "../lib/license.js";
import { MAX_BOOTHS_PER_ORDER, quoteBooths, readVolumeTiers } from "../lib/boothPricing.js";
import { logEvent } from "../lib/platformEvents.js";
import { createSnapTransaction, outcomeFromNotification, verifyNotificationSignature, type MidtransNotification } from "../lib/midtrans.js";
import { createXenditInvoice, outcomeFromInvoice, verifyCallbackToken, type XenditInvoiceCallback } from "../lib/xenditBilling.js";
import { loadGateway, noteWebhook, usableGateways } from "../lib/gateways.js";
import { reconcileOrder, settleOrder } from "../lib/billing.js";
import { portalBaseUrl } from "../lib/urls.js";
import { deliver, passwordChangedMail } from "../lib/emails.js";
import { TENANT_CATEGORIES, cleanPrefsPatch, getPrefs, setPrefs } from "../lib/emailPrefs.js";

// --- Tenant portal API (web dashboard for tenant admins) — tenant-admin JWT, same as /api/auth ---

export const portalRouter = Router();
portalRouter.use(requireAdminAuth);

const DAY_MS = 24 * 60 * 60 * 1000;
const KIOSK_ONLINE_WINDOW_MS = 5 * 60 * 1000;

// GET /api/portal/summary — everything the portal's home screen shows, in one round trip.
portalRouter.get("/summary", async (req, res) => {
  const tenantId = req.tenantId!;
  const since = new Date(Date.now() - 30 * DAY_MS);

  const [[tenant], grace, keys, [stats], payments, [admin]] = await Promise.all([
    db.select({ name: tenants.name, plan: tenants.plan, status: tenants.status, subscriptionEndsAt: tenants.subscriptionEndsAt, boothDiscountPercent: tenants.boothDiscountPercent }).from(tenants).where(eq(tenants.id, tenantId)),
    getGracePeriodDays(),
    db.select({ id: kioskKeys.id, label: kioskKeys.label, lastUsedAt: kioskKeys.lastUsedAt, appVersion: kioskKeys.appVersion, boundDeviceId: kioskKeys.boundDeviceId, licenseType: kioskKeys.licenseType, licenseEndsAt: kioskKeys.licenseEndsAt, revokedAt: kioskKeys.revokedAt })
      .from(kioskKeys).where(and(eq(kioskKeys.tenantId, tenantId), isNull(kioskKeys.revokedAt))),
    db.select({
      sessions: count(),
      revenue: sql<string>`coalesce(sum(${sessions.totalAmount}), 0)`,
    }).from(sessions).where(and(eq(sessions.tenantId, tenantId), eq(sessions.paymentStatus, "success"), gte(sessions.createdAt, since))),
    db.select({ id: tenantPayments.id, planName: tenantPayments.planName, amount: tenantPayments.amount, method: tenantPayments.method, periodDays: tenantPayments.periodDays, createdAt: tenantPayments.createdAt })
      .from(tenantPayments).where(eq(tenantPayments.tenantId, tenantId)).orderBy(desc(tenantPayments.createdAt)).limit(5),
    db.select({ email: admins.email }).from(admins).where(eq(admins.id, req.adminId!)),
  ]);
  if (!tenant) return res.status(404).json({ error: "Tenant tidak ditemukan" });

  const dailyRows = await db.select({ createdAt: sessions.createdAt, totalAmount: sessions.totalAmount })
    .from(sessions).where(and(eq(sessions.tenantId, tenantId), eq(sessions.paymentStatus, "success"), gte(sessions.createdAt, since)));
  const dailyMap = new Map<string, { sessions: number; revenue: number }>();
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  for (let i = 29; i >= 0; i -= 1) dailyMap.set(dayKey(new Date(Date.now() - i * DAY_MS)), { sessions: 0, revenue: 0 });
  for (const r of dailyRows) {
    const e = dailyMap.get(dayKey(new Date(r.createdAt)));
    if (e) { e.sessions += 1; e.revenue += Number(r.totalAmount ?? 0); }
  }

  const [plan] = await db.select({ name: plans.name, kioskLimit: plans.kioskLimit }).from(plans).where(eq(plans.slug, tenant.plan));
  const now = Date.now();
  const licenses = summarizeLicenses(tenant.status, keys, grace, now);

  res.json({
    email: admin?.email ?? null,
    tenant: {
      name: tenant.name,
      status: tenant.status,
      planSlug: tenant.plan,
      planName: plan?.name ?? tenant.plan,
      kioskLimit: plan?.kioskLimit ?? null,
      // Latest paid-through date across booths; each booth also carries its own (kiosks[].licenseEndsAt).
      subscriptionEndsAt: tenant.subscriptionEndsAt,
      // "Locked" for the dashboard means no booth can run at all; individual booths are flagged on kiosks[].
      locked: licenses.activeKeys > 0 && licenses.locked === licenses.activeKeys,
      graceDaysRemaining: null,
      boothDiscountPercent: tenant.boothDiscountPercent,
    },
    licenses,
    kiosks: keys.map((k) => {
      const lock = computeKeyLock(tenant.status, k, grace, now);
      return {
        id: k.id,
        label: k.label,
        appVersion: k.appVersion,
        paired: !!k.boundDeviceId,
        lastUsedAt: k.lastUsedAt,
        online: !!k.lastUsedAt && now - new Date(k.lastUsedAt).getTime() < KIOSK_ONLINE_WINDOW_MS,
        licenseType: lock.licenseType,
        licenseEndsAt: k.licenseEndsAt,
        locked: lock.locked,
        lockReason: lock.reason,
        daysRemaining: lock.daysRemaining,
        graceDaysRemaining: lock.graceDaysRemaining,
      };
    }),
    last30Days: { sessions: Number(stats?.sessions ?? 0), revenue: Number(stats?.revenue ?? 0) },
    daily: [...dailyMap.entries()].map(([date, v]) => ({ date, ...v })),
    recentPayments: payments.map((p) => ({ ...p, amount: Number(p.amount) })),
    onlinePaymentEnabled: (await usableGateways()).length > 0,
  });
});

// GET /api/portal/sessions?page=1&status=success|pending|expired|failed&from=YYYY-MM-DD&to=YYYY-MM-DD
// Photo-session history for this tenant: newest first, 25 per page, with totals for the filtered range.
// Customer contact details are deliberately NOT returned — this is a transaction ledger, not a lead export.
portalRouter.get("/sessions", async (req, res) => {
  const tenantId = req.tenantId!;
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
  const PAGE_SIZE = 25;
  const status = typeof req.query.status === "string" ? req.query.status : "";
  const parseDay = (v: unknown, endOfDay: boolean) => {
    if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
    const d = new Date(`${v}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+07:00`); // Indonesia (WIB) day boundaries
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const from = parseDay(req.query.from, false);
  const to = parseDay(req.query.to, true);

  const filters = [eq(sessions.tenantId, tenantId)];
  if (["success", "pending", "expired", "failed"].includes(status)) filters.push(eq(sessions.paymentStatus, status));
  if (from) filters.push(gte(sessions.createdAt, from));
  if (to) filters.push(lte(sessions.createdAt, to));
  const where = and(...filters);

  const [[totals], rows] = await Promise.all([
    db.select({
      count: count(),
      paidCount: sql<string>`count(*) filter (where ${sessions.paymentStatus} = 'success')`,
      revenue: sql<string>`coalesce(sum(${sessions.totalAmount}) filter (where ${sessions.paymentStatus} = 'success'), 0)`,
    }).from(sessions).where(where),
    db.select({
      id: sessions.id, createdAt: sessions.createdAt, packageName: packages.name, paymentMethod: sessions.paymentMethod,
      paymentStatus: sessions.paymentStatus, paymentPurpose: sessions.paymentPurpose, totalAmount: sessions.totalAmount,
      voucherCode: sessions.voucherCode, orientation: sessions.orientation, photoCount: sql<number>`coalesce(jsonb_array_length(${sessions.photoUrls}), 0)`,
    }).from(sessions).leftJoin(packages, eq(packages.id, sessions.packageId)).where(where)
      .orderBy(desc(sessions.createdAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
  ]);

  const total = Number(totals?.count ?? 0);
  res.json({
    page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    paidCount: Number(totals?.paidCount ?? 0), revenue: Number(totals?.revenue ?? 0),
    items: rows.map((r) => ({ ...r, totalAmount: Number(r.totalAmount ?? 0), photoCount: Number(r.photoCount) })),
  });
});

// POST /api/portal/password — { currentPassword, newPassword }. Requires the current password so a stolen
// session cookie alone can't lock the owner out. Failed attempts are throttled per admin (in-memory, same
// caveat as the login guard in routes/auth.ts: single-process only).
const PASSWORD_MAX_ATTEMPTS = 5;
const PASSWORD_LOCKOUT_MS = 5 * 60 * 1000;
const passwordAttempts = new Map<string, { count: number; lockedUntil: number }>();

portalRouter.post("/password", async (req, res) => {
  const adminId = req.adminId!;
  const currentPassword = String(req.body?.currentPassword ?? "");
  const newPassword = String(req.body?.newPassword ?? "");
  if (newPassword.length < 8) return res.status(400).json({ error: "Password baru minimal 8 karakter" });
  if (newPassword.length > 200) return res.status(400).json({ error: "Password baru terlalu panjang" });

  const entry = passwordAttempts.get(adminId) ?? { count: 0, lockedUntil: 0 };
  if (entry.lockedUntil > Date.now()) {
    return res.status(429).json({ error: `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil((entry.lockedUntil - Date.now()) / 60000)} menit.` });
  }

  const [admin] = await db.select({ email: admins.email, passwordHash: admins.passwordHash }).from(admins).where(eq(admins.id, adminId));
  if (!admin) return res.status(404).json({ error: "Akun tidak ditemukan" });
  if (!verifyPassword(currentPassword, admin.passwordHash)) {
    entry.count += 1;
    if (entry.count >= PASSWORD_MAX_ATTEMPTS) { entry.lockedUntil = Date.now() + PASSWORD_LOCKOUT_MS; entry.count = 0; }
    passwordAttempts.set(adminId, entry);
    return res.status(400).json({ error: "Password saat ini salah" });
  }
  if (verifyPassword(newPassword, admin.passwordHash)) return res.status(400).json({ error: "Password baru harus berbeda dari yang lama" });

  passwordAttempts.delete(adminId);
  await db.update(admins).set({ passwordHash: hashPassword(newPassword) }).where(eq(admins.id, adminId));
  void deliver(admin.email, passwordChangedMail({ name: null, when: new Date().toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jakarta" }) }), { tenantId: req.tenantId!, what: "kata sandi diubah" });
  logEvent({ tenantId: req.tenantId!, category: "auth", action: "password.changed", message: `Password diganti oleh ${admin.email} lewat portal web`, actorType: "tenant_admin", actorLabel: admin.email });
  res.json({ ok: true });
});

// GET/PATCH /api/portal/email-preferences — which optional emails this tenant receives (security mail can't be turned off).
portalRouter.get("/email-preferences", async (req, res) => {
  res.json({ categories: TENANT_CATEGORIES, prefs: await getPrefs("tenant", req.tenantId!) });
});
portalRouter.patch("/email-preferences", async (req, res) => {
  const patch = cleanPrefsPatch("tenant", req.body);
  if (!patch) return res.status(400).json({ error: "Tidak ada perubahan yang valid" });
  res.json({ categories: TENANT_CATEGORIES, prefs: await setPrefs("tenant", req.tenantId!, patch) });
});

// GET /api/portal/billing/orders — this tenant's checkout attempts, newest first.
portalRouter.get("/billing/orders", async (req, res) => {
  const rows = await db.select({
    orderId: billingOrders.orderId, planName: billingOrders.planName, amount: billingOrders.amount,
    periodDays: billingOrders.periodDays, status: billingOrders.status, paymentType: billingOrders.paymentType,
    createdAt: billingOrders.createdAt, paidAt: billingOrders.paidAt, boothCount: billingOrders.boothCount, discountPercent: billingOrders.discountPercent,
  }).from(billingOrders).where(eq(billingOrders.tenantId, req.tenantId!)).orderBy(desc(billingOrders.createdAt)).limit(20);
  res.json(rows.map((r) => ({ ...r, amount: Number(r.amount) })));
});

// Everything the "Booth & langganan" page needs to price an order: the plans (per-booth prices), the platform's volume
// tiers and this tenant's negotiated discount. Shared by the quote preview and the real checkout so both always agree.
async function loadPricingContext(tenantId: string) {
  const [[settings], [tenant]] = await Promise.all([
    db.select({ volumeDiscounts: platformSettings.volumeDiscounts }).from(platformSettings).limit(1),
    db.select({ boothDiscountPercent: tenants.boothDiscountPercent }).from(tenants).where(eq(tenants.id, tenantId)),
  ]);
  return { tiers: readVolumeTiers(settings?.volumeDiscounts ?? [{ minBooths: 10, percent: 10 }]), tenantPercent: tenant?.boothDiscountPercent ?? 0 };
}

type OrderItem = { keyId: string | null; label: string | null };

/** Validates the requested booths: existing keys must be this tenant's and not revoked; new ones are bounded. */
async function resolveOrderItems(tenantId: string, body: Record<string, unknown>): Promise<{ items: OrderItem[] } | { error: string }> {
  const rawIds = Array.isArray(body.keyIds) ? body.keyIds : [];
  const keyIds = [...new Set(rawIds.map((v) => String(v)))];
  if (keyIds.length > MAX_BOOTHS_PER_ORDER) return { error: `Maksimal ${MAX_BOOTHS_PER_ORDER} booth per pembayaran` };
  const newBooths = Math.floor(Number(body.newBooths) || 0);
  if (newBooths < 0 || newBooths > MAX_BOOTHS_PER_ORDER) return { error: `Booth baru harus antara 0 dan ${MAX_BOOTHS_PER_ORDER}` };

  const items: OrderItem[] = [];
  if (keyIds.length > 0) {
    if (!keyIds.every((id) => /^[0-9a-f-]{36}$/i.test(id))) return { error: "Daftar booth tidak valid" };
    const owned = await db.select({ id: kioskKeys.id, label: kioskKeys.label }).from(kioskKeys)
      .where(and(eq(kioskKeys.tenantId, tenantId), isNull(kioskKeys.revokedAt), inArray(kioskKeys.id, keyIds)));
    if (owned.length !== keyIds.length) return { error: "Ada booth yang tidak ditemukan atau sudah dicabut. Muat ulang halaman lalu coba lagi." };
    for (const k of owned) items.push({ keyId: k.id, label: k.label });
  }
  if (newBooths > 0) {
    const [{ n }] = await db.select({ n: count() }).from(kioskKeys).where(and(eq(kioskKeys.tenantId, tenantId), isNull(kioskKeys.revokedAt)));
    if (Number(n) + newBooths > 100) return { error: "Total booth aktif melebihi batas 100 per akun. Hubungi admin STUDIODO." };
    const names = Array.isArray(body.newLabels) ? body.newLabels : [];
    for (let i = 0; i < newBooths; i += 1) {
      const label = typeof names[i] === "string" ? String(names[i]).trim().slice(0, 80) : "";
      items.push({ keyId: null, label: label || null });
    }
  }
  if (items.length === 0) return { error: "Pilih minimal satu booth untuk diperpanjang atau tambah booth baru." };
  return { items };
}

// POST /api/portal/billing/quote — { planSlug, interval, keyIds[], newBooths } → the price breakdown, without charging anything.
portalRouter.post("/billing/quote", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const [plan] = await db.select().from(plans).where(and(eq(plans.slug, String(body.planSlug ?? "")), eq(plans.active, true)));
  if (!plan) return res.status(404).json({ error: "Paket tidak ditemukan atau sudah tidak aktif" });
  const resolved = await resolveOrderItems(req.tenantId!, body);
  if ("error" in resolved) return res.status(400).json({ error: resolved.error });
  const interval = body.interval === "yearly" ? "yearly" : plan.billingInterval === "yearly" ? "yearly" : "monthly";
  const { tiers, tenantPercent } = await loadPricingContext(req.tenantId!);
  const quote = quoteBooths(plan, interval, resolved.items.length, tiers, tenantPercent);
  if (!quote) return res.status(400).json({ error: "Paket ini tidak tersedia untuk periode tersebut" });
  res.json({ quote, tiers });
});

// GET /api/portal/billing/tiers — the volume tiers and this tenant's negotiated discount (for the page's explanation).
portalRouter.get("/billing/tiers", async (req, res) => {
  res.json(await loadPricingContext(req.tenantId!));
});

// POST /api/portal/billing/checkout — { planSlug, interval, keyIds[], newBooths } → { redirectUrl } to a gateway's hosted
// payment page. One payment can renew several booths and/or add new ones; the volume/negotiated discount is applied on
// the server. Tries the enabled gateways in priority order (Superadmin → Pengaturan → Pembayaran langganan): if one is
// down or rejects the request, the next is used. If none works the tenant is told to contact STUDIODO instead.
portalRouter.post("/billing/checkout", async (req, res) => {
  const gateways = await usableGateways();
  if (gateways.length === 0) {
    return res.status(503).json({ error: "Pembayaran online belum diaktifkan. Hubungi admin STUDIODO untuk perpanjang langganan." });
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const planSlug = String(body.planSlug ?? "");
  const [plan] = await db.select().from(plans).where(and(eq(plans.slug, planSlug), eq(plans.active, true)));
  if (!plan) return res.status(404).json({ error: "Paket tidak ditemukan atau sudah tidak aktif" });

  const tenantId = req.tenantId!;
  const resolved = await resolveOrderItems(tenantId, body);
  if ("error" in resolved) return res.status(400).json({ error: resolved.error });
  const items = resolved.items;

  // The interval the tenant picked (monthly/yearly). Charged with the same numbers the website shows, promo included.
  const interval = body.interval === "yearly" ? "yearly" : plan.billingInterval === "yearly" ? "yearly" : "monthly";
  const { tiers, tenantPercent } = await loadPricingContext(tenantId);
  const quote = quoteBooths(plan, interval, items.length, tiers, tenantPercent);
  if (!quote) return res.status(400).json({ error: "Paket ini tidak tersedia untuk periode tersebut" });
  const amount = Math.round(quote.total);
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "Paket ini gratis dan tidak perlu dibayar" });
  const periodDays = quote.periodDays;

  const [admin] = await db.select({ email: admins.email }).from(admins).where(eq(admins.id, req.adminId!));
  const [tenant] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId));
  if (!admin || !tenant) return res.status(404).json({ error: "Akun tidak ditemukan" });

  // Where the gateway sends the tenant back after paying. Defaults to the public website so the payer is never
  // left stranded on the gateway's page when PORTAL_BASE_URL was not configured.
  const finishUrl = `${portalBaseUrl()}/portal/tagihan?status=selesai`;
  const itemName = `${plan.name} · ${items.length} booth (${periodDays} hari)`;

  for (const gw of gateways) {
    // A fresh order id per attempt: a gateway that failed mid-way may already have recorded the previous one.
    const orderId = `SDO-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    try {
      let redirectUrl: string;
      let snapToken: string | null = null;
      let providerRef: string | null = null;
      if (gw.provider === "midtrans") {
        const snap = await createSnapTransaction({ serverKey: gw.secretKey!, production: gw.environment === "production" }, {
          orderId, grossAmount: amount, itemName, customerEmail: admin.email, customerName: tenant.name, finishUrl,
        });
        redirectUrl = snap.redirectUrl;
        snapToken = snap.token;
      } else {
        const invoice = await createXenditInvoice({ secretKey: gw.secretKey! }, { orderId, amount, description: `STUDIODO — ${itemName}`, customerEmail: admin.email, finishUrl });
        redirectUrl = invoice.redirectUrl;
        providerRef = invoice.invoiceId;
      }
      await db.insert(billingOrders).values({
        orderId, provider: gw.provider, providerRef, tenantId, planId: plan.id, planName: plan.name, amount: String(amount), periodDays,
        items, boothCount: items.length, discountPercent: quote.discountPercent,
        snapToken, redirectUrl,
      });
      logEvent({ tenantId, category: "billing", action: "checkout.created", message: `Checkout ${orderId} (${gw.provider}) dibuat: ${plan.name}, ${items.length} booth, Rp ${amount.toLocaleString("id-ID")}${quote.discountPercent > 0 ? ` (diskon ${quote.discountPercent}%)` : ""}`, actorType: "tenant_admin", actorLabel: admin.email });
      return res.status(201).json({ redirectUrl, orderId, provider: gw.provider });
    } catch (e) {
      logEvent({ tenantId, level: gateways.indexOf(gw) < gateways.length - 1 ? "warning" : "error", category: "billing", action: "checkout.gateway_failed", message: `Checkout via ${gw.provider} gagal untuk "${tenant.name}": ${e instanceof Error ? e.message : String(e)}${gateways.indexOf(gw) < gateways.length - 1 ? " — mencoba gateway berikutnya" : ""}`, actorType: "system" });
    }
  }
  res.status(502).json({ error: "Gagal membuat pembayaran. Coba lagi beberapa saat lagi, atau hubungi admin STUDIODO." });
});

// POST /api/portal/billing/orders/:orderId/check — "I paid but nothing changed": asks the gateway directly instead of
// waiting for a webhook that may have been lost. Only this tenant's own orders; rate-limited per tenant.
const lastCheck = new Map<string, number>();
portalRouter.post("/billing/orders/:orderId/check", async (req, res) => {
  const tenantId = req.tenantId!;
  if (Date.now() - (lastCheck.get(tenantId) ?? 0) < 5000) return res.status(429).json({ error: "Tunggu beberapa detik sebelum mengecek lagi." });
  lastCheck.set(tenantId, Date.now());
  const [order] = await db.select().from(billingOrders).where(and(eq(billingOrders.orderId, req.params.orderId), eq(billingOrders.tenantId, tenantId)));
  if (!order) return res.status(404).json({ error: "Order tidak ditemukan" });
  try {
    const out = await reconcileOrder(order);
    res.json({ ok: true, ...out });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : "Gagal mengecek status pembayaran" });
  }
});

// --- Gateway webhooks — PUBLIC (the gateways call them), each authenticated by its own mechanism ---

export const billingWebhookRouter = Router();

// Webhooks are accepted whenever a key exists, even if the gateway was switched off in the meantime —
// a customer may well have paid just before it was disabled, and that payment must still be honoured.

// A correctly authenticated notification for an order we don't know (the gateway dashboard's "test" button,
// or another product sharing the same merchant account) is acknowledged with 200: answering 404 just makes the
// gateway retry it for days and shows a failed test. It is logged so a genuinely lost order is still visible.
function ackUnknownOrder(res: import("express").Response, provider: "midtrans" | "xendit", orderId: unknown) {
  logEvent({ level: "info", category: "billing", action: "webhook.unknown_order", message: `Notifikasi ${provider} untuk order tak dikenal diabaikan (${String(orderId ?? "?").slice(0, 60)})`, actorType: "system" });
  void noteWebhook(provider, `order tak dikenal diabaikan (${String(orderId ?? "?").slice(0, 40)})`).catch(() => undefined);
  return res.json({ ok: true, ignored: true });
}

// POST /api/billing/midtrans/notification — authenticated by the SHA512 signature
billingWebhookRouter.post("/midtrans/notification", async (req, res) => {
  const cfg = await loadGateway("midtrans");
  if (!cfg.secretKey) return res.status(503).json({ error: "Midtrans belum dikonfigurasi" });

  const n = (req.body ?? {}) as MidtransNotification;
  if (!verifyNotificationSignature(cfg.secretKey, n)) {
    logEvent({ level: "warning", category: "billing", action: "webhook.bad_signature", message: `Notifikasi Midtrans dengan signature tidak valid (order ${String(n.order_id ?? "?").slice(0, 60)})`, actorType: "system" });
    void noteWebhook("midtrans", "signature ditolak").catch(() => undefined);
    return res.status(403).json({ error: "Signature tidak valid" });
  }

  const [order] = await db.select().from(billingOrders).where(eq(billingOrders.orderId, String(n.order_id)));
  if (!order || order.provider !== "midtrans") return ackUnknownOrder(res, "midtrans", n.order_id);

  // The signature covers gross_amount, but also confirm it matches what we charged — never
  // extend a subscription because a differently-priced payment happened to carry a valid order id.
  if (Math.round(Number(n.gross_amount)) !== Math.round(Number(order.amount))) {
    logEvent({ tenantId: order.tenantId, level: "error", category: "billing", action: "webhook.amount_mismatch", message: `Nominal notifikasi ${n.gross_amount} tidak cocok dengan order ${order.orderId} (${order.amount})`, actorType: "system" });
    void noteWebhook("midtrans", `nominal tidak cocok (${order.orderId})`).catch(() => undefined);
    return res.status(400).json({ error: "Nominal tidak cocok" });
  }

  const result = await settleOrder(order, outcomeFromNotification(n), n.payment_type ?? null);
  void noteWebhook("midtrans", `${result} · ${order.orderId}`).catch(() => undefined);
  res.json({ ok: true });
});

// POST /api/billing/xendit/notification — authenticated by the static x-callback-token header
billingWebhookRouter.post("/xendit/notification", async (req, res) => {
  const cfg = await loadGateway("xendit");
  if (!cfg.webhookToken) return res.status(503).json({ error: "Xendit belum dikonfigurasi" });

  if (!verifyCallbackToken(cfg.webhookToken, req.header("x-callback-token") ?? undefined)) {
    logEvent({ level: "warning", category: "billing", action: "webhook.bad_signature", message: "Notifikasi Xendit dengan callback token tidak valid", actorType: "system" });
    void noteWebhook("xendit", "token ditolak").catch(() => undefined);
    return res.status(403).json({ error: "Token tidak valid" });
  }

  const cb = (req.body ?? {}) as XenditInvoiceCallback;
  const [order] = await db.select().from(billingOrders).where(eq(billingOrders.orderId, String(cb.external_id ?? "")));
  if (!order || order.provider !== "xendit") return ackUnknownOrder(res, "xendit", cb.external_id);

  const outcome = outcomeFromInvoice(cb);
  // For a paid invoice, the amount actually paid must match the order (Xendit reports paid_amount; amount is the invoice total).
  if (outcome === "paid" && Math.round(Number(cb.paid_amount ?? cb.amount)) !== Math.round(Number(order.amount))) {
    logEvent({ tenantId: order.tenantId, level: "error", category: "billing", action: "webhook.amount_mismatch", message: `Nominal Xendit ${cb.paid_amount ?? cb.amount} tidak cocok dengan order ${order.orderId} (${order.amount})`, actorType: "system" });
    void noteWebhook("xendit", `nominal tidak cocok (${order.orderId})`).catch(() => undefined);
    return res.status(400).json({ error: "Nominal tidak cocok" });
  }

  const result = await settleOrder(order, outcome, cb.payment_channel ?? cb.payment_method ?? null);
  void noteWebhook("xendit", `${result} · ${order.orderId}`).catch(() => undefined);
  res.json({ ok: true });
});
