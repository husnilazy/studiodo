import crypto from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.JWT_SECRET = "unit-test-secret-do-not-use";
  delete process.env.SETTINGS_ENCRYPTION_KEY;
  process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:1/test"; // never connected to: only pure functions are exercised
});

describe("secretBox", () => {
  it("round-trips and uses a fresh IV every time", async () => {
    const { encryptSecret, decryptSecret } = await import("./secretBox.js");
    const a = encryptSecret("Mid-server-abc123");
    const b = encryptSecret("Mid-server-abc123");
    expect(a).not.toBe(b);
    expect(a).not.toContain("abc123");
    expect(decryptSecret(a)).toBe("Mid-server-abc123");
    expect(decryptSecret(b)).toBe("Mid-server-abc123");
  });

  it("fails closed on tampering, garbage, and a changed master key", async () => {
    const { encryptSecret, decryptSecret } = await import("./secretBox.js");
    const enc = encryptSecret("top-secret-value");
    const parts = enc.split(":");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(decryptSecret(parts.join(":"))).toBeNull();
    expect(decryptSecret("not-a-valid-value")).toBeNull();
    expect(decryptSecret(null)).toBeNull();
    expect(decryptSecret("")).toBeNull();

    const original = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "a-different-secret";
    expect(decryptSecret(enc)).toBeNull(); // rotated secret → must re-enter, never garbage
    process.env.JWT_SECRET = original;
    expect(decryptSecret(enc)).toBe("top-secret-value");
  });

  it("masks to the last 4 characters only", async () => {
    const { maskedTail } = await import("./secretBox.js");
    expect(maskedTail("Mid-server-ABCDWXYZ")).toBe("WXYZ");
    expect(maskedTail("abc")).toBe("••••");
  });
});

describe("gateway configuration", () => {
  const env = (secretKey: string | null, webhookToken: string | null = null, production = false) => ({ secretKey, webhookToken, production });
  const row = async (over: Record<string, unknown>) => {
    const { encryptSecret } = await import("./secretBox.js");
    return {
      provider: "midtrans", enabled: true, priority: 10, environment: "sandbox", secretKeyEnc: null, secretKeyLast4: null, webhookTokenEnc: null,
      lastTestAt: null, lastTestOk: null, lastTestMessage: null, lastWebhookAt: null, lastWebhookResult: null, updatedBy: null, updatedAt: new Date(),
      ...over, ...(over.key ? { secretKeyEnc: encryptSecret(String(over.key)) } : {}), ...(over.token ? { webhookTokenEnc: encryptSecret(String(over.token)) } : {}),
    } as never;
  };

  it("legacy env-only setup works with no database row", async () => {
    const { mergeGatewayConfig, isUsable } = await import("./gateways.js");
    const cfg = mergeGatewayConfig("midtrans", undefined, env("SB-Mid-server-env"));
    expect(cfg.keySource).toBe("environment");
    expect(cfg.enabled).toBe(true);
    expect(isUsable(cfg)).toBe(true);
    expect(mergeGatewayConfig("midtrans", undefined, env(null)).enabled).toBe(false);
  });

  it("the admin's switch beats the environment, and a stored key beats the environment key", async () => {
    const { mergeGatewayConfig, isUsable } = await import("./gateways.js");
    const off = mergeGatewayConfig("midtrans", await row({ enabled: false, key: "SB-Mid-server-db" }), env("SB-Mid-server-env"));
    expect(isUsable(off)).toBe(false);
    const on = mergeGatewayConfig("midtrans", await row({ enabled: true, key: "SB-Mid-server-db" }), env("SB-Mid-server-env"));
    expect(on.secretKey).toBe("SB-Mid-server-db");
    expect(on.keySource).toBe("database");
  });

  it("an undecryptable stored key falls back to env instead of crashing", async () => {
    const { mergeGatewayConfig } = await import("./gateways.js");
    const cfg = mergeGatewayConfig("midtrans", await row({ secretKeyEnc: "v1:bad:bad:bad" }), env("SB-Mid-server-env"));
    expect(cfg.secretKey).toBe("SB-Mid-server-env");
  });

  it("Xendit is usable only with BOTH a key and a webhook token", async () => {
    const { mergeGatewayConfig, isUsable } = await import("./gateways.js");
    expect(isUsable(mergeGatewayConfig("xendit", await row({ provider: "xendit", key: "xnd_production_x1234567" }), env(null)))).toBe(false);
    expect(isUsable(mergeGatewayConfig("xendit", await row({ provider: "xendit", key: "xnd_production_x1234567", token: "tok-12345678" }), env(null)))).toBe(true);
  });

  it("orders usable gateways by priority, drops unusable ones, breaks ties by name", async () => {
    const { mergeGatewayConfig, orderGateways } = await import("./gateways.js");
    const mid = mergeGatewayConfig("midtrans", await row({ priority: 20, key: "SB-Mid-server-a" }), env(null));
    const xen = mergeGatewayConfig("xendit", await row({ provider: "xendit", priority: 10, key: "xnd_production_x1234567", token: "tok-12345678" }), env(null));
    expect(orderGateways([mid, xen]).map((g) => g.provider)).toEqual(["xendit", "midtrans"]); // lower number first
    const midOff = { ...mid, enabled: false };
    expect(orderGateways([midOff, xen]).map((g) => g.provider)).toEqual(["xendit"]);
    expect(orderGateways([midOff, { ...xen, enabled: false }])).toEqual([]); // → portal shows the WhatsApp fallback
    expect(orderGateways([{ ...mid, priority: 5 }, { ...xen, priority: 5 }]).map((g) => g.provider)).toEqual(["midtrans", "xendit"]);
  });
});

