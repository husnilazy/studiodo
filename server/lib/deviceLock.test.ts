import { describe, expect, it } from "vitest";
import { MAX_SELF_RESETS, RESET_WINDOW_MS, checkDeviceAccess, createAuthThrottle, hashDeviceToken, isValidDeviceId, newDeviceToken, resetAllowance } from "./deviceLock.js";

const DEV = "hw-1234567890abcdef";

describe("checkDeviceAccess", () => {
  const legacy = { boundDeviceId: DEV, deviceTokenHash: null };

  it("refuses a request that omits the device id, for any key (the old 'no header = pass' hole)", () => {
    for (const row of [legacy, { boundDeviceId: null, deviceTokenHash: null }, { boundDeviceId: DEV, deviceTokenHash: hashDeviceToken("t") }]) {
      expect(checkDeviceAccess(row, null, null)).toMatchObject({ ok: false, code: "device_required" });
    }
    expect(checkDeviceAccess(legacy, "short", null)).toMatchObject({ ok: false, code: "device_required" }); // malformed id
  });

  it("an unbound key cannot claim a computer just by being used", () => {
    expect(checkDeviceAccess({ boundDeviceId: null, deviceTokenHash: null }, DEV, null)).toMatchObject({ ok: false, code: "activation_required" });
  });

  it("only the bound computer passes", () => {
    expect(checkDeviceAccess(legacy, DEV, null)).toEqual({ ok: true }); // grandfathered, no secret yet
    expect(checkDeviceAccess(legacy, "other-device-0001", null)).toMatchObject({ ok: false, code: "kiosk_device_mismatch" });
  });

  it("once a device secret exists the device id alone is not enough", () => {
    const token = newDeviceToken();
    const row = { boundDeviceId: DEV, deviceTokenHash: hashDeviceToken(token) };
    expect(checkDeviceAccess(row, DEV, token)).toEqual({ ok: true });
    expect(checkDeviceAccess(row, DEV, null)).toMatchObject({ ok: false, code: "device_token_invalid" });
    expect(checkDeviceAccess(row, DEV, "wrong")).toMatchObject({ ok: false, code: "device_token_invalid" });
    expect(checkDeviceAccess(row, "other-device-0001", token)).toMatchObject({ ok: false, code: "kiosk_device_mismatch" });
  });
});

describe("device ids and tokens", () => {
  it("validates id shape", () => {
    expect(isValidDeviceId(DEV)).toBe(true);
    expect(isValidDeviceId("a b c d e f g h")).toBe(false);
    expect(isValidDeviceId("x".repeat(129))).toBe(false);
    expect(isValidDeviceId(undefined)).toBe(false);
  });
  it("tokens are random and stored only as a hash", () => {
    const a = newDeviceToken();
    expect(a).toHaveLength(64);
    expect(newDeviceToken()).not.toBe(a);
    expect(hashDeviceToken(a)).not.toContain(a);
  });
});

describe("resetAllowance", () => {
  const t0 = Date.UTC(2026, 9, 1);
  it("allows up to the cap inside the window, then refuses", () => {
    let r = resetAllowance(0, null, t0);
    expect(r).toMatchObject({ allowed: true, nextCount: 1 });
    r = resetAllowance(r.nextCount, r.nextWindowStart, t0 + 1000);
    expect(r).toMatchObject({ allowed: true, nextCount: 2 });
    r = resetAllowance(MAX_SELF_RESETS, r.nextWindowStart, t0 + 2000);
    expect(r.allowed).toBe(false);
  });
  it("starts a fresh window after 30 days", () => {
    const r = resetAllowance(MAX_SELF_RESETS, new Date(t0), t0 + RESET_WINDOW_MS + 1);
    expect(r).toMatchObject({ allowed: true, nextCount: 1 });
    expect(r.nextWindowStart.getTime()).toBe(t0 + RESET_WINDOW_MS + 1);
  });
});

describe("createAuthThrottle", () => {
  it("blocks an IP after too many failures and recovers after the window", () => {
    let now = 1000;
    const t = createAuthThrottle({ max: 3, windowMs: 60_000, now: () => now });
    for (let i = 0; i < 3; i++) { expect(t.blocked("1.1.1.1")).toBe(false); t.fail("1.1.1.1"); }
    expect(t.blocked("1.1.1.1")).toBe(true);
    expect(t.blocked("2.2.2.2")).toBe(false);
    now += 61_000;
    expect(t.blocked("1.1.1.1")).toBe(false);
  });
});
