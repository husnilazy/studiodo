// Withdrawal policy for platform-settled tenants (the money STUDIODO's QRIS collected for them).
// A platform default lives in platform_settings.withdrawal_policy; a tenant can have a partial override in
// tenants.withdrawal_policy. Only the fields present in the override replace the default. Everything here is pure
// (no database), so the rules are easy to test: lib/wallet.ts loads the policy and the numbers it needs.

export interface WithdrawalPolicy {
  /** false = this tenant's payouts are frozen (nobody can request a withdrawal). */
  enabled: boolean;
  /** "anytime" = whenever the tenant wants; "window" = only on `days` between `fromTime` and `toTime` (WIB, UTC+7). */
  mode: "anytime" | "window";
  /** Days a payout request is allowed in "window" mode: 0 = Sunday … 6 = Saturday. */
  days: number[];
  fromTime: string; // "HH:MM"
  toTime: string; // "HH:MM"
  /** Smallest request. 0 = use the platform minimum (platform_settings.withdrawal_min_amount). */
  minAmount: number;
  /** Largest single request. 0 = no limit. */
  maxAmount: number;
  /** Most a tenant may request per calendar day (WIB), amount and count. 0 = no limit. */
  dailyMaxAmount: number;
  dailyMaxCount: number;
  /** Days a QRIS payment is held before it can be withdrawn (covers refunds/chargebacks). 0 = withdrawable at once. */
  holdDays: number;
  /** Minimum hours between two requests of the same tenant. 0 = none. */
  cooldownHours: number;
  /** Requests of at least this amount need a second superadmin/finance user to approve before they can be paid. 0 = off. */
  approvalThreshold: number;
  /** A payout to a bank account the tenant has never been paid at is held this many hours before it can be processed. 0 = off. */
  newAccountHoldHours: number;
  /** Override the platform fee for this tenant. null = use the platform value. */
  feePercent: number | null;
  flatFee: number | null;
}

export const DEFAULT_WITHDRAWAL_POLICY: WithdrawalPolicy = {
  enabled: true,
  mode: "anytime",
  days: [0, 1, 2, 3, 4, 5, 6],
  fromTime: "00:00",
  toTime: "23:59",
  minAmount: 0,
  maxAmount: 0,
  dailyMaxAmount: 0,
  dailyMaxCount: 0,
  holdDays: 0,
  cooldownHours: 0,
  approvalThreshold: 0,
  newAccountHoldHours: 0,
  feePercent: null,
  flatFee: null,
};

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const num = (value: unknown, min: number, max: number): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};

