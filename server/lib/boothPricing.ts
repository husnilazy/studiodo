import { priceForInterval, type CheckoutInterval, type PlanPricingInput } from "./planPricing.js";

// What a tenant pays when it subscribes N booths at once. A plan's price is per booth (one key = one booth); on top of
// that a superadmin can reward bigger orders:
//   - volume tiers (platform-wide): "10 booths or more → 10 % off each"
//   - a negotiated discount on a specific tenant
// The better of the two applies; they never stack, so the final price is always easy to explain to the customer.

export type VolumeTier = { minBooths: number; percent: number };

export const MAX_BOOTHS_PER_ORDER = 100;
export const MAX_DISCOUNT_PERCENT = 90;

const roundRupiah = (value: number) => Math.round(value / 100) * 100;

/** Cleans admin input: whole numbers, sane ranges, one tier per size, smallest first. Throws a readable message on garbage. */
export function sanitizeVolumeTiers(raw: unknown): VolumeTier[] {
  if (!Array.isArray(raw)) throw new Error("Tier diskon harus berupa daftar");
  if (raw.length > 8) throw new Error("Maksimal 8 tier diskon");
  const bySize = new Map<number, number>();
  for (const item of raw) {
    const minBooths = Math.round(Number((item as VolumeTier)?.minBooths));
    const percent = Math.round(Number((item as VolumeTier)?.percent));
    if (!Number.isFinite(minBooths) || minBooths < 2 || minBooths > MAX_BOOTHS_PER_ORDER) throw new Error(`Jumlah booth tier harus antara 2 dan ${MAX_BOOTHS_PER_ORDER}`);
    if (!Number.isFinite(percent) || percent < 1 || percent > MAX_DISCOUNT_PERCENT) throw new Error(`Diskon tier harus antara 1 dan ${MAX_DISCOUNT_PERCENT} persen`);
    bySize.set(minBooths, percent);
  }
  return [...bySize.entries()].map(([minBooths, percent]) => ({ minBooths, percent })).sort((a, b) => a.minBooths - b.minBooths);
}

/** Tolerant read of what is stored (never throws): ignores anything malformed. */
export function readVolumeTiers(stored: unknown): VolumeTier[] {
  try {
    return sanitizeVolumeTiers(stored);
  } catch {
    return [];
  }
}

export type DiscountSource = "volume" | "tenant" | "none";

export function bestDiscount(boothCount: number, tiers: VolumeTier[], tenantPercent: number): { percent: number; source: DiscountSource; tier: VolumeTier | null } {
  let volume = 0;
  let tier: VolumeTier | null = null;
  for (const t of tiers) {
    if (boothCount >= t.minBooths && t.percent > volume) { volume = t.percent; tier = t; }
  }
  const custom = Math.max(0, Math.min(MAX_DISCOUNT_PERCENT, Math.round(Number(tenantPercent) || 0)));
  if (custom > volume) return { percent: custom, source: "tenant", tier: null };
  if (volume > 0) return { percent: volume, source: "volume", tier };
  return { percent: 0, source: "none", tier: null };
}

export interface BoothQuote {
  boothCount: number;
  interval: CheckoutInterval;
  periodDays: number;
  /** One booth's price for the period before the plan promo. */
  unitList: number;
  /** One booth's price after the plan's own promo, before the volume/negotiated discount. */
  unitBase: number;
  discountPercent: number;
  discountSource: DiscountSource;
  /** One booth's final price. */
  unitFinal: number;
  /** boothCount × unitBase — what it would cost with no volume/negotiated discount. */
  subtotal: number;
  discountAmount: number;
  /** What the gateway is asked to charge. */
  total: number;
}

/** Null when the plan does not offer that interval, or the booth count is out of range. */
export function quoteBooths(
  plan: PlanPricingInput,
  interval: CheckoutInterval,
  boothCount: number,
  tiers: VolumeTier[],
  tenantPercent: number,
  now = new Date(),
): BoothQuote | null {
  if (!Number.isInteger(boothCount) || boothCount < 1 || boothCount > MAX_BOOTHS_PER_ORDER) return null;
  const price = priceForInterval(plan, interval, now);
  if (!price) return null;
  const discount = bestDiscount(boothCount, tiers, tenantPercent);
  const unitBase = price.amount;
  const unitFinal = discount.percent > 0 ? roundRupiah(unitBase * (1 - discount.percent / 100)) : unitBase;
  const subtotal = unitBase * boothCount;
  const total = unitFinal * boothCount;
  return {
    boothCount, interval, periodDays: price.periodDays, unitList: price.list, unitBase,
    discountPercent: discount.percent, discountSource: discount.source, unitFinal,
    subtotal, discountAmount: subtotal - total, total,
  };
}
