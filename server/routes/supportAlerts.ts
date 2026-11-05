import { Router, type Request } from "express";
import { and, asc, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { adminNotifications, admins, leadTasks, platformSettings, superadmins, supportMessages, supportThreads, tenantApplications, tenants, withdrawals } from "../db/schema.js";
import { requireAdminAuth } from "../middleware/adminAuth.js";
import { validateUuidParam } from "../middleware/validateUuidParam.js";
import { makeRateLimiter } from "../lib/clientIp.js";
import { createNotification } from "../lib/notifications.js";
import { logEvent } from "../lib/platformEvents.js";
import { ALERT_RULES, channelsFor, sanitizePrefs } from "../lib/adminAlerts.js";
import { loadWaConfig, publicWaStatus, loadWaRow, sendWhatsapp } from "../lib/whatsapp.js";
import { normalizeWhatsapp } from "../lib/crm.js";

// 1) Tenant "Bantuan" chat: the tenant dashboard talks to STUDIODO (mounted at /api/portal/support, tenant-admin auth).
// 2) Superadmin side: support inbox (/api/superadmin/support) and the alert centre (/api/superadmin/alerts).

const MAX_BODY = 2000;
const cleanBody = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, MAX_BODY) : "");
const snippet = (t: string, n = 140) => (t.length > n ? `${t.slice(0, n)}…` : t);

async function getOrCreateThread(tenantId: string) {
  await db.insert(supportThreads).values({ tenantId }).onConflictDoNothing();
  const [thread] = await db.select().from(supportThreads).where(eq(supportThreads.tenantId, tenantId));
  return thread;
}

// --- Tenant side ----------------------------------------------------------------------------------------------------------------

export const supportTenantRouter = Router();
supportTenantRouter.use(requireAdminAuth);
const tooMany = makeRateLimiter(20, 60 * 60_000);

async function tenantView(tenantId: string) {
  // Opening the chat must not create a thread: only a real message does, so the superadmin inbox never lists empty conversations.
  const [thread] = await db.select().from(supportThreads).where(eq(supportThreads.tenantId, tenantId));
  if (!thread) return { status: "open", unread: 0, messages: [] as { id: string; sender: string; body: string; createdAt: Date }[] };
  const messages = await db.select({ id: supportMessages.id, sender: supportMessages.sender, body: supportMessages.body, createdAt: supportMessages.createdAt })
    .from(supportMessages).where(eq(supportMessages.threadId, thread.id)).orderBy(desc(supportMessages.createdAt)).limit(200);
  const unread = messages.filter((m) => m.sender === "admin" && (!thread.tenantLastReadAt || m.createdAt > thread.tenantLastReadAt)).length;
  return { status: thread.status, unread, messages: messages.reverse() };
}

supportTenantRouter.get("/", async (req, res) => res.json(await tenantView(req.tenantId!)));

supportTenantRouter.post("/", async (req, res) => {
  const body = cleanBody(req.body?.body);
  if (!body) return res.status(400).json({ error: "Pesan kosong" });
  if (tooMany(req.tenantId!)) return res.status(429).json({ error: "Terlalu banyak pesan dalam satu jam. Coba lagi nanti." });
  const thread = await getOrCreateThread(req.tenantId!);
  const [admin] = await db.select({ email: admins.email }).from(admins).where(eq(admins.id, req.adminId!));
  const [tenant] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, req.tenantId!));
  await db.insert(supportMessages).values({ threadId: thread.id, sender: "tenant", author: admin?.email ?? null, body });
  await db.update(supportThreads).set({ status: "open", lastSender: "tenant", lastBody: body, lastMessageAt: new Date(), tenantLastReadAt: new Date() }).where(eq(supportThreads.id, thread.id));
  logEvent({ tenantId: req.tenantId!, category: "tenant", action: "support.message", message: `${tenant?.name ?? "Tenant"}: ${snippet(body)}`, actorType: "tenant_admin", actorLabel: admin?.email ?? null });
  res.status(201).json(await tenantView(req.tenantId!));
});

supportTenantRouter.post("/read", async (req, res) => {
  await db.update(supportThreads).set({ tenantLastReadAt: new Date() }).where(eq(supportThreads.tenantId, req.tenantId!));
  res.json({ unread: 0 });
});

// --- Superadmin: support inbox ---------------------------------------------------------------------------------------------------

export const supportAdminRouter = Router();
supportAdminRouter.param("id", validateUuidParam("Percakapan tidak ditemukan"));

async function whoAmI(req: Request): Promise<string | null> {
  const [row] = await db.select({ email: superadmins.email }).from(superadmins).where(eq(superadmins.id, req.superadminId!));
  return row?.email ?? null;
}

