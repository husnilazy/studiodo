import crypto from "node:crypto";
import { db } from "../db/client.js";
import { platformSettings } from "../db/schema.js";
import { decryptSecret, encryptSecret } from "./secretBox.js";
import { normalizeWhatsapp } from "./crm.js";

// WhatsApp gateway for lead follow-up. Provider: Fonnte (fonnte.com) — an Indonesian unofficial gateway where the owner scans
// a QR with a normal WhatsApp number, no Meta business verification. The WhatsApp Cloud API would need an approved business
// account and pre-approved templates for first contact, which does not fit cold follow-up. The code keeps the provider behind
// `sendWhatsapp`, so another gateway (Wablas, Cloud API) is one more branch there.
//
// Credentials follow lib/platformDoku.ts: the token is encrypted (secretBox) in platform_settings and never returned by the API.
// UNVERIFIED against a live Fonnte account: request/response shapes below are from Fonnte's public docs.

export const WA_PROVIDERS = ["none", "fonnte"] as const;
export type WaProvider = (typeof WA_PROVIDERS)[number];

export type WaRow = Pick<typeof platformSettings.$inferSelect, "waProvider" | "waTokenEnc" | "waWebhookKeyEnc">;

export interface WaConfig { provider: Exclude<WaProvider, "none">; token: string }

/** Pure: stored row -> usable config, or null when no provider/token is set (callers fall back to wa.me links). */
export function buildWaConfig(row: WaRow | undefined): WaConfig | null {
  if (!row || row.waProvider !== "fonnte") return null;
  const token = decryptSecret(row.waTokenEnc);
  return token ? { provider: "fonnte", token } : null;
}

export async function loadWaRow(): Promise<WaRow | undefined> {
  const [row] = await db.select({ waProvider: platformSettings.waProvider, waTokenEnc: platformSettings.waTokenEnc, waWebhookKeyEnc: platformSettings.waWebhookKeyEnc }).from(platformSettings).limit(1);
  return row;
}

export const loadWaConfig = async () => buildWaConfig(await loadWaRow());

/** What the API may tell the browser: never the token itself. */
export function publicWaStatus(row: WaRow | undefined) {
  return { provider: (row?.waProvider as WaProvider | undefined) ?? "none", hasToken: Boolean(row?.waTokenEnc), hasWebhookKey: Boolean(row?.waWebhookKeyEnc), ready: buildWaConfig(row) !== null };
}

export type WaPatch = { provider?: unknown; token?: unknown; clearToken?: unknown };

/** Pure: a superadmin's settings body -> columns to write. The token is write-only: blank = keep the stored one. */
export function sanitizeWaPatch(body: WaPatch): { values: Partial<Pick<typeof platformSettings.$inferInsert, "waProvider" | "waTokenEnc">> } | { error: string } {
  const values: Partial<Pick<typeof platformSettings.$inferInsert, "waProvider" | "waTokenEnc">> = {};
  if (body.provider !== undefined) {
    if (!(WA_PROVIDERS as readonly string[]).includes(String(body.provider))) return { error: "Provider WhatsApp tidak dikenal" };
    values.waProvider = String(body.provider);
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (token) {
    if (token.length < 8 || token.length > 200 || /\s/.test(token)) return { error: "Token tidak valid (tanpa spasi, 8–200 karakter)" };
    values.waTokenEnc = encryptSecret(token);
  }
  if (body.clearToken === true) { values.waTokenEnc = null; values.waProvider = "none"; }
  return { values };
}

export function newWebhookKey(): string {
  return crypto.randomBytes(24).toString("base64url");
}

/** Constant-time check of the key in the inbound webhook URL. */
export function webhookKeyMatches(row: WaRow | undefined, given: string): boolean {
  const stored = decryptSecret(row?.waWebhookKeyEnc);
  if (!stored || !given) return false;
  const a = Buffer.from(stored);
  const b = Buffer.from(given);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function rotateWebhookKey(): Promise<string> {
  const key = newWebhookKey();
  const [existing] = await db.select({ id: platformSettings.id }).from(platformSettings).limit(1);
  if (existing) await db.update(platformSettings).set({ waWebhookKeyEnc: encryptSecret(key) });
  else await db.insert(platformSettings).values({ waWebhookKeyEnc: encryptSecret(key) });
  return key;
}

export type SendResult = { ok: true; providerId: string | null } | { ok: false; error: string };

/** Sends one text message through the configured gateway. Never throws: a gateway outage must not break the CRM screen. */
export async function sendWhatsapp(config: WaConfig, rawPhone: string, message: string, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  const target = normalizeWhatsapp(rawPhone);
  if (!target) return { ok: false, error: "Nomor WhatsApp tidak valid" };
  if (!message.trim()) return { ok: false, error: "Pesan kosong" };
  try {
    const res = await fetchImpl("https://api.fonnte.com/send", {
      method: "POST",
      headers: { Authorization: config.token, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ target, message: message.slice(0, 4000), countryCode: "0" }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => null)) as { status?: boolean; reason?: string; detail?: string; id?: unknown } | null;
    if (!res.ok || !body || body.status !== true) return { ok: false, error: body?.reason || body?.detail || `Gateway menolak pesan (HTTP ${res.status})` };
    const id = Array.isArray(body.id) ? body.id[0] : body.id;
    return { ok: true, providerId: id == null ? null : String(id) };
  } catch (error) {
    return { ok: false, error: error instanceof Error && error.name === "TimeoutError" ? "Gateway tidak merespons (timeout)" : "Gateway WhatsApp tidak dapat dihubungi" };
  }
}

export interface InboundMessage { phone: string; text: string; name: string | null }

/** Pure: reads a gateway webhook body (JSON or form fields) into an inbound message, or null when it carries no usable text. */
export function parseInbound(body: unknown): InboundMessage | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const phone = normalizeWhatsapp(String(b.sender ?? b.from ?? ""));
  const text = String(b.message ?? b.text ?? "").trim();
  if (!phone || !text) return null;
  // Group messages carry a `member`; follow-up chats are one-to-one only.
  if (b.member && String(b.member).trim()) return null;
  const name = String(b.name ?? b.pushname ?? "").trim();
  return { phone, text: text.slice(0, 4000), name: name ? name.slice(0, 120) : null };
}
