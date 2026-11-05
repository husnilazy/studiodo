import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { adminNotifications, billingOrders, leadTasks, platformEvents, platformSettings, supportThreads, tenantApplications, withdrawals } from "../db/schema.js";
import { normalizeWhatsapp } from "./crm.js";
import { anomalies, fleet } from "./insights.js";
import { logEvent } from "./platformEvents.js";
import { findUncreditedPayments } from "./qrisBalance.js";
import { upcomingReminders } from "./tenantWhatsapp.js";
import { loadWaConfig, sendWhatsapp } from "./whatsapp.js";

// The morning summary: one WhatsApp (and one in-app entry) a day with everything that needs a person's attention. Built from the
// same numbers the dashboard shows; sent once per WIB day, from the configured hour on, only when the owner switched it on.

export interface DigestSettings { enabled: boolean; hour: number }
export const DEFAULT_DIGEST: DigestSettings = { enabled: false, hour: 7 };

export function sanitizeDigest(input: unknown): DigestSettings {
  const raw = (input && typeof input === "object" ? input : {}) as { enabled?: unknown; hour?: unknown };
  const hour = Number(raw.hour);
  return { enabled: raw.enabled === true, hour: Number.isInteger(hour) && hour >= 5 && hour <= 11 ? hour : DEFAULT_DIGEST.hour };
}

/** The civil date and hour in Indonesia (WIB, UTC+7). */
export function wib(now: Date): { day: string; hour: number } {
  const shifted = new Date(now.getTime() + 7 * 3_600_000);
  return { day: shifted.toISOString().slice(0, 10), hour: shifted.getUTCHours() };
}

export interface DigestStats {
  payments: number; paymentsAmount: number; newApplications: number; expiring: number; expiringNames: string[]; overdueTasks: number; newLeads: number;
  needsReply: number; boothIssues: number; boothOffline: number; openWithdrawals: number; openWithdrawalsAmount: number; anomalies: number; uncredited: number;
}

export const rp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

export function digestText(s: DigestStats, now: Date, appUrl?: string): string {
  const date = now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jakarta" });
  const lines: string[] = [`☀️ *Ringkasan pagi STUDIODO* — ${date}`, ""];
  lines.push(`💰 Pembayaran 24 jam: ${s.payments}${s.payments ? ` (${rp(s.paymentsAmount)})` : ""}`);
  lines.push(`🆕 Pendaftaran baru: ${s.newApplications}`);
  const todo: string[] = [];
  if (s.expiring) todo.push(`⏳ Masa aktif hampir/baru habis: ${s.expiring} tenant — ${s.expiringNames.slice(0, 5).join(", ")}${s.expiring > 5 ? ", …" : ""}`);
  if (s.overdueTasks || s.newLeads) todo.push(`📞 Follow-up: ${s.overdueTasks} tugas jatuh tempo · ${s.newLeads} calon tenant belum dihubungi`);
  if (s.needsReply) todo.push(`💬 Pesan bantuan belum dibalas: ${s.needsReply}`);
  if (s.boothIssues || s.boothOffline) todo.push(`🖥️ Booth: ${s.boothIssues} bermasalah · ${s.boothOffline} offline`);
  if (s.openWithdrawals) todo.push(`🏦 Penarikan menunggu: ${s.openWithdrawals} (${rp(s.openWithdrawalsAmount)})`);
  if (s.anomalies) todo.push(`⚠️ Anomali terdeteksi: ${s.anomalies}`);
  if (s.uncredited) todo.push(`🧾 Pembayaran belum masuk saldo tenant: ${s.uncredited}`);
  lines.push("", ...(todo.length ? ["*Perlu perhatian:*", ...todo] : ["✅ Tidak ada yang mendesak pagi ini."]));
  if (appUrl) lines.push("", `Buka: ${appUrl}`);
  return lines.join("\n");
}

