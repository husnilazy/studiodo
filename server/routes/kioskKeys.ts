import { Router } from "express";
import { validateUuidParam } from "../middleware/validateUuidParam.js";
import crypto from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { deviceRegistry, kioskKeys, platformSettings, tenants } from "../db/schema.js";
import { requireAdminAuth } from "../middleware/adminAuth.js";
import { requireKioskAuth, clearKioskAuthCache } from "../middleware/kioskAuth.js";
import { clearLicenseCache, computeKeyLock, getGracePeriodDays, getKeyLock, hashKioskKey, lockMessage } from "../lib/license.js";
import { logEvent } from "../lib/platformEvents.js";
import { portalBaseUrl } from "../lib/urls.js";
import { hashDeviceToken, isValidDeviceId, newDeviceToken, resetAllowance, MAX_SELF_RESETS } from "../lib/deviceLock.js";
import { encryptSecret, readStoredSecret } from "../lib/secretBox.js";
import { makeRateLimiter } from "../lib/clientIp.js";

export const kioskKeysRouter = Router();
kioskKeysRouter.param("id", validateUuidParam("Kiosk key tidak ditemukan"));

const MAX_ACTIVE_KEYS = 100;

// POST /api/kiosk-keys/heartbeat — kiosk lapor status dirinya sendiri secara berkala
// (versi app + ringkasan diagnostik), dipakai admin dashboard untuk fleet visibility
// (Operator Console Fase 1b). Kiosk-auth, BUKAN admin-auth — harus terdaftar SEBELUM
// kioskKeysRouter.use(requireAdminAuth) di bawah, supaya tidak ketiban middleware itu.
kioskKeysRouter.post("/heartbeat", requireKioskAuth, async (req, res) => {
  const appVersion = typeof req.body?.appVersion === "string" ? req.body.appVersion.slice(0, 40) : undefined;
  const diagnostics = req.body?.diagnostics;
  const lastDiagnostics = diagnostics && typeof diagnostics === "object"
    ? {
        cameraOk: Boolean(diagnostics.cameraOk),
        printerOk: Boolean(diagnostics.printerOk),
        networkOk: Boolean(diagnostics.networkOk),
        checkedAt: new Date().toISOString(),
      }
    : undefined;

  const [updated] = await db.update(kioskKeys)
    .set({ ...(appVersion !== undefined ? { appVersion } : {}), ...(lastDiagnostics ? { lastDiagnostics } : {}) })
    .where(eq(kioskKeys.id, req.kioskKeyId!))
    .returning({ autoUpdateEnabled: kioskKeys.autoUpdateEnabled });

  // Piggyback THIS booth's licence state onto the already-periodic (every 5 min) heartbeat instead of adding a
  // separate polling endpoint. Never rejects: this route's job is to REPORT lock state, not enforce it (see
  // requireActiveSubscription for the actual gate). `lockAt` lets the kiosk lock itself at the right moment even if it
  // goes offline before the licence runs out.
  const lock = await getKeyLock(req.kioskKeyId!);
  const [settings] = await db.select({
    renewalWhatsapp: platformSettings.renewalWhatsapp,
    renewalCheckoutUrl: platformSettings.renewalCheckoutUrl,
  }).from(platformSettings).limit(1);

  res.json({
    ok: true,
    // Piggybacked the same way as the licence above — this is how
    // electron/main.cjs's setupAutoUpdater() learns whether THIS specific
    // kiosk key has been opted out of auto-update by its tenant admin
    // (KioskKeys.tsx's per-row toggle), without a separate polling endpoint.
    autoUpdateEnabled: updated?.autoUpdateEnabled ?? true,
    subscription: {
      locked: lock.locked,
      reason: lock.reason,
      message: lockMessage(lock.reason),
      licenseType: lock.licenseType,
      licenseEndsAt: lock.licenseEndsAt,
      lockAt: lock.lockAt,
      daysRemaining: lock.daysRemaining,
      graceDaysRemaining: lock.graceDaysRemaining,
      renewalWhatsapp: settings?.renewalWhatsapp ?? null,
      renewalCheckoutUrl: settings?.renewalCheckoutUrl ?? null,
      portalUrl: `${portalBaseUrl()}/portal/booth`,
    },
  });
});

