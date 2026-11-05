import { normalizeWhatsapp, waLink } from "./crm.js";

// Follow-up CRM for prospective tenants ("calon tenant"). A lead is a row of tenant_applications; this file is the pure part
// (stages, validation, WhatsApp templates) so it can be tested without a database. Persistence lives in routes/superadminLeads.ts.

export const LEAD_STAGES = ["new", "contacted", "trial_given", "negotiation", "contract_sent", "active", "lost"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const STAGE_LABELS: Record<LeadStage, string> = {
  new: "Baru",
  contacted: "Dihubungi",
  trial_given: "Trial diberikan",
  negotiation: "Negosiasi",
  contract_sent: "Kontrak terkirim",
  active: "Aktif",
  lost: "Batal",
};

export const LEAD_SOURCES = ["website", "whatsapp", "instagram", "referral", "event", "other"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];
export const PAYMENT_SETUPS = ["own", "platform"] as const;
export const CONTRACT_STATUSES = ["none", "draft", "sent", "signed"] as const;

export const isStage = (value: unknown): value is LeadStage => typeof value === "string" && (LEAD_STAGES as readonly string[]).includes(value);

/** Stages that still need work — the ones that count as "open pipeline" and that reminders care about. */
export const OPEN_STAGES: readonly LeadStage[] = ["new", "contacted", "trial_given", "negotiation", "contract_sent"];

/** Moving a lead is free in either direction (a kanban board must not trap anyone), except that "active" is reserved for a
 *  lead that really became a tenant: it can only be set by the conversion, never by hand. */
export function canMoveTo(from: LeadStage, to: LeadStage, converted: boolean): { ok: true } | { ok: false; error: string } {
  if (from === to) return { ok: true };
  if (to === "active" && !converted) return { ok: false, error: "Tahap Aktif otomatis saat lead dijadikan tenant — pakai tombol \"Jadikan tenant\"." };
  if (from === "active" && converted) return { ok: false, error: "Lead ini sudah jadi tenant aktif." };
  return { ok: true };
}

const text = (value: unknown, max: number): string | null => {
  const v = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  return v ? v.slice(0, max) : null;
};
const intOrNull = (value: unknown, min: number, max: number): number | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};

export interface LeadPatch {
  businessName?: string;
  ownerName?: string;
  ownerEmail?: string;
  ownerWhatsapp?: string | null;
  businessType?: string | null;
  city?: string | null;
  leadSource?: LeadSource | null;
  boothCount?: number | null;
  boothLocation?: string | null;
  plannedStart?: string | null;
  paymentSetup?: "own" | "platform" | null;
  planSlug?: string | null;
  contractMonths?: number | null;
  assignedTo?: string | null;
  reviewNote?: string | null;
  lostReason?: string | null;
}

/** Picks and validates the fields a superadmin may edit. Returns an error message instead of throwing so routes can 400. */
export function sanitizeLeadPatch(body: unknown, opts: { requireNames?: boolean } = {}): { patch: LeadPatch } | { error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const patch: LeadPatch = {};
  if (b.businessName !== undefined) { const v = text(b.businessName, 120); if (!v) return { error: "Nama usaha wajib diisi" }; patch.businessName = v; }
  if (b.ownerName !== undefined) { const v = text(b.ownerName, 120); if (!v) return { error: "Nama pemilik wajib diisi" }; patch.ownerName = v; }
  if (opts.requireNames && (!patch.businessName || !patch.ownerName)) return { error: "Nama usaha dan nama pemilik wajib diisi" };
  if (b.ownerEmail !== undefined) {
    const v = String(b.ownerEmail ?? "").trim().toLowerCase();
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { error: "Format email tidak valid" };
    patch.ownerEmail = v; // "" = unknown yet (a lead that only ever wrote on WhatsApp)
  }
  if (b.ownerWhatsapp !== undefined) {
    const raw = text(b.ownerWhatsapp, 40);
    if (raw && !normalizeWhatsapp(raw)) return { error: "Nomor WhatsApp tidak valid" };
    patch.ownerWhatsapp = raw;
  }
  if (b.businessType !== undefined) patch.businessType = text(b.businessType, 80);
  if (b.city !== undefined) patch.city = text(b.city, 80);
  if (b.leadSource !== undefined) {
    const v = text(b.leadSource, 20);
    if (v && !(LEAD_SOURCES as readonly string[]).includes(v)) return { error: "Sumber lead tidak dikenal" };
    patch.leadSource = v as LeadSource | null;
  }
  if (b.boothCount !== undefined) { const n = intOrNull(b.boothCount, 1, 500); if (n === undefined) return { error: "Jumlah booth harus 1–500" }; patch.boothCount = n; }
  if (b.boothLocation !== undefined) patch.boothLocation = text(b.boothLocation, 200);
  if (b.plannedStart !== undefined) patch.plannedStart = text(b.plannedStart, 80);
  if (b.paymentSetup !== undefined) {
    const v = text(b.paymentSetup, 12);
    if (v && !(PAYMENT_SETUPS as readonly string[]).includes(v)) return { error: "Pengaturan pembayaran tidak dikenal" };
    patch.paymentSetup = v as "own" | "platform" | null;
  }
  if (b.planSlug !== undefined) patch.planSlug = text(b.planSlug, 60);
  if (b.contractMonths !== undefined) { const n = intOrNull(b.contractMonths, 1, 60); if (n === undefined) return { error: "Masa kontrak harus 1–60 bulan" }; patch.contractMonths = n; }
  if (b.assignedTo !== undefined) patch.assignedTo = text(b.assignedTo, 120);
  if (b.reviewNote !== undefined) patch.reviewNote = text(b.reviewNote, 2000);
  if (b.lostReason !== undefined) patch.lostReason = text(b.lostReason, 300);
  return { patch };
}

