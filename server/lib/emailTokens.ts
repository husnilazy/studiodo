import crypto from "node:crypto";

// Stateless, signed, expiring tokens for links in emails (verify address, set/reset password). Nothing is stored:
// the token is `base64url(payload).base64url(hmac)` and the payload carries what it is for, who, and when it expires.
// `bind` ties a token to current state so it dies when that state changes — e.g. a password-reset token binds to a
// fragment of the current password hash, so using it once (which changes the hash) makes it unusable again.

export type TokenPurpose = "verify-tenant" | "verify-creator" | "reset-tenant" | "reset-creator" | "unsub-tenant" | "unsub-creator";

interface Payload { p: TokenPurpose; s: string; b: string; e: number }

const secret = () => {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET belum diatur");
  return `email-token:${s}`; // namespaced so a leaked email token can never be replayed as a login JWT
};

const b64 = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");
const mac = (data: string) => crypto.createHmac("sha256", secret()).update(data).digest();

export function signEmailToken(purpose: TokenPurpose, subjectId: string, bind: string, ttlMs: number, now = Date.now()): string {
  const payload = b64(JSON.stringify({ p: purpose, s: subjectId, b: bind, e: now + ttlMs } satisfies Payload));
  return `${payload}.${b64(mac(payload))}`;
}

export type VerifyResult = { ok: true; subjectId: string; bind: string } | { ok: false; reason: "invalid" | "expired" | "wrong_purpose" };

export function verifyEmailToken(token: string, purpose: TokenPurpose, now = Date.now()): VerifyResult {
  const [payload, sig] = String(token ?? "").split(".");
  if (!payload || !sig) return { ok: false, reason: "invalid" };
  const expected = mac(payload);
  let given: Buffer;
  try { given = Buffer.from(sig, "base64url"); } catch { return { ok: false, reason: "invalid" }; }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return { ok: false, reason: "invalid" };
  let data: Payload;
  try { data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Payload; } catch { return { ok: false, reason: "invalid" }; }
  if (data.p !== purpose) return { ok: false, reason: "wrong_purpose" };
  if (typeof data.e !== "number" || data.e < now) return { ok: false, reason: "expired" };
  return { ok: true, subjectId: data.s, bind: data.b };
}

/** What a password-reset token is bound to: a slice of the current hash (changes the moment the password does). */
export const passwordBind = (passwordHash: string) => crypto.createHash("sha256").update(passwordHash).digest("hex").slice(0, 16);