// POST /api/kiosk-keys/report-error — a kiosk's own renderer forwards its
// console.error calls here (see client/src/main.tsx), fire-and-forget, so an
// unattended booth's app-level bugs actually surface somewhere a human can
// see them (Superadmin → Aktivitas & Error) instead of only ever existing in
// that one machine's local app.log. Reuses the existing platform_events
// table/UI (category "kiosk") rather than a new one — same storage, filter,
// and pagination Superadmin already has for every other event type.
kioskKeysRouter.post("/report-error", requireKioskAuth, async (req, res) => {
  const message = String(req.body?.message ?? "").slice(0, 2000);
  if (!message) return res.status(400).json({ error: "message wajib diisi" });
  const stack = typeof req.body?.stack === "string" ? req.body.stack.slice(0, 4000) : undefined;
  const appVersion = typeof req.body?.appVersion === "string" ? req.body.appVersion.slice(0, 40) : undefined;
  const level = req.body?.level === "warning" ? "warning" : "error";

  const [key] = await db.select({ label: kioskKeys.label }).from(kioskKeys).where(eq(kioskKeys.id, req.kioskKeyId!));

  logEvent({
    tenantId: req.tenantId!,
    level,
    category: "kiosk",
    action: "app_error",
    message,
    actorType: "kiosk",
    actorLabel: key?.label ?? null,
    metadata: { stack, appVersion, kioskKeyId: req.kioskKeyId },
  });

  res.json({ ok: true });
});

// POST /api/kiosk-keys/upgrade-binding: a booth that was paired BEFORE activation existed (bound to its computer, but with
// no per-device secret yet) trades its key + device id for a secret, once. The app does this by itself on its next start;
// after that the key alone, even together with the device id, no longer opens the booth.
kioskKeysRouter.post("/upgrade-binding", requireKioskAuth, async (req, res) => {
  const [cur] = await db.select({ hash: kioskKeys.deviceTokenHash, bound: kioskKeys.boundDeviceId, licenseType: kioskKeys.licenseType, trialStartedAt: kioskKeys.trialStartedAt })
    .from(kioskKeys).where(eq(kioskKeys.id, req.kioskKeyId!));
  if (!cur) return res.status(404).json({ error: "Kiosk key tidak ditemukan" });
  if (cur.hash) return res.status(409).json({ error: "Perangkat ini sudah memakai sesi aman. Aktifkan ulang dengan login jika sesinya hilang.", code: "already_upgraded" });

  // Older apps identified the computer with a random id kept in browser storage. If the app now reports a hardware-derived id,
  // move the binding to it (so it also joins the permanent trial memory), unless that id already used a different trial.
  let boundId = cur.bound;
  const wanted = req.body?.newDeviceId;
  if (isValidDeviceId(wanted) && wanted !== cur.bound) {
    const [seen] = await db.select().from(deviceRegistry).where(eq(deviceRegistry.deviceId, wanted));
    const trialConflict = cur.licenseType === "trial" && !!seen?.trialKeyId && seen.trialKeyId !== req.kioskKeyId;
    const takenByAnotherKey = await db.select({ id: kioskKeys.id }).from(kioskKeys).where(and(eq(kioskKeys.boundDeviceId, wanted), isNull(kioskKeys.revokedAt))).limit(1);
    if (!trialConflict && takenByAnotherKey.length === 0) boundId = wanted;
  }
  const token = newDeviceToken();
  await db.update(kioskKeys).set({ deviceTokenHash: hashDeviceToken(token), boundDeviceId: boundId }).where(eq(kioskKeys.id, req.kioskKeyId!));
  if (boundId) {
    const trialFields = cur.licenseType === "trial" ? { trialStartedAt: cur.trialStartedAt ?? new Date(), trialKeyId: req.kioskKeyId!, trialTenantId: req.tenantId! } : null;
    await db.insert(deviceRegistry).values({ deviceId: boundId, ...(trialFields ?? {}) }).onConflictDoUpdate({ target: deviceRegistry.deviceId, set: trialFields ?? { deviceId: boundId } });
  }
  clearKioskAuthCache();
  res.json({ deviceToken: token, deviceId: boundId });
});

