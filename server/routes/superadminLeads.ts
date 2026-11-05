import { Router, type Request } from "express";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { leadActivities, leadTasks, platformSettings, plans, superadmins, tenantApplications } from "../db/schema.js";
import { validateUuidParam } from "../middleware/validateUuidParam.js";
import { logEvent } from "../lib/platformEvents.js";
import { readVolumeTiers } from "../lib/boothPricing.js";
import { mergePolicy } from "../lib/withdrawalPolicy.js";
import { portalBaseUrl } from "../lib/urls.js";
import { normalizeWhatsapp } from "../lib/crm.js";
import {
  canMoveTo, dueFromPreset, isStage, LEAD_STAGES, OPEN_STAGES, renderTemplate, resolveTemplates, sanitizeLeadPatch, sanitizeTemplateOverrides,
  STAGE_LABELS, summarizeFunnel, taskState, TEMPLATE_VARIABLES, whatsappFallbackLink, type LeadStage, type TemplateVars,
} from "../lib/leads.js";
import { buildContractSnapshot, issuerIncomplete, newContractToken, rupiah, renderContractHtml, resolveIssuer, type ContractSnapshot } from "../lib/contract.js";
import { loadWaConfig, loadWaRow, publicWaStatus, rotateWebhookKey, sanitizeWaPatch, sendWhatsapp } from "../lib/whatsapp.js";
import { onboardingGuide, renderDocPage, teamGuide, markdownToHtml, type DocFacts } from "../lib/leadDocs.js";
import { describeSchedule } from "../lib/withdrawalPolicy.js";
import { runLeadReminders } from "../lib/leadReminders.js";

// CRM for prospective tenants (mounted at /api/superadmin/leads, behind requireSuperadminAuth; 'finance' accounts are already
// refused by the superadmin router). A lead is a tenant_applications row; see lib/leads.ts for the rules.
export const superadminLeadsRouter = Router();
superadminLeadsRouter.param("id", validateUuidParam("Lead tidak ditemukan"));
superadminLeadsRouter.param("taskId", validateUuidParam("Tugas tidak ditemukan"));

/** Where the public pages (contract, onboarding guide) live: this API's own address. */
export const publicApiBase = () => (process.env.PUBLIC_BASE_URL || portalBaseUrl()).replace(/\/$/, "");
export const contractUrl = (token: string) => `${publicApiBase()}/api/public/kontrak/${token}`;
export const onboardingUrl = () => `${publicApiBase()}/api/public/panduan/onboarding`;

async function whoAmI(req: Request): Promise<string | null> {
  const [row] = await db.select({ email: superadmins.email }).from(superadmins).where(eq(superadmins.id, req.superadminId!));
  return row?.email ?? null;
}

async function settingsRow() {
  const [existing] = await db.select().from(platformSettings).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(platformSettings).values({}).returning();
  return created;
}

export async function addActivity(leadId: string, kind: string, body: string, actor: string | null, meta?: Record<string, unknown>) {
  const [row] = await db.insert(leadActivities).values({ leadId, kind, body, actor, meta: meta ?? null }).returning();
  return row;
}

const getLead = async (id: string) => (await db.select().from(tenantApplications).where(eq(tenantApplications.id, id)))[0];
type LeadRow = typeof tenantApplications.$inferSelect;

/** What the browser gets: never the contract token (a capability) or the frozen snapshot. */
function publicLead(row: LeadRow) {
  const { contractToken, contractSnapshot, contractSignedIp, ...rest } = row;
  return { ...rest, hasContract: Boolean(contractToken) };
}

const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? "";

