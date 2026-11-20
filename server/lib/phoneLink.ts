import { and, eq, gt } from "drizzle-orm";
import { db } from "../db/client.js";
import { admins, authHandoffs } from "../db/schema.js";
import { sha, secret } from "./loginHandoff.js";
import { signAdminToken } from "./jwt.js";
import { sessionVersion } from "./sessionGuard.js";

// "Luncurkan di HP": the tenant, already signed in on the PC app, shows a QR / link. Opening it on a phone signs that phone in to
// the web admin with no password. The link is a one-time secret (only its hash is stored), lives 15 minutes, and the phone then
// holds a normal 30-day admin session. It sits in auth_handoffs with kind 'phone'; it is created already "verified" because the
// signed-in admin IS the proof of identity.

export const PHONE_LINK_TTL_MS = 15 * 60_000;
export const REMEMBER_TTL = "30d";

/** The code carried in the link is "<id>.<secret>"; the secret is never stored, only its hash. */
export async function createPhoneLink(adminId: string, tenantId: string, meta: { ip: string | null; ua: string }) {
  const [admin] = await db.select({ id: admins.id }).from(admins).where(and(eq(admins.id, adminId), eq(admins.tenantId, tenantId)));
  if (!admin) return null;
  const code = secret();
  const [row] = await db.insert(authHandoffs).values({
    kind: "phone", pollHash: sha(code), confirmHash: sha(code), adminId, status: "verified",
    requestIp: meta.ip, requestUa: meta.ua.slice(0, 200), expiresAt: new Date(Date.now() + PHONE_LINK_TTL_MS),
  }).returning({ id: authHandoffs.id });
  return { code: `${row.id}.${code}` };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Trades the one-time code for a session. The row is claimed atomically, so a code works exactly once. */
export async function redeemPhoneLink(rawCode: string): Promise<{ token: string } | null> {
  const [id, code] = rawCode.split(".");
  if (!id || !code || !UUID.test(id) || code.length > 100) return null;
  const [claimed] = await db.update(authHandoffs).set({ status: "used" })
    .where(and(eq(authHandoffs.id, id), eq(authHandoffs.kind, "phone"), eq(authHandoffs.status, "verified"), eq(authHandoffs.pollHash, sha(code)), gt(authHandoffs.expiresAt, new Date())))
    .returning({ adminId: authHandoffs.adminId });
  if (!claimed?.adminId) return null;
  const [admin] = await db.select().from(admins).where(eq(admins.id, claimed.adminId));
  if (!admin) return null;
  return { token: signAdminToken({ adminId: admin.id, tenantId: admin.tenantId, pv: sessionVersion(admin.passwordHash) }, { expiresIn: REMEMBER_TTL }) };
}
