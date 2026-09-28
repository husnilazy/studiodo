// Kiosk flow builder (Fase 4) rules — the source of truth for which steps exist,
// which are locked (can't be disabled because the app has a hard data dependency on
// them), and which relative-order constraints must hold. Mirrored (not imported,
// see client/src/lib/kioskFlow.ts for why) in the client so the admin UI can validate
// a drag before ever submitting it — this file is what actually gets enforced,
// the client copy is just a UX nicety on top.
export type KioskStepKey = "tutorial" | "packages" | "orientation" | "payment" | "frame" | "capture" | "preview" | "result";

export const KIOSK_STEP_KEYS: KioskStepKey[] = ["tutorial", "packages", "orientation", "payment", "frame", "capture", "preview", "result"];

export const LOCKED_STEPS: KioskStepKey[] = ["packages", "payment", "capture", "result"];

// [before, after]: `before` must appear earlier than `after` in `order`. These come
// from real data dependencies in the current kiosk pages (see Fase 4 plan notes),
// not arbitrary preference — violating one produces a kiosk page that bounces back
// or renders empty state.
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
    if (enabled[key] === false) return { ok: false, error: `Step "${key}" wajib aktif, tidak bisa dimatikan.` };
  }

  const indexOf = new Map(order.map((key, index) => [key, index]));
  for (const [before, after] of ORDER_CONSTRAINTS) {
    const beforeIndex = indexOf.get(before);
    const afterIndex = indexOf.get(after);
    if (beforeIndex === undefined || afterIndex === undefined) continue;
    if (beforeIndex >= afterIndex) {
      return { ok: false, error: `Step "${before}" harus berada sebelum "${after}" di urutan.` };
    }
  }

  return { ok: true };
}