function templateVars(lead: LeadRow, planName: string | null, sender: string | null): TemplateVars {
  const snap = lead.contractSnapshot as ContractSnapshot | null;
  return {
    nama: firstName(lead.ownerName),
    usaha: lead.businessName,
    booth: lead.boothCount,
    kota: lead.city,
    paket: snap?.plan.name ?? planName,
    harga: snap ? rupiah(snap.contractTotal) : null,
    link_kontrak: lead.contractToken && lead.contractStatus !== "none" ? contractUrl(lead.contractToken) : null,
    link_panduan: onboardingUrl(),
    pengirim: sender,
  };
}

// --- list / summary --------------------------------------------------------------------------------------------------------

superadminLeadsRouter.get("/", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
  const rows = await db.select().from(tenantApplications).orderBy(desc(tenantApplications.createdAt)).limit(1000);
  const ids = rows.map((r) => r.id);
  const tasks = ids.length ? await db.select().from(leadTasks).where(and(inArray(leadTasks.leadId, ids), isNull(leadTasks.doneAt))).orderBy(asc(leadTasks.dueAt)) : [];
  const next = new Map<string, typeof tasks[number]>();
  const counts = new Map<string, number>();
  for (const t of tasks) { if (!next.has(t.leadId)) next.set(t.leadId, t); counts.set(t.leadId, (counts.get(t.leadId) ?? 0) + 1); }
  const now = new Date();
  const leads = rows
    .filter((r) => !q || [r.businessName, r.ownerName, r.ownerEmail, r.ownerWhatsapp, r.city].some((v) => v?.toLowerCase().includes(q)))
    .map((r) => {
      const t = next.get(r.id);
      return { ...publicLead(r), nextTask: t ? { id: t.id, title: t.title, dueAt: t.dueAt, state: taskState(t, now) } : null, openTasks: counts.get(r.id) ?? 0 };
    });
  res.json({ leads, stages: LEAD_STAGES.map((s) => ({ stage: s, label: STAGE_LABELS[s] })) });
});

superadminLeadsRouter.get("/summary", async (_req, res) => {
  await runLeadReminders().catch(() => 0); // idempotent; also covers a server that restarted and missed its timer
  const rows = await db.select({ pipelineStage: tenantApplications.pipelineStage, contractStatus: tenantApplications.contractStatus }).from(tenantApplications);
  const open = await db.select({ dueAt: leadTasks.dueAt, doneAt: leadTasks.doneAt }).from(leadTasks).where(isNull(leadTasks.doneAt));
  const now = new Date();
  const states = open.map((t) => taskState(t, now));
  const withTask = new Set((await db.select({ leadId: leadTasks.leadId }).from(leadTasks).where(isNull(leadTasks.doneAt))).map((r) => r.leadId));
  const openLeads = await db.select({ id: tenantApplications.id }).from(tenantApplications).where(inArray(tenantApplications.pipelineStage, [...OPEN_STAGES]));
  res.json({
    funnel: summarizeFunnel(rows),
    overdue: states.filter((s) => s === "overdue").length,
    today: states.filter((s) => s === "today").length,
    openLeads: openLeads.length,
    withoutTask: openLeads.filter((l) => !withTask.has(l.id)).length,
    contractsAwaiting: rows.filter((r) => r.contractStatus === "sent").length,
  });
});

// --- create / read / update ------------------------------------------------------------------------------------------------

superadminLeadsRouter.post("/", async (req, res) => {
  const parsed = sanitizeLeadPatch(req.body, { requireNames: true });
  if ("error" in parsed) return res.status(400).json({ error: parsed.error });
  const p = parsed.patch;
  const actor = await whoAmI(req);
  const stage: LeadStage = isStage(req.body?.pipelineStage) && req.body.pipelineStage !== "active" ? req.body.pipelineStage : "new";
  const [row] = await db.insert(tenantApplications).values({
    businessName: p.businessName!, ownerName: p.ownerName!, ownerEmail: p.ownerEmail ?? "", ownerWhatsapp: p.ownerWhatsapp ?? null,
    businessType: p.businessType ?? null, city: p.city ?? null, leadSource: p.leadSource ?? "whatsapp", boothCount: p.boothCount ?? null,
    boothLocation: p.boothLocation ?? null, plannedStart: p.plannedStart ?? null, paymentSetup: p.paymentSetup ?? null,
    planSlug: p.planSlug ?? null, contractMonths: p.contractMonths ?? null, assignedTo: p.assignedTo ?? actor, pipelineStage: stage,
    message: typeof req.body?.message === "string" && req.body.message.trim() ? req.body.message.trim().slice(0, 2000) : null,
  }).returning();
  await addActivity(row.id, "system", "Lead dibuat manual", actor);
  logEvent({ category: "tenant", action: "lead.created", message: `Lead baru: "${row.businessName}"`, actorType: "superadmin", actorLabel: actor });
  res.status(201).json(publicLead(row));
});

