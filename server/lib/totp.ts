import crypto from "node:crypto";

// Time-based one-time passwords (RFC 6238 / RFC 4226) for superadmin two-factor sign-in — works with Google Authenticator,
// Microsoft Authenticator, Authy, 1Password and every other authenticator app. No dependency: it is HMAC-SHA1 and base32.

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Accept the previous and next 30-second window too, so a few seconds of clock drift never locks the owner out. */
export const TOTP_WINDOW = 1;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error("bukan base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const generateTotpSecret = () => base32Encode(crypto.randomBytes(20)); // 160 bits, the RFC's recommended size

export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", secret).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export const totpStep = (now = Date.now()) => Math.floor(now / 1000 / TOTP_STEP_SECONDS);
export const totpAt = (secretB32: string, now = Date.now()) => hotp(base32Decode(secretB32), totpStep(now));

/**
 * Checks a code against the secret. Returns the matched time step (so the caller can refuse the same step twice: a code
 * that was just used must not work again for the next 90 seconds) or null.
 */
export function verifyTotp(secretB32: string, code: string, now = Date.now(), lastUsedStep = -1): number | null {
  const clean = String(code ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const secret = base32Decode(secretB32);
  const step = totpStep(now);
  for (let w = -TOTP_WINDOW; w <= TOTP_WINDOW; w += 1) {
    const candidate = step + w;
    if (candidate <= lastUsedStep) continue; // replay
    const expected = Buffer.from(hotp(secret, candidate));
    const given = Buffer.from(clean);
    if (expected.length === given.length && crypto.timingSafeEqual(expected, given)) return candidate;
  }
  return null;
}

export function otpauthUrl(secretB32: string, accountEmail: string, issuer = "STUDIODO"): string {
  const label = encodeURIComponent(`${issuer}:${accountEmail}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;
}

// --- recovery codes: one-time codes for when the phone is lost -------------------------------------------------------

export const RECOVERY_CODE_COUNT = 10;

export function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const raw = crypto.randomBytes(5).toString("hex"); // 40 bits each, shown as xxxxx-xxxxx
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

const normalizeRecovery = (code: string) => String(code ?? "").toLowerCase().replace(/[^0-9a-f]/g, "");
export const hashRecoveryCode = (code: string) => crypto.createHash("sha256").update(`studiodo-recovery:${normalizeRecovery(code)}`).digest("hex");

/** Returns the remaining hashes when `code` matches one of them (that code is now spent), or null when it matches none. */
export function consumeRecoveryCode(hashes: string[], code: string): string[] | null {
  if (normalizeRecovery(code).length !== 10) return null;
  const target = hashRecoveryCode(code);
  const idx = hashes.findIndex((h) => h.length === target.length && crypto.timingSafeEqual(Buffer.from(h), Buffer.from(target)));
  if (idx < 0) return null;
  return hashes.filter((_, i) => i !== idx);
}
