import { Router, type Request } from "express";
import { and, asc, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { adminNotifications, admins, leadTasks, platformSettings, superadmins, supportCaseEvents, supportCases, supportMessages, supportThreads, tenantApplications, tenants, withdrawals } from "../db/schema.js";
import { requireAdminAuth } from "../middleware/adminAuth.js";
import { validateUuidParam } from "../middleware/validateUuidParam.js";
import { makeRateLimiter } from "../lib/clientIp.js";
import { createNotification } from "../lib/notifications.js";
import { logEvent } from "../lib/platformEvents.js";
import { ALERT_RULES, channelsFor, sanitizePrefs } from "../lib/adminAlerts.js";
import { loadWaConfig, publicWaStatus, loadWaRow, sendWhatsapp } from "../lib/whatsapp.js";
import { normalizeWhatsapp } from "../lib/crm.js";
import { cleanAttachments, sendCsv, storeSupportImage, supportImageUpload } from "../lib/supportAttachments.js";

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

type ChatMessage = { id: string; sender: string; body: string; attachments: { url: string; name: string }[]; caseId: string | null; createdAt: Date };

async function tenantView(tenantId: string) {
  const [[platform], cases] = await Promise.all([
    db.select({ wa: platformSettings.renewalWhatsapp }).from(platformSettings).limit(1),
    db.select({ id: supportCases.id, caseNo: supportCases.caseNo, title: supportCases.title, category: supportCases.category, status: supportCases.status, createdAt: supportCases.createdAt, updatedAt: supportCases.updatedAt })
      .from(supportCases).where(eq(supportCases.tenantId, tenantId)).orderBy(desc(supportCases.createdAt)).limit(30),
  ]);
  // The "hubungi langsung" WhatsApp number of the STUDIODO team (the same number kiosks show on the subscription screen).
  const extras = { whatsapp: normalizeWhatsapp(platform?.wa), cases };
  // Opening the chat must not create a thread: only a real message does, so the superadmin inbox never lists empty conversations.
  const [thread] = await db.select().from(supportThreads).where(eq(supportThreads.tenantId, tenantId));
  if (!thread) return { status: "open", unread: 0, messages: [] as ChatMessage[], ...extras };
  const messages = await db.select({ id: supportMessages.id, sender: supportMessages.sender, body: supportMessages.body, attachments: supportMessages.attachments, caseId: supportMessages.caseId, createdAt: supportMessages.createdAt })
    .from(supportMessages).where(eq(supportMessages.threadId, thread.id)).orderBy(desc(supportMessages.createdAt)).limit(200);
  const unread = messages.filter((m) => m.sender === "admin" && (!thread.tenantLastReadAt || m.createdAt > thread.tenantLastReadAt)).length;
  return { status: thread.status, unread, messages: messages.reverse() as ChatMessage[], ...extras };
}

supportTenantRouter.get("/", async (req, res) => res.json(await tenantView(req.tenantId!)));

const tooManyUploads = makeRateLimiter(40, 60 * 60_000);
const tooManyCases = makeRateLimiter(10, 60 * 60_000);

supportTenantRouter.post("/upload", supportImageUpload.single("file"), async (req, res) => {
  if (tooManyUploads(req.tenantId!)) return res.status(429).json({ error: "Terlalu banyak unggahan dalam satu jam. Coba lagi nanti." });
  const stored = await storeSupportImage(req.tenantId!, req.file);
  if (!stored.ok) return res.status(400).json({ error: stored.error });
  res.status(201).json({ url: stored.url, name: stored.name });
});

supportTenantRouter.post("/", async (req, res) => {
  const body = cleanBody(req.body?.body);
  const attachments = await cleanAttachments(req.tenantId!, req.body?.attachments);
  if (attachments === null) return res.status(400).json({ error: "Lampiran tidak valid." });
  if (!body && attachments.length === 0) return res.status(400).json({ error: "Pesan kosong" });
  if (tooMany(req.tenantId!)) return res.status(429).json({ error: "Terlalu banyak pesan dalam satu jam. Coba lagi nanti." });
  const thread = await getOrCreateThread(req.tenantId!);
  const [admin] = await db.select({ email: admins.email }).from(admins).where(eq(admins.id, req.adminId!));
  const [tenant] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, req.tenantId!));
  const preview = body || "[gambar]";
  await db.insert(supportMessages).values({ threadId: thread.id, sender: "tenant", author: admin?.email ?? null, body, attachments });
  await db.update(supportThreads).set({ status: "open", lastSender: "tenant", lastBody: preview, lastMessageAt: new Date(), tenantLastReadAt: new Date() }).where(eq(supportThreads.id, thread.id));
  logEvent({ tenantId: req.tenantId!, category: "tenant", action: "support.message", message: `${tenant?.name ?? "Tenant"}: ${snippet(preview)}`, actorType: "tenant_admin", actorLabel: admin?.email ?? null });
  res.status(201).json(await tenantView(req.tenantId!));
});

