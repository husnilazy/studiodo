import { Router } from "express";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { admins, platformSettings, tenants } from "../db/schema.js";
import { hashPassword, verifyPassword } from "../lib/passwordHash.js";
import { signAdminToken } from "../lib/jwt.js";
import { requireAdminAuth } from "../middleware/adminAuth.js";
import { getTenantLicenseSummary } from "../lib/license.js";
import { portalBaseUrl } from "../lib/urls.js";
import { createLoginGuard, minutesLabel } from "../lib/loginGuard.js";
import { clientIp } from "../lib/clientIp.js";
import { logEvent } from "../lib/platformEvents.js";
import { onTenantLoginLockout } from "../lib/securityAlerts.js";

export const authRouter = Router();

// Constant-cost dummy hash so a lookup for a non-existent email still pays
// the same scrypt cost as a real one — otherwise response time alone reveals
// which emails have an admin account.
const DUMMY_PASSWORD_HASH = hashPassword(crypto.randomUUID());

// Brute-force guard: escalating lockouts per account (5 wrong passwords → 5 min, then 30 min, then 2 h) plus a looser
// per-IP guard so one machine can't cycle through many accounts. See lib/loginGuard.ts.
const accountGuard = createLoginGuard({ maxFailures: 5 });
const ipGuard = createLoginGuard({ maxFailures: 20 });

// POST /api/auth/login — { email, password } → tenant admin login
authRouter.post("/login", async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  if (!email || !password) return res.status(400).json({ error: "Email dan password wajib diisi" });

  const ip = clientIp(req);
  const lockedForMs = Math.max(accountGuard.lockedFor(email), ipGuard.lockedFor(ip));
  if (lockedForMs > 0) {
    return res.status(429).json({ error: `Terlalu banyak percobaan gagal. Akun dikunci sementara, coba lagi dalam ${minutesLabel(lockedForMs)}.`, retryAfterSeconds: Math.ceil(lockedForMs / 1000) });
  }

  const [admin] = await db.select().from(admins).where(eq(admins.email, email));
  const valid = verifyPassword(password, admin?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!admin || !valid) {
    const lock = accountGuard.fail(email);
    const ipLock = ipGuard.fail(ip);
    if (lock) void onTenantLoginLockout(email, ip, lock);
    if (ipLock) logEvent({ level: "warning", category: "auth", action: "login.lockout.ip", message: `Satu alamat IP (${ip}) dikunci ${Math.round(ipLock.lockMs / 60000)} menit setelah banyak percobaan masuk gagal`, actorType: "system", metadata: { ip } });
    return res.status(401).json({ error: "Email atau password salah" });
  }
  accountGuard.succeed(email);

  const token = signAdminToken({ adminId: admin.id, tenantId: admin.tenantId });
  res.json({ token });
});

// POST /api/auth/logout — stateless JWT, nothing to revoke server-side; kept for API symmetry
authRouter.post("/logout", requireAdminAuth, (_req, res) => {
  res.json({ ok: true });
});

// GET /api/auth/me — resolve the current admin/tenant from the bearer token.
// Also returns subscription/renewal info (Fase 2) so the dashboard can render its
// "Langganan tinggal N hari" banner — this is display-only, nothing here gates access.
authRouter.get("/me", requireAdminAuth, async (req, res) => {
  const [admin] = await db.select({ email: admins.email }).from(admins).where(eq(admins.id, req.adminId!));
  const [tenant] = await db.select({
    plan: tenants.plan,
    status: tenants.status,
    subscriptionEndsAt: tenants.subscriptionEndsAt,
  }).from(tenants).where(eq(tenants.id, req.tenantId!));
  const [settings] = await db.select({
    renewalWhatsapp: platformSettings.renewalWhatsapp,
    renewalCheckoutUrl: platformSettings.renewalCheckoutUrl,
    gracePeriodDays: platformSettings.gracePeriodDays,
  }).from(platformSettings).limit(1);
  const licenses = await getTenantLicenseSummary(req.tenantId!);

  res.json({
    tenantId: req.tenantId,
    email: admin?.email,
    plan: tenant?.plan ?? null,
    status: tenant?.status ?? null,
    // Per-booth licences now: this is the soonest end date among the booths that are still running, which is what the
    // dashboard banner counts down. `licenses` carries the full picture (how many booths are paid / trial / unpaid / locked).
    subscriptionEndsAt: licenses.nearestEndsAt ?? tenant?.subscriptionEndsAt ?? null,
    licenses,
    portalUrl: `${portalBaseUrl()}/portal/booth`,
    renewalWhatsapp: settings?.renewalWhatsapp ?? null,
    renewalCheckoutUrl: settings?.renewalCheckoutUrl ?? null,
    gracePeriodDays: settings?.gracePeriodDays ?? 3,
  });
});
