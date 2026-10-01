import { Router } from "express";
import crypto from "node:crypto";
import { and, count, desc, eq, gte, isNull, ne, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { admins, billingOrders, kioskKeys, plans, sessions, tenantPayments, tenants } from "../db/schema.js";
import { requireAdminAuth } from "../middleware/adminAuth.js";
import { hashPassword, verifyPassword } from "../lib/passwordHash.js";
import { getSubscriptionStatus } from "../lib/subscription.js";
import { logEvent } from "../lib/platformEvents.js";
import { createSnapTransaction, outcomeFromNotification, verifyNotificationSignature, type MidtransNotification } from "../lib/midtrans.js";
import { createXenditInvoice, outcomeFromInvoice, verifyCallbackToken, type XenditInvoiceCallback } from "../lib/xenditBilling.js";
import { loadGateway, noteWebhook, usableGateways } from "../lib/gateways.js";
import { settleOrder } from "../lib/billing.js";

// --- Tenant portal API (web dashboard for tenant admins) — tenant-admin JWT, same as /api/auth ---

export const portalRouter = Router();
portalRouter.use(requireAdminAuth);

const DAY_MS = 24 * 60 * 60 * 1000;
const KIOSK_ONLINE_WINDOW_MS = 5 * 60 * 1000;

// GET /api/portal/summary — everything the portal's home screen shows, in one round trip.
portalRouter.get("/summary", async (req, res) => {
  const tenantId = req.tenantId!;
  const since = new Date(Date.now() - 30 * DAY_MS);

  const [[tenant], subscription, keys, [stats], payments, [admin]] = await Promise.all([
    db.select({ name: tenants.name, plan: tenants.plan, status: tenants.status, subscriptionEndsAt: tenants.subscriptionEndsAt }).from(tenants).where(eq(tenants.id, tenantId)),
    getSubscriptionStatus(tenantId),
    db.select({ id: kioskKeys.id, label: kioskKeys.label, lastUsedAt: kioskKeys.lastUsedAt, appVersion: kioskKeys.appVersion, boundDeviceId: kioskKeys.boundDeviceId })
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

  res.json({
    email: admin?.email ?? null,
    tenant: {
      name: tenant.name,
      status: tenant.status,
      planSlug: tenant.plan,
      planName: plan?.name ?? tenant.plan,
      kioskLimit: plan?.kioskLimit ?? null,
      subscriptionEndsAt: tenant.subscriptionEndsAt,
      locked: subscription.locked,
      graceDaysRemaining: subscription.graceDaysRemaining,
    },
    kiosks: keys.map((k) => ({
      id: k.id,
      label: k.label,
      appVersion: k.appVersion,
      paired: !!k.boundDeviceId,
      lastUsedAt: k.lastUsedAt,
      online: !!k.lastUsedAt && now - new Date(k.lastUsedAt).getTime() < KIOSK_ONLINE_WINDOW_MS,
    })),
    last30Days: { sessions: Number(stats?.sessions ?? 0), revenue: Number(stats?.revenue ?? 0) },
    daily: [...dailyMap.entries()].map(([date, v]) => ({ date, ...v })),
    recentPayments: payments.map((p) => ({ ...p, amount: Number(p.amount) })),
    onlinePaymentEnabled: (await usableGateways()).length > 0,
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
  logEvent({ tenantId: req.tenantId!, category: "auth", action: "password.changed", message: `Password diganti oleh ${admin.email} lewat portal web`, actorType: "tenant_admin", actorLabel: admin.email });
  res.json({ ok: true });
});

// GET /api/portal/billing/orders — this tenant's checkout attempts, newest first.
portalRouter.get("/billing/orders", async (req, res) => {
  const rows = await db.select({
    orderId: billingOrders.orderId, planName: billingOrders.planName, amount: billingOrders.amount,
    periodDays: billingOrders.periodDays, status: billingOrders.status, paymentType: billingOrders.paymentType,
    createdAt: billingOrders.createdAt, paidAt: billingOrders.paidAt,
  }).from(billingOrders).where(eq(billingOrders.tenantId, req.tenantId!)).orderBy(desc(billingOrders.createdAt)).limit(20);
  res.json(rows.map((r) => ({ ...r, amount: Number(r.amount) })));
});

// POST /api/portal/billing/checkout — { planSlug } → { redirectUrl } to a gateway's hosted payment page.
// Tries the enabled gateways in priority order (Superadmin → Pengaturan → Pembayaran langganan): if one is down or
// rejects the request, the next is used. If none works the tenant is told to contact STUDIODO instead.
portalRouter.post("/billing/checkout", async (req, res) => {
  const gateways = await usableGateways();
  if (gateways.length === 0) {
    return res.status(503).json({ error: "Pembayaran online belum diaktifkan. Hubungi admin STUDIODO untuk perpanjang langganan." });
  }
  const planSlug = String(req.body?.planSlug ?? "");
  const [plan] = await db.select().from(plans).where(and(eq(plans.slug, planSlug), eq(plans.active, true)));
  if (!plan) return res.status(404).json({ error: "Paket tidak ditemukan atau sudah tidak aktif" });

  const amount = Math.round(Number(plan.price));
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "Paket ini gratis dan tidak perlu dibayar" });
  const periodDays = plan.billingInterval === "yearly" ? 365 : 30;

  const tenantId = req.tenantId!;
  const [admin] = await db.select({ email: admins.email }).from(admins).where(eq(admins.id, req.adminId!));
  const [tenant] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId));
  if (!admin || !tenant) return res.status(404).json({ error: "Akun tidak ditemukan" });

  const finishUrl = process.env.PORTAL_BASE_URL ? `${process.env.PORTAL_BASE_URL.replace(/\/$/, "")}/portal/tagihan?status=selesai` : undefined;
  const itemName = `${plan.name} (${periodDays} hari)`;

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
        snapToken, redirectUrl,
      });
      logEvent({ tenantId, category: "billing", action: "checkout.created", message: `Checkout ${orderId} (${gw.provider}) dibuat: ${plan.name}, Rp ${amount.toLocaleString("id-ID")}`, actorType: "tenant_admin", actorLabel: admin.email });
      return res.status(201).json({ redirectUrl, orderId, provider: gw.provider });
    } catch (e) {
      logEvent({ tenantId, level: gateways.indexOf(gw) < gateways.length - 1 ? "warning" : "error", category: "billing", action: "checkout.gateway_failed", message: `Checkout via ${gw.provider} gagal untuk "${tenant.name}": ${e instanceof Error ? e.message : String(e)}${gateways.indexOf(gw) < gateways.length - 1 ? " — mencoba gateway berikutnya" : ""}`, actorType: "system" });
    }
  }
  res.status(502).json({ error: "Gagal membuat pembayaran. Coba lagi beberapa saat lagi, atau hubungi admin STUDIODO." });
});

// --- Gateway webhooks — PUBLIC (the gateways call them), each authenticated by its own mechanism ---

export const billingWebhookRouter = Router();

// Webhooks are accepted whenever a key exists, even if the gateway was switched off in the meantime —
// a customer may well have paid just before it was disabled, and that payment must still be honoured.

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
  if (!order || order.provider !== "midtrans") return res.status(404).json({ error: "Order tidak ditemukan" });

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
  if (!order || order.provider !== "xendit") return res.status(404).json({ error: "Order tidak ditemukan" });

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