/** Keeps only valid, known fields. Used on everything a superadmin sends and on everything read back from the database. */
export function sanitizePolicy(input: unknown): Partial<WithdrawalPolicy> {
  const src = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const out: Partial<WithdrawalPolicy> = {};
  if (typeof src.enabled === "boolean") out.enabled = src.enabled;
  if (src.mode === "anytime" || src.mode === "window") out.mode = src.mode;
  if (Array.isArray(src.days)) {
    const days = [...new Set(src.days.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
    if (days.length > 0) out.days = days;
  }
  if (typeof src.fromTime === "string" && TIME_RE.test(src.fromTime)) out.fromTime = src.fromTime;
  if (typeof src.toTime === "string" && TIME_RE.test(src.toTime)) out.toTime = src.toTime;
  for (const [key, max] of [["minAmount", 1_000_000_000], ["maxAmount", 1_000_000_000], ["dailyMaxAmount", 1_000_000_000], ["dailyMaxCount", 1000], ["holdDays", 60], ["cooldownHours", 720], ["approvalThreshold", 1_000_000_000], ["newAccountHoldHours", 720]] as const) {
    const n = num(src[key], 0, max);
    if (n !== undefined) out[key] = n;
  }
  if (src.flatFee === null) out.flatFee = null;
  else { const n = num(src.flatFee, 0, 10_000_000); if (n !== undefined) out.flatFee = n; }
  if (src.feePercent === null) out.feePercent = null;
  else if (src.feePercent !== undefined && src.feePercent !== "") {
    const f = Number(src.feePercent);
    if (Number.isFinite(f) && f >= 0 && f <= 30) out.feePercent = Math.round(f * 100) / 100;
  }
  return out;
}

export function mergePolicy(platform: unknown, tenant: unknown): WithdrawalPolicy {
  return { ...DEFAULT_WITHDRAWAL_POLICY, ...sanitizePolicy(platform), ...sanitizePolicy(tenant) };
}

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** The WIB wall clock of an instant, as { day: 0-6, minutes: minutes since midnight, dateKey: "YYYY-MM-DD" }. */
export function wibClock(at: Date) {
  const shifted = new Date(at.getTime() + WIB_OFFSET_MS);
  return { day: shifted.getUTCDay(), minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(), dateKey: shifted.toISOString().slice(0, 10) };
}

/** Start of the current WIB day as a UTC instant (for "requests today" queries). */
export function startOfWibDay(at: Date): Date {
  const shifted = new Date(at.getTime() + WIB_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - WIB_OFFSET_MS);
}

export interface WindowStatus {
  open: boolean;
  /** Plain-language line for the tenant, e.g. "Penarikan dibuka Senin–Jumat, 09:00–16:00 WIB". */
  label: string;
  /** Next moment the window opens (only when currently closed). */
  nextOpenAt: Date | null;
}

export function describeSchedule(policy: WithdrawalPolicy): string {
  if (!policy.enabled) return "Penarikan sedang dibekukan";
  if (policy.mode === "anytime") return "Penarikan bisa dilakukan kapan saja";
  const days = policy.days.length === 7 ? "setiap hari" : policy.days.map((d) => DAY_NAMES[d]).join(", ");
  return `Penarikan dibuka ${days}, ${policy.fromTime}–${policy.toTime} WIB`;
}

export function windowStatus(policy: WithdrawalPolicy, now: Date = new Date()): WindowStatus {
  const label = describeSchedule(policy);
  if (!policy.enabled) return { open: false, label, nextOpenAt: null };
  if (policy.mode === "anytime") return { open: true, label, nextOpenAt: null };
  const from = toMinutes(policy.fromTime);
  const to = toMinutes(policy.toTime);
  const clock = wibClock(now);
  const dayAllowed = policy.days.includes(clock.day);
  if (dayAllowed && clock.minutes >= from && clock.minutes <= to) return { open: true, label, nextOpenAt: null };
  // Find the next opening: scan up to 8 days ahead, minute precision is not needed (we report the window start).
  for (let offset = 0; offset <= 7; offset++) {
    const dayStartUtc = startOfWibDay(new Date(now.getTime() + offset * 86_400_000));
    const day = wibClock(new Date(dayStartUtc.getTime() + 60_000)).day;
    if (!policy.days.includes(day)) continue;
    const opensAt = new Date(dayStartUtc.getTime() + from * 60_000);
    if (opensAt.getTime() > now.getTime()) return { open: false, label, nextOpenAt: opensAt };
  }
  return { open: false, label, nextOpenAt: null };
}

export interface WithdrawalContext {
  now: Date;
  amount: number;
  available: number;
  /** Platform minimum (used when the policy's minAmount is 0). */
  platformMinAmount: number;
  flatFee: number;
  requestsToday: { count: number; amount: number };
  lastRequestAt: Date | null;
}

export type WithdrawalCheck = { ok: true } | { ok: false; code: string; error: string };

const rp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

/** The one place that decides whether a payout request is allowed. Returns the first rule that is broken. */
export function checkWithdrawal(policy: WithdrawalPolicy, ctx: WithdrawalContext): WithdrawalCheck {
  if (!policy.enabled) return { ok: false, code: "frozen", error: "Penarikan untuk akun ini sedang dibekukan. Hubungi STUDIODO untuk informasi lebih lanjut." };
  const window = windowStatus(policy, ctx.now);
  if (!window.open) {
    const next = window.nextOpenAt ? ` Dibuka lagi ${window.nextOpenAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", hour: "2-digit", minute: "2-digit" })} WIB.` : "";
    return { ok: false, code: "closed", error: `${window.label}. Saat ini di luar jam penarikan.${next}` };
  }
  const min = policy.minAmount > 0 ? policy.minAmount : ctx.platformMinAmount;
  if (!Number.isFinite(ctx.amount) || ctx.amount <= 0) return { ok: false, code: "invalid", error: "Nominal penarikan tidak valid" };
  if (ctx.amount < min) return { ok: false, code: "min", error: `Penarikan minimal ${rp(min)}` };
  if (policy.maxAmount > 0 && ctx.amount > policy.maxAmount) return { ok: false, code: "max", error: `Penarikan maksimal ${rp(policy.maxAmount)} per permintaan` };
  if (ctx.amount > ctx.available) return { ok: false, code: "balance", error: `Saldo tersedia hanya ${rp(ctx.available)}` };
  if (ctx.amount <= ctx.flatFee) return { ok: false, code: "fee", error: "Nominal harus lebih besar dari biaya penarikan" };
  if (policy.dailyMaxCount > 0 && ctx.requestsToday.count >= policy.dailyMaxCount) return { ok: false, code: "daily_count", error: `Batas ${policy.dailyMaxCount} permintaan penarikan per hari sudah tercapai` };
  if (policy.dailyMaxAmount > 0 && ctx.requestsToday.amount + ctx.amount > policy.dailyMaxAmount) {
    return { ok: false, code: "daily_amount", error: `Batas penarikan harian ${rp(policy.dailyMaxAmount)}; hari ini sudah ${rp(ctx.requestsToday.amount)}` };
  }
  if (policy.cooldownHours > 0 && ctx.lastRequestAt) {
    const readyAt = ctx.lastRequestAt.getTime() + policy.cooldownHours * 3_600_000;
    if (ctx.now.getTime() < readyAt) {
      return { ok: false, code: "cooldown", error: `Permintaan berikutnya bisa diajukan ${new Date(readyAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} WIB (jeda ${policy.cooldownHours} jam)` };
    }
  }
  return { ok: true };
}
