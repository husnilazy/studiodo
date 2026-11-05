import { Router } from "express";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { admins, kioskKeys, platformEvents, platformSettings, superadmins, tenants } from "../db/schema.js";
import { validateUuidParam } from "../middleware/validateUuidParam.js";
import { logEvent } from "../lib/platformEvents.js";
import { normalizeWhatsapp } from "../lib/crm.js";
import { maskSecrets, renderTemplate, resolveTemplates } from "../lib/leads.js";
import { readStoredSecret } from "../lib/secretBox.js";
import { resetLink, SETUP_TTL_MS } from "../lib/emails.js";
import { portalBaseUrl } from "../lib/urls.js";
import { onboardingUrl } from "./superadminLeads.js";
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

/** One-time links carry a signed token; the activity log keeps the shape of the message, not a working credential. */
const maskLinks = (text: string) => text.replace(/([?&]token=)[^\s&]+/g, "$1…");
const safeForLog = (text: string) => maskLinks(maskSecrets(text));

// POST /:id/account-message — fills the "login + trial key" WhatsApp for an existing tenant in one click: the login email, a fresh
// one-time "set your password" link (never the password), and the booth's trial key. Revealing the key is audited like in Lisensi.
superadminTenantWaRouter.post("/:id/account-message", async (req, res) => {
  const [tenant] = await db.select({ id: tenants.id, name: tenants.name, ownerName: tenants.ownerName, phone: tenants.ownerWhatsapp }).from(tenants).where(eq(tenants.id, req.params.id));
  if (!tenant) return res.status(404).json({ error: "Tenant tidak ditemukan" });
  const [admin] = await db.select().from(admins).where(eq(admins.tenantId, tenant.id)).orderBy(asc(admins.createdAt)).limit(1);
  if (!admin) return res.status(409).json({ error: "Tenant ini belum punya akun admin, jadi belum ada data login yang bisa dikirim." });

  const now = new Date();
  const keys = await db.select().from(kioskKeys).where(and(eq(kioskKeys.tenantId, tenant.id), isNull(kioskKeys.revokedAt))).orderBy(desc(kioskKeys.createdAt));
  const key = keys.find((k) => k.licenseType === "trial" && k.licenseEndsAt && k.licenseEndsAt > now) ?? keys.find((k) => k.licenseType === "trial") ?? keys[0];
  const plainKey = key ? readStoredSecret(key.rawKey) : null;
  const trialDays = key?.licenseType === "trial" && key.licenseEndsAt ? Math.max(0, Math.ceil((key.licenseEndsAt.getTime() - now.getTime()) / 86_400_000)) : null;

  const [settings] = await db.select({ templates: platformSettings.leadTemplates }).from(platformSettings).limit(1);
  const template = resolveTemplates(settings?.templates).find((t) => t.key === "welcome_login")!.text;
  const rendered = renderTemplate(template, {
    nama: (tenant.ownerName ?? "").trim().split(/\s+/)[0] || "Kak", usaha: tenant.name, masa_trial: trialDays, link_login: portalBaseUrl(),
    email_login: admin.email, link_setup: resetLink("tenant", admin.id, admin.passwordHash, SETUP_TTL_MS), key_trial: plainKey, link_panduan: onboardingUrl(),
  });

  const actor = await whoAmI(req.superadminId!);
  if (plainKey && key) logEvent({ tenantId: tenant.id, category: "auth", action: "kiosk_key.revealed", message: `Key booth "${key.label ?? key.id.slice(0, 8)}" dimasukkan ke pesan WhatsApp oleh superadmin`, actorType: "superadmin", actorLabel: actor });
  logEvent({ tenantId: tenant.id, level: "info", category: "tenant", action: "tenant.wa.account_prepared", message: `Pesan data akun & key trial disiapkan untuk ${tenant.name}`, actorType: "superadmin", actorLabel: actor });
  res.json({
    text: rendered.text, missing: rendered.missing, waLink: whatsappFallbackLink(tenant.phone, rendered.text),
    includes: { email: admin.email, hasKey: Boolean(plainKey), keyLabel: key?.label ?? null, trialDays, setupLinkDays: 7 },
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
  const safe = safeForLog(text);
  const preview = safe.length > 160 ? `${safe.slice(0, 157)}…` : safe;

  if (req.body?.mode !== "gateway") {
    logEvent({ level: "info", category: "tenant", action: "tenant.wa", message: `WhatsApp ke ${tenant.name} (dibuka manual): ${preview}`, tenantId: tenant.id, actorType: "superadmin", actorLabel: actor, metadata: { via: "wa.me", text: safe } });
    return res.status(201).json({ ok: true });
  }
  const config = await loadWaConfig();
  if (!config) return res.status(409).json({ error: "Gateway WhatsApp belum diatur. Pakai tombol Buka WhatsApp, atau atur di Calon Tenant → Pengaturan." });
  const result = await sendWhatsapp(config, phone, text);
  if (!result.ok) {
    logEvent({ level: "warning", category: "tenant", action: "tenant.wa.failed", message: `WhatsApp ke ${tenant.name} gagal: ${result.error}`, tenantId: tenant.id, actorType: "superadmin", actorLabel: actor, metadata: { via: "gateway", text: safe } });
    return res.status(502).json({ error: `Pesan gagal dikirim: ${result.error}` });
  }
  logEvent({ level: "info", category: "tenant", action: "tenant.wa", message: `WhatsApp ke ${tenant.name} (terkirim): ${preview}`, tenantId: tenant.id, actorType: "superadmin", actorLabel: actor, metadata: { via: "gateway", text: safe, providerId: result.providerId } });
  res.status(201).json({ ok: true });
});