export async function digestStats(now: Date = new Date()): Promise<DigestStats> {
  const d1 = new Date(now.getTime() - 86_400_000);
  const [paid, apps, upcoming, overdue, fresh, threads, fl, wd, anom, uncredited] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int`, sum: sql<string>`coalesce(sum(${billingOrders.amount}), 0)` }).from(billingOrders).where(and(eq(billingOrders.status, "paid"), gte(billingOrders.paidAt, d1))),
    db.select({ n: sql<number>`count(*)::int` }).from(tenantApplications).where(gte(tenantApplications.createdAt, d1)),
    upcomingReminders(now),
    db.select({ n: sql<number>`count(*)::int` }).from(leadTasks).where(and(isNull(leadTasks.doneAt), lte(leadTasks.dueAt, now))),
    db.select({ n: sql<number>`count(*)::int` }).from(tenantApplications).where(eq(tenantApplications.pipelineStage, "new")),
    db.select({ n: sql<number>`count(*)::int` }).from(supportThreads).where(and(eq(supportThreads.status, "open"), eq(supportThreads.lastSender, "tenant"))),
    fleet(now),
    db.select({ n: sql<number>`count(*)::int`, sum: sql<string>`coalesce(sum(${withdrawals.amount}), 0)` }).from(withdrawals).where(inArray(withdrawals.status, ["pending", "processing"])),
    anomalies(now),
    findUncreditedPayments(),
  ]);
  return {
    payments: paid[0]?.n ?? 0, paymentsAmount: Number(paid[0]?.sum ?? 0), newApplications: apps[0]?.n ?? 0,
    expiring: upcoming.length, expiringNames: upcoming.map((u) => u.name), overdueTasks: overdue[0]?.n ?? 0, newLeads: fresh[0]?.n ?? 0, needsReply: threads[0]?.n ?? 0,
    boothIssues: fl.rows.filter((r) => r.issues.length > 0).length, boothOffline: fl.rows.filter((r) => !r.online).length,
    openWithdrawals: wd[0]?.n ?? 0, openWithdrawalsAmount: Number(wd[0]?.sum ?? 0), anomalies: anom.length, uncredited: uncredited.length,
  };
}

export async function loadDigestSettings(): Promise<DigestSettings> {
  const [row] = await db.select({ d: platformSettings.digestSettings }).from(platformSettings).limit(1);
  return row?.d ? sanitizeDigest(row.d) : DEFAULT_DIGEST;
}

/** Sends the digest now (used by the daily job and the "Kirim sekarang" button). Always records the in-app copy. */
export async function sendDigest(now: Date = new Date(), fetchImpl: typeof fetch = fetch): Promise<{ text: string; whatsapp: "sent" | "no_gateway" | "no_number" | "failed"; error?: string }> {
  const text = digestText(await digestStats(now), now);
  await db.insert(adminNotifications).values({ kind: "digest.daily", severity: "info", title: "Ringkasan pagi", body: text, link: "insights" });
  const [settings] = await db.select({ number: platformSettings.adminWaNumber }).from(platformSettings).limit(1);
  const to = normalizeWhatsapp(settings?.number);
  if (!to) return { text, whatsapp: "no_number" };
  const config = await loadWaConfig();
  if (!config) return { text, whatsapp: "no_gateway" };
  const result = await sendWhatsapp(config, to, text, fetchImpl);
  return result.ok ? { text, whatsapp: "sent" } : { text, whatsapp: "failed", error: result.error };
}

/** Called every few minutes: sends at most once per WIB day, from the chosen hour on. Returns whether it sent. */
export async function runDailyDigest(now: Date = new Date(), fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const settings = await loadDigestSettings();
  const { day, hour } = wib(now);
  if (!settings.enabled || hour < settings.hour) return false;
  const already = await db.select({ id: platformEvents.id }).from(platformEvents).where(and(eq(platformEvents.action, "digest.sent"), sql`${platformEvents.metadata}->>'day' = ${day}`)).limit(1);
  if (already.length) return false;
  // Log first: if sending crashes midway we would rather skip a day than send the same summary every 10 minutes.
  logEvent({ level: "info", category: "system", action: "digest.sent", message: `Ringkasan pagi ${day} dikirim`, actorType: "system", metadata: { day } });
  const result = await sendDigest(now, fetchImpl);
  return result.whatsapp === "sent";
}
