import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { kioskKeys, notifications, tenants } from "../db/schema.js";
import { deliverToTenant, subscriptionMail } from "./emails.js";
import type { NotificationSeverity } from "./notifications.js";

// Automatic producers for the dashboard bell. Each rule derives alerts from booth (kiosk key) state and inserts them with
// a dedupe key, so running every 30 minutes never repeats an alert. Lock rules themselves live ONLY in lib/license.ts;
// this file only looks at the end date to warn people before / right after it passes.

const DAY = 86_400_000;
const HOUR = 3_600_000;
const EXPIRING_WINDOW_DAYS = 7;
const RECENTLY_EXPIRED_DAYS = 3;
const OFFLINE_AFTER_HOURS = 24;
const OFFLINE_FORGET_DAYS = 14; // a booth silent this long is retired or abandoned, not "just went offline"

export interface RuleKey {
  id: string;
  tenantId: string;
  label: string | null;
  licenseType: string;
  licenseEndsAt: Date | null;
  lastUsedAt: Date | null;
  paired: boolean;
}

export interface PlannedNotification {
  tenantId: string;
  dedupeKey: string;
  severity: NotificationSeverity;
  kind: "billing" | "booth";
  title: string;
  body: string;
  linkUrl: string;
  /** Present for licence alerts that should also be emailed to the tenant's admins. */
  email?: { kind: "expiring" | "expired"; boothName: string; days?: number; trial: boolean };
}

const dayStamp = (d: Date) => d.toISOString().slice(0, 10);

/** Pure: which alerts do these booths warrant right now? */
export function planNotifications(keys: RuleKey[], now = Date.now()): PlannedNotification[] {
  const out: PlannedNotification[] = [];
  for (const k of keys) {
    const name = k.label?.trim() || "Booth tanpa nama";
    const trial = k.licenseType === "trial";
    const end = k.licenseEndsAt ? k.licenseEndsAt.getTime() : null;

    if (end !== null && k.licenseType !== "unpaid") {
      const left = end - now;
      if (left > 0 && left <= EXPIRING_WINDOW_DAYS * DAY) {
        const days = Math.max(1, Math.ceil(left / DAY));
        out.push({
          tenantId: k.tenantId, dedupeKey: `expiring:${k.id}:${dayStamp(k.licenseEndsAt!)}`, severity: "warning", kind: "billing",
          title: `${trial ? "Trial" : "Langganan"} ${name} berakhir ${days} hari lagi`,
          body: trial ? "Berlangganan sebelum trial habis agar booth tidak terkunci." : "Perpanjang sekarang supaya booth tetap berjalan tanpa terkunci.",
          linkUrl: "/portal/booth",
          email: { kind: "expiring", boothName: name, days, trial },
        });
      } else if (left <= 0 && -left <= RECENTLY_EXPIRED_DAYS * DAY) {
        out.push({
          tenantId: k.tenantId, dedupeKey: `expired:${k.id}:${dayStamp(k.licenseEndsAt!)}`, severity: "critical", kind: "billing",
          title: `${trial ? "Trial" : "Langganan"} ${name} sudah berakhir`,
          body: trial ? "Booth ini terkunci. Berlangganan untuk mengaktifkannya kembali." : "Booth ini terkunci setelah masa tenggang. Perpanjang untuk mengaktifkannya kembali.",
          linkUrl: "/portal/booth",
          email: { kind: "expired", boothName: name, trial },
        });
      }
    }

    // Offline only matters for a booth that is paired and still licensed; at most one alert per booth per day.
    const licensed = k.licenseType !== "unpaid" && (end === null || end > now);
    if (k.paired && licensed && k.lastUsedAt) {
      const silent = now - k.lastUsedAt.getTime();
      if (silent >= OFFLINE_AFTER_HOURS * HOUR && silent <= OFFLINE_FORGET_DAYS * DAY) {
        out.push({
          tenantId: k.tenantId, dedupeKey: `offline:${k.id}:${dayStamp(k.lastUsedAt)}`, severity: "warning", kind: "booth",
          title: `${name} tidak terhubung lebih dari ${Math.floor(silent / DAY) >= 1 ? `${Math.floor(silent / DAY)} hari` : "24 jam"}`,
          body: "Pastikan PC booth menyala dan terhubung internet. Booth yang offline tidak bisa menerima pembayaran QRIS.",
          linkUrl: "/portal/monitor",
        });
      }
    }
  }
  return out;
}

/** Evaluate every active booth and insert any alert not raised before. Returns how many were new. */
export async function runNotificationRules(now = Date.now()): Promise<number> {
  const rows = await db.select({
    id: kioskKeys.id, tenantId: kioskKeys.tenantId, label: kioskKeys.label, licenseType: kioskKeys.licenseType,
    licenseEndsAt: kioskKeys.licenseEndsAt, lastUsedAt: kioskKeys.lastUsedAt, boundDeviceId: kioskKeys.boundDeviceId,
  }).from(kioskKeys).where(and(isNull(kioskKeys.revokedAt)));
  const planned = planNotifications(rows.map((r) => ({ ...r, paired: r.boundDeviceId != null })), now);
  if (planned.length === 0) return 0;
  const inserted = await db.insert(notifications).values(planned.map((p) => ({
    tenantId: p.tenantId, kind: p.kind, severity: p.severity, title: p.title, body: p.body, linkUrl: p.linkUrl,
    createdBy: "system", dedupeKey: p.dedupeKey, expiresAt: new Date(now + 14 * DAY),
  }))).onConflictDoNothing().returning({ key: notifications.dedupeKey, tenantId: notifications.tenantId });
  // Email only what was newly raised (the dedupe key makes a repeat run insert nothing, so nobody is emailed twice).
  const fresh = new Set(inserted.map((i) => `${i.tenantId}|${i.key}`));
  for (const p of planned) {
    if (!p.email || !fresh.has(`${p.tenantId}|${p.dedupeKey}`)) continue;
    const [t] = await db.select({ ownerName: tenants.ownerName }).from(tenants).where(eq(tenants.id, p.tenantId));
    await deliverToTenant(p.tenantId, subscriptionMail({ ownerName: t?.ownerName ?? null, ...p.email }), "langganan booth", { key: "subscription", label: "Pengingat langganan" }).catch(() => undefined);
  }
  return inserted.length;
}
