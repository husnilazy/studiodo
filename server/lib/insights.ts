import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { billingOrders, kioskKeys, platformEvents, sessions, supportThreads, tenantPayments, tenants, withdrawals } from "../db/schema.js";

// What the owner needs to see without digging: tenant health, revenue/churn, the trial funnel, the booth fleet and anything odd.
// The scoring rules are pure functions (tested on their own); the loaders only gather the numbers.

const DAY = 86_400_000;
export const ONLINE_MS = 10 * 60_000;

// --- pure rules ----------------------------------------------------------------------------------------------------------------

export type LicenceStage = "ok" | "ending" | "expired" | "none";
export interface HealthInput { sessions30: number; sessionsPrev30: number; keys: number; keysHealthy: number; keysOnline: number; licence: LicenceStage; unansweredSupport: boolean }
export type HealthLevel = "healthy" | "watch" | "risk";
export interface Health { score: number; level: HealthLevel; reasons: string[] }

export function scoreTenant(i: HealthInput): Health {
  const reasons: string[] = [];
  let usage = Math.min(1, i.sessions30 / 45) * 40;
  if (i.sessions30 === 0) reasons.push("Tidak ada sesi foto dalam 30 hari terakhir");
  else if (i.sessionsPrev30 >= 10 && i.sessions30 < i.sessionsPrev30 * 0.5) { usage *= 0.6; reasons.push(`Pemakaian turun lebih dari separuh (${i.sessionsPrev30} → ${i.sessions30} sesi)`); }

  let tech = 0;
  if (i.keys === 0) reasons.push("Belum ada booth aktif");
  else {
    tech = (i.keysHealthy / i.keys) * 15 + (i.keysOnline / i.keys) * 10;
    if (i.keysOnline === 0) reasons.push("Semua booth offline");
    if (i.keysHealthy < i.keys) reasons.push(`${i.keys - i.keysHealthy} booth melaporkan masalah kamera/printer/jaringan`);
  }

  const licence = i.licence === "ok" ? 25 : i.licence === "ending" ? 12 : 0;
  if (i.licence === "ending") reasons.push("Masa aktif booth hampir habis");
  if (i.licence === "expired") reasons.push("Masa aktif booth sudah habis");
  if (i.licence === "none" && i.keys > 0) reasons.push("Tidak ada booth berlangganan");

  const support = i.unansweredSupport ? 0 : 10;
  if (i.unansweredSupport) reasons.push("Pesan bantuan belum dibalas");

  const score = Math.round(usage + tech + licence + support);
  return { score, level: score >= 75 ? "healthy" : score >= 50 ? "watch" : "risk", reasons };
}

export function licenceStage(keys: { type: string; endsAt: Date | null }[], now: Date): LicenceStage {
  const active = keys.filter((k) => (k.type === "paid" && (!k.endsAt || k.endsAt > now)) || (k.type === "trial" && k.endsAt && k.endsAt > now));
  if (active.length === 0) return keys.some((k) => (k.type === "paid" || k.type === "trial") && k.endsAt && k.endsAt <= now) ? "expired" : "none";
  const soonest = Math.min(...active.map((k) => (k.endsAt ? k.endsAt.getTime() : Infinity)));
  return soonest - now.getTime() <= 7 * DAY ? "ending" : "ok";
}

/** Dotted-number comparison ("0.1.19" < "0.1.30"). Non-numeric parts compare as 0. */
export function compareVersions(a: string | null | undefined, b: string | null | undefined): number {
  const pa = String(a ?? "").replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b ?? "").replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

export interface MrrOrder { amount: number; periodDays: number; at: Date }
/** Monthly-equivalent value of every payment whose coverage is still running: a Rp 300k / 30-day and a Rp 3.6M / 360-day payment both count as ~Rp 300k. */
export function estimateMrr(orders: MrrOrder[], now: Date): number {
  return Math.round(orders.filter((o) => o.periodDays > 0 && o.at.getTime() + o.periodDays * DAY > now.getTime()).reduce((sum, o) => sum + (o.amount * 30) / o.periodDays, 0));
}

export function isAnomalousWithdrawal(amount: number, paidHistory: number[]): string | null {
  if (paidHistory.length >= 2) {
    const avg = paidHistory.reduce((a, b) => a + b, 0) / paidHistory.length;
    if (amount >= 500_000 && amount > avg * 3) return `Penarikan Rp ${Math.round(amount).toLocaleString("id-ID")} — lebih dari 3× rata-rata penarikan sebelumnya (Rp ${Math.round(avg).toLocaleString("id-ID")})`;
    return null;
  }
  return amount >= 5_000_000 ? `Penarikan pertama yang besar: Rp ${Math.round(amount).toLocaleString("id-ID")}` : null;
}

