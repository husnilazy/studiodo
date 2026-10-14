import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { billingOrders } from "../db/schema.js";
import { buildInvoice, verifyInvoiceToken } from "../lib/invoice.js";

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