// "Laporkan masalah": a documented case (bug, payment, device...) with automatic context. It also lands in the chat so the team replies there.
const CASE_CATEGORIES = ["bug", "payment", "device", "billing", "feature", "other"] as const;
const CASE_LABEL: Record<string, string> = { bug: "Bug aplikasi", payment: "Pembayaran / saldo", device: "Kamera / printer", billing: "Langganan / tagihan", feature: "Saran fitur", other: "Lainnya" };
const CONTEXT_KEYS = ["appVersion", "page", "userAgent", "viewport", "language"] as const;

supportTenantRouter.post("/cases", async (req, res) => {
  const tenantId = req.tenantId!;
  const category = CASE_CATEGORIES.find((c) => c === req.body?.category);
  const title = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 120) : "";
  const description = cleanBody(req.body?.description);
  if (!category) return res.status(400).json({ error: "Pilih jenis masalah." });
  if (title.length < 3) return res.status(400).json({ error: "Judul laporan minimal 3 karakter." });
  if (!description) return res.status(400).json({ error: "Jelaskan masalahnya." });
  const attachments = await cleanAttachments(tenantId, req.body?.attachments);
  if (attachments === null) return res.status(400).json({ error: "Lampiran tidak valid." });
  if (tooManyCases(tenantId)) return res.status(429).json({ error: "Terlalu banyak laporan dalam satu jam. Coba lagi nanti." });

  const [admin] = await db.select({ email: admins.email }).from(admins).where(eq(admins.id, req.adminId!));
  const [tenant] = await db.select({ name: tenants.name, plan: tenants.plan }).from(tenants).where(eq(tenants.id, tenantId));
  const rawContext = (req.body?.context ?? {}) as Record<string, unknown>;
  const context: Record<string, string> = { plan: String(tenant?.plan ?? "") };
  for (const key of CONTEXT_KEYS) if (typeof rawContext[key] === "string") context[key] = (rawContext[key] as string).slice(0, 200);

  const thread = await getOrCreateThread(tenantId);
  const [row] = await db.insert(supportCases).values({ tenantId, threadId: thread.id, category, title, description, context, reportedBy: admin?.email ?? null }).returning();
  await db.insert(supportCaseEvents).values({ caseId: row.id, kind: "created", actor: admin?.email ?? null, detail: `${CASE_LABEL[category]}: ${title}` });
  const text = `[Laporan #${row.caseNo} - ${CASE_LABEL[category]}] ${title}\n${description}`.slice(0, 2400);
  await db.insert(supportMessages).values({ threadId: thread.id, sender: "tenant", author: admin?.email ?? null, body: text, attachments, caseId: row.id });
  await db.update(supportThreads).set({ status: "open", lastSender: "tenant", lastBody: snippet(text, 300), lastMessageAt: new Date(), tenantLastReadAt: new Date() }).where(eq(supportThreads.id, thread.id));
  logEvent({ tenantId, category: "tenant", action: "support.message", message: `${tenant?.name ?? "Tenant"} melaporkan #${row.caseNo}: ${snippet(title)}`, actorType: "tenant_admin", actorLabel: admin?.email ?? null });
  res.status(201).json({ caseNo: row.caseNo, chat: await tenantView(tenantId) });
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

supportAdminRouter.post("/threads/:id/upload", supportImageUpload.single("file"), async (req, res) => {
  const [thread] = await db.select({ tenantId: supportThreads.tenantId }).from(supportThreads).where(eq(supportThreads.id, String(req.params.id)));
  if (!thread) return res.status(404).json({ error: "Percakapan tidak ditemukan" });
  const stored = await storeSupportImage(thread.tenantId, req.file); // kept under the tenant's own folder
  if (!stored.ok) return res.status(400).json({ error: stored.error });
  res.status(201).json({ url: stored.url, name: stored.name });
});

supportAdminRouter.post("/threads/:id/reply", async (req, res) => {
  const body = cleanBody(req.body?.body);
  const [thread] = await db.select().from(supportThreads).where(eq(supportThreads.id, req.params.id));
  if (!thread) return res.status(404).json({ error: "Percakapan tidak ditemukan" });
  const attachments = await cleanAttachments(thread.tenantId, req.body?.attachments);
  if (attachments === null) return res.status(400).json({ error: "Lampiran tidak valid." });
  if (!body && attachments.length === 0) return res.status(400).json({ error: "Balasan kosong" });
  const actor = await whoAmI(req);
  const preview = body || "[gambar]";
  const caseId = typeof req.body?.caseId === "string" && /^[0-9a-f-]{36}$/i.test(req.body.caseId) ? req.body.caseId : null;
  const [message] = await db.insert(supportMessages).values({ threadId: thread.id, sender: "admin", author: actor, body, attachments, caseId }).returning();
  await db.update(supportThreads).set({ lastSender: "admin", lastBody: preview, lastMessageAt: new Date(), adminLastReadAt: new Date() }).where(eq(supportThreads.id, thread.id));
  if (caseId) await db.insert(supportCaseEvents).values({ caseId, kind: "reply", actor, detail: snippet(preview, 300) });
  // The tenant sees it in the bell of its dashboard (existing notification system) as well as in the Bantuan chat.
  await createNotification({ tenantId: thread.tenantId, title: "Balasan dari tim STUDIODO", body: snippet(preview, 300), kind: "customer_message", severity: "info", createdBy: actor });
  logEvent({ tenantId: thread.tenantId, category: "tenant", action: "support.replied", message: `Balasan bantuan: ${snippet(preview)}`, actorType: "superadmin", actorLabel: actor });
  res.status(201).json(message);
});

supportAdminRouter.patch("/threads/:id", async (req, res) => {
  const status = req.body?.status;
  if (status !== "open" && status !== "resolved") return res.status(400).json({ error: "Status tidak valid" });
  const [row] = await db.update(supportThreads).set({ status }).where(eq(supportThreads.id, req.params.id)).returning({ id: supportThreads.id, status: supportThreads.status });
  if (!row) return res.status(404).json({ error: "Percakapan tidak ditemukan" });
  res.json(row);
});

// --- Superadmin: documented problem reports ("Kasus & bug") ---------------------------------------------------------------------------

const CASE_STATUSES = ["new", "investigating", "waiting", "resolved", "wontfix"] as const;
const CASE_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
const STATUS_LABEL: Record<string, string> = { new: "Baru", investigating: "Sedang diperiksa", waiting: "Menunggu info", resolved: "Selesai", wontfix: "Tidak dilanjutkan" };

const caseColumns = {
  id: supportCases.id, caseNo: supportCases.caseNo, tenantId: supportCases.tenantId, threadId: supportCases.threadId, category: supportCases.category, title: supportCases.title,
  description: supportCases.description, status: supportCases.status, priority: supportCases.priority, context: supportCases.context, reportedBy: supportCases.reportedBy,
  resolutionNote: supportCases.resolutionNote, createdAt: supportCases.createdAt, updatedAt: supportCases.updatedAt, resolvedAt: supportCases.resolvedAt, tenantName: tenants.name,
};

supportAdminRouter.get("/cases", async (req, res) => {
  const status = String(req.query.status ?? "");
  const category = String(req.query.category ?? "");
  const rows = await db.select(caseColumns).from(supportCases).innerJoin(tenants, eq(tenants.id, supportCases.tenantId))
    .where(and(
      status === "open" ? inArray(supportCases.status, ["new", "investigating", "waiting"]) : (CASE_STATUSES as readonly string[]).includes(status) ? eq(supportCases.status, status) : undefined,
      (CASE_CATEGORIES as readonly string[]).includes(category) ? eq(supportCases.category, category) : undefined,
    ))
    .orderBy(desc(supportCases.createdAt)).limit(500);
  const [counts] = await db.select({ open: sql<number>`count(*) filter (where ${supportCases.status} in ('new','investigating','waiting'))::int`, total: sql<number>`count(*)::int` }).from(supportCases);
  res.json({ cases: rows, open: counts?.open ?? 0, total: counts?.total ?? 0 });
});

// Everything ever reported, for product development: one row per case, openable in Excel. Tenant-written text is formula-safe.
supportAdminRouter.get("/cases.csv", async (_req, res) => {
  const rows = await db.select(caseColumns).from(supportCases).innerJoin(tenants, eq(tenants.id, supportCases.tenantId)).orderBy(desc(supportCases.createdAt)).limit(5000);
  sendCsv(res, "kasus-bug-studiodo.csv", ["No", "Dibuat", "Tenant", "Jenis", "Judul", "Deskripsi", "Status", "Prioritas", "Versi app", "Halaman", "Paket", "Dilaporkan oleh", "Selesai", "Catatan penyelesaian"],
    rows.map((r) => [r.caseNo, r.createdAt, r.tenantName, CASE_LABEL[r.category] ?? r.category, r.title, r.description, STATUS_LABEL[r.status] ?? r.status, r.priority, r.context.appVersion, r.context.page, r.context.plan, r.reportedBy, r.resolvedAt, r.resolutionNote]));
});

// The complete chat record (every message, both directions, with image links), nothing is ever deleted.
supportAdminRouter.get("/messages.csv", async (_req, res) => {
  const rows = await db.select({ at: supportMessages.createdAt, tenant: tenants.name, sender: supportMessages.sender, author: supportMessages.author, body: supportMessages.body, attachments: supportMessages.attachments, caseId: supportMessages.caseId })
    .from(supportMessages).innerJoin(supportThreads, eq(supportThreads.id, supportMessages.threadId)).innerJoin(tenants, eq(tenants.id, supportThreads.tenantId))
    .orderBy(desc(supportMessages.createdAt)).limit(20000);
  sendCsv(res, "riwayat-chat-bantuan.csv", ["Waktu", "Tenant", "Pengirim", "Penulis", "Pesan", "Gambar", "Kasus"], rows.map((r) => [r.at, r.tenant, r.sender === "admin" ? "STUDIODO" : "Tenant", r.author, r.body, r.attachments.map((a) => a.url).join(" "), r.caseId ?? ""]));
});

supportAdminRouter.get("/cases/:id", async (req, res) => {
  const [row] = await db.select(caseColumns).from(supportCases).innerJoin(tenants, eq(tenants.id, supportCases.tenantId)).where(eq(supportCases.id, req.params.id));
  if (!row) return res.status(404).json({ error: "Kasus tidak ditemukan" });
  const [events, messages] = await Promise.all([
    db.select().from(supportCaseEvents).where(eq(supportCaseEvents.caseId, row.id)).orderBy(asc(supportCaseEvents.createdAt)).limit(500),
    db.select({ id: supportMessages.id, sender: supportMessages.sender, author: supportMessages.author, body: supportMessages.body, attachments: supportMessages.attachments, createdAt: supportMessages.createdAt })
      .from(supportMessages).where(eq(supportMessages.caseId, row.id)).orderBy(asc(supportMessages.createdAt)).limit(200),
  ]);
  res.json({ case: row, events, messages });
});

supportAdminRouter.patch("/cases/:id", async (req, res) => {
  const [current] = await db.select().from(supportCases).where(eq(supportCases.id, req.params.id));
  if (!current) return res.status(404).json({ error: "Kasus tidak ditemukan" });
  const actor = await whoAmI(req);
  const b = (req.body ?? {}) as Record<string, unknown>;
  const patch: Partial<typeof supportCases.$inferInsert> = { updatedAt: new Date() };
  const events: { kind: string; detail: string }[] = [];
  let statusMessage: string | null = null;

  if (b.status !== undefined) {
    if (!(CASE_STATUSES as readonly string[]).includes(String(b.status))) return res.status(400).json({ error: "Status tidak valid" });
    if (b.status !== current.status) {
      patch.status = String(b.status);
      patch.resolvedAt = b.status === "resolved" || b.status === "wontfix" ? new Date() : null;
      events.push({ kind: "status", detail: `${STATUS_LABEL[current.status]} → ${STATUS_LABEL[String(b.status)]}` });
      statusMessage = STATUS_LABEL[String(b.status)];
    }
  }
  if (b.priority !== undefined) {
    if (!(CASE_PRIORITIES as readonly string[]).includes(String(b.priority))) return res.status(400).json({ error: "Prioritas tidak valid" });
    if (b.priority !== current.priority) { patch.priority = String(b.priority); events.push({ kind: "priority", detail: `${current.priority} → ${String(b.priority)}` }); }
  }
  if (b.category !== undefined) {
    if (!(CASE_CATEGORIES as readonly string[]).includes(String(b.category))) return res.status(400).json({ error: "Jenis tidak valid" });
    if (b.category !== current.category) { patch.category = String(b.category); events.push({ kind: "category", detail: `${CASE_LABEL[current.category]} → ${CASE_LABEL[String(b.category)]}` }); }
  }
  if (typeof b.resolutionNote === "string") {
    const note = b.resolutionNote.trim().slice(0, 2000) || null;
    if (note !== current.resolutionNote) { patch.resolutionNote = note; events.push({ kind: "note", detail: `Catatan penyelesaian: ${snippet(note ?? "(dikosongkan)", 300)}` }); }
  }
  if (typeof b.note === "string" && b.note.trim()) events.push({ kind: "note", detail: b.note.trim().slice(0, 2000) }); // internal note: never shown to the tenant

  if (events.length === 0) return res.json({ ok: true, unchanged: true });
  await db.update(supportCases).set(patch).where(eq(supportCases.id, current.id));
  await db.insert(supportCaseEvents).values(events.map((e) => ({ caseId: current.id, kind: e.kind, actor, detail: e.detail })));
  if (statusMessage) {
    // The tenant is told about status changes (not internal notes) in its notification bell.
    await createNotification({ tenantId: current.tenantId, title: `Laporan #${current.caseNo}: ${statusMessage}`, body: snippet(current.title, 200), kind: "customer_message", severity: "info", createdBy: actor });
  }
  logEvent({ tenantId: current.tenantId, category: "tenant", action: "support.case_updated", message: `Kasus #${current.caseNo} diperbarui: ${events.map((e) => e.detail).join("; ").slice(0, 200)}`, actorType: "superadmin", actorLabel: actor });
  res.json({ ok: true });
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