// --- loaders -------------------------------------------------------------------------------------------------------------------

export interface TenantHealthRow { tenantId: string; name: string; status: string; ownerWhatsapp: string | null; score: number; level: HealthLevel; reasons: string[]; sessions30: number; keys: number; online: number; licence: LicenceStage }

export async function tenantHealth(now: Date = new Date()): Promise<TenantHealthRow[]> {
  const d30 = new Date(now.getTime() - 30 * DAY);
  const d60 = new Date(now.getTime() - 60 * DAY);
  const [tenantRows, sessionRows, keyRows, threadRows] = await Promise.all([
    db.select({ id: tenants.id, name: tenants.name, status: tenants.status, phone: tenants.ownerWhatsapp }).from(tenants),
    db.select({
      tenantId: sessions.tenantId,
      cur: sql<number>`count(*) filter (where ${sessions.createdAt} >= ${d30})::int`,
      prev: sql<number>`count(*) filter (where ${sessions.createdAt} < ${d30})::int`,
    }).from(sessions).where(and(eq(sessions.paymentStatus, "success"), gte(sessions.createdAt, d60))).groupBy(sessions.tenantId),
    db.select({ tenantId: kioskKeys.tenantId, lastUsedAt: kioskKeys.lastUsedAt, diag: kioskKeys.lastDiagnostics, type: kioskKeys.licenseType, endsAt: kioskKeys.licenseEndsAt }).from(kioskKeys).where(isNull(kioskKeys.revokedAt)),
    db.select({ tenantId: supportThreads.tenantId }).from(supportThreads).where(and(eq(supportThreads.status, "open"), eq(supportThreads.lastSender, "tenant"))),
  ]);
  const sess = new Map(sessionRows.map((r) => [r.tenantId, r]));
  const needsReply = new Set(threadRows.map((r) => r.tenantId));
  const keysBy = new Map<string, typeof keyRows>();
  for (const k of keyRows) keysBy.set(k.tenantId, [...(keysBy.get(k.tenantId) ?? []), k]);

  return tenantRows.filter((t) => t.status !== "suspended").map((t) => {
    const keys = keysBy.get(t.id) ?? [];
    const online = keys.filter((k) => k.lastUsedAt && now.getTime() - new Date(k.lastUsedAt).getTime() < ONLINE_MS).length;
    const healthy = keys.filter((k) => !k.diag || (k.diag.cameraOk && k.diag.printerOk && k.diag.networkOk)).length;
    const licence = licenceStage(keys.map((k) => ({ type: k.type, endsAt: k.endsAt ? new Date(k.endsAt) : null })), now);
    const s = sess.get(t.id);
    const health = scoreTenant({ sessions30: s?.cur ?? 0, sessionsPrev30: s?.prev ?? 0, keys: keys.length, keysHealthy: healthy, keysOnline: online, licence, unansweredSupport: needsReply.has(t.id) });
    return { tenantId: t.id, name: t.name, status: t.status, ownerWhatsapp: t.phone, ...health, sessions30: s?.cur ?? 0, keys: keys.length, online, licence };
  }).sort((a, b) => a.score - b.score);
}

export interface RevenueInsights {
  mrr: number; revenue30: number; revenuePrev30: number; payingTenants: number; newPaying30: number; churned30: number;
  monthly: { month: string; revenue: number }[];
  funnel: { trialsIssued: number; activated: number; used: number; converted: number; expiredUnconverted: number };
}

