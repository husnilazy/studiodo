import { FEATURES, PILLARS, type Feature, type Pillar } from "./features.js";
import { CTA_KEYWORD, hookFor } from "./hooks.js";
import { THEMES, type Deck, type Slide, type Tone } from "./types.js";

// Feature -> ready-to-post deck. Pure and deterministic (no AI call): the same feature always yields the same deck, so
// regenerating is safe and tests can pin the output. Decks use the "kaca" (dark glass) style, one theme colour per feature.

const BASE_TAGS = ["#studiodo", "#photobooth", "#bisnisphotobooth", "#photoboothindonesia"];
const PILLAR_TAGS: Record<Pillar, string[]> = {
  Pembayaran: ["#qris", "#pembayarandigital", "#usahaphotobooth"],
  "Pengalaman booth": ["#photoboothevent", "#selfphotostudio", "#kioskphoto"],
  "Hasil digital": ["#galerifoto", "#fotodigital", "#qrcode"],
  "Kamera & cetak": ["#kamerafoto", "#printfoto", "#photostrip"],
  Operasional: ["#manajemenbooth", "#dashboardbisnis", "#sistemkasir"],
  "Bisnis & growth": ["#bisnisonline", "#umkmindonesia", "#startupindonesia"],
};

const plain = (s: string) => s.replace(/\|/g, " ").replace(/\*/g, "").replace(/\s+/g, " ").trim();
export const hashtagsFor = (f: Feature) => [...BASE_TAGS, ...PILLAR_TAGS[f.pillar]];

export const CAPTION_VARIANTS = 3;
/** Three caption voices (question / before-after / how-to). `variant` wraps around, so autopilot can rotate them. */
export function captionFor(f: Feature, variant = 0): string {
  const v = ((variant % CAPTION_VARIANTS) + CAPTION_VARIANTS) % CAPTION_VARIANTS;
  const ticks = f.gain.map((g) => `✅ ${g}`).join("\n");
  const cta = `💬 Komen "${CTA_KEYWORD}" dan kami bantu mulai trial gratis.
🔗 Atau langsung ke studiodo.id (link di bio).`;
  const hook = plain(hookFor(f.id, f.hook));
  if (v === 0) return `${f.emoji} ${hook}\n\n${f.tagline}\n\n${ticks}\n\n${f.tip}\n\n${cta}`;
  if (v === 1) return `Masih begini?\n${f.pain.map((p) => `❌ ${p}`).join("\n")}\n\nDengan STUDIODO:\n${ticks}\n\n${f.tip}\n\n${cta}`;
  return `${f.tagline}\n\nCara kerjanya:\n${f.how.map((h, i) => `${i + 1}️⃣ ${h}`).join("\n")}\n\n${f.tip}\n\nSimpan postingan ini buat referensi 📌\n\n${cta}`;
}

// Colour rhythm: each deck starts on a different block colour so the profile grid alternates paper / ink / butter / cobalt / blush.
const COVER_TONES: Tone[] = ["light", "peach", "indigo", "mint", "dark"];
const coverTone = (i: number): Tone => COVER_TONES[((i % COVER_TONES.length) + COVER_TONES.length) % COVER_TONES.length];
const featureIndex = (f: Feature) => Math.max(0, FEATURES.findIndex((x) => x.id === f.id));

const COMPARE_TITLES = ["Dulu *ribet,*|sekarang beres", "Sebelum *vs*|sesudah", "Bedanya *terasa*|di hari pertama"];

export function featureDeck(f: Feature, format: "carousel" | "reel", variant = 0): Deck {
  const ci = featureIndex(f);
  const hook = hookFor(f.id, f.hook);
  const t0 = coverTone(ci);
  const tCompare: Tone = t0 === "dark" ? "light" : "dark";
  const tSteps: Tone = t0 === "indigo" ? "peach" : "indigo";
  const tNote: Tone = t0 === "mint" ? "peach" : "mint";
  const stat = f.stat
    ? ({ kind: "stat", tone: tNote, eyebrow: "Fakta", title: `${f.name}`, stat: f.stat, note: f.tip } as Slide)
    : ({ kind: "note", tone: tNote, eyebrow: "Yang kamu dapat", title: "Hasilnya *begini*", items: f.gain, note: f.tip } as Slide);
  const compare: Slide = { kind: "compare", tone: tCompare, eyebrow: "Dulu vs sekarang", title: COMPARE_TITLES[ci % COMPARE_TITLES.length], labelBefore: "Dulu", labelAfter: "Dengan STUDIODO", itemsBefore: f.pain, items: f.gain };
  const steps: Slide = { kind: "steps", tone: tSteps, eyebrow: "Cara kerja", title: "Semudah *ini*", items: f.how };
  const cta: Slide = { kind: "cta", tone: "dark", eyebrow: "Mulai sekarang", title: "Siap bikin booth yang *jalan sendiri?*", body: `Komen "${CTA_KEYWORD}" atau daftar gratis di studiodo.id.` };
  const slides: Slide[] = format === "carousel"
    ? [{ kind: "cover", tone: t0, eyebrow: f.pillar, title: hook, body: f.tagline, mockup: f.mockup }, compare, steps, stat, cta]
    : [
        { kind: "hook", tone: t0, eyebrow: f.pillar, title: hook, emoji: f.emoji, mockup: "none", seconds: 3 },
        { kind: "feature", tone: tNote, eyebrow: "Fitur", title: `${plain(f.name)}`, body: f.tagline, mockup: f.mockup, seconds: 4 },
        { ...compare, seconds: 4.2 },
        { ...steps, seconds: 4.2 },
        { ...cta, seconds: 3.4 },
      ];
  return {
    id: `ft-${f.id}-${format === "reel" ? "r" : "c"}`,
    title: `${format === "reel" ? "Reel" : "Carousel"} · ${f.name}`,
    format, tone: t0, style: "kaca", theme: THEMES[ci % THEMES.length], handle: "studiodo.id", featureId: f.id,
    caption: captionFor(f, variant), hashtags: hashtagsFor(f), slides,
  };
}

