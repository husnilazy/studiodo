import { Router } from "express";
import crypto from "node:crypto";
import { db } from "../db/client.js";
import { tenantSettings, sessions, vouchers, voucherRedemptions } from "../db/schema.js";
import { and, eq } from "drizzle-orm";
import { requireKioskAuth } from "../middleware/kioskAuth.js";
import { requireActiveSubscription } from "../middleware/requireActiveSubscription.js";

export const paymentRouter = Router();

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// No env-var fallback for Xendit credentials — unlike a single-tenant install,
// a shared env var here would mean every tenant without its own configured
// key/token implicitly shares one Xendit account and one webhook secret,
// letting any of them forge "payment succeeded" webhooks for the others.
// Each tenant must configure its own via Admin → Pembayaran QRIS Xendit.
async function getXenditConfig(tenantId: string) {
  const [config] = await db
    .select({ secretKey: tenantSettings.xenditSecretKey, webhookToken: tenantSettings.xenditWebhookToken })
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, tenantId));
  const secretKey = config?.secretKey ?? undefined;
  return {
    secretKey,
    webhookToken: config?.webhookToken ?? undefined,
    demoMode: process.env.PAYMENT_DEMO_MODE === "true" && !secretKey,
  };
}

async function createXenditQrisInvoice(tenantId: string, externalId: string, amount: number, secretKey: string) {
  // XENDIT_CALLBACK_URL, when set (e.g. an ngrok tunnel for local dev), is a
  // base URL up to ".../webhook/xendit" — the tenant-scoped path segment is
  // always appended, or Xendit's callback would hit a route that doesn't exist.
  const callbackBase = (process.env.XENDIT_CALLBACK_URL || `${process.env.PUBLIC_BASE_URL || "http://localhost:4050"}/api/payment/webhook/xendit`).replace(/\/$/, "");
  const callbackUrl = `${callbackBase}/${tenantId}`;
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

async function getPrintingConfig(tenantId: string) {
  const [config] = await db.select({ enabled: tenantSettings.additionalPrintEnabled, price: tenantSettings.additionalPrintPrice, max: tenantSettings.additionalPrintMax })
    .from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId));
  return { enabled: config?.enabled ?? true, price: Number(config?.price ?? 15000), max: config?.max ?? 5 };
}

// Shared by /voucher and /additional-print/voucher — the lookup, active-window,
// and quota checks are identical for both purposes; only what happens AFTER a
// voucher is found (which amount it's applied to, which session fields it
// touches) differs per caller.
type RedeemableVoucher = typeof vouchers.$inferSelect;
async function findRedeemableVoucher(tenantId: string, code: string): Promise<{ voucher: RedeemableVoucher } | { error: string; status: number }> {
  const normalizedCode = String(code ?? "").trim().toUpperCase();
  if (!normalizedCode) return { error: "Kode voucher wajib diisi", status: 400 };
  const [voucher] = await db.select().from(vouchers).where(and(eq(vouchers.code, normalizedCode), eq(vouchers.tenantId, tenantId)));
  if (!voucher || !voucher.active) return { error: "Kode voucher tidak aktif", status: 404 };
  const now = new Date();
  if ((voucher.startsAt && now < voucher.startsAt) || (voucher.expiresAt && now > voucher.expiresAt)) {
    return { error: "Voucher berada di luar periode aktif", status: 410 };
  }
  if (voucher.maxUses !== null && voucher.usedCount >= voucher.maxUses) {
    return { error: "Kuota voucher sudah habis", status: 410 };
  }
  return { voucher };
}

async function completeAdditionalPrintPayment(tenantId: string, sessionId: string) {
  const [session] = await db.select().from(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.tenantId, tenantId)));
  if (!session || session.additionalPrintsPending <= 0) return;
  const count = session.additionalPrintsPending;
  const amount = Number(session.totalAmount ?? 0) + count * Number((await getPrintingConfig(tenantId)).price);
  await db.update(sessions).set({
    additionalPrintsPaid: session.additionalPrintsPaid + count,
    additionalPrintsPending: 0,
    totalAmount: amount.toFixed(2),
    paymentStatus: "success",
    paymentPurpose: "session",
  }).where(and(eq(sessions.id, sessionId), eq(sessions.tenantId, tenantId)));
}

