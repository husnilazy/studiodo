import crypto from "node:crypto";

// Encrypts secrets (payment-gateway keys) before they are stored in the database, so a leaked DB dump or
// backup alone does not expose them. AES-256-GCM with a per-value random IV; the key is derived from
// SETTINGS_ENCRYPTION_KEY when set, otherwise from JWT_SECRET. If that secret is ever rotated, stored
// values can no longer be decrypted and must be re-entered in Superadmin (decryption fails closed → null).

const KEY_CONTEXT = "studiodo:settings-encryption:v1";

function masterKey(): Buffer {
  const secret = process.env.SETTINGS_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET (atau SETTINGS_ENCRYPTION_KEY) belum diatur");
  return crypto.scryptSync(secret, KEY_CONTEXT, 32);
}

/** → "v1:<iv>:<tag>:<ciphertext>" (base64url parts) */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), enc.toString("base64url")].join(":");
}

/** Returns null (never throws) when the value is malformed, tampered with, or the key changed. */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  try {
    const [version, iv, tag, data] = stored.split(":");
    if (version !== "v1" || !iv || !tag || !data) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** "••••abcd" style hint — never enough to reconstruct the secret. */
export function maskedTail(secret: string): string {
  return secret.length <= 4 ? "••••" : secret.slice(-4);
}
