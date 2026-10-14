import { Router } from "express";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { superadmins } from "../db/schema.js";
import { decryptSecret, encryptSecret } from "../lib/secretBox.js";
import { passwordBind, signEmailToken, verifyEmailToken } from "../lib/emailTokens.js";
import { signSuperadminToken } from "../lib/jwt.js";
import { sessionVersion } from "../lib/sessionGuard.js";
import { verifyPassword } from "../lib/passwordHash.js";
import { createLoginGuard, minutesLabel } from "../lib/loginGuard.js";
import { clientIp } from "../lib/clientIp.js";
import { logEvent } from "../lib/platformEvents.js";
import { consumeRecoveryCode, generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, otpauthUrl, verifyTotp } from "../lib/totp.js";

// Two-factor sign-in for Admin Pusat. The superadmin can read and change every tenant, so a leaked password alone must not be
// enough. Password step → (if 2FA is on) a short-lived challenge → 6-digit authenticator code or a one-time recovery code → token.

export const TWO_FA_CHALLENGE_TTL_MS = 5 * 60_000;

// Guesses at the 6-digit code are throttled harder than passwords: 5 misses lock that account for 5 min, then 30 min, then 2 h.
const codeGuard = createLoginGuard({ maxFailures: 5 });
const codeIpGuard = createLoginGuard({ maxFailures: 20 });

type Row = typeof superadmins.$inferSelect;
const secretOf = (row: Row) => decryptSecret(row.totpSecretEnc);

/** Verifies a TOTP code (marking its time step as used, atomically) or a recovery code (spending it). */
async function checkSecondFactor(row: Row, code: string): Promise<"totp" | "recovery" | null> {
  const secret = secretOf(row);
  if (secret) {
    const step = verifyTotp(secret, code, Date.now(), row.totpLastStep ?? -1);
    if (step !== null) {
      // Only one request can win this step: a code that was just used (or replayed in parallel) is refused.
      const won = await db.update(superadmins).set({ totpLastStep: step })
        .where(and(eq(superadmins.id, row.id), or(isNull(superadmins.totpLastStep), lt(superadmins.totpLastStep, step)))).returning({ id: superadmins.id });
      if (won.length > 0) return "totp";
      return null;
    }
  }
  const remaining = consumeRecoveryCode(row.recoveryCodes ?? [], code);
  if (remaining) {
    const spent = await db.update(superadmins).set({ recoveryCodes: remaining })
      .where(and(eq(superadmins.id, row.id), eq(superadmins.recoveryCodes, row.recoveryCodes ?? []))).returning({ id: superadmins.id });
    if (spent.length > 0) return "recovery";
  }
  return null;
}

/** The challenge handed out after a correct password when 2FA is on. Bound to the current password, so it dies if that changes. */
export const issueTwoFactorChallenge = (row: Pick<Row, "id" | "passwordHash">) => signEmailToken("superadmin-2fa", row.id, passwordBind(row.passwordHash), TWO_FA_CHALLENGE_TTL_MS);

// ---- public: second step of sign-in -------------------------------------------------------------------------------

export const twoFactorLoginRouter = Router();

// POST /api/superadmin/login/2fa { challenge, code }
twoFactorLoginRouter.post("/login/2fa", async (req, res) => {
  const challenge = String(req.body?.challenge ?? "");
  const code = String(req.body?.code ?? "");
  const v = verifyEmailToken(challenge, "superadmin-2fa");
  if (!v.ok) return res.status(401).json({ error: "Sesi verifikasi sudah habis. Masuk ulang dengan email dan password.", code: "challenge_expired" });

  const ip = clientIp(req);
  const lockedForMs = Math.max(codeGuard.lockedFor(v.subjectId), codeIpGuard.lockedFor(ip));
  if (lockedForMs > 0) return res.status(429).json({ error: `Terlalu banyak kode salah. Coba lagi dalam ${minutesLabel(lockedForMs)}.`, retryAfterSeconds: Math.ceil(lockedForMs / 1000) });

  const [row] = await db.select().from(superadmins).where(eq(superadmins.id, v.subjectId));
  if (!row || !row.totpEnabledAt || passwordBind(row.passwordHash) !== v.bind) return res.status(401).json({ error: "Sesi verifikasi tidak valid. Masuk ulang.", code: "challenge_expired" });

  const used = await checkSecondFactor(row, code);
  if (!used) {
    const lock = codeGuard.fail(v.subjectId);
    codeIpGuard.fail(ip);
    if (lock) logEvent({ level: "error", category: "auth", action: "superadmin.2fa.lockout", message: `Verifikasi 2FA Admin Pusat dikunci ${Math.round(lock.lockMs / 60000)} menit setelah kode salah beruntun (${row.email}, IP ${ip})`, actorType: "system", actorLabel: row.email, metadata: { ip } });
    return res.status(401).json({ error: "Kode salah atau sudah dipakai. Cek kode terbaru di aplikasi authenticator." });
  }
  codeGuard.succeed(v.subjectId);
  if (used === "recovery") {
    logEvent({ level: "warning", category: "auth", action: "superadmin.2fa.recovery_used", message: `${row.email} masuk memakai kode pemulihan 2FA (sisa ${(row.recoveryCodes?.length ?? 1) - 1})`, actorType: "superadmin", actorLabel: row.email, metadata: { ip } });
  }
  res.json({ token: signSuperadminToken({ superadminId: row.id, pv: sessionVersion(row.passwordHash) }), usedRecoveryCode: used === "recovery" });
});

// ---- authenticated: set up / turn off ------------------------------------------------------------------------------