// POST /api/payment/qris  { sessionId }
paymentRouter.post("/qris", requireKioskAuth, requireActiveSubscription, async (req, res) => {
  const tenantId = req.tenantId!;
  const { sessionId } = req.body as { sessionId: string };
  if (!sessionId) {
    return res.status(400).json({ error: "sessionId wajib diisi" });
  }
  // Independent reads — run concurrently instead of paying two sequential
  // DB round-trips before we're even able to start the Xendit call.
  const [[session], xendit] = await Promise.all([
    db.select({ totalAmount: sessions.totalAmount }).from(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.tenantId, tenantId))),
    getXenditConfig(tenantId),
  ]);
  const amount = Number(session?.totalAmount ?? 0);
  if (!session || amount <= 0) return res.status(400).json({ error: "Total pembayaran tidak valid" });

  if (xendit.demoMode) {
    await db.update(sessions).set({ paymentMethod: "qris", paymentStatus: "pending" }).where(and(eq(sessions.id, sessionId), eq(sessions.tenantId, tenantId)));
    setTimeout(async () => {
      await db
        .update(sessions)
        .set({ paymentStatus: "success", paymentMethod: "qris" })
        .where(and(eq(sessions.id, sessionId), eq(sessions.tenantId, tenantId)));
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
    const invoice = await createXenditQrisInvoice(tenantId, sessionId, amount, xendit.secretKey);
    // The customer's QR only needs invoice.qr_string, already in hand — this
    // write is our own bookkeeping (and a resilience net: the webhook looks
    // the session up by id regardless, not by xenditInvoiceId), so it
    // doesn't need to block the response the kiosk is waiting on to render
    // the QR code.
    db.update(sessions)
      .set({ xenditInvoiceId: invoice.id, paymentMethod: "qris", paymentStatus: "pending" })
      .where(and(eq(sessions.id, sessionId), eq(sessions.tenantId, tenantId)))
      .catch((error) => console.error("[qris] Gagal mencatat xenditInvoiceId", error));
    return res.json({ demo: false, qrString: invoice.qr_string, invoiceId: invoice.id });
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: "Gagal membuat invoice QRIS Xendit" });
  }
});

