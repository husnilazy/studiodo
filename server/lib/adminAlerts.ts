import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { adminNotifications, platformSettings } from "../db/schema.js";
import { loadWaConfig, sendWhatsapp } from "./whatsapp.js";
import { normalizeWhatsapp } from "./crm.js";

// Alerts for the platform team. Everything important already passes through logEvent (platform_events): a sign-up, a payment, a
// withdrawal request, a help message, a server error… so the rules below turn those events into alerts (in-app list + optional
// WhatsApp to the owner's number) without touching every producer. logEvent calls raiseAlertFromEvent after it records the event.

export type Severity = "info" | "success" | "warning" | "critical";

export interface AlertRule {
  label: string; // shown in settings
  severity: Severity;
  /** Superadmin section id the alert opens. */
  link: string;
  /** Default for WhatsApp; the owner can override per kind in settings. */
  whatsapp: boolean;
  /** Minimum minutes between two WhatsApps of this kind (error storms must not flood a phone). */
  waCooldownMin?: number;
  title: string;
}

export const ALERT_RULES: Record<string, AlertRule> = {
  "application.submitted": { label: "Pendaftaran tenant baru", severity: "success", link: "applications", whatsapp: true, title: "Pendaftaran tenant baru" },
  "payment.received": { label: "Pembayaran langganan diterima", severity: "success", link: "billing", whatsapp: true, title: "Pembayaran diterima" },
  "payment.booth_missing": { label: "Pembayaran mencakup booth yang dicabut", severity: "critical", link: "billing", whatsapp: true, title: "Pembayaran perlu ditindaklanjuti" },
  "reconcile.amount_mismatch": { label: "Nominal pembayaran tidak cocok", severity: "critical", link: "billing", whatsapp: true, title: "Nominal pembayaran tidak cocok" },
  "webhook.amount_mismatch": { label: "Nominal webhook tidak cocok", severity: "critical", link: "billing", whatsapp: true, title: "Nominal webhook tidak cocok" },
  "checkout.gateway_failed": { label: "Checkout gagal di gateway", severity: "warning", link: "billing", whatsapp: false, title: "Checkout gagal di gateway" },
  "withdrawal.requested": { label: "Permintaan penarikan baru", severity: "warning", link: "withdrawals", whatsapp: true, title: "Permintaan penarikan baru" },
  "support.message": { label: "Pesan bantuan dari tenant", severity: "info", link: "support", whatsapp: true, title: "Pesan bantuan dari tenant" },
  "lead.reply": { label: "Balasan WhatsApp calon tenant", severity: "info", link: "applications", whatsapp: true, title: "Calon tenant membalas" },
  "lead.contract_signed": { label: "Kontrak disetujui calon tenant", severity: "success", link: "applications", whatsapp: true, title: "Kontrak disetujui" },
  "lead.followup_due": { label: "Follow-up calon tenant jatuh tempo", severity: "warning", link: "applications", whatsapp: false, title: "Follow-up jatuh tempo" },
  "marketplace.reported": { label: "Template dilaporkan", severity: "warning", link: "marketplace", whatsapp: false, title: "Template dilaporkan" },
  "creator_template.submitted": { label: "Template kreator menunggu review", severity: "info", link: "creators", whatsapp: false, title: "Template kreator baru" },
  "server.unhandled_error": { label: "Error server", severity: "critical", link: "events", whatsapp: true, waCooldownMin: 15, title: "Error di server" },
  "app_error": { label: "Error aplikasi kiosk", severity: "warning", link: "events", whatsapp: false, waCooldownMin: 30, title: "Error di aplikasi kiosk" },
  "email.failed": { label: "Email gagal terkirim", severity: "warning", link: "email", whatsapp: false, title: "Email gagal terkirim" },
  "superadmin.login.lockout": { label: "Login superadmin terkunci", severity: "warning", link: "events", whatsapp: true, title: "Login superadmin terkunci" },
  "superadmin.2fa.lockout": { label: "2FA superadmin terkunci", severity: "warning", link: "events", whatsapp: true, title: "2FA superadmin terkunci" },
};

