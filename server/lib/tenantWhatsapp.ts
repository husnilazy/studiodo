import { and, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { kioskKeys, platformEvents, platformSettings, tenants } from "../db/schema.js";
import { normalizeWhatsapp } from "./crm.js";
import { whatsappFallbackLink } from "./leads.js";
import { logEvent } from "./platformEvents.js";
import { portalBaseUrl } from "./urls.js";
import { loadWaConfig, sendWhatsapp } from "./whatsapp.js";

// WhatsApp to existing tenants (not leads): a manual composer in the tenant detail, and automatic renewal reminders based on the
// per-booth licences (kiosk_keys.license_ends_at). Everything sent is recorded in platform_events (action "tenant.wa"), which is
// also how the automatic job remembers what it already sent, so no extra table (or migration) is needed.

export const TENANT_TEMPLATE_VARIABLES = ["nama", "bisnis", "booth", "jenis", "tanggal", "sisa", "link_portal", "pengirim"] as const;
export type TenantVars = Partial<Record<(typeof TENANT_TEMPLATE_VARIABLES)[number], string | number | null>>;

export interface TenantTemplate { key: string; label: string; text: string }

export const TENANT_TEMPLATES: TenantTemplate[] = [
  {
    key: "expiring", label: "Pengingat masa aktif hampir habis",
    text: "Halo {nama}, ini {pengirim} dari STUDIODO 👋\n\n{jenis} {booth} untuk *{bisnis}* akan berakhir pada *{tanggal}* ({sisa}).\n\nAgar booth tetap bisa dipakai tanpa terkunci, perpanjang lewat portal: {link_portal}\n\nAda yang bisa kami bantu? Balas pesan ini ya 🙏",
  },
  {
    key: "expired", label: "Masa aktif sudah habis",
    text: "Halo {nama}, ini {pengirim} dari STUDIODO.\n\n{jenis} {booth} untuk *{bisnis}* sudah berakhir pada {tanggal}, sehingga booth terkunci sementara.\n\nPerpanjang lewat portal: {link_portal} — begitu pembayaran masuk, booth aktif kembali otomatis. Butuh bantuan? Balas pesan ini 🙏",
  },
  {
    key: "checkin", label: "Tanya kabar / bantu penggunaan",
    text: "Halo {nama}, ini {pengirim} dari STUDIODO 👋\n\nKami ingin memastikan *{bisnis}* sudah nyaman memakai STUDIODO. Ada kendala atau yang ingin dibantu atur (frame, harga, printer, QRIS)?\n\nBalas pesan ini kapan saja ya 🙏",
  },
  { key: "free", label: "Pesan bebas", text: "Halo {nama}, " },
];

export function renderTenantMessage(text: string, vars: TenantVars): { text: string; missing: string[] } {
  const missing: string[] = [];
  const out = text.replace(/\{([a-z_]+)\}/g, (whole, name: string) => {
    if (!(TENANT_TEMPLATE_VARIABLES as readonly string[]).includes(name)) return whole;
    const value = vars[name as keyof TenantVars];
    if (value === null || value === undefined || value === "") { missing.push(name); return whole; }
    return String(value);
  });
  return { text: out, missing };
}

// --- reminder stages -----------------------------------------------------------------------------------------------------------

export type ReminderStage = "d7" | "d3" | "d1" | "expired";
export const STAGE_ORDER: ReminderStage[] = ["d7", "d3", "d1", "expired"];
const DAY = 86_400_000;

/** Whole days left, counted in calendar terms: ends later today = 0, ended yesterday = -1. */
export function daysLeft(endsAt: Date, now: Date): number {
  return Math.ceil((endsAt.getTime() - now.getTime()) / DAY);
}

/** Which reminder an expiry date calls for right now (null = nothing yet, or too long ago to bother). */
export function stageFor(endsAt: Date, now: Date): ReminderStage | null {
  const left = daysLeft(endsAt, now);
  if (left < -3) return null;
  if (left < 0) return "expired";
  if (left <= 1) return "d1";
  if (left <= 3) return "d3";
  if (left <= 7) return "d7";
  return null;
}

export const describeLeft = (left: number): string => (left < 0 ? `sudah lewat ${Math.abs(left)} hari` : left === 0 ? "hari ini" : left === 1 ? "besok" : `${left} hari lagi`);
export const formatDateId = (date: Date): string => date.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });

/** Automatic sends only happen at civil hours in Indonesia (WIB), never at 3 AM. */
export function withinSendingHours(now: Date): boolean {
  const hour = (now.getUTCHours() + 7) % 24;
  return hour >= 8 && hour < 20;
}

export interface TenantAutoSettings { enabled: boolean; stages: ReminderStage[] }
export const DEFAULT_AUTO: TenantAutoSettings = { enabled: false, stages: ["d7", "d3", "d1", "expired"] };

export function sanitizeAutoSettings(input: unknown): TenantAutoSettings {
  const raw = (input && typeof input === "object" ? input : {}) as { enabled?: unknown; stages?: unknown };
  const stages = Array.isArray(raw.stages) ? STAGE_ORDER.filter((s) => (raw.stages as unknown[]).includes(s)) : DEFAULT_AUTO.stages;
  return { enabled: raw.enabled === true, stages };
}

export interface LicenceRow { tenantId: string; type: string; endsAt: Date | null }
export interface DueReminder { tenantId: string; stage: ReminderStage; kind: "trial" | "paid"; booths: number; earliestEnd: Date; key: string }

/** Pure: collapses per-booth licences into at most one reminder per tenant (the most urgent stage), with a stable dedupe key. */
export function dueReminders(rows: LicenceRow[], now: Date, enabledStages: ReminderStage[] = STAGE_ORDER): DueReminder[] {
  const byTenant = new Map<string, DueReminder>();
  for (const row of rows) {
    if (!row.endsAt || (row.type !== "trial" && row.type !== "paid")) continue;
    const stage = stageFor(row.endsAt, now);
    if (!stage || !enabledStages.includes(stage)) continue;
    const current = byTenant.get(row.tenantId);
    const rank = (s: ReminderStage) => STAGE_ORDER.indexOf(s);
    if (!current || rank(stage) > rank(current.stage) || (stage === current.stage && row.endsAt < current.earliestEnd)) {
      byTenant.set(row.tenantId, {
        tenantId: row.tenantId, stage, kind: row.type, booths: 1, earliestEnd: row.endsAt,
        key: `${row.tenantId}:${stage}:${row.endsAt.toISOString().slice(0, 10)}`,
      });
    } else if (stage === current.stage) {
      current.booths += 1;
    }
  }
  return [...byTenant.values()];
}

// --- shared loaders ------------------------------------------------------------------------------------------------------------

const firstName = (full: string | null) => (full ?? "").trim().split(/\s+/)[0] || "Kak";

export function varsFor(tenant: { name: string; ownerName: string | null }, extra: { booths?: number; kind?: "trial" | "paid"; endsAt?: Date | null; now?: Date; sender?: string | null }): TenantVars {
  const now = extra.now ?? new Date();
  const left = extra.endsAt ? daysLeft(extra.endsAt, now) : null;
  return {
    nama: firstName(tenant.ownerName), bisnis: tenant.name,
    booth: extra.booths ? (extra.booths === 1 ? "1 booth" : `${extra.booths} booth`) : null,
    jenis: extra.kind ? (extra.kind === "trial" ? "Masa trial" : "Langganan") : null,
    tanggal: extra.endsAt ? formatDateId(extra.endsAt) : null,
    sisa: left === null ? null : describeLeft(left),
    link_portal: portalBaseUrl(), pengirim: extra.sender ?? "tim STUDIODO",
  };
}

export async function loadTenantAuto(): Promise<TenantAutoSettings> {
  const [row] = await db.select({ auto: platformSettings.tenantWaAuto }).from(platformSettings).limit(1);
  return sanitizeAutoSettings(row?.auto);
}

/** Active (not revoked) licences that carry an expiry, for every tenant or just one. */
export async function loadLicences(tenantId?: string): Promise<LicenceRow[]> {
  const rows = await db.select({ tenantId: kioskKeys.tenantId, type: kioskKeys.licenseType, endsAt: kioskKeys.licenseEndsAt })
    .from(kioskKeys)
    .where(and(isNull(kioskKeys.revokedAt), isNotNull(kioskKeys.licenseEndsAt), inArray(kioskKeys.licenseType, ["trial", "paid"]), tenantId ? eq(kioskKeys.tenantId, tenantId) : undefined));
  return rows;
}