paymentRouter.post("/additional-print", requireKioskAuth, requireActiveSubscription, async (req, res) => {
  const tenantId = req.tenantId!;
  const sessionId = String(req.body.sessionId ?? "");
  const quantity = Math.round(Number(req.body.quantity) || 0);
  const config = await getPrintingConfig(tenantId);
  if (!sessionId || quantity < 1 || quantity > config.max || !config.enabled) return res.status(400).json({ error: "Permintaan print tambahan tidak valid" });
  const [session] = await db.select({ paymentStatus: sessions.paymentStatus, totalAmount: sessions.totalAmount }).from(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.tenantId, tenantId)));
  // Split from a single shared check — a session-not-found-for-this-tenant
  // case and a genuinely-unpaid case used to return the exact same "Sesi
  // belum lunas" text, which made this message untrustworthy as a diagnosis
  // (confirmed live: an admin reported this error after a 100%-free voucher
  // that DOES correctly mark paymentStatus success, with no other code path
  // found that would leave it otherwise — the ambiguity itself was the bug
  // worth fixing regardless of which case actually fired).
  if (!session) return res.status(404).json({ error: "Sesi tidak ditemukan" });
  if (session.paymentStatus !== "success") return res.status(400).json({ error: "Sesi belum lunas" });
  const amount = quantity * config.price;
  await db.update(sessions).set({ additionalPrintsPending: quantity, paymentPurpose: "additional_print", paymentStatus: "pending" }).where(and(eq(sessions.id, sessionId), eq(sessions.tenantId, tenantId)));
  const xendit = await getXenditConfig(tenantId);
  if (xendit.demoMode) {
    setTimeout(() => completeAdditionalPrintPayment(tenantId, sessionId).catch(console.error), 3000);
    return res.json({ demo: true, qrString: `DEMO-ADDITIONAL-${sessionId}-${Date.now()}`, expiresInSeconds: 3, amount });
  }
  if (!xendit.secretKey) {
    await db.update(sessions).set({ additionalPrintsPending: 0, paymentPurpose: "session", paymentStatus: "success" }).where(and(eq(sessions.id, sessionId), eq(sessions.tenantId, tenantId)));
    return res.status(503).json({ error: "Xendit Secret Key belum dikonfigurasi" });
  }
  try {
    const invoice = await createXenditQrisInvoice(tenantId, `${sessionId}-additional-${Date.now()}`, amount, xendit.secretKey);
    await db.update(sessions).set({ xenditInvoiceId: invoice.id }).where(and(eq(sessions.id, sessionId), eq(sessions.tenantId, tenantId)));
    return res.json({ demo: false, qrString: invoice.qr_string, invoiceId: invoice.id, amount });
  } catch (error) {
    await db.update(sessions).set({ additionalPrintsPending: 0, paymentPurpose: "session", paymentStatus: "success" }).where(and(eq(sessions.id, sessionId), eq(sessions.tenantId, tenantId)));
    console.error(error);
    return res.status(502).json({ error: "Gagal membuat invoice print tambahan" });
  }
});

// POST /api/payment/additional-print/voucher — an alternative to QRIS for
// buying extra prints on the Hasil screen. Deliberately a SEPARATE endpoint
// from /voucher below rather than a mode flag on it — that handler writes
// straight into sessions.totalAmount for a partial-discount voucher, which
// must never happen here (it would silently corrupt the original session's
// already-paid total). This computes its own charge from quantity * printing
// price and never touches sessions.totalAmount directly — completeAdditionalPrintPayment
// (below) is the one place that adds the print charge onto the session's
// running total, identically to the QRIS path above.
paymentRouter.post("/additional-print/voucher", requireKioskAuth, requireActiveSubscription, async (req, res) => {
  const tenantId = req.tenantId!;
  const sessionId = String(req.body.sessionId ?? "");
  const code = String(req.body.code ?? "");
  const quantity = Math.round(Number(req.body.quantity) || 0);
  const config = await getPrintingConfig(tenantId);
  if (!sessionId || quantity < 1 || quantity > config.max || !config.enabled) return res.status(400).json({ error: "Permintaan print tambahan tidak valid" });

  const [session] = await db.select({ paymentStatus: sessions.paymentStatus }).from(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.tenantId, tenantId)));
  if (!session) return res.status(404).json({ error: "Sesi tidak ditemukan" });
  if (session.paymentStatus !== "success") return res.status(400).json({ error: "Sesi belum lunas" });

  const found = await findRedeemableVoucher(tenantId, code);
  if ("error" in found) return res.status(found.status).json({ error: found.error });
  const voucher = found.voucher;
  const chargeAmount = quantity * config.price;

  if (voucher.voucherType === "cash") {
    const cashAmount = Number(voucher.cashAmount ?? 0);
    if (cashAmount < chargeAmount) return res.status(400).json({ error: `Nominal invoice cash kurang. Total cetak tambahan Rp ${chargeAmount.toLocaleString("id-ID")}.` });
    await db.update(vouchers).set({ usedCount: voucher.usedCount + 1, active: false }).where(eq(vouchers.id, voucher.id));
    await db.update(sessions).set({ additionalPrintsPending: quantity }).where(and(eq(sessions.id, sessionId), eq(sessions.tenantId, tenantId)));
    await completeAdditionalPrintPayment(tenantId, sessionId);
    await db.insert(voucherRedemptions).values({
      tenantId, voucherId: voucher.id, sessionId, redemptionPurpose: "additional_print",
      originalAmount: chargeAmount.toFixed(2), discountAmount: "0.00", finalAmount: chargeAmount.toFixed(2),
    });
    return res.json({ valid: true, amount: 0, cash: true });
  }

  // No partial-then-QRIS-remainder flow exists for this charge (unlike the
  // main session, which can top up the rest via QRIS after a partial
  // discount) — building one is out of scope, so a discount voucher must
  // cover the full print charge or the customer is pointed at QRIS instead.
  const discount = voucher.discountType === "free"
    ? chargeAmount
    : voucher.discountType === "percent"
      ? chargeAmount * Number(voucher.discountValue) / 100
      : Math.min(chargeAmount, Number(voucher.discountValue));
  const remaining = Math.max(0, Math.round(chargeAmount - discount));
  if (remaining > 0) return res.status(400).json({ error: "Voucher ini tidak menutupi seluruh biaya cetak tambahan. Gunakan QRIS untuk melanjutkan." });

  await db.update(vouchers).set({ usedCount: voucher.usedCount + 1 }).where(eq(vouchers.id, voucher.id));
  await db.update(sessions).set({ additionalPrintsPending: quantity }).where(and(eq(sessions.id, sessionId), eq(sessions.tenantId, tenantId)));
  await completeAdditionalPrintPayment(tenantId, sessionId);
  await db.insert(voucherRedemptions).values({
    tenantId, voucherId: voucher.id, sessionId, redemptionPurpose: "additional_print",
    originalAmount: chargeAmount.toFixed(2), discountAmount: discount.toFixed(2), finalAmount: "0.00",
  });
  res.json({ valid: true, amount: 0 });
});

