import { Router, type Request } from "express";
import { and, desc, eq, ilike, isNull, isNotNull, or, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { kioskKeys, platformSettings, superadmins, tenants } from "../db/schema.js";
import { clearKioskAuthCache } from "../middleware/kioskAuth.js";
import { clearLicenseCache, computeKeyLock, getGracePeriodDays, issueKioskKey, syncTenantEndsAt, type IssueKind } from "../lib/license.js";
import { logEvent } from "../lib/platformEvents.js";

// Superadmin control over every booth licence on the platform (mounted under /api/superadmin/licenses, behind
// requireSuperadminAuth). One kiosk key = one booth = one licence: this is where a superadmin issues trial keys,
// converts a trial to a paid booth, sets or shifts an end date, and revokes or restores a booth.

export const licensesAdminRouter = Router();

const DAY_MS = 24 * 60 * 60 * 1000;
const KINDS: IssueKind[] = ["trial", "paid", "unpaid"];

async function actorLabel(req: Request): Promise<string | null> {
  const [row] = await db.select({ email: superadmins.email }).from(superadmins).where(eq(superadmins.id, req.superadminId!));
  return row?.email ?? null;
}

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// GET /api/superadmin/licenses?type=trial|paid|unpaid&state=active|locked|expiring|revoked&tenantId=&q=
// Every booth across all tenants with its licence, newest first (max 500).
licensesAdminRouter.get("/", async (req, res) => {
  const conditions = [];
  const type = String(req.query.type ?? "");
  if (KINDS.includes(type as IssueKind)) conditions.push(eq(kioskKeys.licenseType, type));
  const tenantId = String(req.query.tenantId ?? "");
  if (tenantId) {
    if (!isUuid(tenantId)) return res.status(400).json({ error: "tenantId tidak valid" });
    conditions.push(eq(kioskKeys.tenantId, tenantId));
  }
  const q = String(req.query.q ?? "").trim().slice(0, 80);
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
    conditions.push(or(ilike(tenants.name, like), ilike(kioskKeys.label, like), ilike(tenants.slug, like)));
  }
  if (req.query.state === "revoked") conditions.push(isNotNull(kioskKeys.revokedAt));
  else conditions.push(isNull(kioskKeys.revokedAt));

  const [rows, grace] = await Promise.all([
    db.select({
      id: kioskKeys.id, label: kioskKeys.label, tenantId: kioskKeys.tenantId, tenantName: tenants.name, tenantStatus: tenants.status,
      licenseType: kioskKeys.licenseType, licenseEndsAt: kioskKeys.licenseEndsAt, licensePlanSlug: kioskKeys.licensePlanSlug,
      trialStartedAt: kioskKeys.trialStartedAt, createdAt: kioskKeys.createdAt, lastUsedAt: kioskKeys.lastUsedAt,
      boundDeviceId: kioskKeys.boundDeviceId, appVersion: kioskKeys.appVersion, revokedAt: kioskKeys.revokedAt,
    }).from(kioskKeys).innerJoin(tenants, eq(tenants.id, kioskKeys.tenantId))
      .where(and(...conditions)).orderBy(desc(kioskKeys.createdAt)).limit(500),
    getGracePeriodDays(),
  ]);

  const now = Date.now();
  let items = rows.map((row) => {
    const lock = computeKeyLock(row.tenantStatus, row, grace, now);
    return {
      ...row, boundDeviceId: undefined, paired: !!row.boundDeviceId,
      locked: lock.locked, lockReason: lock.reason, daysRemaining: lock.daysRemaining, graceDaysRemaining: lock.graceDaysRemaining,
      expiringSoon: !lock.locked && lock.licenseEndsAt !== null && lock.licenseEndsAt.getTime() - now <= 7 * DAY_MS && lock.licenseEndsAt.getTime() > now,
    };
  });
  if (req.query.state === "locked") items = items.filter((i) => i.locked);
  else if (req.query.state === "active") items = items.filter((i) => !i.locked);
  else if (req.query.state === "expiring") items = items.filter((i) => i.expiringSoon);
  res.json(items);
});