export interface EventLike { action: string; message: string; tenantId?: string | null }
export interface AlertDraft { kind: string; severity: Severity; title: string; body: string; link: string; tenantId: string | null }
export type AlertPrefs = Record<string, { inApp?: boolean; whatsapp?: boolean }>;

/** Pure: the alert an event should raise, or null when it is not alert-worthy. */
export function alertFromEvent(event: EventLike): AlertDraft | null {
  const rule = ALERT_RULES[event.action];
  if (!rule) return null;
  return { kind: event.action, severity: rule.severity, title: rule.title, body: event.message.slice(0, 600), link: rule.link, tenantId: event.tenantId ?? null };
}

/** Pure: owner overrides over the rule defaults. */
export function channelsFor(kind: string, prefs: AlertPrefs | null | undefined): { inApp: boolean; whatsapp: boolean } {
  const rule = ALERT_RULES[kind];
  const p = prefs?.[kind];
  return { inApp: p?.inApp ?? true, whatsapp: p?.whatsapp ?? rule?.whatsapp ?? false };
}

export function sanitizePrefs(input: unknown): AlertPrefs {
  const out: AlertPrefs = {};
  if (!input || typeof input !== "object") return out;
  for (const kind of Object.keys(ALERT_RULES)) {
    const v = (input as Record<string, unknown>)[kind];
    if (!v || typeof v !== "object") continue;
    const entry: { inApp?: boolean; whatsapp?: boolean } = {};
    if (typeof (v as { inApp?: unknown }).inApp === "boolean") entry.inApp = (v as { inApp: boolean }).inApp;
    if (typeof (v as { whatsapp?: unknown }).whatsapp === "boolean") entry.whatsapp = (v as { whatsapp: boolean }).whatsapp;
    if (Object.keys(entry).length) out[kind] = entry;
  }
  return out;
}

export function whatsappText(draft: AlertDraft, appUrl?: string): string {
  const icon = draft.severity === "critical" ? "🚨" : draft.severity === "warning" ? "⚠️" : draft.severity === "success" ? "✅" : "🔔";
  return `${icon} *STUDIODO — ${draft.title}*\n${draft.body}${appUrl ? `\n\nBuka: ${appUrl}` : ""}`;
}

const lastWa = new Map<string, number>();
let waWindow: number[] = [];
const WA_PER_HOUR = 40; // hard stop so a bug can never turn the gateway into a spam cannon

/** Records the alert and, when enabled and a gateway + number are set up, sends the WhatsApp. Never throws. */
export async function raiseAlert(draft: AlertDraft, now: number = Date.now()): Promise<void> {
  try {
    const [settings] = await db.select({ number: platformSettings.adminWaNumber, prefs: platformSettings.adminAlertPrefs }).from(platformSettings).limit(1);
    const channels = channelsFor(draft.kind, settings?.prefs);
    if (!channels.inApp && !channels.whatsapp) return;
    const [row] = await db.insert(adminNotifications).values({ kind: draft.kind, severity: draft.severity, title: draft.title, body: draft.body, link: draft.link, tenantId: draft.tenantId }).returning();
    if (!channels.whatsapp) return;
    const to = normalizeWhatsapp(settings?.number);
    const config = await loadWaConfig();
    if (!to || !config) return;
    const cooldown = (ALERT_RULES[draft.kind]?.waCooldownMin ?? 0) * 60_000;
    if (cooldown && now - (lastWa.get(draft.kind) ?? 0) < cooldown) return;
    waWindow = waWindow.filter((t) => now - t < 3_600_000);
    if (waWindow.length >= WA_PER_HOUR) return;
    lastWa.set(draft.kind, now); waWindow.push(now);
    const result = await sendWhatsapp(config, to, whatsappText(draft));
    await db.update(adminNotifications).set(result.ok ? { waSentAt: new Date() } : { waError: result.error.slice(0, 300) }).where(eq(adminNotifications.id, row.id));
  } catch (error) {
    console.error("[admin-alerts] gagal memproses peringatan", draft.kind, error instanceof Error ? error.message : error);
  }
}

export function raiseAlertFromEvent(event: EventLike): void {
  const draft = alertFromEvent(event);
  if (draft) void raiseAlert(draft);
}

/** For tests. */
export function _resetAlertState() { lastWa.clear(); waWindow = []; }