export const twoFactorAdminRouter = Router();

const load = async (id: string) => (await db.select().from(superadmins).where(eq(superadmins.id, id)))[0];

// GET /api/superadmin/2fa/status
twoFactorAdminRouter.get("/status", async (req, res) => {
  const row = await load(req.superadminId!);
  if (!row) return res.status(404).json({ error: "Akun tidak ditemukan" });
  res.json({ enabled: !!row.totpEnabledAt, enabledAt: row.totpEnabledAt, recoveryCodesLeft: row.recoveryCodes?.length ?? 0, setupPending: !row.totpEnabledAt && !!row.totpSecretEnc });
});

// POST /api/superadmin/2fa/setup — creates a fresh secret (not active until confirmed with a code from the app)
twoFactorAdminRouter.post("/setup", async (req, res) => {
  const row = await load(req.superadminId!);
  if (!row) return res.status(404).json({ error: "Akun tidak ditemukan" });
  if (row.totpEnabledAt) return res.status(409).json({ error: "2FA sudah aktif. Nonaktifkan dulu bila ingin mengganti perangkat." });
  const secret = generateTotpSecret();
  await db.update(superadmins).set({ totpSecretEnc: encryptSecret(secret), totpLastStep: null }).where(eq(superadmins.id, row.id));
  res.json({ secret, otpauthUrl: otpauthUrl(secret, row.email) });
});

// POST /api/superadmin/2fa/enable { code } — proves the app is set up correctly, then turns 2FA on and returns the recovery codes ONCE
twoFactorAdminRouter.post("/enable", async (req, res) => {
  const row = await load(req.superadminId!);
  if (!row) return res.status(404).json({ error: "Akun tidak ditemukan" });
  if (row.totpEnabledAt) return res.status(409).json({ error: "2FA sudah aktif." });
  const secret = secretOf(row);
  if (!secret) return res.status(400).json({ error: "Mulai dari langkah 1: buat kode QR dulu." });
  const lockedFor = codeGuard.lockedFor(row.id);
  if (lockedFor > 0) return res.status(429).json({ error: `Terlalu banyak kode salah. Coba lagi dalam ${minutesLabel(lockedFor)}.` });
  const step = verifyTotp(secret, String(req.body?.code ?? ""));
  if (step === null) { codeGuard.fail(row.id); return res.status(400).json({ error: "Kode tidak cocok. Pastikan jam HP Anda akurat lalu coba kode berikutnya." }); }
  codeGuard.succeed(row.id);
  const codes = generateRecoveryCodes();
  await db.update(superadmins).set({ totpEnabledAt: new Date(), totpLastStep: step, recoveryCodes: codes.map(hashRecoveryCode) }).where(eq(superadmins.id, row.id));
  logEvent({ category: "auth", action: "superadmin.2fa.enabled", message: `2FA diaktifkan untuk Admin Pusat ${row.email}`, actorType: "superadmin", actorLabel: row.email });
  res.json({ ok: true, recoveryCodes: codes });
});

// POST /api/superadmin/2fa/disable { password, code }
twoFactorAdminRouter.post("/disable", async (req, res) => {
  const row = await load(req.superadminId!);
  if (!row) return res.status(404).json({ error: "Akun tidak ditemukan" });
  if (!row.totpEnabledAt) return res.status(409).json({ error: "2FA belum aktif." });
  const lockedFor = codeGuard.lockedFor(row.id);
  if (lockedFor > 0) return res.status(429).json({ error: `Terlalu banyak percobaan. Coba lagi dalam ${minutesLabel(lockedFor)}.` });
  if (!verifyPassword(String(req.body?.password ?? ""), row.passwordHash)) { codeGuard.fail(row.id); return res.status(400).json({ error: "Password salah." }); }
  if (!(await checkSecondFactor(row, String(req.body?.code ?? "")))) { codeGuard.fail(row.id); return res.status(400).json({ error: "Kode salah atau sudah dipakai." }); }
  codeGuard.succeed(row.id);
  await db.update(superadmins).set({ totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null, recoveryCodes: [] }).where(eq(superadmins.id, row.id));
  logEvent({ level: "warning", category: "auth", action: "superadmin.2fa.disabled", message: `2FA dinonaktifkan untuk Admin Pusat ${row.email}`, actorType: "superadmin", actorLabel: row.email });
  res.json({ ok: true });
});

// POST /api/superadmin/2fa/recovery-codes { code } — replaces the recovery codes (old ones stop working)
twoFactorAdminRouter.post("/recovery-codes", async (req, res) => {
  const row = await load(req.superadminId!);
  if (!row?.totpEnabledAt) return res.status(409).json({ error: "2FA belum aktif." });
  const lockedFor = codeGuard.lockedFor(row.id);
  if (lockedFor > 0) return res.status(429).json({ error: `Terlalu banyak percobaan. Coba lagi dalam ${minutesLabel(lockedFor)}.` });
  const secret = secretOf(row);
  const step = secret ? verifyTotp(secret, String(req.body?.code ?? ""), Date.now(), row.totpLastStep ?? -1) : null;
  if (step === null) { codeGuard.fail(row.id); return res.status(400).json({ error: "Kode salah atau sudah dipakai. Tunggu kode berikutnya di aplikasi authenticator." }); }
  codeGuard.succeed(row.id);
  const codes = generateRecoveryCodes();
  await db.update(superadmins).set({ recoveryCodes: codes.map(hashRecoveryCode), totpLastStep: step }).where(eq(superadmins.id, row.id));
  res.json({ ok: true, recoveryCodes: codes });
});