// POST /api/superadmin/licenses/tenants/:tenantId/keys  { label?, kind: 'trial'|'paid'|'unpaid', days?, planSlug? }
// Issues a new booth key with its licence. Returns the raw key — hand it to the customer to enter in the kiosk app.
licensesAdminRouter.post("/tenants/:tenantId/keys", async (req, res) => {
  const tenantId = req.params.tenantId;
  if (!isUuid(tenantId)) return res.status(400).json({ error: "Tenant tidak valid" });
  const [tenant] = await db.select({ id: tenants.id, name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) return res.status(404).json({ error: "Tenant tidak ditemukan" });

  const kind = String(req.body?.kind ?? "trial") as IssueKind;
  if (!KINDS.includes(kind)) return res.status(400).json({ error: "Jenis key harus trial, paid, atau unpaid" });
  const [settings] = await db.select({ defaultTrialDays: platformSettings.defaultTrialDays }).from(platformSettings).limit(1);
  const fallbackDays = kind === "trial" ? settings?.defaultTrialDays || 7 : 30;
  const days = req.body?.days === undefined || req.body.days === "" ? fallbackDays : Math.round(Number(req.body.days));
  if (kind !== "unpaid" && (!Number.isFinite(days) || days < 1 || days > 3650)) return res.status(400).json({ error: "Lama langganan/trial harus 1–3650 hari" });

  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(kioskKeys).where(and(eq(kioskKeys.tenantId, tenantId), isNull(kioskKeys.revokedAt)));
  if (n >= 100) return res.status(400).json({ error: "Tenant ini sudah punya 100 booth aktif" });

  const planSlug = req.body?.planSlug ? String(req.body.planSlug).slice(0, 60) : null;
  const issued = await issueKioskKey(tenantId, { label: req.body?.label ? String(req.body.label) : null, kind, days, planSlug });
  await syncTenantEndsAt(tenantId);
  const by = await actorLabel(req);
  logEvent({
    tenantId, category: "kiosk", action: kind === "trial" ? "license.trial_issued" : "license.key_issued",
    message: `Key ${kind === "trial" ? `trial ${days} hari` : kind === "paid" ? `berlangganan ${days} hari` : "belum berlangganan"} dibuat untuk "${tenant.name}"${issued.label ? ` (${issued.label})` : ""}`,
    actorType: "superadmin", actorLabel: by, metadata: { keyId: issued.id, kind, days },
  });
  res.status(201).json({ id: issued.id, label: issued.label, licenseType: issued.licenseType, licenseEndsAt: issued.licenseEndsAt, key: issued.rawKey });
});

// PATCH /api/superadmin/licenses/:id  { label?, licenseType?, licenseEndsAt?, extendDays?, planSlug? }
// Full manual control of one booth's licence. `extendDays` counts from the later of the current end and now (negative
// values shorten, counted from the current end); `licenseEndsAt` sets an exact date (null = unlimited, paid only).
licensesAdminRouter.patch("/:id", async (req, res) => {
  const id = req.params.id;
  if (!isUuid(id)) return res.status(400).json({ error: "Booth tidak valid" });
  const [key] = await db.select().from(kioskKeys).where(eq(kioskKeys.id, id));
  if (!key) return res.status(404).json({ error: "Booth tidak ditemukan" });

  const patch: Partial<typeof kioskKeys.$inferInsert> = {};
  if (req.body?.label !== undefined) patch.label = String(req.body.label ?? "").trim().slice(0, 80) || null;
  if (req.body?.planSlug !== undefined) patch.licensePlanSlug = req.body.planSlug ? String(req.body.planSlug).slice(0, 60) : null;

  let type = key.licenseType;
  if (req.body?.licenseType !== undefined) {
    if (!KINDS.includes(req.body.licenseType)) return res.status(400).json({ error: "Jenis lisensi harus trial, paid, atau unpaid" });
    type = req.body.licenseType;
  }
  let endsAt: Date | null = key.licenseEndsAt;
  if (req.body?.licenseEndsAt !== undefined) {
    if (req.body.licenseEndsAt === null || req.body.licenseEndsAt === "") endsAt = null;
    else {
      endsAt = new Date(req.body.licenseEndsAt);
      if (Number.isNaN(endsAt.getTime())) return res.status(400).json({ error: "Tanggal berakhir tidak valid" });
    }
  } else if (req.body?.extendDays !== undefined) {
    const days = Math.round(Number(req.body.extendDays));
    if (!Number.isFinite(days) || days === 0 || Math.abs(days) > 3650) return res.status(400).json({ error: "Jumlah hari harus bilangan bulat antara -3650 dan 3650 (bukan 0)" });
    const base = days > 0 ? Math.max(endsAt ? endsAt.getTime() : 0, Date.now()) : (endsAt ? endsAt.getTime() : Date.now());
    endsAt = new Date(base + days * DAY_MS);
    if (type === "unpaid") type = "paid"; // extending an unpaid booth by hand grants it a paid period
  }

  if (type === "unpaid") endsAt = null;
  if (type === "trial" && !endsAt) return res.status(400).json({ error: "Trial wajib punya tanggal berakhir" });
  patch.licenseType = type;
  patch.licenseEndsAt = endsAt;
  if (type === "trial" && !key.trialStartedAt) patch.trialStartedAt = new Date();

  const [row] = await db.update(kioskKeys).set(patch).where(eq(kioskKeys.id, id)).returning();
  clearLicenseCache();
  await syncTenantEndsAt(key.tenantId);
  const by = await actorLabel(req);
  logEvent({
    tenantId: key.tenantId, category: "billing", action: "license.updated",
    message: `Lisensi booth "${key.label ?? key.id.slice(0, 8)}" diubah manual: ${key.licenseType} → ${type}, berakhir ${endsAt ? endsAt.toISOString().slice(0, 10) : "tanpa batas"}`,
    actorType: "superadmin", actorLabel: by, metadata: { keyId: id, from: { type: key.licenseType, endsAt: key.licenseEndsAt }, to: { type, endsAt } },
  });
  res.json(row);
});

// POST /api/superadmin/licenses/:id/reset-device — free the key so it can be paired with a different computer
licensesAdminRouter.post("/:id/reset-device", async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: "Booth tidak valid" });
  const [row] = await db.update(kioskKeys).set({ boundDeviceId: null, boundAt: null }).where(eq(kioskKeys.id, req.params.id)).returning({ id: kioskKeys.id, tenantId: kioskKeys.tenantId, label: kioskKeys.label });
  if (!row) return res.status(404).json({ error: "Booth tidak ditemukan" });
  clearKioskAuthCache();
  logEvent({ tenantId: row.tenantId, category: "kiosk", action: "kiosk_key.device_reset", message: `Device booth "${row.label ?? row.id.slice(0, 8)}" direset oleh superadmin`, actorType: "superadmin", actorLabel: await actorLabel(req) });
  res.json({ ok: true });
});