// ---------------------------------------------------------------- autopilot ----

export type AutopilotOptions = {
  startDate: string; // YYYY-MM-DD, local (WIB by default)
  weeks: number;
  days: number[]; // 0 = Sunday … 6
  times: string[]; // HH:mm
  reelEvery: number; // every Nth post is a reel (0 = never)
  tzOffsetMin: number; // minutes east of UTC (WIB = 420)
  used: { featureId: string; format: "carousel" | "reel" }[]; // already queued/posted, skipped here
  onlyFeatureIds?: string[];
  maxPosts?: number;
};
export type Slot = { featureId: string; format: "carousel" | "reel"; local: string; scheduledAt: string };

const pad = (n: number) => String(n).padStart(2, "0");

/** Local wall-clock -> ISO UTC for a fixed offset (no DST in Indonesia). */
export function localToIso(date: string, time: string, tzOffsetMin: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - tzOffsetMin * 60_000).toISOString();
}

/** All posting slots in the window, in time order. */
export function postingSlots(o: Pick<AutopilotOptions, "startDate" | "weeks" | "days" | "times">): { date: string; time: string }[] {
  const [y, m, d] = o.startDate.split("-").map(Number);
  const out: { date: string; time: string }[] = [];
  const times = [...new Set(o.times)].sort();
  for (let i = 0; i < Math.min(Math.max(o.weeks, 1), 26) * 7; i++) {
    const day = new Date(Date.UTC(y, m - 1, d + i));
    if (!o.days.includes(day.getUTCDay())) continue;
    const date = `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`;
    for (const time of times) out.push({ date, time });
  }
  return out;
}

/**
 * Fills the window with posts: formats follow the reel ratio, pillars rotate (never the same pillar twice in a row while
 * another one has content left) and every feature is used once per format before any repeats.
 */
export function planAutopilot(o: AutopilotOptions): Slot[] {
  const pool = FEATURES.filter((f) => !o.onlyFeatureIds?.length || o.onlyFeatureIds.includes(f.id));
  const taken = new Set(o.used.map((u) => `${u.featureId}:${u.format}`));
  const lastUse = new Map<Pillar, number>();
  const slots: Slot[] = [];
  let prevPillar: Pillar | null = null;
  const all = postingSlots(o);
  for (let i = 0; i < all.length && slots.length < (o.maxPosts ?? 200); i++) {
    const wantReel = o.reelEvery > 0 && (slots.length + 1) % o.reelEvery === 0;
    const formats: ("carousel" | "reel")[] = wantReel ? ["reel", "carousel"] : ["carousel", "reel"];
    let pick: { f: Feature; format: "carousel" | "reel" } | null = null;
    for (const format of formats) {
      const free = pool.filter((f) => !taken.has(`${f.id}:${format}`));
      if (!free.length) continue;
      // pillar that was used longest ago (and not the previous one if avoidable)
      const pillars = PILLARS.filter((p) => free.some((f) => f.pillar === p));
      const choices = pillars.filter((p) => p !== prevPillar);
      const order = (choices.length ? choices : pillars).sort((a, b) => (lastUse.get(a) ?? -1) - (lastUse.get(b) ?? -1));
      const f = free.find((x) => x.pillar === order[0]);
      if (f) { pick = { f, format }; break; }
    }
    if (!pick) break;
    taken.add(`${pick.f.id}:${pick.format}`);
    lastUse.set(pick.f.pillar, slots.length);
    prevPillar = pick.f.pillar;
    slots.push({ featureId: pick.f.id, format: pick.format, local: `${all[i].date} ${all[i].time}`, scheduledAt: localToIso(all[i].date, all[i].time, o.tzOffsetMin) });
  }
  return slots;
}
