import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { billingOrders } from "../db/schema.js";
import QRCode from "qrcode";
import { buildInvoice, PAYMENT_WINDOW_MS, verifyInvoiceToken } from "../lib/invoice.js";
import { reconcileOrder } from "../lib/billing.js";
import crypto from "node:crypto";
import { admins, tenants } from "../db/schema.js";
import { loadGateway } from "../lib/gateways.js";
import { portalBaseUrl } from "../lib/urls.js";
import { logEvent } from "../lib/platformEvents.js";
import { cancelCharge, chargeMethod, createSnapTransaction, isPayMethod, PAY_METHODS, type PayInstruction } from "../lib/midtrans.js";

// Login-free invoice view for the link in the invoice email (mounted at /api/public). Authenticated only by the signed,
// order-bound token in the link: it opens exactly that one invoice, and nothing else.

export const publicInvoiceRouter = Router();

const hits = new Map<string, { n: number; at: number }>();

// GET /api/public/invoice/:orderId?token=…
publicInvoiceRouter.get("/invoice/:orderId", async (req, res) => {
  // Cheap per-IP throttle against token guessing (the token is a 256-bit HMAC, so this is belt and braces).
  const ip = String(req.headers["cf-connecting-ip"] ?? req.ip ?? "?");
  const h = hits.get(ip);
  if (h && Date.now() - h.at < 60_000 && h.n >= 60) return res.status(429).json({ error: "Terlalu banyak permintaan" });
  hits.set(ip, h && Date.now() - h.at < 60_000 ? { n: h.n + 1, at: h.at } : { n: 1, at: Date.now() });

  const orderId = String(req.params.orderId);
  if (!verifyInvoiceToken(orderId, String(req.query.token ?? ""))) return res.status(404).json({ error: "Invoice tidak ditemukan atau tautan tidak valid" });
  const [order] = await db.select().from(billingOrders).where(eq(billingOrders.orderId, orderId));
  if (!order) return res.status(404).json({ error: "Invoice tidak ditemukan atau tautan tidak valid" });
  res.set("Cache-Control", "no-store");
  res.json({ invoice: await buildInvoice(order) });
});

// --- STUDIODO's own payment page. Same signed link as the invoice; it opens exactly that one order. ---
// The tenant picks a method on the page; each one is charged through Midtrans' Core API and the page shows what to do
// (QR, virtual-account number, store code). "Other methods" (cards, ...) opens Midtrans' hosted page as a fallback.

type Order = typeof billingOrders.$inferSelect;

async function payOrder(req: import("express").Request) {
  const orderId = String(req.params.orderId);
  if (!verifyInvoiceToken(orderId, String(req.query.token ?? ""))) return null;
  const [order] = await db.select().from(billingOrders).where(eq(billingOrders.orderId, orderId));
  return order ?? null;
}

async function payView(order: Order) {
  const invoice = await buildInvoice(order);
  const dueAt = new Date(order.createdAt.getTime() + PAYMENT_WINDOW_MS);
  const ins = (order.paymentInstruction ?? null) as PayInstruction | null;
  let instruction: Record<string, unknown> | null = null;
  if (ins && order.status === "pending") {
    const { qrString, midOrderId: _mid, ...rest } = ins;
    void _mid;
    let qr: string | null = null;
    if (qrString) {
      const svg = await QRCode.toString(qrString, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
      qr = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    }
    instruction = { ...rest, qr };
  }
  return {
    orderId: order.orderId, plan: order.planName, boothCount: invoice.boothCount, periodDays: order.periodDays, amount: Math.round(Number(order.amount)),
    status: order.status, dueAt: dueAt.toISOString(), provider: order.provider,
    methods: PAY_METHODS.map(({ id, label, hint, kind }) => ({ id, label, hint, kind })),
    instruction,
  };
}

const NOT_FOUND = { error: "Tautan pembayaran tidak ditemukan atau tidak valid" };
const attempts = new Map<string, { n: number; at: number }>();
const tooMany = (orderId: string) => {
  const a = attempts.get(orderId);
  const fresh = !!a && Date.now() - a.at < 60_000;
  attempts.set(orderId, { n: fresh ? a!.n + 1 : 1, at: fresh ? a!.at : Date.now() });
  if (attempts.size > 500) attempts.clear();
  return fresh && a!.n >= 8;
};
const midtransCfg = async () => {
  const gw = await loadGateway("midtrans");
  return gw.secretKey ? { serverKey: gw.secretKey, production: gw.environment === "production" } : null;
};
const suffix = () => crypto.randomBytes(2).toString("hex").toUpperCase();
const TYPE_OF: Record<string, string> = { qris: "qris", mandiri: "echannel", alfamart: "cstore", indomaret: "cstore" };

async function payParties(order: Order) {
  const [[tenant], [admin]] = await Promise.all([
    db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, order.tenantId)),
    db.select({ email: admins.email }).from(admins).where(eq(admins.tenantId, order.tenantId)).limit(1),
  ]);
  return { name: tenant?.name ?? "Tenant", email: admin?.email ?? "billing@studiodo.id" };
}
const itemName = (o: Order) => `${o.planName} · ${o.boothCount} booth (${o.periodDays} hari)`;