superadminLeadsRouter.get("/:id", async (req, res) => {
  const lead = await getLead(req.params.id);
  if (!lead) return res.status(404).json({ error: "Lead tidak ditemukan" });
  const [activities, tasks] = await Promise.all([
    db.select().from(leadActivities).where(eq(leadActivities.leadId, lead.id)).orderBy(desc(leadActivities.createdAt)).limit(300),
    db.select().from(leadTasks).where(eq(leadTasks.leadId, lead.id)).orderBy(asc(leadTasks.doneAt), asc(leadTasks.dueAt)),
  ]);
  const now = new Date();
  const snap = lead.contractSnapshot as ContractSnapshot | null;
  res.json({
    lead: publicLead(lead),
    activities,
    tasks: tasks.map((t) => ({ ...t, state: taskState(t, now) })),
    contract: lead.contractStatus === "none" || !snap ? null : {
      status: lead.contractStatus, number: snap.number, url: lead.contractToken ? contractUrl(lead.contractToken) : null,
      sentAt: lead.contractSentAt, signedAt: lead.contractSignedAt, signedName: lead.contractSignedName, warnings: snap.warnings,
      total: snap.contractTotal, html: renderContractHtml(snap, { status: lead.contractStatus as "draft" | "sent" | "signed", signedAt: lead.contractSignedAt?.toISOString(), signedName: lead.contractSignedName }),
    },
  });
});

superadminLeadsRouter.patch("/:id", async (req, res) => {
  const lead = await getLead(req.params.id);
  if (!lead) return res.status(404).json({ error: "Lead tidak ditemukan" });
  const parsed = sanitizeLeadPatch(req.body);
  if ("error" in parsed) return res.status(400).json({ error: parsed.error });
  // A signed contract froze these numbers; changing them silently would make the lead and the contract disagree.
  const touchesTerms = ["boothCount", "planSlug", "contractMonths", "paymentSetup"].some((k) => (parsed.patch as Record<string, unknown>)[k] !== undefined && (parsed.patch as Record<string, unknown>)[k] !== (lead as Record<string, unknown>)[k]);
  if (touchesTerms && lead.contractStatus === "signed") return res.status(409).json({ error: "Kontrak sudah disetujui — ubah syarat lewat kontrak baru, bukan di kartu lead." });
  const patch: Record<string, unknown> = { ...parsed.patch };
  if (patch.ownerEmail === undefined) delete patch.ownerEmail;
  if (touchesTerms && lead.contractStatus === "sent") { patch.contractStatus = "draft"; } // sent terms no longer match; must be regenerated and re-sent
  const [row] = await db.update(tenantApplications).set(patch).where(eq(tenantApplications.id, lead.id)).returning();
  if (touchesTerms && lead.contractStatus === "sent") await addActivity(lead.id, "contract", "Syarat diubah setelah kontrak terkirim — kontrak perlu dibuat ulang dan dikirim lagi", await whoAmI(req));
  res.json(publicLead(row));
});

