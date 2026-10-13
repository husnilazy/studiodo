import { and, desc, eq, gt, inArray, isNull, notExists, or, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { notificationReads, notifications } from "../db/schema.js";

export const NOTIFICATION_KINDS = ["platform", "customer_message", "billing", "booth", "system"] as const;
export const NOTIFICATION_SEVERITIES = ["info", "success", "warning", "critical"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

export interface CreateNotificationInput {
  /** null = every tenant (broadcast). */
  tenantId: string | null;
  title: string;
  body?: string | null;
  kind?: NotificationKind;
  severity?: NotificationSeverity;
  /** In-portal path ("/portal/booth") or an https URL. Anything else is dropped. */
  linkUrl?: string | null;
  createdBy?: string | null;
  expiresAt?: Date | null;
}

/** Only same-site paths and https links may be attached — a notification must not be able to smuggle a javascript: URL. */
export function sanitizeLink(link: string | null | undefined): string | null {
  const v = (link ?? "").trim();
  if (!v) return null;
  if (/^\/(?!\/)/.test(v) && v.length <= 300) return v;
  if (/^https:\/\//i.test(v) && v.length <= 500) return v;
  return null;
}

/**
 * The single entry point for producing a notification. Superadmin broadcasts use it today; later producers
 * (a customer leaving a message on a booth, a failed payout, a booth going offline…) call it too, so the
 * bell in the dashboard needs no change to show them.
 */
export async function createNotification(input: CreateNotificationInput) {
  const [row] = await db.insert(notifications).values({
    tenantId: input.tenantId,
    kind: input.kind ?? "platform",
    severity: input.severity ?? "info",
    title: input.title.trim().slice(0, 140),
    body: input.body?.trim().slice(0, 2000) || null,
    linkUrl: sanitizeLink(input.linkUrl),
    createdBy: input.createdBy ?? null,
    expiresAt: input.expiresAt ?? null,
  }).returning();
  return row;
}

const visibleTo = (tenantId: string) => and(
  or(isNull(notifications.tenantId), eq(notifications.tenantId, tenantId)),
  or(isNull(notifications.expiresAt), gt(notifications.expiresAt, sql`now()`)),
);

const unreadFor = (tenantId: string) => notExists(
  db.select({ one: sql`1` }).from(notificationReads).where(and(eq(notificationReads.notificationId, notifications.id), eq(notificationReads.tenantId, tenantId))),
);

export async function listForTenant(tenantId: string, limit = 30) {
  const rows = await db.select({
    id: notifications.id, kind: notifications.kind, severity: notifications.severity, title: notifications.title, body: notifications.body,
    linkUrl: notifications.linkUrl, createdAt: notifications.createdAt,
    readAt: sql<Date | null>`(select r.read_at from notification_reads r where r.notification_id = ${notifications.id} and r.tenant_id = ${tenantId})`,
  }).from(notifications).where(visibleTo(tenantId)).orderBy(desc(notifications.createdAt)).limit(limit);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(notifications).where(and(visibleTo(tenantId), unreadFor(tenantId)));
  return { items: rows.map((r) => ({ ...r, read: r.readAt != null })), unread: n };
}

export async function markRead(tenantId: string, ids: string[] | "all") {
  const targets = ids === "all"
    ? await db.select({ id: notifications.id }).from(notifications).where(and(visibleTo(tenantId), unreadFor(tenantId)))
    : await db.select({ id: notifications.id }).from(notifications).where(and(visibleTo(tenantId), inArray(notifications.id, ids)));
  if (targets.length === 0) return 0;
  await db.insert(notificationReads).values(targets.map((t) => ({ notificationId: t.id, tenantId }))).onConflictDoNothing();
  return targets.length;
}
