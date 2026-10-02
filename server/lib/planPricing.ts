// One place that turns a plan row into the prices people see AND the amount a payment gateway is asked to charge, so the
// website, the tenant portal and checkout can never disagree about what a plan costs.
//
// Model: `price` is the LIST price of one billing interval (monthly by default). A plan can carry
//   - a promo discount (`discountPercent`, optionally with a label and an end date) that applies to whatever is shown, and
//   - a yearly option (`yearlyDiscountPercent` > 0 on a monthly plan): 12 months of the monthly price, minus that percent.
// A legacy plan whose billingInterval is already "yearly" simply has a yearly list price and no monthly/yearly toggle.

export type PlanPricingInput = {
  price: string | number;
  billingInterval: string;
  discountPercent?: number | null;
  discountEndsAt?: Date | string | null;
  yearlyDiscountPercent?: number | null;
};

export type PriceOption = {
  /** Price before any promo, for this interval. */
  list: number;
  /** What is actually charged. */
  final: number;
  /** Promo percent in effect (0 when none / expired). */
  discountPercent: number;
  /** Final price spread over the months in the interval. */
  perMonth: number;
};

export type PlanPricing = {
  monthly: PriceOption | null;
  yearly: PriceOption | null;
  /** How much cheaper the yearly option is than twelve monthly payments, in percent (0 when there is no yearly option). */
  yearlySavingsPercent: number;
  /** The promo that is currently active, if any. */
  activeDiscountPercent: number;
  discountEndsAt: string | null;
};

const clampPercent = (value: unknown) => Math.max(0, Math.min(90, Math.round(Number(value) || 0)));
const roundRupiah = (value: number) => Math.round(value / 100) * 100; // keep prices tidy (…00)

export function activeDiscountPercent(plan: Pick<PlanPricingInput, "discountPercent" | "discountEndsAt">, now = new Date()) {
  const percent = clampPercent(plan.discountPercent);
  if (percent === 0) return 0;
  if (plan.discountEndsAt && new Date(plan.discountEndsAt).getTime() <= now.getTime()) return 0;
  return percent;
}

function option(list: number, months: number, discountPercent: number): PriceOption {
  const final = discountPercent > 0 ? roundRupiah(list * (1 - discountPercent / 100)) : list;
  return { list, final, discountPercent, perMonth: Math.round(final / months) };
}

export function computePlanPricing(plan: PlanPricingInput, now = new Date()): PlanPricing {
  const base = Math.max(0, Number(plan.price) || 0);
  const promo = activeDiscountPercent(plan, now);
  const endsAt = promo > 0 && plan.discountEndsAt ? new Date(plan.discountEndsAt).toISOString() : null;

  if (plan.billingInterval === "yearly") {
    return { monthly: null, yearly: option(base, 12, promo), yearlySavingsPercent: 0, activeDiscountPercent: promo, discountEndsAt: endsAt };
  }

  const monthly = option(base, 1, promo);
  const yearlyExtra = clampPercent(plan.yearlyDiscountPercent);
  if (yearlyExtra === 0 || base === 0) {
    return { monthly, yearly: null, yearlySavingsPercent: 0, activeDiscountPercent: promo, discountEndsAt: endsAt };
  }
  // Yearly = twelve months of the (already promo-discounted) monthly price, minus the yearly discount. The list price
  // shown struck-through for the year is 12x the undiscounted monthly price, so "you save" is honest.
  const twelveMonthsList = base * 12;
  const yearlyFinal = roundRupiah(monthly.final * 12 * (1 - yearlyExtra / 100));
  const yearly: PriceOption = {
    list: twelveMonthsList,
    final: yearlyFinal,
    discountPercent: Math.round((1 - yearlyFinal / twelveMonthsList) * 100),
    perMonth: Math.round(yearlyFinal / 12),
  };
  return { monthly, yearly, yearlySavingsPercent: Math.round((1 - yearlyFinal / (monthly.final * 12)) * 100), activeDiscountPercent: promo, discountEndsAt: endsAt };
}

export type CheckoutInterval = "monthly" | "yearly";

/** The amount and period to charge for `interval`, or null when the plan does not offer that interval. */
export function priceForInterval(plan: PlanPricingInput, interval: CheckoutInterval, now = new Date()): { amount: number; periodDays: number; list: number } | null {
  const pricing = computePlanPricing(plan, now);
  const picked = interval === "yearly" ? pricing.yearly : pricing.monthly;
  if (!picked) return null;
  return { amount: picked.final, periodDays: interval === "yearly" ? 365 : 30, list: picked.list };
}
