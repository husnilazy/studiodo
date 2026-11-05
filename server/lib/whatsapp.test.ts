import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../db/client.js", () => ({ db: {}, client: { end: async () => undefined } }));

let wa: typeof import("./whatsapp.js");
let box: typeof import("./secretBox.js");
beforeAll(async () => {
  process.env.JWT_SECRET = "unit-test-secret";
  wa = await import("./whatsapp.js");
  box = await import("./secretBox.js");
});

const row = (over: Record<string, unknown> = {}) => ({ waProvider: "fonnte", waTokenEnc: box.encryptSecret("tok-123456789"), waWebhookKeyEnc: null, ...over }) as never;

describe("token handling (write-only)", () => {
  it("stores the token encrypted and never in plain text", () => {
    const r = wa.sanitizeWaPatch({ provider: "fonnte", token: "abcdefgh12345" });
    if ("error" in r) throw new Error(r.error);
    expect(r.values.waTokenEnc).toMatch(/^v1:/);
    expect(JSON.stringify(r.values)).not.toContain("abcdefgh12345");
  });
  it("a blank token keeps the stored one; clearToken wipes it and switches the provider off", () => {
    expect(wa.sanitizeWaPatch({ provider: "fonnte", token: "   " })).toEqual({ values: { waProvider: "fonnte" } });
    expect(wa.sanitizeWaPatch({ clearToken: true })).toEqual({ values: { waTokenEnc: null, waProvider: "none" } });
  });
  it("rejects unknown providers and malformed tokens", () => {
    expect(wa.sanitizeWaPatch({ provider: "carrier-pigeon" })).toHaveProperty("error");
    expect(wa.sanitizeWaPatch({ token: "short" })).toHaveProperty("error");
    expect(wa.sanitizeWaPatch({ token: "has space inside" })).toHaveProperty("error");
  });
  it("the public status never contains the token or its ciphertext", () => {
    const status = wa.publicWaStatus(row());
    expect(status).toEqual({ provider: "fonnte", hasToken: true, hasWebhookKey: false, ready: true });
    expect(JSON.stringify(status)).not.toMatch(/tok-123|v1:/);
  });
  it("is not ready without a token or with provider none", () => {
    expect(wa.buildWaConfig(row({ waTokenEnc: null }))).toBeNull();
    expect(wa.buildWaConfig(row({ waProvider: "none" }))).toBeNull();
    expect(wa.buildWaConfig(undefined)).toBeNull();
    expect(wa.buildWaConfig(row())).toEqual({ provider: "fonnte", token: "tok-123456789" });
  });
});

describe("webhook key", () => {
  it("accepts only the exact key", () => {
    const key = wa.newWebhookKey();
    const r = row({ waWebhookKeyEnc: box.encryptSecret(key) });
    expect(wa.webhookKeyMatches(r, key)).toBe(true);
    expect(wa.webhookKeyMatches(r, key + "x")).toBe(false);
    expect(wa.webhookKeyMatches(r, "")).toBe(false);
    expect(wa.webhookKeyMatches(row(), key)).toBe(false);
  });
});

describe("sending", () => {
  const cfg = { provider: "fonnte" as const, token: "tok-123456789" };
  it("posts the normalized number with the token in the Authorization header", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: true, id: ["abc"] }), { status: 200 }));
    const r = await wa.sendWhatsapp(cfg, "0877-7737-3108", "Halo", fetchMock as never);
    expect(r).toEqual({ ok: true, providerId: "abc" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.fonnte.com/send");
    expect((init.headers as Record<string, string>).Authorization).toBe("tok-123456789");
    expect(String(init.body)).toContain("target=6287777373108");
  });
  it("reports the gateway's reason when it refuses", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: false, reason: "device disconnect" }), { status: 200 }));
    expect(await wa.sendWhatsapp(cfg, "0877-7737-3108", "Halo", fetchMock as never)).toEqual({ ok: false, error: "device disconnect" });
  });
  it("never throws when the gateway is down, and rejects bad input before calling it", async () => {
    const down = vi.fn(async () => { throw new Error("ECONNREFUSED"); });
    expect(await wa.sendWhatsapp(cfg, "0877-7737-3108", "Halo", down as never)).toMatchObject({ ok: false });
    const never = vi.fn();
    expect(await wa.sendWhatsapp(cfg, "abc", "Halo", never as never)).toMatchObject({ ok: false });
    expect(await wa.sendWhatsapp(cfg, "0877-7737-3108", "  ", never as never)).toMatchObject({ ok: false });
    expect(never).not.toHaveBeenCalled();
  });
});

describe("inbound webhook parsing", () => {
  it("reads sender and text, normalizing the number", () => {
    expect(wa.parseInbound({ sender: "6287777373108", message: " Halo ka ", name: "Dika" })).toEqual({ phone: "6287777373108", text: "Halo ka", name: "Dika" });
    expect(wa.parseInbound({ from: "0877-7737-3108", text: "ok" })).toMatchObject({ phone: "6287777373108" });
  });
  it("ignores group messages, empty bodies and junk", () => {
    expect(wa.parseInbound({ sender: "6287777373108", message: "hi", member: "628111" })).toBeNull();
    expect(wa.parseInbound({ sender: "6287777373108", message: "" })).toBeNull();
    expect(wa.parseInbound({ message: "no sender" })).toBeNull();
    expect(wa.parseInbound(null)).toBeNull();
    expect(wa.parseInbound("string")).toBeNull();
  });
});
