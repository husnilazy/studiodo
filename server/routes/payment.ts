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
    demoMode: process.env.PAYMENT_DEMO_MODE === "true" && !secretKey,
  };
}

async function createXenditQrisInvoice(externalId: string, amount: number, secretKey: string) {
  const callbackUrl = process.env.XENDIT_CALLBACK_URL
    ?? `${process.env.PUBLIC_BASE_URL ?? "http://localhost:4050"}/api/payment/webhook/xendit`;
  const res = await fetch("https://api.xendit.co/qr_codes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + Buffer.from(`${secretKey}:`).toString("base64"),
    },
    body: JSON.stringify({
      external_id: externalId,
      type: "DYNAMIC",
      callback_url: callbackUrl,
      currency: "IDR",
      amount,
    }),
  });
  if (!res.ok) {
    throw new Error(`Xendit error: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as { id: string; qr_string: string };
}

async function getPrintingConfig() {
  const [config] = await db.select({ enabled: boothConfig.additionalPrintEnabled, price: boothConfig.additionalPrintPrice, max: boothConfig.additionalPrintMax })
    .from(boothConfig).where(eq(boothConfig.boothId, "default"));
  return { enabled: config?.enabled ?? true, price: Number(config?.price ?? 15000), max: config?.max ?? 5 };
}

async function completeAdditionalPrintPayment(sessionId: string) {
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session || session.additionalPrintsPending <= 0) return;
  const count = session.additionalPrintsPending;
  const amount = Number(session.totalAmount ?? 0) + count * Number((await getPrintingConfig()).price);
  await db.update(sessions).set({
    additionalPrintsPaid: session.additionalPrintsPaid + count,
    additionalPrintsPending: 0,
    totalAmount: amount.toFixed(2),
    paymentStatus: "success",
    paymentPurpose: "session",
  }).where(eq(sessions.id, sessionId));
}

// POST /api/payment/qris  { sessionId }
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
    await db.update(sessions).set({ paymentMethod: "qris", paymentStatus: "pending" }).where(eq(sessions.id, sessionId));
    setTimeout(async () => {
      await db
        .update(sessions)
        .set({ paymentStatus: "success", paymentMethod: "qris" })
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
      .set({ xenditInvoiceId: invoice.id, paymentMethod: "qris", paymentStatus: "pending" })
      .where(eq(sessions.id, sessionId));
    return res.json({ demo: false, qrString: invoice.qr_string, invoiceId: invoice.id });
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: "Gagal membuat invoice QRIS Xendit" });
  }
});

paymentRouter.post("/additional-print", async (req, res) => {
  const sessionId = String(req.body.sessionId ?? "");
  const quantity = Math.round(Number(req.body.quantity) || 0);
  const config = await getPrintingConfig();
  if (!sessionId || quantity < 1 || quantity > config.max || !config.enabled) return res.status(400).json({ error: "Permintaan print tambahan tidak valid" });
  const [session] = await db.select({ paymentStatus: sessions.paymentStatus, totalAmount: sessions.totalAmount }).from(sessions).where(eq(sessions.id, sessionId));
  if (!session || session.paymentStatus !== "success") return res.status(400).json({ error: "Sesi belum lunas" });
  const amount = quantity * config.price;
  await db.update(sessions).set({ additionalPrintsPending: quantity, paymentPurpose: "additional_print", paymentStatus: "pending" }).where(eq(sessions.id, sessionId));
  const xendit = await getXenditConfig();
  if (xendit.demoMode) {
    setTimeout(() => completeAdditionalPrintPayment(sessionId).catch(console.error), 3000);
    return res.json({ demo: true, qrString: `DEMO-ADDITIONAL-${sessionId}-${Date.now()}`, expiresInSeconds: 3, amount });
  }
  if (!xendit.secretKey) {
    await db.update(sessions).set({ additionalPrintsPending: 0, paymentPurpose: "session", paymentStatus: "success" }).where(eq(sessions.id, sessionId));
    return res.status(503).json({ error: "Xendit Secret Key belum dikonfigurasi" });
  }
  try {
    const invoice = await createXenditQrisInvoice(`${sessionId}-additional-${Date.now()}`, amount, xendit.secretKey);
    await db.update(sessions).set({ xenditInvoiceId: invoice.id }).where(eq(sessions.id, sessionId));
    return res.json({ demo: false, qrString: invoice.qr_string, invoiceId: invoice.id, amount });
  } catch (error) {
    await db.update(sessions).set({ additionalPrintsPending: 0, paymentPurpose: "session", paymentStatus: "success" }).where(eq(sessions.id, sessionId));
    console.error(error);
    return res.status(502).json({ error: "Gagal membuat invoice print tambahan" });
  }
});

// GET /api/payment/status/:sessionId — polled by kiosk while waiting for payment
paymentRouter.get("/status/:sessionId", async (req, res) => {
  const [session] = await db
    .select({ paymentStatus: sessions.paymentStatus, additionalPrintsPaid: sessions.additionalPrintsPaid, additionalPrintsPending: sessions.additionalPrintsPending })
    .from(sessions)
    .where(eq(sessions.id, req.params.sessionId));
  if (!session) return res.status(404).json({ error: "Sesi tidak ditemukan" });
  res.json({ status: session.paymentStatus, additionalPrintsPaid: session.additionalPrintsPaid, additionalPrintsPending: session.additionalPrintsPending });
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
  const [session] = await db.select({ totalAmount: sessions.totalAmount, packageId: sessions.packageId }).from(sessions).where(eq(sessions.id, sessionId));
  if (!session) return res.status(404).json({ error: "Sesi tidak ditemukan" });

  if (voucher.voucherType === "cash") {
    const cashAmount = Number(voucher.cashAmount ?? 0);
    const sessionAmount = Number(session.totalAmount ?? 0);
    if (cashAmount < sessionAmount) return res.status(400).json({ error: `Nominal invoice cash kurang. Total sesi Rp ${sessionAmount.toLocaleString("id-ID")}.` });
    await db.update(vouchers).set({ usedCount: voucher.usedCount + 1, active: false }).where(eq(vouchers.id, voucher.id));
    await db.update(sessions).set({ paymentStatus: "success", paymentMethod: "cash", voucherCode: voucher.code }).where(eq(sessions.id, sessionId));
    return res.json({ valid: true, amount: sessionAmount, discount: 0, cash: true, invoiceNumber: voucher.invoiceNumber });
  }

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
  const externalId = event?.reference_id
    ?? event?.external_id
    ?? event?.data?.reference_id
    ?? event?.data?.external_id;
  const status = String(event?.status ?? event?.data?.status ?? "").toUpperCase();
  const sessionId = String(externalId ?? "").split("-additional-")[0];
  if (sessionId && ["SUCCEEDED", "COMPLETED", "PAID", "SETTLED"].includes(status)) {
    const [session] = await db.select({ paymentPurpose: sessions.paymentPurpose }).from(sessions).where(eq(sessions.id, sessionId));
    if (session?.paymentPurpose === "additional_print") await completeAdditionalPrintPayment(sessionId);
    else await db.update(sessions).set({ paymentStatus: "success" }).where(eq(sessions.id, sessionId));
  }
  res.status(200).end();
});
