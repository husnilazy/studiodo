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
  /** Fingerprint of the password the token was issued under (lib/sessionGuard.ts); absent on older tokens. */
  pv?: string;
  /** Read-only session opened by the platform team ("lihat sebagai tenant"): every request that changes data is refused. */
  ro?: boolean;
  /** Who opened it (superadmin email), for the banner and the audit trail. */
  imp?: string;
}

export function signAdminToken(payload: AdminTokenPayload, opts: { expiresIn?: string } = {}): string {
  return jwt.sign(payload, getSecret(), { expiresIn: (opts.expiresIn ?? TOKEN_TTL) as jwt.SignOptions["expiresIn"] });
}

/** True when this token may not change anything (see AdminTokenPayload.ro) and the request would. */
export const blocksWrite = (payload: AdminTokenPayload, method: string) => Boolean(payload.ro) && !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());

export function verifyAdminToken(token: string): AdminTokenPayload {
  const decoded = jwt.verify(token, getSecret());
  if (typeof decoded !== "object" || !decoded || typeof decoded.adminId !== "string" || typeof decoded.tenantId !== "string") {
    throw new Error("Token tidak valid");
  }
  return { adminId: decoded.adminId, tenantId: decoded.tenantId, ...(typeof decoded.pv === "string" ? { pv: decoded.pv } : {}), ...(decoded.ro === true ? { ro: true } : {}), ...(typeof decoded.imp === "string" ? { imp: decoded.imp } : {}) };
}

export interface SuperadminTokenPayload {
  superadminId: string;
  pv?: string;
}

// `type: "superadmin"` is a deliberate, explicit marker — not just a different
// payload shape — so a tenant admin token (which has no `type` field) can never
// be mistaken for a superadmin one even though both are signed with the same
// JWT_SECRET. Superadmins can read/edit every tenant, so this boundary matters.
export function signSuperadminToken(payload: SuperadminTokenPayload): string {
  return jwt.sign({ type: "superadmin", superadminId: payload.superadminId, ...(payload.pv ? { pv: payload.pv } : {}) }, getSecret(), { expiresIn: TOKEN_TTL });
}

export function verifySuperadminToken(token: string): SuperadminTokenPayload {
  const decoded = jwt.verify(token, getSecret());
  if (typeof decoded !== "object" || !decoded || decoded.type !== "superadmin" || typeof decoded.superadminId !== "string") {
    throw new Error("Token tidak valid");
  }
  return { superadminId: decoded.superadminId, ...(typeof decoded.pv === "string" ? { pv: decoded.pv } : {}) };
}

export interface CreatorTokenPayload {
  creatorId: string;
  pv?: string;
}

// Marketplace creators are a third identity realm; `type: "creator"` keeps their tokens from ever
// passing as tenant-admin or superadmin tokens (all three share JWT_SECRET).
export function signCreatorToken(payload: CreatorTokenPayload): string {
  return jwt.sign({ type: "creator", creatorId: payload.creatorId, ...(payload.pv ? { pv: payload.pv } : {}) }, getSecret(), { expiresIn: TOKEN_TTL });
}

export function verifyCreatorToken(token: string): CreatorTokenPayload {
  const decoded = jwt.verify(token, getSecret());
  if (typeof decoded !== "object" || !decoded || decoded.type !== "creator" || typeof decoded.creatorId !== "string") {
    throw new Error("Token tidak valid");
  }
  return { creatorId: decoded.creatorId, ...(typeof decoded.pv === "string" ? { pv: decoded.pv } : {}) };
}
