import express, { Router } from "express";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { leadActivities, tenantApplications } from "../db/schema.js";
import { clientIp, makeRateLimiter } from "../lib/clientIp.js";
import { renderContractHtml, type ContractSnapshot } from "../lib/contract.js";
import { normalizeWhatsapp } from "../lib/crm.js";
import { renderDocPage, onboardingGuide } from "../lib/leadDocs.js";
import { logEvent } from "../lib/platformEvents.js";
import { loadWaRow, parseInbound, webhookKeyMatches } from "../lib/whatsapp.js";
import { contractUrl, loadDocFacts } from "./superadminLeads.js";

// Public, login-free pages for prospective tenants (mounted at /api/public):
//  - GET  /kontrak/:token           the cooperation letter; the long random token is the only credential
//  - POST /kontrak/:token/setuju    the customer's approval
//  - GET  /panduan/onboarding       the onboarding guide
//  - POST /wa/webhook/:key          inbound WhatsApp messages from the gateway (key in the URL, set up in Superadmin)
export const publicLeadsRouter = Router();

const tooMany = makeRateLimiter(60, 60_000);
const tooManySigns = makeRateLimiter(10, 10 * 60_000);
const notFound = (res: express.Response) => res.status(404).type("html").send(renderDocPage("Tidak ditemukan", "# Tautan tidak ditemukan\n\nTautan ini tidak valid atau sudah tidak berlaku. Hubungi tim STUDIODO yang mengirimkannya."));
const TOKEN_RE = /^[A-Za-z0-9_-]{20,80}$/;

publicLeadsRouter.get("/kontrak/:token", async (req, res) => {
  if (tooMany(clientIp(req))) return res.status(429).send("Terlalu banyak permintaan");
  const token = String(req.params.token);
  if (!TOKEN_RE.test(token)) return notFound(res);
  const [lead] = await db.select().from(tenantApplications).where(and(eq(tenantApplications.contractToken, token), isNotNull(tenantApplications.contractSnapshot)));
  // A draft is not public: until the team presses "Kirim", the link shows nothing.
  if (!lead || (lead.contractStatus !== "sent" && lead.contractStatus !== "signed")) return notFound(res);
  res.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
  res.type("html").send(renderContractHtml(lead.contractSnapshot as unknown as ContractSnapshot, {
    status: lead.contractStatus as "sent" | "signed", signedAt: lead.contractSignedAt?.toISOString(), signedName: lead.contractSignedName, signUrl: `${contractUrl(token)}/setuju`,
  }));
});

publicLeadsRouter.post("/kontrak/:token/setuju", express.urlencoded({ extended: false, limit: "4kb" }), async (req, res) => {
  const ip = clientIp(req);
  if (tooManySigns(ip)) return res.status(429).send("Terlalu banyak percobaan");
  const token = String(req.params.token);
  if (!TOKEN_RE.test(token)) return notFound(res);
  const name = String(req.body?.name ?? "").trim().slice(0, 120);
  if (!name || req.body?.agree !== "1") return res.status(400).type("html").send(renderDocPage("Persetujuan belum lengkap", "# Persetujuan belum lengkap\n\nIsi nama lengkap dan centang persetujuan, lalu coba lagi."));
  // Only a letter that is "sent" can be approved, and only once (the WHERE makes it atomic).
  const [lead] = await db.update(tenantApplications)
    .set({ contractStatus: "signed", contractSignedAt: new Date(), contractSignedName: name, contractSignedIp: ip })
    .where(and(eq(tenantApplications.contractToken, token), eq(tenantApplications.contractStatus, "sent"))).returning();
  if (lead) {
    await db.insert(leadActivities).values({ leadId: lead.id, kind: "contract", body: `Kontrak disetujui oleh ${name} lewat tautan`, actor: "lead", meta: { ip } });
    logEvent({ category: "tenant", action: "lead.contract_signed", message: `Kontrak "${lead.businessName}" disetujui oleh ${name}`, actorType: "system", metadata: { leadId: lead.id } });
  }
  res.redirect(303, contractUrl(token));
});

publicLeadsRouter.get("/panduan/onboarding", async (req, res) => {
  if (tooMany(clientIp(req))) return res.status(429).send("Terlalu banyak permintaan");
  const doc = onboardingGuide(await loadDocFacts());
  res.set("Cache-Control", "public, max-age=300").type("html").send(renderDocPage(doc.title, doc.markdown));
});

// Gateway → us. Always answers 200 to a valid key (gateways retry on errors); unknown numbers are ignored on purpose so a stranger
// messaging the number cannot fill the CRM.
publicLeadsRouter.post("/wa/webhook/:key", express.urlencoded({ extended: false, limit: "64kb" }), async (req, res) => {
  if (tooMany(clientIp(req))) return res.status(429).json({ error: "Terlalu banyak permintaan" });
  if (!webhookKeyMatches(await loadWaRow(), String(req.params.key))) return res.status(404).json({ error: "Tidak ditemukan" });
  const msg = parseInbound(req.body);
  if (!msg) return res.json({ ok: true, ignored: true });
  const candidates = await db.select().from(tenantApplications).where(isNotNull(tenantApplications.ownerWhatsapp));
  const lead = candidates.find((l) => normalizeWhatsapp(l.ownerWhatsapp) === msg.phone);
  if (!lead) return res.json({ ok: true, ignored: true });
  await db.insert(leadActivities).values({ leadId: lead.id, kind: "whatsapp_in", body: msg.text, actor: "lead", meta: { name: msg.name } });
  await db.update(tenantApplications).set({ lastContactedAt: new Date() }).where(eq(tenantApplications.id, lead.id));
  logEvent({ category: "tenant", action: "lead.reply", message: `Balasan WhatsApp dari ${lead.ownerName} (${lead.businessName})`, actorType: "system", metadata: { leadId: lead.id } });
  res.json({ ok: true });
});