describe("Midtrans webhook verification", () => {
  const sig = (o: string, c: string, g: string, key: string) => crypto.createHash("sha512").update(o + c + g + key).digest("hex");

  it("accepts the right signature and rejects tampering", async () => {
    const { verifyNotificationSignature } = await import("./midtrans.js");
    const n = { order_id: "SDO-1", status_code: "200", gross_amount: "150000.00", signature_key: sig("SDO-1", "200", "150000.00", "KEY") };
    expect(verifyNotificationSignature("KEY", n)).toBe(true);
    expect(verifyNotificationSignature("OTHER", n)).toBe(false);
    expect(verifyNotificationSignature("KEY", { ...n, gross_amount: "1.00" })).toBe(false);
    expect(verifyNotificationSignature("KEY", { ...n, signature_key: "abc" })).toBe(false);
    expect(verifyNotificationSignature("KEY", { ...n, signature_key: undefined })).toBe(false);
  });

  it("maps statuses to outcomes (fraud challenge stays pending)", async () => {
    const { outcomeFromNotification } = await import("./midtrans.js");
    expect(outcomeFromNotification({ transaction_status: "settlement" })).toBe("paid");
    expect(outcomeFromNotification({ transaction_status: "capture", fraud_status: "accept" })).toBe("paid");
    expect(outcomeFromNotification({ transaction_status: "capture", fraud_status: "challenge" })).toBe("pending");
    expect(outcomeFromNotification({ transaction_status: "expire" })).toBe("expired");
    for (const s of ["deny", "cancel", "failure"]) expect(outcomeFromNotification({ transaction_status: s })).toBe("failed");
    expect(outcomeFromNotification({ transaction_status: "pending" })).toBe("pending");
    expect(outcomeFromNotification({})).toBe("pending");
  });
});

describe("Xendit webhook verification", () => {
  it("compares the callback token safely", async () => {
    const { verifyCallbackToken } = await import("./xenditBilling.js");
    expect(verifyCallbackToken("secret-token", "secret-token")).toBe(true);
    expect(verifyCallbackToken("secret-token", "secret-tokeN")).toBe(false);
    expect(verifyCallbackToken("secret-token", "short")).toBe(false);
    expect(verifyCallbackToken("secret-token", undefined)).toBe(false);
    expect(verifyCallbackToken("", "")).toBe(false); // an unset token must never validate an empty header
  });

  it("maps invoice statuses to outcomes", async () => {
    const { outcomeFromInvoice } = await import("./xenditBilling.js");
    expect(outcomeFromInvoice({ status: "PAID" })).toBe("paid");
    expect(outcomeFromInvoice({ status: "settled" })).toBe("paid");
    expect(outcomeFromInvoice({ status: "EXPIRED" })).toBe("expired");
    expect(outcomeFromInvoice({ status: "FAILED" })).toBe("failed");
    expect(outcomeFromInvoice({ status: "PENDING" })).toBe("pending");
    expect(outcomeFromInvoice({})).toBe("pending");
  });
});