superadminLeadsRouter.delete("/:id", async (req, res) => {
  const lead = await getLead(req.params.id);
  if (!lead) return res.status(404).json({ error: "Lead tidak ditemukan" });
  if (lead.status === "converted") return res.status(409).json({ error: "Lead yang sudah jadi tenant tidak dihapus." });
  await db.delete(tenantApplications).where(eq(tenantApplications.id, lead.id));
  logEvent({ category: "tenant", action: "lead.deleted", message: `Lead "${lead.businessName}" dihapus`, actorType: "superadmin", actorLabel: await whoAmI(req) });
  res.json({ ok: true });
});

// --- stage ----------------------------------------------------------------------------------------------------------------------

export async function moveStage(lead: LeadRow, to: LeadStage, actor: string | null, reason?: string | null) {
  const set: Partial<typeof tenantApplications.$inferInsert> = { pipelineStage: to };
  if (to === "lost") {
    set.lostReason = reason ?? null;
    if (lead.status === "pending") { set.status = "rejected"; set.reviewedBy = actor; set.reviewedAt = new Date(); set.reviewNote = reason ?? lead.reviewNote; }
  } else if (lead.pipelineStage === "lost") {
    set.lostReason = null;
    if (lead.status === "rejected") { set.status = "pending"; set.reviewedBy = null; set.reviewedAt = null; }
  }
  const [row] = await db.update(tenantApplications).set(set).where(eq(tenantApplications.id, lead.id)).returning();
  await addActivity(lead.id, "stage", `${STAGE_LABELS[lead.pipelineStage as LeadStage] ?? lead.pipelineStage} → ${STAGE_LABELS[to]}${reason ? ` (${reason})` : ""}`, actor, { from: lead.pipelineStage, to });
  return row;
}

superadminLeadsRouter.post("/:id/stage", async (req, res) => {
  const lead = await getLead(req.params.id);
  if (!lead) return res.status(404).json({ error: "Lead tidak ditemukan" });
  if (!isStage(req.body?.stage)) return res.status(400).json({ error: "Tahap tidak dikenal" });
  const to = req.body.stage as LeadStage;
  const check = canMoveTo(lead.pipelineStage as LeadStage, to, lead.status === "converted");
  if (!check.ok) return res.status(409).json({ error: check.error });
  if (to === lead.pipelineStage) return res.json(publicLead(lead));
  const reason = typeof req.body?.reason === "string" && req.body.reason.trim() ? req.body.reason.trim().slice(0, 300) : null;
  res.json(publicLead(await moveStage(lead, to, await whoAmI(req), reason)));
});

// --- notes & tasks ---------------------------------------------------------------------------------------------------------------

superadminLeadsRouter.post("/:id/notes", async (req, res) => {
  const lead = await getLead(req.params.id);
  if (!lead) return res.status(404).json({ error: "Lead tidak ditemukan" });
  const body = typeof req.body?.body === "string" ? req.body.body.trim().slice(0, 4000) : "";
  if (!body) return res.status(400).json({ error: "Catatan kosong" });
  const kind = req.body?.kind === "call" ? "call" : "note";
  const actor = await whoAmI(req);
  const row = await addActivity(lead.id, kind, body, actor);
  if (kind === "call") await db.update(tenantApplications).set({ lastContactedAt: new Date() }).where(eq(tenantApplications.id, lead.id));
  res.status(201).json(row);
});

superadminLeadsRouter.post("/:id/tasks", async (req, res) => {
  const lead = await getLead(req.params.id);
  if (!lead) return res.status(404).json({ error: "Lead tidak ditemukan" });
  const title = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 200) : "";
  if (!title) return res.status(400).json({ error: "Judul tugas wajib diisi" });
  const due = typeof req.body?.preset === "string" ? dueFromPreset(req.body.preset) : new Date(String(req.body?.dueAt ?? ""));
  if (!due || Number.isNaN(due.getTime())) return res.status(400).json({ error: "Tanggal tugas tidak valid" });
  const actor = await whoAmI(req);
  const [row] = await db.insert(leadTasks).values({ leadId: lead.id, title, dueAt: due, createdBy: actor }).returning();
  await addActivity(lead.id, "task", `Tugas dibuat: ${title}`, actor, { taskId: row.id, dueAt: due.toISOString() });
  res.status(201).json({ ...row, state: taskState(row) });
});

