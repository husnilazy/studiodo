import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { admins, creatorSubmissions, creators, tenantApplications, tenants } from "../db/schema.js";
import { hashPassword } from "./passwordHash.js";
import { passwordBind, verifyEmailToken } from "./emailTokens.js";
import { deliver, passwordChangedMail, passwordResetMail, resetLink, verifyEmailMail, verifyLink } from "./emails.js";
import { logEvent } from "./platformEvents.js";

// Rules behind the email links: verifying an address, asking for a password reset, and using the reset link.
// The routes only parse input and map these results to HTTP.

export type Realm = "tenant" | "creator";
export type LinkError = "invalid" | "expired" | "used" | "not_found";
export type LinkResult = { ok: true } | { ok: false; error: LinkError; message: string };

const MESSAGES: Record<LinkError, string> = {
  invalid: "Tautan tidak valid. Pastikan Anda menyalin seluruh tautan dari email.",
  expired: "Tautan sudah kedaluwarsa. Minta tautan baru.",
  used: "Tautan ini sudah dipakai. Jika perlu, minta tautan baru.",
  not_found: "Data tidak ditemukan.",
};
const bad = (error: LinkError): LinkResult => ({ ok: false, error, message: MESSAGES[error] });

// --- verify the address on an application / creator signup -----------------------------------------------------

export async function verifyEmail(kind: Realm, id: string, token: string): Promise<LinkResult> {
  const v = verifyEmailToken(token, kind === "tenant" ? "verify-tenant" : "verify-creator");
  if (!v.ok) return bad(v.reason === "expired" ? "expired" : "invalid");
  if (v.subjectId !== id) return bad("invalid");
  if (kind === "tenant") {
    const [row] = await db.select({ email: tenantApplications.ownerEmail, at: tenantApplications.emailVerifiedAt }).from(tenantApplications).where(eq(tenantApplications.id, id));
    if (!row) return bad("not_found");
    if (row.email.toLowerCase() !== v.bind) return bad("invalid"); // the address on file changed since the email went out
    if (!row.at) await db.update(tenantApplications).set({ emailVerifiedAt: new Date() }).where(eq(tenantApplications.id, id));
    logEvent({ level: "info", category: "tenant", action: "application.email_verified", message: `Email pengaju ${row.email} terverifikasi`, actorType: "system" });
  } else {
    const [row] = await db.select({ email: creatorSubmissions.email, at: creatorSubmissions.emailVerifiedAt }).from(creatorSubmissions).where(eq(creatorSubmissions.id, id));
    if (!row) return bad("not_found");
    if (row.email.toLowerCase() !== v.bind) return bad("invalid");
    if (!row.at) await db.update(creatorSubmissions).set({ emailVerifiedAt: new Date() }).where(eq(creatorSubmissions.id, id));
    logEvent({ level: "info", category: "tenant", action: "creator.email_verified", message: `Email pendaftar kreator ${row.email} terverifikasi`, actorType: "system" });
  }
  return { ok: true };
}

/** Re-send the verification email for the latest unverified signup with this address. Silent when there is none. */
export async function resendVerification(kind: Realm, emailRaw: string): Promise<void> {
  const email = emailRaw.trim().toLowerCase();
  if (kind === "tenant") {
    const [row] = await db.select().from(tenantApplications).where(and(sql`lower(${tenantApplications.ownerEmail}) = ${email}`, isNull(tenantApplications.emailVerifiedAt))).orderBy(desc(tenantApplications.createdAt)).limit(1);
    if (row) await deliver(row.ownerEmail, verifyEmailMail({ name: row.ownerName, url: verifyLink("tenant", row.id, row.ownerEmail), what: "pengajuan akun Anda" }), { what: "verifikasi email" });
  } else {
    const [row] = await db.select().from(creatorSubmissions).where(and(sql`lower(${creatorSubmissions.email}) = ${email}`, isNull(creatorSubmissions.emailVerifiedAt))).orderBy(desc(creatorSubmissions.createdAt)).limit(1);
    if (row) await deliver(row.email, verifyEmailMail({ name: row.name, url: verifyLink("creator", row.id, row.email), what: "pendaftaran kreator Anda" }), { what: "verifikasi email" });
  }
}

