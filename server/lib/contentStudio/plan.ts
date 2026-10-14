import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Content plan: what to post, in which order, on which day, and a checklist per post.
// Stored next to the decks in storage/content-studio/plan.json (no DB migration).

export type PlanStatus = "ide" | "draf" | "siap" | "terjadwal" | "terposting";
export type PlanItem = {
  id: string;
  title: string;
  phase: string;
  pillar: string;
  format: "carousel" | "reel" | "story";
  deckId?: string;
  date?: string; // YYYY-MM-DD (local)
  time?: string; // HH:mm
  status: PlanStatus;
  checks: string[]; // checked checklist keys
  notes?: string;
};
export type Plan = {
  startDate: string;
  days: number[]; // 0 = Sunday … 6 = Saturday
  time: string;
  items: PlanItem[];
  profileChecks: string[];
  updatedAt?: string;
};

const planFile = () => path.join(process.cwd(), "storage", "content-studio", "plan.json");

const PHASES = {
  intro: "1 · Perkenalan (launching)",
  core: "2 · Prioritas inti",
  grow: "3 · Perluas topik",
  depth: "4 · Pendalaman",
} as const;

// [deckId, title, pillar, format, phase]. Order = priority. Every built-in deck appears exactly once.
const SEED: [string, string, string, "carousel" | "reel", string][] = [
  ["carousel-perkenalan-studiodo", "Perkenalan STUDIODO", "Perkenalan", "carousel", PHASES.intro],
  ["reel-perkenalan-studiodo", "Reel: Kenalan dengan STUDIODO", "Perkenalan", "reel", PHASES.intro],
  ["carousel-fitur-lengkap", "Fitur lengkap dalam satu platform", "Perkenalan", "carousel", PHASES.intro],
  ["carousel-untuk-siapa", "STUDIODO untuk siapa?", "Perkenalan", "carousel", PHASES.intro],
  ["carousel-cara-mulai", "Cara mulai dengan STUDIODO", "Perkenalan", "carousel", PHASES.intro],
  ["reel-dashboard-realtime", "Reel: Dashboard real-time", "Operasional", "reel", PHASES.intro],
  ["carousel-checklist-mulai-usaha", "Checklist mulai usaha photobooth", "Edukasi", "carousel", PHASES.intro],
  ["carousel-bayar-qris", "Bayar QRIS otomatis", "Pembayaran", "carousel", PHASES.intro],

  ["carousel-dashboard-realtime", "Dashboard & monitor booth", "Operasional", "carousel", PHASES.core],
  ["reel-alur-customer", "Reel: Alur customer bayar-foto-hasil", "Pengalaman booth", "reel", PHASES.core],
  ["carousel-hasil-digital", "Hasil digital & galeri QR", "Hasil digital", "carousel", PHASES.core],
  ["carousel-voucher-event", "Voucher & promo event", "Pembayaran", "carousel", PHASES.core],
  ["carousel-kasir-satu-layar", "Kasir satu layar", "Kasir", "carousel", PHASES.core],
  ["carousel-antrian-digital", "Antrian digital", "Kasir", "carousel", PHASES.core],
  ["reel-foto-gif-video", "Reel: Foto, GIF, video satu sesi", "Pengalaman booth", "reel", PHASES.core],
  ["carousel-gateway-sendiri", "Xendit/DOKU milik sendiri", "Pembayaran", "carousel", PHASES.core],

  ["carousel-kamera-iso", "Kamera & pengaturan jarak jauh", "Kamera & cetak", "carousel", PHASES.grow],
  ["carousel-gaya-kiosk", "Tampilan kiosk sesuai brand", "Pengalaman booth", "carousel", PHASES.grow],
  ["reel-stop-motion", "Reel: Mode stop-motion", "Pengalaman booth", "reel", PHASES.grow],
  ["carousel-kesalahan-owner-baru", "5 kesalahan owner baru", "Edukasi", "carousel", PHASES.grow],
  ["carousel-offline-aman", "Sesi aman saat internet putus", "Andal", "carousel", PHASES.grow],
  ["carousel-menentukan-harga-paket", "Cara menentukan harga paket", "Edukasi", "carousel", PHASES.grow],
  ["carousel-shift-kasir", "Shift kasir & selisih kas", "Kasir", "carousel", PHASES.grow],
  ["carousel-data-pelanggan", "Data pelanggan & follow-up", "Hasil digital", "carousel", PHASES.grow],

  ["carousel-banyak-kiosk", "Dari 1 booth ke banyak", "Operasional", "carousel", PHASES.depth],
  ["carousel-event-vs-tetap", "Booth event vs booth tetap", "Edukasi", "carousel", PHASES.depth],
  ["carousel-printer-cetak", "Printer & format cetak", "Kamera & cetak", "carousel", PHASES.depth],
  ["carousel-mirror-asli", "Mode cermin vs asli", "Kamera & cetak", "carousel", PHASES.depth],
  ["carousel-portrait-landscape", "Portrait atau landscape", "Pengalaman booth", "carousel", PHASES.depth],
  ["carousel-kiosk-landscape", "Tampilan kiosk landscape", "Pengalaman booth", "carousel", PHASES.depth],
  ["carousel-update-otomatis", "Update otomatis per kiosk", "Andal", "carousel", PHASES.depth],
  ["reel-saldo-penarikan", "Reel: Saldo & penarikan dana", "Pembayaran", "reel", PHASES.depth],
  ["carousel-kreator-marketplace", "Jadi kreator, jual frame", "Kreator", "carousel", PHASES.depth],
];

