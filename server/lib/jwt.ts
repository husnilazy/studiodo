import jwt from "jsonwebtoken";

const TOKEN_TTL = "12h";

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET belum di-set. Isi .env dengan string acak yang panjang.");
  }
  return secret;
}

export interface AdminTokenPayload {
  adminId: string;
  tenantId: string;
}

export function signAdminToken(payload: AdminTokenPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: TOKEN_TTL });
}

export function verifyAdminToken(token: string): AdminTokenPayload {
  const decoded = jwt.verify(token, getSecret());
  if (typeof decoded !== "object" || !decoded || typeof decoded.adminId !== "string" || typeof decoded.tenantId !== "string") {
    throw new Error("Token tidak valid");
  }
  return { adminId: decoded.adminId, tenantId: decoded.tenantId };
}

export interface SuperadminTokenPayload {
  superadminId: string;
}

// `type: "superadmin"` is a deliberate, explicit marker — not just a different
// payload shape — so a tenant admin token (which has no `type` field) can never
// be mistaken for a superadmin one even though both are signed with the same
// JWT_SECRET. Superadmins can read/edit every tenant, so this boundary matters.
export function signSuperadminToken(payload: SuperadminTokenPayload): string {
  return jwt.sign({ type: "superadmin", superadminId: payload.superadminId }, getSecret(), { expiresIn: TOKEN_TTL });
}

export function verifySuperadminToken(token: string): SuperadminTokenPayload {
  const decoded = jwt.verify(token, getSecret());
  if (typeof decoded !== "object" || !decoded || decoded.type !== "superadmin" || typeof decoded.superadminId !== "string") {
    throw new Error("Token tidak valid");
  }
  return { superadminId: decoded.superadminId };
}
