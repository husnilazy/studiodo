import { Router } from "express";
import crypto from "node:crypto";
import { and, count, desc, eq, gte, isNull, ne, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { admins, billingOrders, kioskKeys, plans, sessions, tenantPayments, tenants } from "../db/schema.js";
import { requireAdminAuth } from "../middleware/adminAuth.js";
import { getSubscriptionStatus, extendSubscription } from "../lib/subscription.js";
import { syncTenantFeaturesToPlan } from "../lib/planFeatures.js";
import { logEvent } from "../lib/platformEvents.js";
import {
  createSnapTransaction,
  isMidtransConfigured,
  outcomeFromNotification,
  verifyNotificationSignature,
  type MidtransNotification,
} from "../lib/midtrans.js";

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
    recentPayments: payments.map((p) => ({ ...p, amount: Number(p.amount) })),
    onlinePaymentEnabled: isMidtransConfigured(),
  });
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

// POST /api/portal/billing/checkout — { planSlug } → { redirectUrl } to Midtrans' hosted payment page.
portalRouter.post("/billing/checkout", async (req, res) => {
  if (!isMidtransConfigured()) {
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

  const orderId = `SDO-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  try {
    const snap = await createSnapTransaction({
      orderId,
      grossAmount: amount,
      itemName: `${plan.name} (${periodDays} hari)`,
      customerEmail: admin.email,
      customerName: tenant.name,
      finishUrl: process.env.PORTAL_BASE_URL ? `${process.env.PORTAL_BASE_URL.replace(/\/$/, "")}/portal/tagihan?status=selesai` : undefined,
    });
    await db.insert(billingOrders).values({
      orderId, tenantId, planId: plan.id, planName: plan.name, amount: String(amount), periodDays,
      snapToken: snap.token, redirectUrl: snap.redirectUrl,
    });
    logEvent({ tenantId, category: "billing", action: "checkout.created", message: `Checkout ${orderId} dibuat: ${plan.name}, Rp ${amount.toLocaleString("id-ID")}`, actorType: "tenant_admin", actorLabel: admin.email });
    res.status(201).json({ redirectUrl: snap.redirectUrl, orderId });
  } catch (e) {
    logEvent({ tenantId, level: "error", category: "billing", action: "checkout.failed", message: `Checkout gagal untuk "${tenant.name}": ${e instanceof Error ? e.message : String(e)}`, actorType: "system" });
    res.status(502).json({ error: "Gagal membuat pembayaran. Coba lagi beberapa saat lagi." });
  }
});

// --- Midtrans webhook — PUBLIC (Midtrans calls it), authenticated by the signature instead ---

export const billingWebhookRouter = Router();

// POST /api/billing/midtrans/notification
billingWebhookRouter.post("/midtrans/notification", async (req, res) => {
  if (!isMidtransConfigured()) return res.status(503).json({ error: "Midtrans belum dikonfigurasi" });

  const n = (req.body ?? {}) as MidtransNotification;
  if (!verifyNotificationSignature(n)) {
    logEvent({ level: "warning", category: "billing", action: "webhook.bad_signature", message: `Notifikasi Midtrans dengan signature tidak valid (order ${String(n.order_id ?? "?").slice(0, 60)})`, actorType: "system" });
    return res.status(403).json({ error: "Signature tidak valid" });
  }

  const [order] = await db.select().from(billingOrders).where(eq(billingOrders.orderId, String(n.order_id)));
  if (!order) return res.status(404).json({ error: "Order tidak ditemukan" });

  // The signature covers gross_amount, but also confirm it matches what we charged — never
  // extend a subscription because a differently-priced payment happened to carry a valid order id.
  if (Math.round(Number(n.gross_amount)) !== Math.round(Number(order.amount))) {
    logEvent({ tenantId: order.tenantId, level: "error", category: "billing", action: "webhook.amount_mismatch", message: `Nominal notifikasi ${n.gross_amount} tidak cocok dengan order ${order.orderId} (${order.amount})`, actorType: "system" });
    return res.status(400).json({ error: "Nominal tidak cocok" });
  }

  const outcome = outcomeFromNotification(n);

  if (outcome === "paid") {
    // Guarded transition: only the first notification wins, so retries never double-extend.
    const [claimed] = await db.update(billingOrders)
      .set({ status: "paid", paidAt: new Date(), paymentType: n.payment_type ?? null })
      .where(and(eq(billingOrders.id, order.id), ne(billingOrders.status, "paid")))
      .returning();
    if (claimed) {
      if (order.planId) {
        const [plan] = await db.select({ slug: plans.slug }).from(plans).where(eq(plans.id, order.planId));
        if (plan) {
          await db.update(tenants).set({ plan: plan.slug }).where(eq(tenants.id, order.tenantId));
          await syncTenantFeaturesToPlan(order.tenantId);
        }
      }
      const tenant = await extendSubscription(order.tenantId, order.periodDays);
      await db.insert(tenantPayments).values({
        tenantId: order.tenantId, planId: order.planId, planName: order.planName, amount: order.amount,
        method: "midtrans", periodDays: order.periodDays, note: `Midtrans ${order.orderId}${n.payment_type ? ` (${n.payment_type})` : ""}`, recordedBy: "midtrans",
      });
      logEvent({
        tenantId: order.tenantId, category: "billing", action: "payment.received",
        message: `Pembayaran online Rp ${Number(order.amount).toLocaleString("id-ID")} diterima untuk "${tenant?.name ?? order.tenantId}" (${order.periodDays} hari, ${order.planName})`,
        actorType: "system", metadata: { orderId: order.orderId, paymentType: n.payment_type ?? null },
      });
    }
  } else if (outcome === "failed" || outcome === "expired") {
    await db.update(billingOrders).set({ status: outcome }).where(and(eq(billingOrders.id, order.id), eq(billingOrders.status, "pending")));
  }

  res.json({ ok: true });
});