kioskKeysRouter.use(requireAdminAuth);

// POST /api/kiosk-keys/activate: { key, deviceId } with the tenant admin's login. THE way a computer becomes a booth:
// the admin must be signed in to the owning account AND hold the key. It binds this computer's hardware-derived id,
// refuses a computer that already used a free trial, and returns the per-device secret the app keeps in the OS keystore.
const activateLimiter = makeRateLimiter(10, 10 * 60_000);
kioskKeysRouter.post("/activate", async (req, res) => {
  const tenantId = req.tenantId!;
  if (activateLimiter(tenantId)) return res.status(429).json({ error: "Terlalu banyak percobaan aktivasi. Coba lagi beberapa menit lagi.", code: "too_many_attempts" });
  const rawKey = String(req.body?.key ?? "").trim();
  const deviceId = req.body?.deviceId;
  if (!rawKey) return res.status(400).json({ error: "Key booth wajib diisi" });
  if (!isValidDeviceId(deviceId)) return res.status(400).json({ error: "Identitas perangkat tidak valid. Perbarui aplikasi STUDIODO ke versi terbaru.", code: "device_required" });

  // The key must belong to THIS account: a key from another tenant answers exactly like a wrong key.
  const [row] = await db.select().from(kioskKeys).where(and(eq(kioskKeys.keyHash, hashKioskKey(rawKey)), eq(kioskKeys.tenantId, tenantId), isNull(kioskKeys.revokedAt)));
  if (!row) return res.status(404).json({ error: "Key tidak ditemukan di akun ini, atau sudah dicabut. Cek lagi key-nya di dashboard, menu Booth.", code: "key_not_found" });

  if (row.boundDeviceId && row.boundDeviceId !== deviceId) {
    return res.status(403).json({ error: "Key ini sudah aktif di komputer lain. Reset device dari dashboard (Booth & langganan) untuk memindahkannya ke komputer ini.", code: "kiosk_device_mismatch" });
  }

  // One free trial per computer, remembered forever (device_registry): not undone by reset-device, revoking or deleting accounts.
  if (row.licenseType === "trial") {
    const [seen] = await db.select().from(deviceRegistry).where(eq(deviceRegistry.deviceId, deviceId));
    if (seen?.trialKeyId && seen.trialKeyId !== row.id) {
      logEvent({ tenantId, level: "warning", category: "kiosk", action: "trial.device_reuse_blocked", message: `Komputer yang sudah pernah memakai trial mencoba mengaktifkan trial lain (booth "${row.label ?? row.id.slice(0, 8)}")`, actorType: "tenant_admin", metadata: { keyId: row.id } });
      return res.status(403).json({ error: "Komputer ini sudah pernah memakai key trial. Gunakan key langganan, atau hubungi admin STUDIODO.", code: "trial_already_used" });
    }
  }

  const token = newDeviceToken();
  const now = new Date();
  await db.update(kioskKeys).set({ boundDeviceId: deviceId, boundAt: row.boundDeviceId ? row.boundAt : now, activatedAt: now, deviceTokenHash: hashDeviceToken(token) }).where(eq(kioskKeys.id, row.id));
  const trialFields = row.licenseType === "trial" ? { trialStartedAt: row.trialStartedAt ?? now, trialKeyId: row.id, trialTenantId: tenantId } : null;
  await db.insert(deviceRegistry).values({ deviceId, ...(trialFields ?? {}) })
    .onConflictDoUpdate({ target: deviceRegistry.deviceId, set: trialFields ?? { deviceId } });
  clearKioskAuthCache();
  clearLicenseCache();
  logEvent({ tenantId, category: "kiosk", action: "kiosk_key.activated", message: `Booth "${row.label ?? row.id.slice(0, 8)}" diaktifkan di komputer baru`, actorType: "tenant_admin", metadata: { keyId: row.id } });
  const lock = await getKeyLock(row.id);
  res.json({ deviceToken: token, booth: { id: row.id, label: row.label, licenseType: lock.licenseType, locked: lock.locked, reason: lock.reason } });
});