export async function revenueInsights(now: Date = new Date()): Promise<RevenueInsights> {
  const d30 = new Date(now.getTime() - 30 * DAY);
  const d60 = new Date(now.getTime() - 60 * DAY);
  const d90 = new Date(now.getTime() - 90 * DAY);
  const d180 = new Date(now.getTime() - 180 * DAY);
  const [orders, manual, keyAgg, usedAgg] = await Promise.all([
    db.select({ tenantId: billingOrders.tenantId, amount: billingOrders.amount, periodDays: billingOrders.periodDays, at: billingOrders.paidAt }).from(billingOrders).where(and(eq(billingOrders.status, "paid"), gte(billingOrders.paidAt, d180))),
    db.select({ tenantId: tenantPayments.tenantId, amount: tenantPayments.amount, periodDays: tenantPayments.periodDays, at: tenantPayments.createdAt }).from(tenantPayments).where(gte(tenantPayments.createdAt, d180)),
    db.select({
      issued: sql<number>`count(*)::int`,
      activated: sql<number>`count(*) filter (where ${kioskKeys.activatedAt} is not null)::int`,
      converted: sql<number>`count(*) filter (where ${kioskKeys.licenseType} = 'paid')::int`,
      expired: sql<number>`count(*) filter (where ${kioskKeys.licenseType} = 'trial' and ${kioskKeys.licenseEndsAt} < ${now})::int`,
    }).from(kioskKeys).where(gte(kioskKeys.trialStartedAt, d90)),
    db.select({ n: sql<number>`count(distinct ${sessions.kioskKeyId})::int` }).from(sessions).innerJoin(kioskKeys, eq(kioskKeys.id, sessions.kioskKeyId)).where(and(gte(kioskKeys.trialStartedAt, d90), eq(sessions.paymentStatus, "success"))),
  ]);
  const all = [...orders, ...manual].filter((o) => o.at).map((o) => ({ tenantId: o.tenantId, amount: Number(o.amount), periodDays: o.periodDays, at: new Date(o.at as Date) }));
  const inWindow = (from: Date, to: Date) => all.filter((o) => o.at >= from && o.at < to).reduce((s, o) => s + o.amount, 0);
  const coverageEnd = new Map<string, number>(); // latest end of paid coverage per tenant
  const firstPaid = new Map<string, number>();
  for (const o of all) {
    coverageEnd.set(o.tenantId, Math.max(coverageEnd.get(o.tenantId) ?? 0, o.at.getTime() + o.periodDays * DAY));
    firstPaid.set(o.tenantId, Math.min(firstPaid.get(o.tenantId) ?? Infinity, o.at.getTime()));
  }
  const monthly: { month: string; revenue: number }[] = [];
  for (let m = 5; m >= 0; m--) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m + 1, 1));
    monthly.push({ month: start.toISOString().slice(0, 7), revenue: Math.round(inWindow(start, end)) });
  }
  return {
    mrr: estimateMrr(all, now),
    revenue30: Math.round(inWindow(d30, now)), revenuePrev30: Math.round(inWindow(d60, d30)),
    payingTenants: [...coverageEnd.values()].filter((end) => end > now.getTime()).length,
    newPaying30: [...firstPaid.values()].filter((t) => t >= d30.getTime()).length,
    churned30: [...coverageEnd.values()].filter((end) => end <= now.getTime() && end > d30.getTime()).length,
    monthly,
    funnel: { trialsIssued: keyAgg[0]?.issued ?? 0, activated: keyAgg[0]?.activated ?? 0, used: usedAgg[0]?.n ?? 0, converted: keyAgg[0]?.converted ?? 0, expiredUnconverted: keyAgg[0]?.expired ?? 0 },
  };
}

export interface FleetRow { keyId: string; label: string | null; tenantId: string; tenantName: string; version: string | null; outdated: boolean; online: boolean; lastUsedAt: string | null; issues: string[]; autoUpdate: boolean; licenceType: string; licenceEndsAt: string | null }

export async function fleet(now: Date = new Date()): Promise<{ latest: string | null; rows: FleetRow[] }> {
  const rows = await db.select({
    id: kioskKeys.id, label: kioskKeys.label, tenantId: kioskKeys.tenantId, tenantName: tenants.name, version: kioskKeys.appVersion, lastUsedAt: kioskKeys.lastUsedAt,
    diag: kioskKeys.lastDiagnostics, auto: kioskKeys.autoUpdateEnabled, type: kioskKeys.licenseType, endsAt: kioskKeys.licenseEndsAt, bound: kioskKeys.boundDeviceId,
  }).from(kioskKeys).innerJoin(tenants, eq(tenants.id, kioskKeys.tenantId)).where(isNull(kioskKeys.revokedAt));
  let latest: string | null = null;
  for (const r of rows) if (r.version && (!latest || compareVersions(r.version, latest) > 0)) latest = r.version;
  return {
    latest,
    rows: rows.filter((r) => r.bound || r.version).map((r) => ({
      keyId: r.id, label: r.label, tenantId: r.tenantId, tenantName: r.tenantName, version: r.version, outdated: Boolean(latest && r.version && compareVersions(r.version, latest) < 0),
      online: Boolean(r.lastUsedAt && now.getTime() - new Date(r.lastUsedAt).getTime() < ONLINE_MS), lastUsedAt: r.lastUsedAt ? new Date(r.lastUsedAt).toISOString() : null,
      issues: r.diag ? [!r.diag.cameraOk && "kamera", !r.diag.printerOk && "printer", !r.diag.networkOk && "jaringan"].filter(Boolean) as string[] : [],
      autoUpdate: r.auto, licenceType: r.type, licenceEndsAt: r.endsAt ? new Date(r.endsAt).toISOString() : null,
    })).sort((a, b) => Number(b.issues.length > 0) - Number(a.issues.length > 0) || Number(b.outdated) - Number(a.outdated) || a.tenantName.localeCompare(b.tenantName)),
  };
}

