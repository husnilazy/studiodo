import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { billingOrders } from "../db/schema.js";
import QRCode from "qrcode";
import { buildInvoice, PAYMENT_WINDOW_MS, verifyInvoiceToken } from "../lib/invoice.js";
import { reconcileOrder } from "../lib/billing.js";

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

// --- STUDIODO's own payment page (QRIS). Same signed link as the invoice; it opens exactly that one order. ---

async function payOrder(req: import("express").Request) {
  const orderId = String(req.params.orderId);
  if (!verifyInvoiceToken(orderId, String(req.query.token ?? ""))) return null;
  const [order] = await db.select().from(billingOrders).where(eq(billingOrders.orderId, orderId));
  return order ?? null;
}

// GET /api/public/billing/pay/:orderId?token=…  → what the page draws: amount, status, the QR as an SVG data URL
publicInvoiceRouter.get("/billing/pay/:orderId", async (req, res) => {
  const order = await payOrder(req);
  if (!order) return res.status(404).json({ error: "Tautan pembayaran tidak ditemukan atau tidak valid" });
  const invoice = await buildInvoice(order);
  const dueAt = new Date(order.createdAt.getTime() + PAYMENT_WINDOW_MS);
  let qr: string | null = null;
  if (order.status === "pending" && order.qrString) {
    const svg = await QRCode.toString(order.qrString, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    qr = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  }
  res.set("Cache-Control", "no-store");
  res.json({ orderId: order.orderId, plan: order.planName, boothCount: invoice.boothCount, periodDays: order.periodDays, amount: Math.round(Number(order.amount)), status: order.status, dueAt: dueAt.toISOString(), paymentMethod: invoice.paymentMethod, qr });
});

// POST /api/public/billing/pay/:orderId/check?token=…  → asks Midtrans whether it was paid (the page polls this every few seconds)
const lastPayCheck = new Map<string, number>();
publicInvoiceRouter.post("/billing/pay/:orderId/check", async (req, res) => {
  const order = await payOrder(req);
  if (!order) return res.status(404).json({ error: "Tautan pembayaran tidak ditemukan atau tidak valid" });
  if (order.status !== "pending") return res.json({ status: order.status });
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