// GET /api/payment/status/:sessionId — polled by kiosk while waiting for payment
paymentRouter.get("/status/:sessionId", requireKioskAuth, async (req, res) => {
  const [session] = await db
    .select({ paymentStatus: sessions.paymentStatus, additionalPrintsPaid: sessions.additionalPrintsPaid, additionalPrintsPending: sessions.additionalPrintsPending })
    .from(sessions)
    .where(and(eq(sessions.id, String(req.params.sessionId)), eq(sessions.tenantId, req.tenantId!)));
  if (!session) return res.status(404).json({ error: "Sesi tidak ditemukan" });
  res.json({ status: session.paymentStatus, additionalPrintsPaid: session.additionalPrintsPaid, additionalPrintsPending: session.additionalPrintsPending });
});

paymentRouter.post("/voucher", requireKioskAuth, requireActiveSubscription, async (req, res) => {
  const tenantId = req.tenantId!;
  const { sessionId, code } = req.body as { sessionId: string; code: string };
  if (!sessionId || !String(code ?? "").trim()) return res.status(400).json({ error: "sessionId dan code wajib diisi" });

  const found = await findRedeemableVoucher(tenantId, code);
  if ("error" in found) return res.status(found.status).json({ error: found.error });
  const voucher = found.voucher;
  const [session] = await db.select({ totalAmount: sessions.totalAmount, packageId: sessions.packageId }).from(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.tenantId, tenantId)));
  if (!session) return res.status(404).json({ error: "Sesi tidak ditemukan" });

  if (voucher.voucherType === "cash") {
    const cashAmount = Number(voucher.cashAmount ?? 0);
    const sessionAmount = Number(session.totalAmount ?? 0);
    if (cashAmount < sessionAmount) return res.status(400).json({ error: `Nominal invoice cash kurang. Total sesi Rp ${sessionAmount.toLocaleString("id-ID")}.` });
    await db.update(vouchers).set({ usedCount: voucher.usedCount + 1, active: false }).where(eq(vouchers.id, voucher.id));
    await db.update(sessions).set({ paymentStatus: "success", paymentMethod: "cash", voucherCode: voucher.code }).where(and(eq(sessions.id, sessionId), eq(sessions.tenantId, tenantId)));
    await db.insert(voucherRedemptions).values({
      tenantId, voucherId: voucher.id, sessionId, redemptionPurpose: "session",
      originalAmount: sessionAmount.toFixed(2), discountAmount: "0.00", finalAmount: sessionAmount.toFixed(2),
    });
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
  }).where(and(eq(sessions.id, sessionId), eq(sessions.tenantId, tenantId)));
  await db.insert(voucherRedemptions).values({
    tenantId, voucherId: voucher.id, sessionId, redemptionPurpose: "session",
    originalAmount: originalAmount.toFixed(2), discountAmount: discount.toFixed(2), finalAmount: amount.toFixed(2),
  });
  res.json({ valid: true, amount, discount, voucherCode: voucher.code });
});

