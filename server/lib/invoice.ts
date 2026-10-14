import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { admins, billingOrders, siteContent, tenants } from "../db/schema.js";
import { signEmailToken, verifyEmailToken } from "./emailTokens.js";
import { portalBaseUrl } from "./urls.js";

// Invoices for subscription payments. There is no separate invoice table: a billing_orders row IS the invoice
// (its order id is the invoice number), so what the tenant sees can never drift from what was charged.

type Order = typeof billingOrders.$inferSelect;

export type InvoiceStatus = "paid" | "pending" | "failed" | "expired";

export type InvoiceView = {
  invoiceNumber: string;
  status: InvoiceStatus;
  issuedAt: string;
  paidAt: string | null;
  dueAt: string | null; // pending only: when the gateway's payment page stops accepting payment
  paymentMethod: string | null; // human label, e.g. "QRIS"
  provider: string;
  seller: { name: string; company: string; email: string | null; whatsapp: string | null; website: string };
  customer: { businessName: string; ownerName: string | null; email: string | null; city: string | null; address: string | null };
  plan: string;
  periodDays: number;
  booths: string[]; // labels of the booths this payment covers
  boothCount: number;
  unitPrice: number; // list price per booth for the period (before the volume/negotiated discount)
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  total: number;
  payUrl: string | null; // gateway payment page, only while still payable
};

/** Midtrans' Snap page accepts payment for 24h by default; Xendit invoices are created with the same window. */
export const PAYMENT_WINDOW_MS = 24 * 60 * 60 * 1000;
export const INVOICE_LINK_TTL_MS = 400 * 24 * 60 * 60 * 1000;

const METHOD_LABEL: Record<string, string> = {
  qris: "QRIS", gopay: "GoPay", shopeepay: "ShopeePay", bank_transfer: "Transfer bank (Virtual Account)", echannel: "Mandiri Bill",
  credit_card: "Kartu kredit/debit", cstore: "Gerai (Alfamart/Indomaret)", akulaku: "Akulaku", dana: "DANA",
  BANK_TRANSFER: "Transfer bank (Virtual Account)", EWALLET: "E-wallet", QR_CODE: "QRIS", CREDIT_CARD: "Kartu kredit/debit", RETAIL_OUTLET: "Gerai retail",
};
export const methodLabel = (type: string | null | undefined) => (type ? METHOD_LABEL[type] ?? type.replaceAll("_", " ") : null);

/** Pure: split a charged total back into list price, discount and per-booth price. */
export function priceBreakdown(total: number, discountPercent: number, boothCount: number) {
  const pct = Math.min(99, Math.max(0, discountPercent));
  const subtotal = pct > 0 ? Math.round(total / (1 - pct / 100)) : total;
  const booths = Math.max(1, boothCount);
  return { subtotal, discountAmount: subtotal - total, unitPrice: Math.round(subtotal / booths) };
}

export const invoiceToken = (orderId: string) => signEmailToken("invoice", orderId, "", INVOICE_LINK_TTL_MS);
export const verifyInvoiceToken = (orderId: string, token: string) => {
  const v = verifyEmailToken(token, "invoice");
  return v.ok && v.subjectId === orderId;
};
/** Link that opens the invoice without logging in — the one placed in emails. */
export const invoiceUrl = (orderId: string) => `${portalBaseUrl()}/invoice/${encodeURIComponent(orderId)}?t=${encodeURIComponent(invoiceToken(orderId))}`;

async function sellerInfo(): Promise<InvoiceView["seller"]> {
  const [row] = await db.select({ data: siteContent.data }).from(siteContent).where(eq(siteContent.key, "site"));
  const d = (row?.data ?? {}) as Record<string, unknown>;
  const wa = String(d.whatsappNumber ?? "").replace(/\D/g, "");
  return { name: "STUDIODO", company: "Frameless Creative", email: String(d.supportEmail ?? "").trim() || null, whatsapp: wa || null, website: portalBaseUrl().replace(/^https?:\/\//, "") };
}

export async function buildInvoice(order: Order): Promise<InvoiceView> {
  const [[tenant], [admin], seller] = await Promise.all([
    db.select({ name: tenants.name, ownerName: tenants.ownerName, city: tenants.city, address: tenants.address }).from(tenants).where(eq(tenants.id, order.tenantId)),
    db.select({ email: admins.email }).from(admins).where(eq(admins.tenantId, order.tenantId)).limit(1),
    sellerInfo(),
  ]);
  const total = Math.round(Number(order.amount));
  const boothCount = order.boothCount ?? Math.max(1, order.items.length);
  const { subtotal, discountAmount, unitPrice } = priceBreakdown(total, order.discountPercent ?? 0, boothCount);
  const dueAt = new Date(order.createdAt.getTime() + PAYMENT_WINDOW_MS);
  const status = order.status as InvoiceStatus;
  const payable = status === "pending" && dueAt.getTime() > Date.now() && !!order.redirectUrl;
  return {
    invoiceNumber: order.orderId,
    status,
    issuedAt: order.createdAt.toISOString(),
    paidAt: order.paidAt ? order.paidAt.toISOString() : null,
    dueAt: status === "pending" ? dueAt.toISOString() : null,
    paymentMethod: methodLabel(order.paymentType),
    provider: order.provider,
    seller,
    customer: { businessName: tenant?.name ?? "—", ownerName: tenant?.ownerName ?? null, email: admin?.email ?? null, city: tenant?.city ?? null, address: tenant?.address ?? null },
    plan: order.planName,
    periodDays: order.periodDays,
    booths: order.items.map((i, n) => i.label?.trim() || `Booth ${n + 1}`),
    boothCount,
    unitPrice, subtotal, discountPercent: order.discountPercent ?? 0, discountAmount, total,
    payUrl: payable ? order.redirectUrl : null,
  };
}
