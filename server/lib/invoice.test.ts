import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../db/client.js", () => ({ db: {}, client: {} }));

let inv: typeof import("./invoice.js");
let mail: typeof import("./invoiceEmail.js");
beforeAll(async () => {
  process.env.JWT_SECRET = "invoice-test-secret";
  inv = await import("./invoice.js");
  mail = await import("./invoiceEmail.js");
});

const base = () => ({
  invoiceNumber: "SDO-ABC-123", status: "pending" as const, issuedAt: "2026-10-14T03:00:00.000Z", paidAt: null, dueAt: "2026-10-15T03:00:00.000Z",
  paymentMethod: null, provider: "midtrans",
  seller: { name: "STUDIODO", company: "Frameless Creative", email: "halo@studiodo.id", whatsapp: "6281234", website: "www.studiodo.id" },
  customer: { businessName: "Booth <Ceria>", ownerName: "Dina", email: "dina@example.com", city: "Bandung", address: null },
  plan: "Pro", periodDays: 30, booths: ["Mall A", "Mall B"], boothCount: 2, unitPrice: 500000, subtotal: 1000000, discountPercent: 10, discountAmount: 100000, total: 900000,
  payUrl: "https://app.sandbox.midtrans.com/snap/v4/redirection/abc",
});

describe("priceBreakdown", () => {
  it("splits a discounted total back into list price, discount and unit price", () => {
    expect(inv.priceBreakdown(900000, 10, 2)).toEqual({ subtotal: 1000000, discountAmount: 100000, unitPrice: 500000 });
  });
  it("is a no-op without discount and survives bad input", () => {
    expect(inv.priceBreakdown(750000, 0, 1)).toEqual({ subtotal: 750000, discountAmount: 0, unitPrice: 750000 });
    expect(inv.priceBreakdown(100, 200, 0).subtotal).toBeGreaterThan(0); // percent clamped, no divide-by-zero
  });
});

describe("methodLabel", () => {
  it("maps gateway codes to readable names", () => {
    expect(inv.methodLabel("qris")).toBe("QRIS");
    expect(inv.methodLabel("bank_transfer")).toContain("Virtual Account");
    expect(inv.methodLabel("some_new_type")).toBe("some new type");
    expect(inv.methodLabel(null)).toBeNull();
  });
});

describe("invoice link token", () => {
  it("opens only the order it was issued for", () => {
    const t = inv.invoiceToken("SDO-ABC-123");
    expect(inv.verifyInvoiceToken("SDO-ABC-123", t)).toBe(true);
    expect(inv.verifyInvoiceToken("SDO-OTHER-999", t)).toBe(false);
    expect(inv.verifyInvoiceToken("SDO-ABC-123", t.slice(0, -2) + "xx")).toBe(false);
    expect(inv.verifyInvoiceToken("SDO-ABC-123", "")).toBe(false);
  });
  it("is not valid as a different token purpose", async () => {
    const { verifyEmailToken } = await import("./emailTokens.js");
    expect(verifyEmailToken(inv.invoiceToken("SDO-ABC-123"), "reset-tenant").ok).toBe(false);
  });
});

describe("invoiceMail", () => {
  it("pending: shows total, pay button and due time; escapes business name", () => {
    const m = mail.invoiceMail(base(), "https://www.studiodo.id/invoice/SDO-ABC-123?t=x");
    expect(m.subject).toContain("menunggu pembayaran");
    expect(m.subject).toContain("900.000");
    expect(m.html).toContain("MENUNGGU PEMBAYARAN");
    expect(m.html).toContain("Bayar sekarang");
    expect(m.html).toContain("Booth &lt;Ceria&gt;");
    expect(m.html).not.toContain("Booth <Ceria>");
    expect(m.html).toContain("Diskon 10%");
    expect(m.text).toContain("Bayar: https://app.sandbox.midtrans.com");
  });
  it("paid: shows LUNAS, method and paid time, and no pay button", () => {
    const m = mail.invoiceMail({ ...base(), status: "paid", paidAt: "2026-10-14T03:05:00.000Z", paymentMethod: "QRIS", dueAt: null, payUrl: null }, "https://x/invoice/1");
    expect(m.subject).toContain("Pembayaran diterima");
    expect(m.html).toContain("LUNAS");
    expect(m.html).toContain("QRIS");
    expect(m.html).not.toContain("Bayar sekarang");
  });
});