supportAdminRouter.get("/threads", async (_req, res) => {
  const rows = await db.select({
    id: supportThreads.id, tenantId: supportThreads.tenantId, status: supportThreads.status, lastSender: supportThreads.lastSender, lastBody: supportThreads.lastBody,
    lastMessageAt: supportThreads.lastMessageAt, adminLastReadAt: supportThreads.adminLastReadAt, tenantName: tenants.name, ownerName: tenants.ownerName, ownerWhatsapp: tenants.ownerWhatsapp,
    unread: sql<number>`(select count(*)::int from ${supportMessages} m where m.thread_id = ${supportThreads.id} and m.sender = 'tenant' and (${supportThreads.adminLastReadAt} is null or m.created_at > ${supportThreads.adminLastReadAt}))`,
  }).from(supportThreads).innerJoin(tenants, eq(tenants.id, supportThreads.tenantId)).orderBy(desc(supportThreads.lastMessageAt)).limit(300);
  const threads = rows.map((r) => ({ ...r, needsReply: r.status === "open" && r.lastSender === "tenant" }));
  res.json({ threads, needsReply: threads.filter((t) => t.needsReply).length, unread: threads.reduce((n, t) => n + t.unread, 0) });
});

supportAdminRouter.get("/threads/:id", async (req, res) => {
  const [thread] = await db.select({ id: supportThreads.id, tenantId: supportThreads.tenantId, status: supportThreads.status, tenantName: tenants.name, ownerName: tenants.ownerName, ownerWhatsapp: tenants.ownerWhatsapp, plan: tenants.plan })
    .from(supportThreads).innerJoin(tenants, eq(tenants.id, supportThreads.tenantId)).where(eq(supportThreads.id, req.params.id));
  if (!thread) return res.status(404).json({ error: "Percakapan tidak ditemukan" });
  const messages = await db.select().from(supportMessages).where(eq(supportMessages.threadId, thread.id)).orderBy(asc(supportMessages.createdAt)).limit(500);
  await db.update(supportThreads).set({ adminLastReadAt: new Date() }).where(eq(supportThreads.id, thread.id));
  res.json({ thread, messages });
});

supportAdminRouter.post("/threads/:id/reply", async (req, res) => {
  const body = cleanBody(req.body?.body);
  if (!body) return res.status(400).json({ error: "Balasan kosong" });
  const [thread] = await db.select().from(supportThreads).where(eq(supportThreads.id, req.params.id));
  if (!thread) return res.status(404).json({ error: "Percakapan tidak ditemukan" });
  const actor = await whoAmI(req);
  const [message] = await db.insert(supportMessages).values({ threadId: thread.id, sender: "admin", author: actor, body }).returning();
  await db.update(supportThreads).set({ lastSender: "admin", lastBody: body, lastMessageAt: new Date(), adminLastReadAt: new Date() }).where(eq(supportThreads.id, thread.id));
  // The tenant sees it in the bell of its dashboard (existing notification system) as well as in the Bantuan chat.
  await createNotification({ tenantId: thread.tenantId, title: "Balasan dari tim STUDIODO", body: snippet(body, 300), kind: "customer_message", severity: "info", createdBy: actor });
  res.status(201).json(message);
});

supportAdminRouter.patch("/threads/:id", async (req, res) => {
  const status = req.body?.status;
  if (status !== "open" && status !== "resolved") return res.status(400).json({ error: "Status tidak valid" });
  const [row] = await db.update(supportThreads).set({ status }).where(eq(supportThreads.id, req.params.id)).returning({ id: supportThreads.id, status: supportThreads.status });
  if (!row) return res.status(404).json({ error: "Percakapan tidak ditemukan" });
  res.json(row);
});

// --- Superadmin: alert centre ----------------------------------------------------------------------------------------------------

export const alertsAdminRouter = Router();
alertsAdminRouter.param("id", validateUuidParam("Notifikasi tidak ditemukan"));

alertsAdminRouter.get("/", async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 60));
  const onlyUnread = req.query.unread === "1";
  const kind = typeof req.query.kind === "string" && ALERT_RULES[req.query.kind] ? req.query.kind : null;
  const items = await db.select({
    id: adminNotifications.id, kind: adminNotifications.kind, severity: adminNotifications.severity, title: adminNotifications.title, body: adminNotifications.body, link: adminNotifications.link,
    tenantId: adminNotifications.tenantId, readAt: adminNotifications.readAt, waSentAt: adminNotifications.waSentAt, waError: adminNotifications.waError, createdAt: adminNotifications.createdAt, tenantName: tenants.name,
  }).from(adminNotifications).leftJoin(tenants, eq(tenants.id, adminNotifications.tenantId))
    .where(and(onlyUnread ? isNull(adminNotifications.readAt) : undefined, kind ? eq(adminNotifications.kind, kind) : undefined))
    .orderBy(desc(adminNotifications.createdAt)).limit(limit);
  res.json({ items, ...(await unreadCounts()) });
});

async function unreadCounts() {
  const [row] = await db.select({
    unread: sql<number>`count(*) filter (where ${adminNotifications.readAt} is null)::int`,
    critical: sql<number>`count(*) filter (where ${adminNotifications.readAt} is null and ${adminNotifications.severity} = 'critical')::int`,
  }).from(adminNotifications);
  return { unread: row?.unread ?? 0, critical: row?.critical ?? 0 };
}

