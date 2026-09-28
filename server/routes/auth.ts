import { Router } from "express";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { admins, platformSettings, tenants } from "../db/schema.js";
import { hashPassword, verifyPassword } from "../lib/passwordHash.js";
import { signAdminToken } from "../lib/jwt.js";
import { requireAdminAuth } from "../middleware/adminAuth.js";

export const authRouter = Router();

// Constant-cost dummy hash so a lookup for a non-existent email still pays
// the same scrypt cost as a real one — otherwise response time alone reveals
// which emails have an admin account.
const DUMMY_PASSWORD_HASH = hashPassword(crypto.randomUUID());

// Basic in-memory brute-force guard, keyed by normalized email. Good enough
// for Phase 1 (single process) — a real multi-instance deployment would need
// this in a shared store (e.g. Redis) instead, same caveat as the JWT design.
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 5 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();

function isLockedOut(email: string): number {
  const entry = loginAttempts.get(email);
  if (!entry || entry.lockedUntil <= Date.now()) return 0;
  return entry.lockedUntil - Date.now();
}

function recordLoginFailure(email: string) {
  const entry = loginAttempts.get(email) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
    entry.count = 0;
  }
  loginAttempts.set(email, entry);
}

// POST /api/auth/login — { email, password } → tenant admin login
authRouter.post("/login", async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  if (!email || !password) return res.status(400).json({ error: "Email dan password wajib diisi" });

  const lockedForMs = isLockedOut(email);
  if (lockedForMs > 0) {
    return res.status(429).json({ error: `Terlalu banyak percobaan gagal. Coba lagi dalam ${Math.ceil(lockedForMs / 60000)} menit.` });
  }

  const [admin] = await db.select().from(admins).where(eq(admins.email, email));
  const valid = verifyPassword(password, admin?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!admin || !valid) {
    recordLoginFailure(email);
    return res.status(401).json({ error: "Email atau password salah" });
  }
  loginAttempts.delete(email);

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

  res.json({
    tenantId: req.tenantId,
    email: admin?.email,
    plan: tenant?.plan ?? null,
    status: tenant?.status ?? null,
    subscriptionEndsAt: tenant?.subscriptionEndsAt ?? null,
    renewalWhatsapp: settings?.renewalWhatsapp ?? null,
    renewalCheckoutUrl: settings?.renewalCheckoutUrl ?? null,
    gracePeriodDays: settings?.gracePeriodDays ?? 3,
  });
});
