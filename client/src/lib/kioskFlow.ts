// Kiosk flow builder (Fase 4) — client mirror of server/lib/kioskFlowRules.ts.
// Duplicated on purpose, not imported: client and server live in separate tsconfig
// roots/build pipelines (server builds with `rootDir: "."`, so pulling in a file
// from outside server/ would break `npm run build:server`). Keep the two in sync
// by hand — this file is small and changes rarely. The server copy is what's
// actually enforced; this one just lets the admin UI validate a drag before ever
// submitting it, for a faster feedback loop.
export type KioskStepKey = "tutorial" | "packages" | "orientation" | "payment" | "frame" | "capture" | "preview" | "result";

export interface KioskStepDef {
  key: KioskStepKey;
  route: string;
  label: string;
  hint: string;
  locked: boolean;
}

export const STEP_DEFS: Record<KioskStepKey, KioskStepDef> = {
  tutorial: { key: "tutorial", route: "/tutorial", label: "Tutorial", hint: "Ringkasan cara pakai sebelum mulai.", locked: false },
  packages: { key: "packages", route: "/paket", label: "Pilih Paket", hint: "Wajib — titik awal setiap sesi.", locked: true },
  orientation: { key: "orientation", route: "/orientasi", label: "Tampilan Kamera", hint: "Cermin atau tampilan normal.", locked: false },
  payment: { key: "payment", route: "/bayar", label: "Pembayaran", hint: "Wajib — QRIS, voucher, atau cash.", locked: true },
  frame: { key: "frame", route: "/frame", label: "Pilih Frame", hint: "Pilih bingkai foto.", locked: false },
  capture: { key: "capture", route: "/sesi-foto", label: "Sesi Foto", hint: "Wajib — pengambilan foto.", locked: true },
  preview: { key: "preview", route: "/preview", label: "Preview & Edit", hint: "Cek & edit hasil sebelum lanjut.", locked: false },
  result: { key: "result", route: "/hasil", label: "Hasil", hint: "Wajib — download, cetak, selesai.", locked: true },
};

export const KIOSK_STEP_KEYS: KioskStepKey[] = ["tutorial", "packages", "orientation", "payment", "frame", "capture", "preview", "result"];
export const LOCKED_STEPS: KioskStepKey[] = ["packages", "payment", "capture", "result"];

// See server/lib/kioskFlowRules.ts for why these specific pairs — real data
// dependencies in the current pages, not arbitrary preference.
export const ORDER_CONSTRAINTS: [KioskStepKey, KioskStepKey][] = [
  ["packages", "payment"],
  ["packages", "orientation"],
  ["payment", "frame"],
  ["frame", "capture"],
  ["payment", "capture"],
  ["capture", "preview"],
  ["preview", "result"],
];

export interface KioskFlowConfig {
  order: string[];
  enabled: Record<string, boolean>;
}

export function validateFlowOrder(config: KioskFlowConfig): { ok: true } | { ok: false; error: string } {
  const { order, enabled } = config;
  if (!Array.isArray(order) || order.length !== KIOSK_STEP_KEYS.length) {
    return { ok: false, error: "Urutan step harus berisi semua 8 step, tidak boleh kurang/lebih." };
  }
  const seen = new Set<string>();
  for (const key of order) {
    if (!KIOSK_STEP_KEYS.includes(key as KioskStepKey)) return { ok: false, error: `Step tidak dikenal: "${key}".` };
    if (seen.has(key)) return { ok: false, error: `Step "${key}" muncul dua kali.` };
    seen.add(key);
  }
  for (const key of LOCKED_STEPS) {
    if (enabled[key] === false) return { ok: false, error: `Step "${STEP_DEFS[key as KioskStepKey].label}" wajib aktif, tidak bisa dimatikan.` };
  }
  const indexOf = new Map(order.map((key, index) => [key, index]));
  for (const [before, after] of ORDER_CONSTRAINTS) {
    const beforeIndex = indexOf.get(before);
    const afterIndex = indexOf.get(after);
    if (beforeIndex === undefined || afterIndex === undefined) continue;
    if (beforeIndex >= afterIndex) {
      return { ok: false, error: `Step "${STEP_DEFS[before].label}" harus sebelum "${STEP_DEFS[after].label}".` };
    }
  }
  return { ok: true };
}

export const DEFAULT_KIOSK_FLOW: KioskFlowConfig = {
  order: [...KIOSK_STEP_KEYS],
  enabled: { tutorial: false, orientation: true, frame: true, preview: true },
};

function resolveStep(offset: 1 | -1, fromKey: KioskStepKey | "idle", flow: KioskFlowConfig): string {
  const order = flow.order.length === KIOSK_STEP_KEYS.length ? (flow.order as KioskStepKey[]) : KIOSK_STEP_KEYS;
  const isEnabled = (key: KioskStepKey) => LOCKED_STEPS.includes(key) || flow.enabled[key] !== false;

  // "idle" isn't a reorderable step — starting position is always "the first
  // enabled step in whatever order is configured".
  let index = fromKey === "idle" ? -1 : order.indexOf(fromKey);
  if (index === -1 && fromKey !== "idle") index = 0;

  for (let cursor = index + offset; cursor >= 0 && cursor < order.length; cursor += offset) {
    const candidate = order[cursor];
    if (isEnabled(candidate)) return STEP_DEFS[candidate].route;
  }
  // Fell off the end/start — idle is the only sane fallback (start over / go home).
  return "/";
}

/** Next enabled step's route after `fromKey` in the configured order. */
export function getNextRoute(fromKey: KioskStepKey | "idle", flow: KioskFlowConfig): string {
  return resolveStep(1, fromKey, flow);
}

/** Previous enabled step's route before `fromKey` in the configured order. */
export function getPreviousRoute(fromKey: KioskStepKey, flow: KioskFlowConfig): string {
  return resolveStep(-1, fromKey, flow);
}
