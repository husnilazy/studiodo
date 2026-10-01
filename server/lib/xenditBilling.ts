import crypto from "node:crypto";
import type { OrderOutcome } from "./midtrans.js";

// Xendit Invoice client for STUDIODO's own subscription billing — a platform account, separate from each
// tenant's own Xendit credentials used for kiosk sales (routes/payment.ts). Credentials come from
// lib/gateways.ts; nothing here reads process.env.

export type XenditCfg = { secretKey: string };

const API = "https://api.xendit.co";
const basicAuth = (cfg: XenditCfg) => `Basic ${Buffer.from(`${cfg.secretKey}:`).toString("base64")}`;

export async function createXenditInvoice(
  cfg: XenditCfg,
  input: { orderId: string; amount: number; description: string; customerEmail: string; finishUrl?: string },
): Promise<{ invoiceId: string; redirectUrl: string }> {
  const res = await fetch(`${API}/v2/invoices`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: basicAuth(cfg) },
    body: JSON.stringify({
      external_id: input.orderId,
      amount: input.amount,
      currency: "IDR",
      description: input.description.slice(0, 200),
      payer_email: input.customerEmail,
      invoice_duration: 24 * 60 * 60, // seconds — an unpaid checkout link expires after a day
      ...(input.finishUrl ? { success_redirect_url: input.finishUrl } : {}),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; invoice_url?: string; message?: string };
  if (!res.ok || !body.id || !body.invoice_url) throw new Error(body.message || `Xendit menolak permintaan (HTTP ${res.status})`);
  return { invoiceId: body.id, redirectUrl: body.invoice_url };
}

/** Lists one invoice: 200 → key valid, 401 → invalid, 403 → valid key but without invoice permission. */
export async function testXendit(cfg: XenditCfg): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`${API}/v2/invoices?limit=1`, { headers: { Authorization: basicAuth(cfg) }, signal: AbortSignal.timeout(15_000) });
    if (res.status === 200) return { ok: true, message: "Kunci valid dan bisa membaca invoice." };
    if (res.status === 401) return { ok: false, message: "Kunci ditolak Xendit. Periksa Secret Key (dan pastikan bukan kunci Public)." };
    if (res.status === 403) return { ok: false, message: "Kunci valid tetapi belum punya izin Invoice. Aktifkan izin Invoices (Write) di Xendit." };
    return { ok: false, message: `Respons tak terduga dari Xendit (HTTP ${res.status}).` };
  } catch (e) {
    return { ok: false, message: `Tidak dapat menghubungi Xendit: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export type XenditInvoiceCallback = {
  id?: string;
  external_id?: string;
  status?: string;
  amount?: number | string;
  paid_amount?: number | string;
  payment_method?: string;
  payment_channel?: string;
};

/** Xendit authenticates invoice callbacks with a static token in the x-callback-token header. */
export function verifyCallbackToken(expected: string, received: string | undefined): boolean {
  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function outcomeFromInvoice(cb: XenditInvoiceCallback): OrderOutcome {
  switch ((cb.status ?? "").toUpperCase()) {
    case "PAID":
    case "SETTLED":
      return "paid";
    case "EXPIRED":
      return "expired";
    case "FAILED":
      return "failed";
    default:
      return "pending";
  }
}