superadminLeadsRouter.patch("/:id/tasks/:taskId", async (req, res) => {
  const [task] = await db.select().from(leadTasks).where(and(eq(leadTasks.id, req.params.taskId), eq(leadTasks.leadId, req.params.id)));
  if (!task) return res.status(404).json({ error: "Tugas tidak ditemukan" });
  const actor = await whoAmI(req);
  const set: Partial<typeof leadTasks.$inferInsert> = {};
  if (typeof req.body?.done === "boolean") set.doneAt = req.body.done ? new Date() : null;
  if (req.body?.dueAt !== undefined || req.body?.preset !== undefined) {
    const due = typeof req.body.preset === "string" ? dueFromPreset(req.body.preset) : new Date(String(req.body.dueAt));
    if (!due || Number.isNaN(due.getTime())) return res.status(400).json({ error: "Tanggal tugas tidak valid" });
    set.dueAt = due; set.remindedAt = null; // a moved task earns a fresh reminder
  }
  if (typeof req.body?.title === "string" && req.body.title.trim()) set.title = req.body.title.trim().slice(0, 200);
  const [row] = await db.update(leadTasks).set(set).where(eq(leadTasks.id, task.id)).returning();
  if (set.doneAt) await addActivity(task.leadId, "task", `Tugas selesai: ${task.title}`, actor);
  res.json({ ...row, state: taskState(row) });
});

superadminLeadsRouter.delete("/:id/tasks/:taskId", async (req, res) => {
  await db.delete(leadTasks).where(and(eq(leadTasks.id, req.params.taskId), eq(leadTasks.leadId, req.params.id)));
  res.json({ ok: true });
});

// --- WhatsApp --------------------------------------------------------------------------------------------------------------------

// Templates rendered for this lead, each with a wa.me fallback link. `gateway` tells the UI whether "Kirim" can go through the gateway.
superadminLeadsRouter.get("/:id/templates", async (req, res) => {
  const lead = await getLead(req.params.id);
  if (!lead) return res.status(404).json({ error: "Lead tidak ditemukan" });
  const [settings, [plan]] = await Promise.all([settingsRow(), lead.planSlug ? db.select({ name: plans.name }).from(plans).where(eq(plans.slug, lead.planSlug)) : Promise.resolve([])]);
  const vars = templateVars(lead, plan?.name ?? null, await whoAmI(req));
  const templates = resolveTemplates(settings.leadTemplates).map((t) => {
    const out = renderTemplate(t.text, vars);
    return { key: t.key, label: t.label, stage: t.stage, text: out.text, missing: out.missing, waLink: whatsappFallbackLink(lead.ownerWhatsapp, out.text) };
  });
  res.json({ templates, gateway: publicWaStatus(await loadWaRow()).ready, phone: normalizeWhatsapp(lead.ownerWhatsapp) });
});