export interface Anomaly { kind: string; severity: "warning" | "critical"; tenantId: string | null; tenantName: string | null; message: string }

export async function anomalies(now: Date = new Date()): Promise<Anomaly[]> {
  const out: Anomaly[] = [];
  const names = new Map((await db.select({ id: tenants.id, name: tenants.name }).from(tenants)).map((t) => [t.id, t.name]));
  const d1 = new Date(now.getTime() - DAY);
  const d14 = new Date(now.getTime() - 15 * DAY);

  // Big payouts compared with the tenant's own history
  const open = await db.select({ tenantId: withdrawals.tenantId, amount: withdrawals.amount }).from(withdrawals).where(inArray(withdrawals.status, ["pending", "processing"]));
  if (open.length) {
    const history = await db.select({ tenantId: withdrawals.tenantId, amount: withdrawals.amount }).from(withdrawals).where(eq(withdrawals.status, "paid"));
    for (const w of open) {
      const reason = isAnomalousWithdrawal(Number(w.amount), history.filter((h) => h.tenantId === w.tenantId).map((h) => Number(h.amount)));
      if (reason) out.push({ kind: "withdrawal.large", severity: "warning", tenantId: w.tenantId, tenantName: names.get(w.tenantId) ?? null, message: reason });
    }
  }

  // A sudden burst of paid sessions, or a payment-failure storm, in the last 24h
  const perTenant = await db.select({
    tenantId: sessions.tenantId,
    today: sql<number>`count(*) filter (where ${sessions.createdAt} >= ${d1} and ${sessions.paymentStatus} = 'success')::int`,
    base: sql<number>`count(*) filter (where ${sessions.createdAt} < ${d1} and ${sessions.paymentStatus} = 'success')::int`,
    bad: sql<number>`count(*) filter (where ${sessions.createdAt} >= ${d1} and ${sessions.paymentStatus} in ('failed', 'expired'))::int`,
    all: sql<number>`count(*) filter (where ${sessions.createdAt} >= ${d1})::int`,
  }).from(sessions).where(gte(sessions.createdAt, d14)).groupBy(sessions.tenantId);
  for (const r of perTenant) {
    const avg = r.base / 14;
    if (r.today >= 20 && r.today > avg * 4) out.push({ kind: "sessions.spike", severity: "warning", tenantId: r.tenantId, tenantName: names.get(r.tenantId) ?? null, message: `${r.today} sesi berbayar dalam 24 jam — lebih dari 4× rata-rata harian (${avg.toFixed(1)})` });
    if (r.all >= 10 && r.bad / r.all > 0.6) out.push({ kind: "payments.failing", severity: "critical", tenantId: r.tenantId, tenantName: names.get(r.tenantId) ?? null, message: `${r.bad} dari ${r.all} pembayaran kiosk gagal/kedaluwarsa dalam 24 jam — periksa pengaturan QRIS tenant` });
  }

  // Repeated lockouts = someone guessing passwords
  const locks = await db.select({ n: sql<number>`count(*)::int` }).from(platformEvents).where(and(inArray(platformEvents.action, ["login.lockout", "login.lockout.ip", "superadmin.login.lockout", "superadmin.2fa.lockout"]), gte(platformEvents.createdAt, d1)));
  if ((locks[0]?.n ?? 0) >= 3) out.push({ kind: "auth.lockouts", severity: "critical", tenantId: null, tenantName: null, message: `${locks[0].n} akun/IP terkunci karena banyak percobaan login gagal dalam 24 jam` });

  return out;
}