// POST /api/superadmin/licenses/:id/revoke and /restore
licensesAdminRouter.post("/:id/revoke", async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: "Booth tidak valid" });
  const [row] = await db.update(kioskKeys).set({ revokedAt: new Date() }).where(and(eq(kioskKeys.id, req.params.id), isNull(kioskKeys.revokedAt))).returning({ id: kioskKeys.id, tenantId: kioskKeys.tenantId, label: kioskKeys.label });
  if (!row) return res.status(404).json({ error: "Booth tidak ditemukan atau sudah dicabut" });
  clearKioskAuthCache();
  clearLicenseCache();
  await syncTenantEndsAt(row.tenantId);
  logEvent({ tenantId: row.tenantId, category: "kiosk", action: "kiosk_key.revoked", message: `Booth "${row.label ?? row.id.slice(0, 8)}" dicabut oleh superadmin`, actorType: "superadmin", actorLabel: await actorLabel(req) });
  res.json({ ok: true });
});

licensesAdminRouter.post("/:id/restore", async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: "Booth tidak valid" });
  const [row] = await db.update(kioskKeys).set({ revokedAt: null }).where(and(eq(kioskKeys.id, req.params.id), isNotNull(kioskKeys.revokedAt))).returning({ id: kioskKeys.id, tenantId: kioskKeys.tenantId, label: kioskKeys.label });
  if (!row) return res.status(404).json({ error: "Booth tidak ditemukan atau tidak sedang dicabut" });
  clearKioskAuthCache();
  clearLicenseCache();
  await syncTenantEndsAt(row.tenantId);
  logEvent({ tenantId: row.tenantId, category: "kiosk", action: "kiosk_key.restored", message: `Booth "${row.label ?? row.id.slice(0, 8)}" diaktifkan kembali oleh superadmin`, actorType: "superadmin", actorLabel: await actorLabel(req) });
  res.json({ ok: true });
});

// GET /api/superadmin/licenses/:id/key — the raw key, to hand it to the customer again
licensesAdminRouter.get("/:id/key", async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: "Booth tidak valid" });
  const [row] = await db.select({ key: kioskKeys.rawKey, tenantId: kioskKeys.tenantId, label: kioskKeys.label }).from(kioskKeys).where(eq(kioskKeys.id, req.params.id));
  if (!row) return res.status(404).json({ error: "Booth tidak ditemukan" });
  if (!row.key) return res.status(410).json({ error: "Key ini dibuat sebelum fitur lihat-ulang tersedia — tidak bisa ditampilkan lagi." });
  logEvent({ tenantId: row.tenantId, category: "auth", action: "kiosk_key.revealed", message: `Key booth "${row.label ?? req.params.id.slice(0, 8)}" dilihat oleh superadmin`, actorType: "superadmin", actorLabel: await actorLabel(req) });
  res.json({ key: row.key });
});