// POST /:id/whatsapp  { text, mode: "gateway" | "manual" }
//   gateway: sent through the configured provider.  manual: the operator opened wa.me and pressed send themselves — only logged.
superadminLeadsRouter.post("/:id/whatsapp", async (req, res) => {
  const lead = await getLead(req.params.id);
  if (!lead) return res.status(404).json({ error: "Lead tidak ditemukan" });
  const text = typeof req.body?.text === "string" ? req.body.text.trim().slice(0, 4000) : "";
  if (!text) return res.status(400).json({ error: "Pesan kosong" });
  if (!lead.ownerWhatsapp || !normalizeWhatsapp(lead.ownerWhatsapp)) return res.status(400).json({ error: "Lead ini belum punya nomor WhatsApp yang valid" });
  const actor = await whoAmI(req);
  const markContacted = async () => {
    const set: Partial<typeof tenantApplications.$inferInsert> = { lastContactedAt: new Date() };
    if (lead.pipelineStage === "new") set.pipelineStage = "contacted";
    await db.update(tenantApplications).set(set).where(eq(tenantApplications.id, lead.id));
    if (set.pipelineStage) await addActivity(lead.id, "stage", `${STAGE_LABELS.new} → ${STAGE_LABELS.contacted} (otomatis, pesan terkirim)`, "system", { from: "new", to: "contacted" });
  };

  if (req.body?.mode !== "gateway") {
    const row = await addActivity(lead.id, "whatsapp_out", text, actor, { via: "wa.me", status: "opened" });
    await markContacted();
    return res.status(201).json({ ok: true, activity: row });
  }
  const config = await loadWaConfig();
  if (!config) return res.status(409).json({ error: "Gateway WhatsApp belum diatur. Pakai tombol Buka WhatsApp, atau atur di Pengaturan." });
  const result = await sendWhatsapp(config, lead.ownerWhatsapp, text);
  if (!result.ok) {
    await addActivity(lead.id, "whatsapp_out", text, actor, { via: "gateway", status: "failed", error: result.error });
    return res.status(502).json({ error: `Pesan gagal dikirim: ${result.error}` });
  }
  const row = await addActivity(lead.id, "whatsapp_out", text, actor, { via: "gateway", status: "sent", providerId: result.providerId });
  await markContacted();
  res.status(201).json({ ok: true, activity: row });
});

// --- contract ----------------------------------------------------------------------------------------------------------------------

async function contractInputs(lead: LeadRow) {
  const settings = await settingsRow();
  const [plan] = lead.planSlug ? await db.select().from(plans).where(eq(plans.slug, lead.planSlug)) : [];
  return {
    settings, plan,
    input: {
      lead: {
        id: lead.id, businessName: lead.businessName, ownerName: lead.ownerName, ownerEmail: lead.ownerEmail, ownerWhatsapp: lead.ownerWhatsapp,
        city: lead.city, boothCount: lead.boothCount, boothLocation: lead.boothLocation, plannedStart: lead.plannedStart, paymentSetup: lead.paymentSetup, contractMonths: lead.contractMonths,
      },
      plan: plan ? { ...plan, kioskLimit: plan.kioskLimit } : null,
      tiers: readVolumeTiers(settings.volumeDiscounts),
      settings: {
        qrisFeePercent: Number(settings.qrisFeePercent), withdrawalMinAmount: settings.withdrawalMinAmount, withdrawalFlatFee: settings.withdrawalFlatFee,
        defaultTrialDays: settings.defaultTrialDays, gracePeriodDays: settings.gracePeriodDays,
      },
      policy: mergePolicy(settings.withdrawalPolicy, null),
      issuer: resolveIssuer(settings.contractIssuer),
    },
  };
}

// Generate (or regenerate) the draft from the lead's current data. A signed contract is never overwritten.
superadminLeadsRouter.post("/:id/contract", async (req, res) => {
  const lead = await getLead(req.params.id);
  if (!lead) return res.status(404).json({ error: "Lead tidak ditemukan" });
  if (lead.contractStatus === "signed") return res.status(409).json({ error: "Kontrak sudah disetujui dan tidak bisa dibuat ulang." });
  const { input } = await contractInputs(lead);
  const previous = lead.contractSnapshot as ContractSnapshot | null;
  const built = buildContractSnapshot({ ...input, number: previous?.number });
  if ("error" in built) return res.status(400).json({ error: built.error });
  const [row] = await db.update(tenantApplications).set({
    contractSnapshot: built.snapshot as unknown as Record<string, unknown>, contractStatus: "draft", contractToken: lead.contractToken ?? newContractToken(), contractSentAt: null,
  }).where(eq(tenantApplications.id, lead.id)).returning();
  await addActivity(lead.id, "contract", `Draf kontrak ${built.snapshot.number} dibuat (${built.snapshot.booths} booth, ${rupiah(built.snapshot.contractTotal)})`, await whoAmI(req));
  res.json({ ok: true, warnings: built.snapshot.warnings, html: renderContractHtml(built.snapshot, { status: "draft" }), lead: publicLead(row) });
});

