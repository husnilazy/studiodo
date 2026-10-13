import { Router } from "express";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { kioskKeys, packages, sessions, tenants } from "../db/schema.js";
import { requireAdminAuth } from "../middleware/adminAuth.js";
import { computeKeyLock, getGracePeriodDays } from "../lib/license.js";
import { ACTIVE_SESSION_WINDOW_MS, boothState, sessionStage, startOfTodayWib, type BoothState, type SessionStage } from "../lib/live.js";

// Live booth monitor (mounted at /api/live, tenant-admin auth): one account, many booths, one screen. Polled every few
// seconds by the kiosk app's admin and the website portal, so it stays to a handful of indexed queries.

export const liveRouter = Router();
liveRouter.use(requireAdminAuth);

liveRouter.get("/", async (req, res) => {
  const tenantId = req.tenantId!;
  const now = Date.now();
  const todayStart = startOfTodayWib(now);
  const openSince = new Date(now - ACTIVE_SESSION_WINDOW_MS);

  const photoCountSql = sql<number>`coalesce(jsonb_array_length(${sessions.photoUrls}), 0)::int`;
  const [[tenant], grace, keys, openRows, todayRows, recentRows] = await Promise.all([
    db.select({ status: tenants.status }).from(tenants).where(eq(tenants.id, tenantId)),
    getGracePeriodDays(),
    db.select({
      id: kioskKeys.id, label: kioskKeys.label, lastUsedAt: kioskKeys.lastUsedAt, appVersion: kioskKeys.appVersion,
      lastDiagnostics: kioskKeys.lastDiagnostics, boundDeviceId: kioskKeys.boundDeviceId,
      licenseType: kioskKeys.licenseType, licenseEndsAt: kioskKeys.licenseEndsAt,
    }).from(kioskKeys).where(and(eq(kioskKeys.tenantId, tenantId), isNull(kioskKeys.revokedAt))).orderBy(kioskKeys.createdAt),
    // Sessions that might still be in progress: recent, not finished, paid or waiting to be paid.
    db.select({
      id: sessions.id, kioskKeyId: sessions.kioskKeyId, paymentStatus: sessions.paymentStatus, completedAt: sessions.completedAt,
      createdAt: sessions.createdAt, totalAmount: sessions.totalAmount, photoCount: photoCountSql,
      packageName: packages.name, packagePhotoCount: packages.photoCount,
    }).from(sessions).leftJoin(packages, eq(packages.id, sessions.packageId))
      .where(and(eq(sessions.tenantId, tenantId), isNull(sessions.completedAt), gte(sessions.createdAt, openSince), inArray(sessions.paymentStatus, ["pending", "success"])))
      .orderBy(desc(sessions.createdAt)).limit(200),
    db.select({
      kioskKeyId: sessions.kioskKeyId,
      sessions: sql<number>`count(*)::int`,
      paid: sql<number>`(count(*) filter (where ${sessions.paymentStatus} = 'success'))::int`,
      revenue: sql<number>`coalesce(sum(${sessions.totalAmount}) filter (where ${sessions.paymentStatus} = 'success'), 0)::float8`,
      photos: sql<number>`coalesce(sum(${photoCountSql}) filter (where ${sessions.paymentStatus} = 'success'), 0)::int`,
      lastAt: sql<Date | null>`max(${sessions.createdAt})`,
    }).from(sessions).where(and(eq(sessions.tenantId, tenantId), gte(sessions.createdAt, todayStart))).groupBy(sessions.kioskKeyId),
    db.select({
      id: sessions.id, kioskKeyId: sessions.kioskKeyId, createdAt: sessions.createdAt, completedAt: sessions.completedAt,
      paymentStatus: sessions.paymentStatus, totalAmount: sessions.totalAmount, packageName: packages.name,
      hasContact: sql<boolean>`(coalesce(${sessions.customerWhatsapp}, '') <> '' or coalesce(${sessions.customerEmail}, '') <> '')`,
    }).from(sessions).leftJoin(packages, eq(packages.id, sessions.packageId))
      .where(and(eq(sessions.tenantId, tenantId), gte(sessions.createdAt, todayStart), inArray(sessions.paymentStatus, ["pending", "success"])))
      .orderBy(desc(sessions.createdAt)).limit(15),
  ]);

  // Open sessions → stage; newest per booth is "current", the rest of the unpaid ones are the booth's waiting line.
  const openByBooth = new Map<string, { current: (typeof openRows)[number] & { stage: SessionStage }; waiting: number }>();
  for (const row of openRows) {
    if (!row.kioskKeyId) continue;
    const stage = sessionStage({ paymentStatus: row.paymentStatus, completedAt: row.completedAt, createdAt: row.createdAt, photoCount: row.photoCount, packagePhotoCount: row.packagePhotoCount }, now);
    if (!stage) continue;
    const entry = openByBooth.get(row.kioskKeyId);
    if (!entry) openByBooth.set(row.kioskKeyId, { current: { ...row, stage }, waiting: 0 });
    else if (stage === "payment") entry.waiting += 1;
  }
  const todayByBooth = new Map(todayRows.map((r) => [r.kioskKeyId ?? "", r]));
  const labelById = new Map(keys.map((k) => [k.id, k.label ?? "Booth tanpa nama"]));

  const booths = keys.map((k) => {
    const lock = computeKeyLock(tenant?.status ?? "active", k, grace, now);
    const open = openByBooth.get(k.id);
    const state: BoothState = boothState({ locked: lock.locked, lastUsedAt: k.lastUsedAt, stage: open?.current.stage ?? null }, now);
    const today = todayByBooth.get(k.id);
    return {
      id: k.id,
      label: k.label ?? "Booth tanpa nama",
      state,
      paired: !!k.boundDeviceId,
      lastUsedAt: k.lastUsedAt,
      appVersion: k.appVersion,
      diagnostics: k.lastDiagnostics,
      licenseType: lock.licenseType,
      lockReason: lock.reason,
      daysRemaining: lock.daysRemaining,
      current: open && (state === "payment" || state === "capture" || state === "review") ? {
        sessionId: open.current.id, stage: open.current.stage, packageName: open.current.packageName,
        photoCount: open.current.photoCount, photoTarget: open.current.packagePhotoCount,
        amount: Number(open.current.totalAmount ?? 0), startedAt: open.current.createdAt,
      } : null,
      waiting: open?.waiting ?? 0,
      today: { sessions: today?.sessions ?? 0, paid: today?.paid ?? 0, revenue: Number(today?.revenue ?? 0), photos: today?.photos ?? 0 },
      lastSessionAt: today?.lastAt ?? null,
    };
  });

  const total = todayRows.reduce((acc, r) => ({ sessions: acc.sessions + r.sessions, paid: acc.paid + r.paid, revenue: acc.revenue + Number(r.revenue) }), { sessions: 0, paid: 0, revenue: 0 });
  res.json({
    now: new Date(now).toISOString(),
    summary: {
      booths: booths.length,
      online: booths.filter((b) => b.state !== "offline" && b.state !== "locked").length,
      inSession: booths.filter((b) => b.state === "capture" || b.state === "review").length,
      waitingPayment: booths.reduce((n, b) => n + (b.state === "payment" ? 1 : 0) + b.waiting, 0),
      offline: booths.filter((b) => b.state === "offline").length,
      locked: booths.filter((b) => b.state === "locked").length,
      sessionsToday: total.sessions, paidToday: total.paid, revenueToday: total.revenue,
    },
    booths,
    recent: recentRows.map((r) => ({
      id: r.id, at: r.createdAt, booth: r.kioskKeyId ? labelById.get(r.kioskKeyId) ?? "Booth lain" : "—",
      packageName: r.packageName, amount: Number(r.totalAmount ?? 0), paymentStatus: r.paymentStatus,
      done: !!r.completedAt, hasContact: r.hasContact,
    })),
  });
});
