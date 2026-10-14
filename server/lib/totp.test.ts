import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, consumeRecoveryCode, generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, hotp, otpauthUrl, totpAt, verifyTotp } from "./totp.js";

// RFC 4226 appendix D: secret "12345678901234567890", counters 0..9
const RFC4226 = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
const ASCII_SECRET = Buffer.from("12345678901234567890");

describe("hotp / totp against the RFC test vectors", () => {
  it("HOTP matches RFC 4226", () => {
    RFC4226.forEach((expected, counter) => expect(hotp(ASCII_SECRET, counter)).toBe(expected));
  });
  it("TOTP matches RFC 6238 (SHA-1, 6 digits taken from the 8-digit vectors)", () => {
    const b32 = base32Encode(ASCII_SECRET);
    // RFC 6238 appendix B, SHA-1: T=59s -> 94287082, T=1111111109 -> 07081804, T=1234567890 -> 89005924
    expect(totpAt(b32, 59_000)).toBe("287082");
    expect(totpAt(b32, 1111111109_000)).toBe("081804");
    expect(totpAt(b32, 1234567890_000)).toBe("005924");
  });
});

describe("base32", () => {
  it("round-trips and rejects junk", () => {
    const buf = Buffer.from("studiodo-secret!");
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
    expect(() => base32Decode("not*base32")).toThrow();
    expect(generateTotpSecret()).toMatch(/^[A-Z2-7]{32}$/);
  });
});

describe("verifyTotp", () => {
  const secret = base32Encode(ASCII_SECRET);
  const now = 1234567890_000;
  it("accepts the current code and one step of clock drift either side", () => {
    expect(verifyTotp(secret, "005924", now)).not.toBeNull();
    expect(verifyTotp(secret, totpAt(secret, now - 30_000), now)).not.toBeNull();
    expect(verifyTotp(secret, totpAt(secret, now + 30_000), now)).not.toBeNull();
  });
  it("rejects wrong, stale, malformed codes", () => {
    expect(verifyTotp(secret, "000000", now)).toBeNull();
    expect(verifyTotp(secret, totpAt(secret, now - 120_000), now)).toBeNull();
    expect(verifyTotp(secret, "12345", now)).toBeNull();
    expect(verifyTotp(secret, "abcdef", now)).toBeNull();
    expect(verifyTotp(secret, "", now)).toBeNull();
  });
  it("refuses to accept the same time step twice (replay)", () => {
    const step = verifyTotp(secret, "005924", now)!;
    expect(verifyTotp(secret, "005924", now, step)).toBeNull();
    expect(verifyTotp(secret, totpAt(secret, now + 30_000), now, step)).not.toBeNull(); // the next code is fine
  });
  it("tolerates spaces in the code (authenticator apps show '123 456')", () => {
    expect(verifyTotp(secret, "005 924", now)).not.toBeNull();
  });
});

describe("otpauth URL", () => {
  it("is what authenticator apps scan", () => {
    const url = otpauthUrl("JBSWY3DPEHPK3PXP", "admin@studiodo.id");
    expect(url).toContain("otpauth://totp/STUDIODO%3Aadmin%40studiodo.id");
    expect(url).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(url).toContain("issuer=STUDIODO");
  });
});

describe("recovery codes", () => {
  it("generates ten distinct codes that are spent once", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toMatch(/^[0-9a-f]{5}-[0-9a-f]{5}$/);
    const hashes = codes.map(hashRecoveryCode);
    const left = consumeRecoveryCode(hashes, codes[3])!;
    expect(left).toHaveLength(9);
    expect(consumeRecoveryCode(left, codes[3])).toBeNull(); // already used
    expect(consumeRecoveryCode(left, codes[4].toUpperCase().replace("-", " "))).toHaveLength(8); // format-insensitive
    expect(consumeRecoveryCode(hashes, "00000-00000")).toBeNull();
    expect(consumeRecoveryCode(hashes, "short")).toBeNull();
  });
});