// GET /api/kiosk-keys — list this tenant's kiosk keys (never returns the raw key or its hash)
kioskKeysRouter.get("/", async (req, res) => {
  const rows = await db
    .select({
      id: kioskKeys.id,
      label: kioskKeys.label,
      createdAt: kioskKeys.createdAt,
      lastUsedAt: kioskKeys.lastUsedAt,
      revokedAt: kioskKeys.revokedAt,
      appVersion: kioskKeys.appVersion,
      lastDiagnostics: kioskKeys.lastDiagnostics,
      boundDeviceId: kioskKeys.boundDeviceId,
      boundAt: kioskKeys.boundAt,
      autoUpdateEnabled: kioskKeys.autoUpdateEnabled,
      licenseType: kioskKeys.licenseType,
      licenseEndsAt: kioskKeys.licenseEndsAt,
      licensePlanSlug: kioskKeys.licensePlanSlug,
    })
    .from(kioskKeys)
    .where(eq(kioskKeys.tenantId, req.tenantId!))
    .orderBy(desc(kioskKeys.createdAt));
  const [[tenant], grace] = await Promise.all([
    db.select({ status: tenants.status }).from(tenants).where(eq(tenants.id, req.tenantId!)),
    getGracePeriodDays(),
  ]);
  res.json(rows.map((row) => {
    const lock = computeKeyLock(tenant?.status ?? "active", row, grace);
    return { ...row, locked: lock.locked, lockReason: lock.reason, daysRemaining: lock.daysRemaining, graceDaysRemaining: lock.graceDaysRemaining };
  }));
});

// PATCH /api/kiosk-keys/:id — rename the booth and/or toggle its auto-update opt-out (KioskKeys.tsx). Auto-update is
// advisory only, same as the column comment in schema.ts: the kiosk reads it off its own heartbeat and decides for
// itself whether to call checkForUpdates(), the server never pushes or enforces anything.
kioskKeysRouter.patch("/:id", async (req, res) => {
  const patch: { autoUpdateEnabled?: boolean; label?: string | null } = {};
  if (req.body?.autoUpdateEnabled !== undefined) patch.autoUpdateEnabled = Boolean(req.body.autoUpdateEnabled);
  if (req.body?.label !== undefined) patch.label = String(req.body.label ?? "").trim().slice(0, 80) || null;
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: "Tidak ada perubahan yang dikirim" });
  const [row] = await db
    .update(kioskKeys)
    .set(patch)
    .where(and(eq(kioskKeys.id, req.params.id), eq(kioskKeys.tenantId, req.tenantId!)))
    .returning({ id: kioskKeys.id, autoUpdateEnabled: kioskKeys.autoUpdateEnabled, label: kioskKeys.label });
  if (!row) return res.status(404).json({ error: "Kiosk key tidak ditemukan" });
  res.json(row);
});

// POST /api/kiosk-keys — add a booth. The new key can be paired right away but stays locked ("unpaid") until the booth
// is subscribed to from the website (Booth & langganan) — one key is one booth is one subscription.
kioskKeysRouter.post("/", async (req, res) => {
  // How many booths a tenant may have is decided by what it pays for (one subscription per booth), not by its plan, so
  // only a sanity cap applies here.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(kioskKeys)
    .where(and(eq(kioskKeys.tenantId, req.tenantId!), isNull(kioskKeys.revokedAt)));
  if (count >= MAX_ACTIVE_KEYS) {
    return res.status(403).json({ error: `Maksimal ${MAX_ACTIVE_KEYS} booth aktif per akun. Hubungi admin STUDIODO bila butuh lebih.` });
  }

  const label = String(req.body?.label ?? "").trim().slice(0, 80) || null;
  const rawKey = crypto.randomBytes(32).toString("hex");
  const [row] = await db
    .insert(kioskKeys)
    .values({ tenantId: req.tenantId!, label, keyHash: hashKioskKey(rawKey), rawKey: encryptSecret(rawKey), licenseType: "unpaid" })
    .returning({ id: kioskKeys.id, label: kioskKeys.label, createdAt: kioskKeys.createdAt });
  logEvent({ tenantId: req.tenantId!, category: "kiosk", action: "kiosk_key.created", message: `Booth baru "${label ?? "tanpa nama"}" dibuat (belum berlangganan)`, actorType: "tenant_admin" });
  res.status(201).json({ ...row, key: rawKey, licenseType: "unpaid" });
});