// GET /api/public/billing/pay/:orderId?token=…
publicInvoiceRouter.get("/billing/pay/:orderId", async (req, res) => {
  const order = await payOrder(req);
  if (!order) return res.status(404).json(NOT_FOUND);
  res.set("Cache-Control", "no-store");
  res.json(await payView(order));
});

// POST /api/public/billing/pay/:orderId/charge?token=…  { method } — pick (or switch) the payment method
publicInvoiceRouter.post("/billing/pay/:orderId/charge", async (req, res) => {
  const order = await payOrder(req);
  if (!order) return res.status(404).json(NOT_FOUND);
  if (order.status !== "pending" || order.provider !== "midtrans") return res.status(409).json({ error: "Order ini sudah tidak bisa dibayar. Buat pembayaran baru." });
  if (tooMany(order.orderId)) return res.status(429).json({ error: "Terlalu sering mengganti metode. Tunggu sebentar." });
  const method = req.body?.method;
  if (!isPayMethod(method)) return res.status(400).json({ error: "Metode pembayaran tidak dikenal" });
  const cfg = await midtransCfg();
  if (!cfg) return res.status(503).json({ error: "Pembayaran online belum diaktifkan. Hubungi admin STUDIODO." });

  const who = await payParties(order);
  const prev = (order.paymentInstruction ?? null) as PayInstruction | null;
  try {
    const ins = await chargeMethod(cfg, method, {
      midOrderId: `${order.orderId}-${suffix()}`, grossAmount: Math.round(Number(order.amount)), itemName: itemName(order), customerEmail: who.email, customerName: who.name,
    });
    // Point the order at the new charge first, then cancel the old one: a late notice for the old charge is ignored (see the webhook).
    const [updated] = await db.update(billingOrders).set({ providerRef: ins.midOrderId, paymentInstruction: ins as unknown as Record<string, unknown>, paymentType: TYPE_OF[method] ?? "bank_transfer" }).where(eq(billingOrders.id, order.id)).returning();
    if (prev?.midOrderId) void cancelCharge(cfg, prev.midOrderId);
    logEvent({ tenantId: order.tenantId, category: "billing", action: "pay.method_chosen", message: `${order.orderId}: metode ${method}`, actorType: "tenant_admin", actorLabel: who.email });
    res.json(await payView(updated));
  } catch (e) {
    logEvent({ tenantId: order.tenantId, level: "warning", category: "billing", action: "pay.charge_failed", message: `${order.orderId} (${method}): ${e instanceof Error ? e.message : String(e)}`.slice(0, 280), actorType: "system" });
    res.status(502).json({ error: e instanceof Error ? e.message : "Gagal membuat pembayaran" });
  }
});

// POST /api/public/billing/pay/:orderId/other?token=…  → { url } Midtrans' hosted page (cards and anything not listed above)
publicInvoiceRouter.post("/billing/pay/:orderId/other", async (req, res) => {
  const order = await payOrder(req);
  if (!order) return res.status(404).json(NOT_FOUND);
  if (order.status !== "pending" || order.provider !== "midtrans") return res.status(409).json({ error: "Order ini sudah tidak bisa dibayar. Buat pembayaran baru." });
  if (tooMany(order.orderId)) return res.status(429).json({ error: "Terlalu sering mengganti metode. Tunggu sebentar." });
  const cfg = await midtransCfg();
  if (!cfg) return res.status(503).json({ error: "Pembayaran online belum diaktifkan. Hubungi admin STUDIODO." });
  const who = await payParties(order);
  const prev = (order.paymentInstruction ?? null) as PayInstruction | null;
  try {
    const midOrderId = `${order.orderId}-${suffix()}`;
    const base = portalBaseUrl();
    const snap = await createSnapTransaction(cfg, {
      orderId: midOrderId, grossAmount: Math.round(Number(order.amount)), itemName: itemName(order), customerEmail: who.email, customerName: who.name,
      finishUrl: `${base}/portal/tagihan?status=selesai`, unfinishUrl: `${base}/portal/tagihan?status=belum`, errorUrl: `${base}/portal/tagihan?status=gagal`,
    });
    await db.update(billingOrders).set({ providerRef: midOrderId, snapToken: snap.token, paymentInstruction: null }).where(eq(billingOrders.id, order.id));
    if (prev?.midOrderId) void cancelCharge(cfg, prev.midOrderId);
    res.json({ url: snap.redirectUrl });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : "Gagal membuka halaman pembayaran" });
  }
});

// POST /api/public/billing/pay/:orderId/check?token=…  → asks Midtrans whether it was paid (the page polls this every few seconds)
const lastPayCheck = new Map<string, number>();
publicInvoiceRouter.post("/billing/pay/:orderId/check", async (req, res) => {
  const order = await payOrder(req);
  if (!order) return res.status(404).json(NOT_FOUND);
  if (order.status !== "pending") return res.json({ status: order.status });
  if (!order.providerRef) return res.json({ status: order.status }); // nothing charged yet
  if (Date.now() - (lastPayCheck.get(order.orderId) ?? 0) < 3000) return res.json({ status: order.status });
  lastPayCheck.set(order.orderId, Date.now());
  if (lastPayCheck.size > 500) lastPayCheck.clear();
  try {
    const out = await reconcileOrder(order);
    res.json({ status: out.status });
  } catch {
    res.json({ status: order.status });
  }
});