/** Keys of automatic reminders already sent (from the event log), so a restart or an overlapping run never repeats one. */
async function alreadySent(since: Date): Promise<Set<string>> {
  const rows = await db.select({ key: sql<string | null>`${platformEvents.metadata}->>'key'` }).from(platformEvents)
    .where(and(eq(platformEvents.action, "tenant.wa.auto"), gte(platformEvents.createdAt, since)));
  return new Set(rows.map((r) => r.key).filter((k): k is string => Boolean(k)));
}

export interface UpcomingItem { tenantId: string; name: string; stage: ReminderStage; kind: "trial" | "paid"; booths: number; endsAt: string; phone: string | null; sent: boolean }

/** What the automatic job would send now (or already did), for the "Pengingat otomatis" panel. */
export async function upcomingReminders(now: Date = new Date(), stages: ReminderStage[] = STAGE_ORDER): Promise<UpcomingItem[]> {
  const due = dueReminders(await loadLicences(), now, stages);
  if (!due.length) return [];
  const [tenantRows, sent] = await Promise.all([
    db.select({ id: tenants.id, name: tenants.name, phone: tenants.ownerWhatsapp }).from(tenants).where(inArray(tenants.id, due.map((d) => d.tenantId))),
    alreadySent(new Date(now.getTime() - 40 * DAY)),
  ]);
  const byId = new Map(tenantRows.map((t) => [t.id, t]));
  return due.filter((d) => byId.has(d.tenantId)).map((d) => ({
    tenantId: d.tenantId, name: byId.get(d.tenantId)!.name, stage: d.stage, kind: d.kind, booths: d.booths, endsAt: d.earliestEnd.toISOString(),
    phone: normalizeWhatsapp(byId.get(d.tenantId)!.phone), sent: sent.has(d.key),
  })).sort((a, b) => a.endsAt.localeCompare(b.endsAt));
}

const MAX_PER_RUN = 25; // a bug or a bulk import must never turn the gateway into a spam cannon

/** Sends the pending reminders. Idempotent (event log = memory). Returns how many went out. */
export async function runTenantWaReminders(now: Date = new Date(), fetchImpl: typeof fetch = fetch): Promise<number> {
  const settings = await loadTenantAuto();
  if (!settings.enabled || !withinSendingHours(now)) return 0;
  const config = await loadWaConfig();
  if (!config) return 0;
  const due = dueReminders(await loadLicences(), now, settings.stages);
  if (!due.length) return 0;
  const [tenantRows, sent] = await Promise.all([
    db.select({ id: tenants.id, name: tenants.name, ownerName: tenants.ownerName, phone: tenants.ownerWhatsapp, status: tenants.status }).from(tenants).where(inArray(tenants.id, due.map((d) => d.tenantId))),
    alreadySent(new Date(now.getTime() - 40 * DAY)),
  ]);
  const byId = new Map(tenantRows.map((t) => [t.id, t]));
  let count = 0;
  for (const item of due) {
    if (count >= MAX_PER_RUN) break;
    const tenant = byId.get(item.tenantId);
    if (!tenant || sent.has(item.key) || tenant.status === "suspended") continue;
    const phone = normalizeWhatsapp(tenant.phone);
    if (!phone) continue;
    const template = TENANT_TEMPLATES.find((t) => t.key === (item.stage === "expired" ? "expired" : "expiring"))!;
    const { text } = renderTenantMessage(template.text, varsFor(tenant, { booths: item.booths, kind: item.kind, endsAt: item.earliestEnd, now }));
    // Log BEFORE sending: if the process dies mid-send we would rather skip one reminder than send it twice.
    logEvent({ level: "info", category: "tenant", action: "tenant.wa.auto", message: `Pengingat WhatsApp otomatis (${item.stage}) ke ${tenant.name}`, tenantId: tenant.id, actorType: "system", metadata: { key: item.key, stage: item.stage, via: "gateway" } });
    const result = await sendWhatsapp(config, phone, text, fetchImpl);
    if (!result.ok) logEvent({ level: "warning", category: "tenant", action: "tenant.wa.failed", message: `Pengingat WhatsApp ke ${tenant.name} gagal: ${result.error}`, tenantId: tenant.id, actorType: "system", metadata: { key: item.key } });
    else count++;
  }
  return count;
}

export { whatsappFallbackLink };