alertsAdminRouter.post("/read", async (req, res) => {
  const body = (req.body ?? {}) as { ids?: unknown; all?: unknown };
  const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  if (body.all === true) await db.update(adminNotifications).set({ readAt: new Date() }).where(isNull(adminNotifications.readAt));
  else if (Array.isArray(body.ids)) {
    const ids = body.ids.filter(isUuid).slice(0, 200);
    if (ids.length) await db.update(adminNotifications).set({ readAt: new Date() }).where(and(inArray(adminNotifications.id, ids), isNull(adminNotifications.readAt)));
  } else return res.status(400).json({ error: "Kirim { ids: [...] } atau { all: true }" });
  res.json(await unreadCounts());
});

/** What needs a person right now — the "apa yang perlu di-follow up" list. Each row links to the section that handles it. */
alertsAdminRouter.get("/summary", async (_req, res) => {
  const now = new Date();
  const [[sup], [wd], [apps], [tasks], [contracts], counts] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(supportThreads).where(and(eq(supportThreads.status, "open"), eq(supportThreads.lastSender, "tenant"))),
    db.select({ n: sql<number>`count(*)::int` }).from(withdrawals).where(inArray(withdrawals.status, ["pending", "processing"])),
    db.select({ n: sql<number>`count(*)::int` }).from(tenantApplications).where(and(eq(tenantApplications.pipelineStage, "new"), eq(tenantApplications.status, "pending"))),
    db.select({ n: sql<number>`count(*)::int` }).from(leadTasks).where(and(isNull(leadTasks.doneAt), lt(leadTasks.dueAt, now))),
    db.select({ n: sql<number>`count(*)::int` }).from(tenantApplications).where(eq(tenantApplications.contractStatus, "sent")),
    unreadCounts(),
  ]);
  const items = [
    { key: "support", label: "Pesan tenant belum dibalas", count: sup?.n ?? 0, link: "support", tone: "warn" },
    { key: "withdrawals", label: "Penarikan menunggu diproses", count: wd?.n ?? 0, link: "withdrawals", tone: "warn" },
    { key: "leads_new", label: "Pendaftar baru belum dihubungi", count: apps?.n ?? 0, link: "applications", tone: "warn" },
    { key: "leads_tasks", label: "Follow-up calon tenant terlambat", count: tasks?.n ?? 0, link: "applications", tone: "bad" },
    { key: "contracts", label: "Kontrak menunggu persetujuan", count: contracts?.n ?? 0, link: "applications", tone: "info" },
  ];
  res.json({ ...counts, followUp: items.filter((i) => i.count > 0), followUpTotal: items.reduce((n, i) => n + i.count, 0) });
});

alertsAdminRouter.get("/settings", async (_req, res) => {
  const [row] = await db.select({ number: platformSettings.adminWaNumber, prefs: platformSettings.adminAlertPrefs }).from(platformSettings).limit(1);
  res.json({
    number: row?.number ?? "",
    gateway: publicWaStatus(await loadWaRow()).ready,
    kinds: Object.entries(ALERT_RULES).map(([kind, rule]) => ({ kind, label: rule.label, severity: rule.severity, ...channelsFor(kind, row?.prefs) })),
  });
});

alertsAdminRouter.put("/settings", async (req, res) => {
  const set: Partial<typeof platformSettings.$inferInsert> = {};
  if (req.body?.number !== undefined) {
    const raw = typeof req.body.number === "string" ? req.body.number.trim() : "";
    if (raw && !normalizeWhatsapp(raw)) return res.status(400).json({ error: "Nomor WhatsApp tidak valid" });
    set.adminWaNumber = raw || null;
  }
  if (req.body?.prefs !== undefined) set.adminAlertPrefs = sanitizePrefs(req.body.prefs);
  if (Object.keys(set).length) {
    const [existing] = await db.select({ id: platformSettings.id }).from(platformSettings).limit(1);
    if (existing) await db.update(platformSettings).set({ ...set, updatedAt: new Date() }).where(eq(platformSettings.id, existing.id));
    else await db.insert(platformSettings).values(set);
  }
  res.json({ ok: true });
});

alertsAdminRouter.post("/test", async (_req, res) => {
  const [row] = await db.select({ number: platformSettings.adminWaNumber }).from(platformSettings).limit(1);
  const to = normalizeWhatsapp(row?.number);
  if (!to) return res.status(400).json({ error: "Isi nomor WhatsApp penerima dulu" });
  const config = await loadWaConfig();
  if (!config) return res.status(409).json({ error: "Gateway WhatsApp belum diatur (Calon Tenant → Pengaturan)" });
  const result = await sendWhatsapp(config, to, "🔔 *STUDIODO* — tes notifikasi. Peringatan penting (pendaftaran, pembayaran, pesan tenant) akan dikirim ke nomor ini.");
  if (!result.ok) return res.status(502).json({ error: result.error });
  res.json({ ok: true });
});
