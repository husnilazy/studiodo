import { afterEach, describe, expect, it, vi } from "vitest";
import { chargeQris } from "./midtrans.js";

const cfg = { serverKey: "SB-Mid-server-test", production: false };
const input = { orderId: "SDO-TEST-1", grossAmount: 449000, itemName: "Starter", customerEmail: "a@b.id", customerName: "Tenant" };

afterEach(() => vi.unstubAllGlobals());

describe("chargeQris", () => {
  it("sends a qris charge and returns the QR payload with the expiry read as WIB", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status_code: "201", qr_string: "000201010212", expiry_time: "2026-11-08 22:00:00" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await chargeQris(cfg, input);
    expect(out.qrString).toBe("000201010212");
    expect(out.expiresAt?.toISOString()).toBe("2026-11-08T15:00:00.000Z");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.sandbox.midtrans.com/v2/charge");
    const sent = JSON.parse(String(init.body));
    expect(sent.payment_type).toBe("qris");
    expect(sent.transaction_details).toEqual({ order_id: "SDO-TEST-1", gross_amount: 449000 });
  });

  it("throws when Midtrans refuses, so checkout can fall back to Snap", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status_code: "402", status_message: "Payment channel is not activated." }), { status: 200 })));
    await expect(chargeQris(cfg, input)).rejects.toThrow("not activated");
  });

  it("throws when no QR comes back", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status_code: "201" }), { status: 200 })));
    await expect(chargeQris(cfg, input)).rejects.toThrow("kode QRIS");
  });
});
