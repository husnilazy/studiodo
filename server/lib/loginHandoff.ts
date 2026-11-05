import crypto from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { admins, authHandoffs } from "../db/schema.js";
import { signAdminToken } from "./jwt.js";
import { sessionVersion } from "./sessionGuard.js";

// Passwordless sign-in for the desktop app (and anything that cannot host Google's button):
//   1. the app starts a handoff and gets { id, poll } — `poll` is a secret only that app holds;
//   2. the user proves who they are in a browser (Google account, or the link in an email);
//   3. the browser shows a confirm page ("Masuk dari perangkat …?") and only the user's click approves it — so a mail scanner that
//      opens the link, or someone who sends a victim a link they started, cannot log anyone in;
//   4. the app polls and receives the normal admin token once approved. One use, short life.

export const HANDOFF_TTL_MS = 10 * 60_000;
export const MAGIC_PER_EMAIL_PER_HOUR = 5;

export const sha = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
export const secret = () => crypto.randomBytes(32).toString("base64url");
const same = (a: string, b: string) => { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export async function startHandoff(kind: "google" | "magic", meta: { ip: string | null; ua: string | null; email?: string }) {
  const poll = secret();
  const [row] = await db.insert(authHandoffs).values({
    kind, pollHash: sha(poll), email: meta.email ?? null, requestIp: meta.ip, requestUa: (meta.ua ?? "").slice(0, 200), expiresAt: new Date(Date.now() + HANDOFF_TTL_MS),
  }).returning({ id: authHandoffs.id });
  return { id: row.id, poll };
}

const live = (id: string) => and(eq(authHandoffs.id, id), gt(authHandoffs.expiresAt, new Date()));
export async function getLiveHandoff(id: string) { return (await db.select().from(authHandoffs).where(live(id)))[0]; }

/** The identity is proven (Google callback / email link opened): remember who, and hand back the secret the confirm page must echo. */
export async function markVerified(id: string, adminId: string, email: string): Promise<string | null> {
  const confirm = secret();
  const [row] = await db.update(authHandoffs).set({ status: "verified", adminId, email, confirmHash: sha(confirm) })
    .where(and(live(id), eq(authHandoffs.status, "pending"))).returning({ id: authHandoffs.id });
  return row ? confirm : null;
}

export async function markFailed(id: string, error: string) {
  await db.update(authHandoffs).set({ status: "failed", error }).where(and(live(id), eq(authHandoffs.status, "pending")));
}

/** The user pressed "Ya, ini saya" on the confirm page. */
export async function approve(id: string, confirm: string): Promise<boolean> {
  const row = await getLiveHandoff(id);
  if (!row || row.status !== "verified" || !row.confirmHash || !same(row.confirmHash, sha(confirm))) return false;
  const [done] = await db.update(authHandoffs).set({ status: "approved", confirmHash: null })
    .where(and(eq(authHandoffs.id, id), eq(authHandoffs.status, "verified"))).returning({ id: authHandoffs.id });
  return Boolean(done);
}

export type PollResult = { status: "pending" | "verified" | "failed" | "expired" | "invalid"; error?: string } | { status: "approved"; token: string };

/** What the app asks every second or two. The token is released exactly once. */
export async function poll(id: string, pollSecret: string): Promise<PollResult> {
  const [row] = await db.select().from(authHandoffs).where(eq(authHandoffs.id, id));
  if (!row || !same(row.pollHash, sha(pollSecret))) return { status: "invalid" };
  if (row.expiresAt.getTime() < Date.now()) return { status: "expired" };
  if (row.status === "used") return { status: "invalid" };
  if (row.status === "failed") return { status: "failed", error: row.error ?? "Gagal masuk." };
  if (row.status !== "approved" || !row.adminId) return { status: row.status === "verified" ? "verified" : "pending" };
  const [claimed] = await db.update(authHandoffs).set({ status: "used" }).where(and(eq(authHandoffs.id, id), eq(authHandoffs.status, "approved"))).returning({ adminId: authHandoffs.adminId });
  if (!claimed?.adminId) return { status: "invalid" };
  const [admin] = await db.select().from(admins).where(eq(admins.id, claimed.adminId));
  if (!admin) return { status: "invalid" };
  return { status: "approved", token: signAdminToken({ adminId: admin.id, tenantId: admin.tenantId, pv: sessionVersion(admin.passwordHash) }) };
}

export async function findAdminByEmail(emailRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  return (await db.select().from(admins).where(sql`lower(${admins.email}) = ${email}`))[0];
}

/** Direct sign-in token for flows with no handoff (the web "Masuk dengan Google" button). */
export const tokenFor = (admin: { id: string; tenantId: string; passwordHash: string }) => signAdminToken({ adminId: admin.id, tenantId: admin.tenantId, pv: sessionVersion(admin.passwordHash) });

export async function recentMagicCount(email: string): Promise<number> {
  const rows = await db.select({ n: sql<number>`count(*)::int` }).from(authHandoffs)
    .where(and(eq(authHandoffs.kind, "magic"), eq(authHandoffs.email, email), gt(authHandoffs.createdAt, new Date(Date.now() - 3_600_000))));
  return rows[0]?.n ?? 0;
}

/** For the magic link: attaches a fresh one-time secret to a pending handoff. */
export async function attachMagicSecret(id: string, adminId: string, email: string): Promise<string> {
  const token = secret();
  await db.update(authHandoffs).set({ adminId, email, confirmHash: sha(token) }).where(eq(authHandoffs.id, id));
  return token;
}

/** The email link was opened: a link is proof of mailbox access, so it moves to "verified" (the confirm page still needs a click). */
export async function verifyMagic(id: string, token: string): Promise<boolean> {
  const row = await getLiveHandoff(id);
  if (!row || row.kind !== "magic" || row.status !== "pending" || !row.confirmHash || !same(row.confirmHash, sha(token))) return false;
  await db.update(authHandoffs).set({ status: "verified" }).where(and(eq(authHandoffs.id, id), eq(authHandoffs.status, "pending")));
  return true;
}