// --- password reset / first-time setup ---------------------------------------------------------------------------

async function findAccount(realm: Realm, email: string) {
  if (realm === "tenant") {
    const [row] = await db.select({ id: admins.id, hash: admins.passwordHash, email: admins.email, name: tenants.ownerName, tenantId: tenants.id })
      .from(admins).innerJoin(tenants, eq(tenants.id, admins.tenantId)).where(eq(admins.email, email));
    return row ? { id: row.id, hash: row.hash, email: row.email, name: row.name, tenantId: row.tenantId as string | null } : null;
  }
  const [row] = await db.select({ id: creators.id, hash: creators.passwordHash, email: creators.email, name: creators.name, status: creators.status }).from(creators).where(eq(creators.email, email));
  return row && row.status === "active" ? { id: row.id, hash: row.hash, email: row.email, name: row.name as string | null, tenantId: null as string | null } : null;
}

/** Always "succeeds" from the caller's point of view, so the form can't be used to discover which emails have accounts. */
export async function requestPasswordReset(realm: Realm, emailRaw: string): Promise<void> {
  const email = emailRaw.trim().toLowerCase();
  const acct = await findAccount(realm, email);
  if (!acct) return;
  await deliver(acct.email, passwordResetMail({ name: acct.name, url: resetLink(realm, acct.id, acct.hash) }), { tenantId: acct.tenantId, what: "atur ulang kata sandi" });
  logEvent({ tenantId: acct.tenantId, level: "info", category: "auth", action: "password.reset_requested", message: `Permintaan atur ulang kata sandi untuk ${acct.email}`, actorType: "system", actorLabel: acct.email });
}

export async function confirmPasswordReset(realm: Realm, token: string, newPassword: string): Promise<LinkResult> {
  if (newPassword.length < 8) return { ok: false, error: "invalid", message: "Kata sandi baru minimal 8 karakter" };
  if (newPassword.length > 200) return { ok: false, error: "invalid", message: "Kata sandi baru terlalu panjang" };
  const v = verifyEmailToken(token, realm === "tenant" ? "reset-tenant" : "reset-creator");
  if (!v.ok) return bad(v.reason === "expired" ? "expired" : "invalid");

  let email: string; let name: string | null; let tenantId: string | null = null;
  if (realm === "tenant") {
    const [row] = await db.select({ hash: admins.passwordHash, email: admins.email, name: tenants.ownerName, tenantId: tenants.id }).from(admins).innerJoin(tenants, eq(tenants.id, admins.tenantId)).where(eq(admins.id, v.subjectId));
    if (!row) return bad("not_found");
    if (passwordBind(row.hash) !== v.bind) return bad("used"); // the password changed since this link was issued, i.e. it was already used
    await db.update(admins).set({ passwordHash: hashPassword(newPassword) }).where(eq(admins.id, v.subjectId));
    email = row.email; name = row.name; tenantId = row.tenantId;
  } else {
    const [row] = await db.select({ hash: creators.passwordHash, email: creators.email, name: creators.name, status: creators.status }).from(creators).where(eq(creators.id, v.subjectId));
    if (!row || row.status !== "active") return bad("not_found");
    if (passwordBind(row.hash) !== v.bind) return bad("used");
    await db.update(creators).set({ passwordHash: hashPassword(newPassword) }).where(eq(creators.id, v.subjectId));
    email = row.email; name = row.name;
  }
  logEvent({ tenantId, level: "info", category: "auth", action: "password.reset_completed", message: `Kata sandi ${email} diatur ulang lewat tautan email`, actorType: "system", actorLabel: email });
  void deliver(email, passwordChangedMail({ name, when: new Date().toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jakarta" }) }), { tenantId, what: "kata sandi diubah" });
  return { ok: true };
}