// Xendit webhook (for production mode) — one URL per tenant, registered by that tenant in their own Xendit dashboard
paymentRouter.post("/webhook/xendit/:tenantId", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const token = String(req.headers["x-callback-token"] ?? "");
  const xendit = await getXenditConfig(tenantId);
  if (!xendit.webhookToken || !timingSafeEqualStrings(token, xendit.webhookToken)) {
    return res.status(401).end();
  }
  const event = req.body;
  // The real "qr.payment" payload nests our external_id under qr_code.external_id
  // (confirmed against a live payment: { event, id, amount, qr_code: { external_id, ... },
  // status, payment_detail }) — Xendit's dashboard "Test and save" button sends a
  // flatter legacy shape with reference_id at the top level, so both are checked.
  const externalId = event?.qr_code?.external_id
    ?? event?.reference_id
    ?? event?.external_id
    ?? event?.data?.reference_id
    ?? event?.data?.external_id;
  const status = String(event?.status ?? event?.data?.status ?? "").toUpperCase();
  const sessionId = String(externalId ?? "").split("-additional-")[0];
  // Defense-in-depth beyond the token check above: a leaked/forged webhook
  // token shouldn't be enough to mark an underpaid session as fully paid.
  // Only enforced when the payload actually carries a parseable amount —
  // the exact field name isn't formally documented, and silently rejecting
  // a genuine payment because of a missed field would hurt real customers,
  // so an unparseable amount falls back to trusting the token check alone.
  const paidAmount = Number(event?.amount ?? event?.data?.amount ?? NaN);
  if (sessionId && ["SUCCEEDED", "COMPLETED", "PAID", "SETTLED"].includes(status)) {
    const [session] = await db.select({ paymentPurpose: sessions.paymentPurpose, tenantId: sessions.tenantId, totalAmount: sessions.totalAmount, additionalPrintsPending: sessions.additionalPrintsPending }).from(sessions).where(eq(sessions.id, sessionId));
    // Sanity check in addition to the token check above: the session must actually belong to this tenant.
    if (session?.tenantId === tenantId) {
      if (session.paymentPurpose === "additional_print") {
        const expected = session.additionalPrintsPending * (await getPrintingConfig(tenantId)).price;
        if (Number.isFinite(paidAmount) && paidAmount < expected) {
          console.warn(`[xendit-webhook] Jumlah dibayar (${paidAmount}) kurang dari cetak tambahan yang diharapkan (${expected}) untuk sesi ${sessionId}, diabaikan.`);
        } else {
          await completeAdditionalPrintPayment(tenantId, sessionId);
        }
      } else {
        const expected = Number(session.totalAmount ?? 0);
        if (Number.isFinite(paidAmount) && paidAmount < expected) {
          console.warn(`[xendit-webhook] Jumlah dibayar (${paidAmount}) kurang dari total sesi (${expected}) untuk sesi ${sessionId}, diabaikan.`);
        } else {
          await db.update(sessions).set({ paymentStatus: "success" }).where(and(eq(sessions.id, sessionId), eq(sessions.tenantId, tenantId)));
        }
      }
    }
  }
  res.status(200).end();
});
