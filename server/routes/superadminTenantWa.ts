import { Router } from "express";
import { desc, eq, inArray, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { platformEvents, platformSettings, superadmins, tenants } from "../db/schema.js";
import { validateUuidParam } from "../middleware/validateUuidParam.js";
import { logEvent } from "../lib/platformEvents.js";
import { normalizeWhatsapp } from "../lib/crm.js";
import { loadWaConfig, loadWaRow, publicWaStatus, sendWhatsapp } from "../lib/whatsapp.js";
import {
  TENANT_TEMPLATES, loadLicences, loadTenantAuto, renderTenantMessage, sanitizeAutoSettings, stageFor, upcomingReminders, varsFor, whatsappFallbackLink, withinSendingHours,
} from "../lib/tenantWhatsapp.js";

// WhatsApp to existing tenants, mounted at /api/superadmin/tenant-wa (behind the Superadmin auth; finance accounts are refused upstream).
export const superadminTenantWaRouter = Router();
superadminTenantWaRouter.param("id", validateUuidParam("Tenant tidak ditemukan"));

async function whoAmI(superadminId: string): Promise<string | null> {
  const [row] = await db.select({ email: superadmins.email }).from(superadmins).where(eq(superadmins.id, superadminId));
  return row?.email ?? null;
}

// GET /overview — gateway state, the automatic-reminder setting, and what is queued / already sent
superadminTenantWaRouter.get("/overview", async (_req, res) => {
  const [waRow, auto] = await Promise.all([loadWaRow(), loadTenantAuto()]);
  const upcoming = await upcomingReminders(new Date(), undefined);
  res.json({ gateway: publicWaStatus(waRow).ready, auto, sendingNow: withinSendingHours(new Date()), upcoming });
});

// PUT /auto { enabled, stages }
superadminTenantWaRouter.put("/auto", async (req, res) => {
  const clean = sanitizeAutoSettings(req.body);
  const [existing] = await db.select({ id: platformSettings.id }).from(platformSettings).limit(1);
  if (existing) await db.update(platformSettings).set({ tenantWaAuto: clean, updatedAt: new Date() }).where(eq(platformSettings.id, existing.id));
  else await db.insert(platformSettings).values({ tenantWaAuto: clean });
  if (clean.enabled && !(await loadWaConfig())) return res.json({ auto: clean, warning: "Pengingat otomatis aktif, tetapi gateway WhatsApp belum diatur (Calon Tenant → Pengaturan) — belum ada pesan yang bisa terkirim." });
  res.json({ auto: clean });
});

// GET /:id — composer data: templates already filled in for this tenant, the phone, history
superadminTenantWaRouter.get("/:id", async (req, res) => {
  const [tenant] = await db.select({ id: tenants.id, name: tenants.name, ownerName: tenants.ownerName, phone: tenants.ownerWhatsapp }).from(tenants).where(eq(tenants.id, req.params.id));
  if (!tenant) return res.status(404).json({ error: "Tenant tidak ditemukan" });
  const now = new Date();
  const licences = (await loadLicences(tenant.id)).filter((l) => l.endsAt);
  // The licence that matters most: the one expiring first (an already-expired one wins over a healthy one).
  const soonest = licences.sort((a, b) => a.endsAt!.getTime() - b.endsAt!.getTime())[0];
  const sender = await whoAmI(req.superadminId!);
  const vars = varsFor(tenant, {
    booths: soonest ? licences.filter((l) => l.endsAt!.getTime() === soonest.endsAt!.getTime()).length : undefined,
    kind: soonest && (soonest.type === "trial" || soonest.type === "paid") ? soonest.type : undefined,
    endsAt: soonest?.endsAt ?? null, now, sender: sender ? sender.split("@")[0] : null,
  });
  const phone = normalizeWhatsapp(tenant.phone);
  const templates = TENANT_TEMPLATES.map((t) => {
    const out = renderTenantMessage(t.text, vars);
    return { key: t.key, label: t.label, text: out.text, missing: out.missing, waLink: whatsappFallbackLink(phone, out.text) };
  });
  const history = await db.select({ id: platformEvents.id, action: platformEvents.action, message: platformEvents.message, actor: platformEvents.actorLabel, at: platformEvents.createdAt, metadata: platformEvents.metadata })
    .from(platformEvents)
    .where(and(eq(platformEvents.tenantId, tenant.id), inArray(platformEvents.action, ["tenant.wa", "tenant.wa.auto", "tenant.wa.failed"])))
    .orderBy(desc(platformEvents.createdAt)).limit(15);
  res.json({
    tenant: { id: tenant.id, name: tenant.name, ownerName: tenant.ownerName }, phone, gateway: publicWaStatus(await loadWaRow()).ready, templates, history,
    licenceStage: soonest?.endsAt ? stageFor(soonest.endsAt, now) : null,
  });
});

// POST /:id/send { text, mode: "gateway" | "manual" } — gateway sends through the provider; manual = the operator pressed send in wa.me, only logged
superadminTenantWaRouter.post("/:id/send", async (req, res) => {
  const [tenant] = await db.select({ id: tenants.id, name: tenants.name, phone: tenants.ownerWhatsapp }).from(tenants).where(eq(tenants.id, req.params.id));
  if (!tenant) return res.status(404).json({ error: "Tenant tidak ditemukan" });
  const text = typeof req.body?.text === "string" ? req.body.text.trim().slice(0, 4000) : "";
  if (!text) return res.status(400).json({ error: "Pesan kosong" });
  const phone = normalizeWhatsapp(tenant.phone);
  if (!phone) return res.status(400).json({ error: "Tenant ini belum punya nomor WhatsApp yang valid. Isi dulu di kolom profil tenant." });
  const actor = await whoAmI(req.superadminId!);
  const preview = text.length > 160 ? `${text.slice(0, 157)}…` : text;

  if (req.body?.mode !== "gateway") {
    logEvent({ level: "info", category: "tenant", action: "tenant.wa", message: `WhatsApp ke ${tenant.name} (dibuka manual): ${preview}`, tenantId: tenant.id, actorType: "superadmin", actorLabel: actor, metadata: { via: "wa.me", text } });
    return res.status(201).json({ ok: true });
  }
  const config = await loadWaConfig();
  if (!config) return res.status(409).json({ error: "Gateway WhatsApp belum diatur. Pakai tombol Buka WhatsApp, atau atur di Calon Tenant → Pengaturan." });
  const result = await sendWhatsapp(config, phone, text);
  if (!result.ok) {
    logEvent({ level: "warning", category: "tenant", action: "tenant.wa.failed", message: `WhatsApp ke ${tenant.name} gagal: ${result.error}`, tenantId: tenant.id, actorType: "superadmin", actorLabel: actor, metadata: { via: "gateway", text } });
    return res.status(502).json({ error: `Pesan gagal dikirim: ${result.error}` });
  }
  logEvent({ level: "info", category: "tenant", action: "tenant.wa", message: `WhatsApp ke ${tenant.name} (terkirim): ${preview}`, tenantId: tenant.id, actorType: "superadmin", actorLabel: actor, metadata: { via: "gateway", text, providerId: result.providerId } });
  res.status(201).json({ ok: true });
});
