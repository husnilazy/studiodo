import { Router } from "express";
import { db } from "../db/client.js";
import { boothConfig, sessions, vouchers } from "../db/schema.js";
import { eq } from "drizzle-orm";

export const paymentRouter = Router();

async function getXenditConfig() {
  const [config] = await db
    .select({ secretKey: boothConfig.xenditSecretKey, webhookToken: boothConfig.xenditWebhookToken })
    .from(boothConfig)
    .where(eq(boothConfig.boothId, "default"));
  const secretKey = config?.secretKey ?? process.env.XENDIT_SECRET_KEY;
  return {
    secretKey,
    webhookToken: config?.webhookToken ?? process.env.XENDIT_WEBHOOK_TOKEN,
    // A saved production key always takes precedence over the local demo flag.
    demoMode: process.env.PAYMENT_DEMO_MODE === "true" && !secretKey,
  };
}

async function createXenditQrisInvoice(sessionId: string, amount: number, secretKey: string) {
  const res = await fetch("https://api.xendit.co/qr_codes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + Buffer.from(`${secretKey}:`).toString("base64"),
    },
    body: JSON.stringify({
      reference_id: sessionId,
      type: "DYNAMIC",
      currency: "IDR",
      amount,
      channel_code: "ID_QRIS",
    }),
  });
  if (!res.ok) {
    throw new Error(`Xendit error: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as { id: string; qr_string: string };
}

// POST /api/payment/qris  { sessionId, amount }
paymentRouter.post("/qris", async (req, res) => {
  const { sessionId } = req.body as { sessionId: string };
  if (!sessionId) {
    return res.status(400).json({ error: "sessionId wajib diisi" });
  }
  const [session] = await db.select({ totalAmount: sessions.totalAmount }).from(sessions).where(eq(sessions.id, sessionId));
  const amount = Number(session?.totalAmount ?? 0);
  if (!session || amount <= 0) return res.status(400).json({ error: "Total pembayaran tidak valid" });

  const xendit = await getXenditConfig();
  if (xendit.demoMode) {
    setTimeout(async () => {
      await db
        .update(sessions)
        .set({ paymentStatus: "success" })
        .where(eq(sessions.id, sessionId));
    }, 5000);
    return res.json({
      demo: true,
      qrString: `DEMO-QRIS-${sessionId}`,
      expiresInSeconds: 5,
    });
  }
  if (!xendit.secretKey) {
    return res.status(503).json({ error: "Xendit Secret Key belum dikonfigurasi" });
  }

  try {
    const invoice = await createXenditQrisInvoice(sessionId, amount, xendit.secretKey);
    await db
      .update(sessions)
      .set({ xenditInvoiceId: invoice.id, paymentMethod: "qris" })
      .where(eq(sessions.id, sessionId));
    return res.json({ demo: false, qrString: invoice.qr_string, invoiceId: invoice.id });
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: "Gagal membuat invoice QRIS Xendit" });
  }
});

// GET /api/payment/status/:sessionId — polled by kiosk while waiting for payment
paymentRouter.get("/status/:sessionId", async (req, res) => {
  const [session] = await db
    .select({ paymentStatus: sessions.paymentStatus })
    .from(sessions)
    .where(eq(sessions.id, req.params.sessionId));
  if (!session) return res.status(404).json({ error: "Sesi tidak ditemukan" });
  res.json({ status: session.paymentStatus });
});

paymentRouter.post("/voucher", async (req, res) => {
  const { sessionId, code } = req.body as { sessionId: string; code: string };
  const normalizedCode = String(code ?? "").trim().toUpperCase();
  if (!sessionId || !normalizedCode) return res.status(400).json({ error: "sessionId dan code wajib diisi" });

  const [voucher] = await db.select().from(vouchers).where(eq(vouchers.code, normalizedCode));
  if (!voucher || !voucher.active) return res.status(404).json({ error: "Kode voucher tidak aktif" });
  const now = new Date();
  if ((voucher.startsAt && now < voucher.startsAt) || (voucher.expiresAt && now > voucher.expiresAt)) {
    return res.status(410).json({ error: "Voucher berada di luar periode aktif" });
  }
  if (voucher.maxUses !== null && voucher.usedCount >= voucher.maxUses) {
    return res.status(410).json({ error: "Kuota voucher sudah habis" });
  }
  const [session] = await db.select({ totalAmount: sessions.totalAmount }).from(sessions).where(eq(sessions.id, sessionId));
  if (!session) return res.status(404).json({ error: "Sesi tidak ditemukan" });

  const originalAmount = Number(session.totalAmount ?? 0);
  const discount = voucher.discountType === "free"
    ? originalAmount
    : voucher.discountType === "percent"
      ? originalAmount * Number(voucher.discountValue) / 100
      : Math.min(originalAmount, Number(voucher.discountValue));
  const amount = Math.max(0, Math.round(originalAmount - discount));

  await db.update(vouchers).set({ usedCount: voucher.usedCount + 1 }).where(eq(vouchers.id, voucher.id));
  await db.update(sessions).set({
    paymentStatus: amount === 0 ? "success" : "pending",
    paymentMethod: "voucher",
    voucherCode: voucher.code,
    totalAmount: amount.toFixed(2),
  }).where(eq(sessions.id, sessionId));
  res.json({ valid: true, amount, discount, voucherCode: voucher.code });
});

// Xendit webhook (for production mode)
paymentRouter.post("/webhook/xendit", async (req, res) => {
  const token = req.headers["x-callback-token"];
  const xendit = await getXenditConfig();
  if (!xendit.webhookToken || token !== xendit.webhookToken) {
    return res.status(401).end();
  }
  const event = req.body;
  const sessionId = event?.reference_id ?? event?.data?.reference_id;
  const status = String(event?.status ?? event?.data?.status ?? "").toUpperCase();
  if (sessionId && ["SUCCEEDED", "COMPLETED", "PAID", "SETTLED"].includes(status)) {
    await db.update(sessions).set({ paymentStatus: "success" }).where(eq(sessions.id, sessionId));
  }
  res.status(200).end();
});