// GET /api/kiosk-keys/:id/reveal — look up a previously-created key's raw
// value again (e.g. it needs re-pairing on new hardware and the original
// "shown once" moment is long gone). Deliberately a separate, explicit action
// from the list endpoint rather than including it in every row by default.
kioskKeysRouter.get("/:id/reveal", async (req, res) => {
  const [row] = await db
    .select({ key: kioskKeys.rawKey })
    .from(kioskKeys)
    .where(and(eq(kioskKeys.id, req.params.id), eq(kioskKeys.tenantId, req.tenantId!)));
  if (!row) return res.status(404).json({ error: "Kiosk key tidak ditemukan" });
  // Keys created before this raw-value column existed have nothing to show —
  // only their hash was ever stored, and a hash can't be reversed back to it.
  const plainKey = readStoredSecret(row.key);
  if (!plainKey) return res.status(410).json({ error: "Key ini dibuat sebelum fitur lihat-ulang tersedia — tidak bisa ditampilkan lagi, buat key baru." });
  res.json({ key: plainKey });
});

// POST /api/kiosk-keys/:id/reset-device — clear the device lock so this key can
// be paired to a different computer (hardware replaced, or it was mistakenly
// bound). Doesn't touch the key itself — same raw key still works, just no
// longer tied to the old machine. Whatever device pairs with it next claims it.
kioskKeysRouter.post("/:id/reset-device", async (req, res) => {
  const [cur] = await db.select({ id: kioskKeys.id, label: kioskKeys.label, bound: kioskKeys.boundDeviceId, count: kioskKeys.deviceResetCount, windowStart: kioskKeys.deviceResetWindowStart })
    .from(kioskKeys).where(and(eq(kioskKeys.id, req.params.id), eq(kioskKeys.tenantId, req.tenantId!)));
  if (!cur) return res.status(404).json({ error: "Kiosk key tidak ditemukan" });
  if (!cur.bound) return res.json({ ok: true, id: cur.id }); // nothing to free, nothing counted
  // Moving a paid key between computers is capped: otherwise one subscription could be rotated across any number of PCs.
  const allowance = resetAllowance(cur.count, cur.windowStart);
  if (!allowance.allowed) {
    logEvent({ tenantId: req.tenantId!, level: "warning", category: "kiosk", action: "kiosk_key.device_reset_limit", message: `Batas pindah device tercapai untuk booth "${cur.label ?? cur.id.slice(0, 8)}"`, actorType: "tenant_admin" });
    return res.status(429).json({ error: `Pindah device sudah mencapai batas (${MAX_SELF_RESETS} kali per 30 hari untuk satu booth). Hubungi admin STUDIODO untuk membukanya.`, code: "reset_limit" });
  }
  await db.update(kioskKeys)
    .set({ boundDeviceId: null, boundAt: null, activatedAt: null, deviceTokenHash: null, deviceResetCount: allowance.nextCount, deviceResetWindowStart: allowance.nextWindowStart })
    .where(eq(kioskKeys.id, cur.id));
  clearKioskAuthCache();
  clearLicenseCache();
  logEvent({ tenantId: req.tenantId!, level: "warning", category: "kiosk", action: "kiosk_key.device_reset", message: `Device booth "${cur.label ?? cur.id.slice(0, 8)}" direset oleh pemilik akun (${allowance.nextCount}/${MAX_SELF_RESETS})`, actorType: "tenant_admin" });
  res.json({ ok: true, id: cur.id, resetsLeft: Math.max(0, MAX_SELF_RESETS - allowance.nextCount) });
});

// DELETE /api/kiosk-keys/:id — revoke a kiosk key (soft delete)
kioskKeysRouter.delete("/:id", async (req, res) => {
  const [row] = await db
    .update(kioskKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(kioskKeys.id, req.params.id), eq(kioskKeys.tenantId, req.tenantId!), isNull(kioskKeys.revokedAt)))
    .returning({ id: kioskKeys.id });
  if (!row) return res.status(404).json({ error: "Kiosk key tidak ditemukan" });
  clearKioskAuthCache();
  clearLicenseCache();
  res.json({ ok: true, id: row.id });
});
