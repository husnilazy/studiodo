import { Router } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { notificationReads, notifications, superadmins, tenants } from "../db/schema.js";
import { requireAdminAuth } from "../middleware/adminAuth.js";
import { NOTIFICATION_KINDS, NOTIFICATION_SEVERITIES, createNotification, listForTenant, markRead, type NotificationKind, type NotificationSeverity } from "../lib/notifications.js";
import { logEvent } from "../lib/platformEvents.js";

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// --- Tenant side: GET /api/portal/notifications, POST /api/portal/notifications/read ---
export const notificationsTenantRouter = Router();
notificationsTenantRouter.use(requireAdminAuth);

notificationsTenantRouter.get("/", async (req, res) => {
  const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 30));
  res.json(await listForTenant(req.tenantId!, limit));
});

// Body: { ids: string[] } or { all: true }
notificationsTenantRouter.post("/read", async (req, res) => {
  const body = (req.body ?? {}) as { ids?: unknown; all?: unknown };
  if (body.all === true) {
    await markRead(req.tenantId!, "all");
  } else if (Array.isArray(body.ids)) {
    const ids = body.ids.filter(isUuid).slice(0, 100);
    if (ids.length > 0) await markRead(req.tenantId!, ids);
  } else {
    return res.status(400).json({ error: "Kirim { ids: [...] } atau { all: true }" });
  }
  res.json(await listForTenant(req.tenantId!, 1).then((r) => ({ unread: r.unread })));
});

// --- Superadmin side (mounted under /api/superadmin/notifications, already behind requireSuperadminAuth) ---
export const notificationsAdminRouter = Router();

// What has been sent, newest first, with how many tenants have read each broadcast.
notificationsAdminRouter.get("/", async (_req, res) => {
  const rows = await db.select({
    id: notifications.id, tenantId: notifications.tenantId, tenantName: tenants.name, kind: notifications.kind, severity: notifications.severity,
    title: notifications.title, body: notifications.body, linkUrl: notifications.linkUrl, createdBy: notifications.createdBy, expiresAt: notifications.expiresAt, createdAt: notifications.createdAt,
    readCount: sql<number>`(select count(*)::int from ${notificationReads} r where r.notification_id = ${notifications.id})`,
  }).from(notifications).leftJoin(tenants, eq(tenants.id, notifications.tenantId)).orderBy(desc(notifications.createdAt)).limit(100);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(tenants);
  res.json({ items: rows, tenantCount: n });
});

notificationsAdminRouter.post("/", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return res.status(400).json({ error: "Judul wajib diisi" });
  if (title.length > 140) return res.status(400).json({ error: "Judul maksimal 140 karakter" });
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (text.length > 2000) return res.status(400).json({ error: "Isi pesan maksimal 2000 karakter" });
  const severity = NOTIFICATION_SEVERITIES.includes(body.severity as NotificationSeverity) ? (body.severity as NotificationSeverity) : "info";
  const kind = NOTIFICATION_KINDS.includes(body.kind as NotificationKind) ? (body.kind as NotificationKind) : "platform";

  let tenantId: string | null = null;
  if (body.tenantId != null && body.tenantId !== "") {
    if (!isUuid(body.tenantId)) return res.status(400).json({ error: "Tenant tidak valid" });
    const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, body.tenantId));
    if (!t) return res.status(404).json({ error: "Tenant tidak ditemukan" });
    tenantId = t.id;
  }

  let expiresAt: Date | null = null;
  if (body.expiresInDays != null && body.expiresInDays !== "") {
    const days = Number(body.expiresInDays);
    if (!Number.isFinite(days) || days < 1 || days > 365) return res.status(400).json({ error: "Masa tampil harus 1–365 hari" });
    expiresAt = new Date(Date.now() + days * 86_400_000);
  }

  const [me] = await db.select({ email: superadmins.email }).from(superadmins).where(eq(superadmins.id, req.superadminId!));
  const row = await createNotification({ tenantId, title, body: text, kind, severity, linkUrl: typeof body.linkUrl === "string" ? body.linkUrl : null, createdBy: me?.email ?? "superadmin", expiresAt });
  logEvent({ tenantId, category: "system", action: "notification.sent", message: `Notifikasi "${title}" dikirim ke ${tenantId ? "satu tenant" : "semua tenant"}`, actorType: "superadmin", actorLabel: me?.email ?? null });
  res.status(201).json(row);
});

notificationsAdminRouter.delete("/:id", async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: "Notifikasi tidak valid" });
  await db.delete(notifications).where(eq(notifications.id, req.params.id));
  res.json({ ok: true });
});
