import { beforeAll, describe, expect, it } from "vitest";
import { passwordBind, signEmailToken, verifyEmailToken } from "./emailTokens.js";

beforeAll(() => { process.env.JWT_SECRET = "test-secret"; });

describe("emailTokens", () => {
  it("round-trips subject and binding", () => {
    const t = signEmailToken("verify-tenant", "abc", "a@b.com", 60_000);
    expect(verifyEmailToken(t, "verify-tenant")).toEqual({ ok: true, subjectId: "abc", bind: "a@b.com" });
  });
  it("rejects a token used for another purpose", () => {
    const t = signEmailToken("verify-tenant", "abc", "x", 60_000);
    expect(verifyEmailToken(t, "reset-tenant")).toEqual({ ok: false, reason: "wrong_purpose" });
  });
  it("rejects an expired token", () => {
    const t = signEmailToken("reset-creator", "abc", "x", 1000, 1_000);
    expect(verifyEmailToken(t, "reset-creator", 10_000)).toEqual({ ok: false, reason: "expired" });
  });
  it("rejects tampering with payload or signature, and garbage", () => {
    const t = signEmailToken("verify-creator", "abc", "x", 60_000);
    const [p, s] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ p: "verify-creator", s: "evil", b: "x", e: Date.now() + 99999 })).toString("base64url");
    expect(verifyEmailToken(`${forged}.${s}`, "verify-creator").ok).toBe(false);
    expect(verifyEmailToken(`${p}.${s.slice(0, -2)}AA`, "verify-creator").ok).toBe(false);
    expect(verifyEmailToken("nonsense", "verify-creator").ok).toBe(false);
    expect(verifyEmailToken("", "verify-creator").ok).toBe(false);
  });
  it("a different secret invalidates old tokens", () => {
    const t = signEmailToken("verify-tenant", "abc", "x", 60_000);
    process.env.JWT_SECRET = "other";
    expect(verifyEmailToken(t, "verify-tenant").ok).toBe(false);
    process.env.JWT_SECRET = "test-secret";
  });
  it("passwordBind changes when the hash changes", () => {
    expect(passwordBind("hash1")).not.toBe(passwordBind("hash2"));
    expect(passwordBind("hash1")).toBe(passwordBind("hash1"));
  });
});