// Send = make the public link live. The owner must confirm they reviewed the draft; an incomplete issuer blocks sending.
superadminLeadsRouter.post("/:id/contract/send", async (req, res) => {
  const lead = await getLead(req.params.id);
  if (!lead || !lead.contractToken || !lead.contractSnapshot) return res.status(404).json({ error: "Buat draf kontrak dulu" });
  if (lead.contractStatus === "signed") return res.status(409).json({ error: "Kontrak sudah disetujui" });
  if (req.body?.reviewed !== true) return res.status(400).json({ error: "Konfirmasi dulu bahwa draf sudah ditinjau pemilik / penasihat hukum." });
  const snap = lead.contractSnapshot as unknown as ContractSnapshot;
  if (issuerIncomplete(snap.issuer)) return res.status(409).json({ error: "Data STUDIODO (nama badan usaha, alamat, kontak) belum lengkap. Isi di Pengaturan lalu buat ulang drafnya." });
  const actor = await whoAmI(req);
  const [row] = await db.update(tenantApplications).set({ contractStatus: "sent", contractSentAt: new Date() }).where(eq(tenantApplications.id, lead.id)).returning();
  await addActivity(lead.id, "contract", `Kontrak ${snap.number} dikirim (tautan aktif)`, actor);
  if (OPEN_STAGES.includes(lead.pipelineStage as LeadStage) && lead.pipelineStage !== "contract_sent") await moveStage(row, "contract_sent", actor);
  const url = contractUrl(lead.contractToken);
  const vars = templateVars({ ...row, contractStatus: "sent" }, null, actor);
  const templateText = resolveTemplates((await settingsRow()).leadTemplates).find((t) => t.key === "contract")!.text;
  const message = renderTemplate(templateText, vars).text;
  res.json({ ok: true, url, message, waLink: whatsappFallbackLink(lead.ownerWhatsapp, message) });
});

// Manually record an approval that happened outside the link (e.g. the customer agreed on WhatsApp / signed a paper copy).
superadminLeadsRouter.post("/:id/contract/mark-signed", async (req, res) => {
  const lead = await getLead(req.params.id);
  if (!lead || !lead.contractSnapshot) return res.status(404).json({ error: "Buat draf kontrak dulu" });
  if (lead.contractStatus === "signed") return res.json(publicLead(lead));
  const name = typeof req.body?.name === "string" && req.body.name.trim() ? req.body.name.trim().slice(0, 120) : lead.ownerName;
  const actor = await whoAmI(req);
  const [row] = await db.update(tenantApplications).set({ contractStatus: "signed", contractSignedAt: new Date(), contractSignedName: name, contractSignedIp: "dicatat manual" }).where(eq(tenantApplications.id, lead.id)).returning();
  await addActivity(lead.id, "contract", `Kontrak dicatat disetujui oleh ${name} (dicatat manual oleh ${actor ?? "tim"})`, actor);
  res.json(publicLead(row));
});

// --- settings ----------------------------------------------------------------------------------------------------------------------

superadminLeadsRouter.get("/settings/all", async (_req, res) => {
  const row = await settingsRow();
  res.json({
    whatsapp: publicWaStatus(row),
    templates: resolveTemplates(row.leadTemplates),
    variables: TEMPLATE_VARIABLES,
    issuer: { name: row.contractIssuer?.name ?? "", address: row.contractIssuer?.address ?? "", contact: row.contractIssuer?.contact ?? "" },
    webhookPath: "/api/public/wa/webhook/<kunci>",
    publicBase: publicApiBase(),
  });
});