// --- Follow-up tasks ---------------------------------------------------------

export type TaskState = "done" | "overdue" | "today" | "upcoming";

/** `today` and "overdue" use the WIB calendar (UTC+7) because that is when the team works. */
export function taskState(task: { dueAt: Date | string; doneAt?: Date | string | null }, now: Date = new Date()): TaskState {
  if (task.doneAt) return "done";
  const due = new Date(task.dueAt).getTime();
  if (due <= now.getTime()) return "overdue";
  const wibDay = (ms: number) => Math.floor((ms + 7 * 3600_000) / 86_400_000);
  return wibDay(due) === wibDay(now.getTime()) ? "today" : "upcoming";
}

/** Quick presets for "ingatkan saya …" so a task takes one tap. */
export function dueFromPreset(preset: string, now: Date = new Date()): Date | null {
  const hours: Record<string, number> = { "3h": 3, "1d": 24, "2d": 48, "3d": 72, "1w": 168 };
  const h = hours[preset];
  return h ? new Date(now.getTime() + h * 3600_000) : null;
}

// --- WhatsApp templates ------------------------------------------------------

export interface TemplateVars {
  nama?: string | null; // owner's first name / name
  usaha?: string | null;
  booth?: string | number | null;
  kota?: string | null;
  paket?: string | null;
  harga?: string | null;
  link_kontrak?: string | null;
  link_panduan?: string | null;
  pengirim?: string | null;
}

export const TEMPLATE_VARIABLES: { key: keyof TemplateVars; label: string }[] = [
  { key: "nama", label: "Nama pemilik" },
  { key: "usaha", label: "Nama usaha" },
  { key: "booth", label: "Jumlah booth" },
  { key: "kota", label: "Kota" },
  { key: "paket", label: "Nama paket" },
  { key: "harga", label: "Total harga kontrak" },
  { key: "link_kontrak", label: "Tautan kontrak" },
  { key: "link_panduan", label: "Tautan panduan onboarding" },
  { key: "pengirim", label: "Nama pengirim (tim STUDIODO)" },
];

export interface LeadTemplate { key: string; label: string; stage: LeadStage | "any"; text: string }

