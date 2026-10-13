import { Router } from "express";
import { validateUuidParam } from "../middleware/validateUuidParam.js";
import crypto from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { kioskKeys, platformSettings, tenants } from "../db/schema.js";
import { requireAdminAuth } from "../middleware/adminAuth.js";
import { requireKioskAuth, clearKioskAuthCache } from "../middleware/kioskAuth.js";
import { clearLicenseCache, computeKeyLock, getGracePeriodDays, getKeyLock, hashKioskKey, lockMessage } from "../lib/license.js";
import { logEvent } from "../lib/platformEvents.js";
import { portalBaseUrl } from "../lib/urls.js";

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

kioskKeysRouter.use(requireAdminAuth);

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
    .values({ tenantId: req.tenantId!, label, keyHash: hashKioskKey(rawKey), rawKey, licenseType: "unpaid" })
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
  if (!row.key) return res.status(410).json({ error: "Key ini dibuat sebelum fitur lihat-ulang tersedia — tidak bisa ditampilkan lagi, buat key baru." });
  res.json({ key: row.key });
});

// POST /api/kiosk-keys/:id/reset-device — clear the device lock so this key can
// be paired to a different computer (hardware replaced, or it was mistakenly
// bound). Doesn't touch the key itself — same raw key still works, just no
// longer tied to the old machine. Whatever device pairs with it next claims it.
kioskKeysRouter.post("/:id/reset-device", async (req, res) => {
  const [row] = await db
    .update(kioskKeys)
    .set({ boundDeviceId: null, boundAt: null })
    .where(and(eq(kioskKeys.id, req.params.id), eq(kioskKeys.tenantId, req.tenantId!)))
    .returning({ id: kioskKeys.id });
  if (!row) return res.status(404).json({ error: "Kiosk key tidak ditemukan" });
  clearKioskAuthCache();
  clearLicenseCache();
  res.json({ ok: true, id: row.id });
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