const pad = (n: number) => String(n).padStart(2, "0");
export const toYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 12); };

/** Assigns dates to every not-yet-posted item, in list order, on the chosen weekdays starting at startDate. */
export function reschedule(plan: Plan, opts: { startDate: string; days: number[]; time: string }): Plan {
  const days = [...new Set(opts.days.filter((d) => d >= 0 && d <= 6))];
  if (!days.length) throw new Error("Pilih minimal satu hari posting");
  const cursor = parseYmd(opts.startDate);
  const items = plan.items.map((i) => ({ ...i }));
  for (const item of items) {
    if (item.status === "terposting") continue;
    for (let guard = 0; guard < 400 && !days.includes(cursor.getDay()); guard++) cursor.setDate(cursor.getDate() + 1);
    item.date = toYmd(cursor);
    item.time = opts.time;
    cursor.setDate(cursor.getDate() + 1);
  }
  return { ...plan, startDate: opts.startDate, days, time: opts.time, items };
}

export function defaultPlan(): Plan {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  const base: Plan = {
    startDate: toYmd(start),
    days: [1, 3, 5, 0], // Mon, Wed, Fri, Sun
    time: "19:00",
    profileChecks: [],
    items: SEED.map(([deckId, title, pillar, format, phase], i) => ({
      id: `p${i + 1}`, title, phase, pillar, format, deckId, status: "draf" as const, checks: [],
    })),
  };
  return reschedule(base, { startDate: base.startDate, days: base.days, time: base.time });
}

const STATUSES: PlanStatus[] = ["ide", "draf", "siap", "terjadwal", "terposting"];
const FORMATS = ["carousel", "reel", "story"];
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const HM = /^\d{2}:\d{2}$/;

/** Validates untrusted input; returns a clean Plan or an error string. */
export function parsePlan(input: any): Plan | string {
  if (!input || typeof input !== "object" || !Array.isArray(input.items)) return "Rencana tidak valid";
  if (input.items.length > 300) return "Terlalu banyak item (maks 300)";
  const items: PlanItem[] = [];
  for (const raw of input.items) {
    if (!raw || typeof raw.id !== "string" || typeof raw.title !== "string") return "Ada item yang tidak valid";
    items.push({
      id: raw.id.slice(0, 40),
      title: raw.title.slice(0, 160),
      phase: String(raw.phase ?? "").slice(0, 80),
      pillar: String(raw.pillar ?? "").slice(0, 60),
      format: FORMATS.includes(raw.format) ? raw.format : "carousel",
      deckId: typeof raw.deckId === "string" && raw.deckId ? raw.deckId.replace(/[^a-z0-9-]/gi, "").slice(0, 60) : undefined,
      date: typeof raw.date === "string" && YMD.test(raw.date) ? raw.date : undefined,
      time: typeof raw.time === "string" && HM.test(raw.time) ? raw.time : undefined,
      status: STATUSES.includes(raw.status) ? raw.status : "draf",
      checks: Array.isArray(raw.checks) ? raw.checks.map((c: unknown) => String(c).slice(0, 40)).slice(0, 20) : [],
      notes: typeof raw.notes === "string" ? raw.notes.slice(0, 2000) : undefined,
    });
  }
  return {
    startDate: typeof input.startDate === "string" && YMD.test(input.startDate) ? input.startDate : toYmd(new Date()),
    days: Array.isArray(input.days) ? input.days.map(Number).filter((d: number) => d >= 0 && d <= 6) : [1, 3, 5, 0],
    time: typeof input.time === "string" && HM.test(input.time) ? input.time : "19:00",
    items,
    profileChecks: Array.isArray(input.profileChecks) ? input.profileChecks.map((c: unknown) => String(c).slice(0, 40)).slice(0, 30) : [],
  };
}

export async function loadPlan(): Promise<Plan> {
  try {
    const parsed = parsePlan(JSON.parse(await readFile(planFile(), "utf8")));
    if (typeof parsed !== "string") return parsed;
  } catch { /* first run */ }
  return savePlan(defaultPlan());
}

export async function savePlan(plan: Plan): Promise<Plan> {
  await mkdir(path.dirname(planFile()), { recursive: true });
  const next = { ...plan, updatedAt: new Date().toISOString() };
  await writeFile(planFile(), JSON.stringify(next, null, 2));
  return next;
}