superadminLeadsRouter.put("/settings/all", async (req, res) => {
  const current = await settingsRow();
  const set: Partial<typeof platformSettings.$inferInsert> = {};
  if (req.body?.whatsapp && typeof req.body.whatsapp === "object") {
    const parsed = sanitizeWaPatch(req.body.whatsapp);
    if ("error" in parsed) return res.status(400).json({ error: parsed.error });
    Object.assign(set, parsed.values);
  }
  if (req.body?.templates !== undefined) set.leadTemplates = sanitizeTemplateOverrides(req.body.templates);
  if (req.body?.issuer && typeof req.body.issuer === "object") {
    const t = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 300) : "");
    set.contractIssuer = { name: t(req.body.issuer.name), address: t(req.body.issuer.address), contact: t(req.body.issuer.contact) };
  }
  if (Object.keys(set).length) {
    set.updatedAt = new Date();
    await db.update(platformSettings).set(set).where(eq(platformSettings.id, current.id));
    logEvent({ category: "system", action: "leads.settings_updated", message: `Pengaturan CRM/WhatsApp diubah${set.waTokenEnc !== undefined ? " (token WhatsApp)" : ""}`, actorType: "superadmin", actorLabel: await whoAmI(req) });
  }
  const row = await settingsRow();
  res.json({ whatsapp: publicWaStatus(row), templates: resolveTemplates(row.leadTemplates), issuer: { name: row.contractIssuer?.name ?? "", address: row.contractIssuer?.address ?? "", contact: row.contractIssuer?.contact ?? "" } });
});

// The inbound-webhook key is shown ONCE (like an API key) and can only be rotated afterwards.
superadminLeadsRouter.post("/settings/webhook-key", async (_req, res) => {
  const key = await rotateWebhookKey();
  res.json({ key, url: `${publicApiBase()}/api/public/wa/webhook/${key}` });
});

superadminLeadsRouter.post("/settings/whatsapp-test", async (req, res) => {
  const config = await loadWaConfig();
  if (!config) return res.status(409).json({ error: "Isi token dan pilih provider dulu" });
  const phone = typeof req.body?.phone === "string" ? req.body.phone : "";
  const result = await sendWhatsapp(config, phone, "Tes dari STUDIODO: gateway WhatsApp tersambung ✅");
  if (!result.ok) return res.status(502).json({ error: result.error });
  res.json({ ok: true });
});

// --- docs --------------------------------------------------------------------------------------------------------------------------

export async function loadDocFacts(): Promise<DocFacts> {
  const row = await settingsRow();
  const policy = mergePolicy(row.withdrawalPolicy, null);
  return {
    trialDays: row.defaultTrialDays, graceDays: row.gracePeriodDays, qrisFeePercent: Number(row.qrisFeePercent), withdrawalMinAmount: policy.minAmount || row.withdrawalMinAmount,
    withdrawalFlatFee: row.withdrawalFlatFee, withdrawalSchedule: describeSchedule(policy), holdDays: policy.holdDays, volumeTiers: readVolumeTiers(row.volumeDiscounts), portalUrl: portalBaseUrl(),
  };
}

superadminLeadsRouter.get("/docs/:which", async (req, res) => {
  const facts = await loadDocFacts();
  const doc = req.params.which === "onboarding" ? onboardingGuide(facts) : req.params.which === "team" ? teamGuide(facts) : null;
  if (!doc) return res.status(404).json({ error: "Dokumen tidak ditemukan" });
  res.json({ ...doc, html: markdownToHtml(doc.markdown), page: renderDocPage(doc.title, doc.markdown), publicUrl: req.params.which === "onboarding" ? onboardingUrl() : null });
});