export const DEFAULT_TEMPLATES: LeadTemplate[] = [
  {
    key: "greeting", label: "Sapaan awal", stage: "new",
    text: "Halo {nama}, kami dari STUDIODO. Terima kasih sudah mengajukan {usaha}. Boleh kami tahu sedikit tentang rencana booth Anda (jumlah booth, lokasi, kapan mulai)? Dengan itu kami bisa menyiapkan akun & key trial yang pas.",
  },
  {
    key: "payment_question", label: "Tanya akun pembayaran", stage: "contacted",
    text: "Halo {nama}, sebelum key trial disiapkan: untuk pembayaran pelanggan di booth {usaha}, apakah sudah punya akun sendiri (Midtrans/Xendit/DOKU) atau mau lewat platform STUDIODO? Kalau lewat platform, dana QRIS ditampung STUDIODO dan bisa ditarik dari dashboard sesuai jadwal penarikan.",
  },
  {
    key: "trial_key", label: "Kirim key trial", stage: "trial_given",
    text: "Halo {nama}, akun STUDIODO untuk {usaha} sudah siap. Detail login dan key trial kami kirim ke email Anda. Langkah pasangnya ada di panduan ini: {link_panduan}. Kalau butuh dibantu pemasangan di PC booth, balas pesan ini ya.",
  },
  {
    key: "trial_checkin", label: "Follow-up masa trial", stage: "trial_given",
    text: "Halo {nama}, bagaimana trial STUDIODO di {usaha}? Ada kendala di pemasangan kamera, printer, atau pembayaran QRIS? Kami siap bantu lewat chat atau panggilan singkat.",
  },
  {
    key: "pricing", label: "Info harga & paket", stage: "negotiation",
    text: "Halo {nama}, untuk {booth} booth {usaha} paket {paket}, total langganannya {harga}. Pembelian 10 booth atau lebih mendapat diskon volume. Kalau cocok, kami kirimkan surat kerja sama untuk dibaca dulu.",
  },
  {
    key: "contract", label: "Kirim surat kerja sama", stage: "contract_sent",
    text: "Halo {nama}, berikut surat kerja sama STUDIODO untuk {usaha} (paket {paket}, {booth} booth): {link_kontrak}\nSilakan dibaca. Kalau sudah sesuai, tekan tombol \"Setuju\" di halaman itu. Ada yang ingin didiskusikan? Balas pesan ini ya.",
  },
  {
    key: "contract_nudge", label: "Ingatkan kontrak", stage: "contract_sent",
    text: "Halo {nama}, kami cek lagi soal surat kerja sama {usaha}: {link_kontrak}. Ada bagian yang masih perlu kami jelaskan?",
  },
  {
    key: "welcome_active", label: "Selamat bergabung", stage: "active",
    text: "Halo {nama}, selamat bergabung di STUDIODO! {usaha} sudah aktif. Panduan memulai: {link_panduan}. Tim kami siap membantu kapan pun.",
  },
];

/** Replaces {var} placeholders. Unknown/empty variables are reported in `missing` and left out of the text. */
export function renderTemplate(template: string, vars: TemplateVars): { text: string; missing: string[] } {
  const missing: string[] = [];
  const out = template.replace(/\{([a-z_]+)\}/g, (_m, key: string) => {
    const value = (vars as Record<string, string | number | null | undefined>)[key];
    if (value === undefined || value === null || String(value).trim() === "") {
      if (!missing.includes(key)) missing.push(key);
      return "";
    }
    return String(value).trim();
  });
  return { text: out.replace(/[ \t]{2,}/g, " ").replace(/ +([.,!?:])/g, "$1").trim(), missing };
}

/** Templates with the owner's saved edits laid over the defaults. */
export function resolveTemplates(overrides: Record<string, string> | null | undefined): LeadTemplate[] {
  return DEFAULT_TEMPLATES.map((t) => {
    const custom = overrides?.[t.key];
    return typeof custom === "string" && custom.trim() ? { ...t, text: custom.trim().slice(0, 2000) } : t;
  });
}

/** Keeps only overrides for known template keys. */
export function sanitizeTemplateOverrides(input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input || typeof input !== "object") return out;
  for (const t of DEFAULT_TEMPLATES) {
    const v = (input as Record<string, unknown>)[t.key];
    if (typeof v === "string" && v.trim() && v.trim() !== t.text) out[t.key] = v.trim().slice(0, 2000);
  }
  return out;
}

/** wa.me fallback: works with no gateway configured; the operator still presses send in their own WhatsApp. */
export function whatsappFallbackLink(rawPhone: string | null | undefined, message: string): string | null {
  const digits = normalizeWhatsapp(rawPhone);
  return digits ? waLink(digits, message) : null;
}

// --- Pipeline summary --------------------------------------------------------

export interface FunnelRow { stage: LeadStage; label: string; count: number }

export function summarizeFunnel(leads: { pipelineStage: string }[]): FunnelRow[] {
  return LEAD_STAGES.map((stage) => ({ stage, label: STAGE_LABELS[stage], count: leads.filter((l) => l.pipelineStage === stage).length }));
}
