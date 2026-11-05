import { describe, expect, it } from "vitest";
import { checkWithdrawal, DEFAULT_WITHDRAWAL_POLICY, mergePolicy, sanitizePolicy, startOfWibDay, windowStatus, type WithdrawalContext } from "./withdrawalPolicy.js";

// Monday 2026-11-02 10:00 WIB = 03:00 UTC
const MONDAY_10_WIB = new Date("2026-11-02T03:00:00Z");
const SUNDAY_23_WIB = new Date("2026-11-01T16:30:00Z"); // Sunday 23:30 WIB

const ctx = (over: Partial<WithdrawalContext> = {}): WithdrawalContext => ({
  now: MONDAY_10_WIB, amount: 100_000, available: 500_000, platformMinAmount: 50_000, flatFee: 2_500,
  requestsToday: { count: 0, amount: 0 }, lastRequestAt: null, ...over,
});

describe("sanitizePolicy / mergePolicy", () => {
  it("keeps valid fields and drops garbage", () => {
    expect(sanitizePolicy({ enabled: false, mode: "window", days: [1, 2, 2, 9, "x"], fromTime: "09:00", toTime: "25:00", minAmount: "75000", holdDays: -3, feePercent: 1.234, evil: "x" }))
      .toEqual({ enabled: false, mode: "window", days: [1, 2], fromTime: "09:00", minAmount: 75000, feePercent: 1.23 });
  });
  it("lets a tenant override only the fields it sets", () => {
    const merged = mergePolicy({ holdDays: 2, minAmount: 100000 }, { minAmount: 25000, enabled: true });
    expect(merged.holdDays).toBe(2);
    expect(merged.minAmount).toBe(25000);
    expect(merged.mode).toBe(DEFAULT_WITHDRAWAL_POLICY.mode);
  });
  it("tolerates a null/garbage override", () => {
    expect(mergePolicy(null, "nope")).toEqual(DEFAULT_WITHDRAWAL_POLICY);
  });
});

describe("windowStatus (WIB)", () => {
  const weekdays = mergePolicy({ mode: "window", days: [1, 2, 3, 4, 5], fromTime: "09:00", toTime: "16:00" }, null);
  it("is always open in anytime mode", () => {
    expect(windowStatus(DEFAULT_WITHDRAWAL_POLICY, SUNDAY_23_WIB).open).toBe(true);
  });
  it("is open inside the window", () => {
    expect(windowStatus(weekdays, MONDAY_10_WIB).open).toBe(true);
  });
  it("is closed on a day that is not allowed and reports the next opening", () => {
    const status = windowStatus(weekdays, SUNDAY_23_WIB);
    expect(status.open).toBe(false);
    // next opening: Monday 09:00 WIB = Monday 02:00 UTC
    expect(status.nextOpenAt?.toISOString()).toBe("2026-11-02T02:00:00.000Z");
    expect(status.label).toContain("Senin");
  });
  it("is closed outside the hours of an allowed day", () => {
    const early = new Date("2026-11-02T00:30:00Z"); // Monday 07:30 WIB
    expect(windowStatus(weekdays, early).open).toBe(false);
    expect(windowStatus(weekdays, early).nextOpenAt?.toISOString()).toBe("2026-11-02T02:00:00.000Z");
  });
  it("a frozen tenant is never open", () => {
    expect(windowStatus(mergePolicy(null, { enabled: false }), MONDAY_10_WIB).open).toBe(false);
  });
  it("finds the start of the WIB day", () => {
    expect(startOfWibDay(new Date("2026-11-02T20:00:00Z")).toISOString()).toBe("2026-11-02T17:00:00.000Z"); // 03:00 Tuesday WIB → Tue 00:00 WIB = Mon 17:00 UTC
  });
});

describe("checkWithdrawal", () => {
  const policy = DEFAULT_WITHDRAWAL_POLICY;
  const code = (p = policy, c = ctx()) => { const r = checkWithdrawal(p, c); return r.ok ? "ok" : r.code; };

  it("allows a normal request", () => expect(code()).toBe("ok"));
  it("blocks a frozen tenant", () => expect(code(mergePolicy(null, { enabled: false }))).toBe("frozen"));
  it("blocks outside the window", () => expect(code(mergePolicy({ mode: "window", days: [1], fromTime: "09:00", toTime: "16:00" }, null), ctx({ now: SUNDAY_23_WIB }))).toBe("closed"));
  it("enforces the platform minimum unless the policy sets its own", () => {
    expect(code(policy, ctx({ amount: 40_000 }))).toBe("min");
    expect(code(mergePolicy({ minAmount: 20_000 }, null), ctx({ amount: 40_000 }))).toBe("ok");
  });
  it("enforces the per-request maximum", () => expect(code(mergePolicy({ maxAmount: 80_000 }, null))).toBe("max"));
  it("never lets a request exceed the available balance", () => expect(code(policy, ctx({ amount: 600_000 }))).toBe("balance"));
  it("requires the amount to cover the fee", () => expect(code(mergePolicy({ minAmount: 1 }, null), ctx({ amount: 2_000 }))).toBe("fee"));
  it("enforces the daily count and amount", () => {
    expect(code(mergePolicy({ dailyMaxCount: 2 }, null), ctx({ requestsToday: { count: 2, amount: 100_000 } }))).toBe("daily_count");
    expect(code(mergePolicy({ dailyMaxAmount: 300_000 }, null), ctx({ requestsToday: { count: 1, amount: 250_000 } }))).toBe("daily_amount");
  });
  it("enforces the cooldown between requests", () => {
    const last = new Date(MONDAY_10_WIB.getTime() - 2 * 3_600_000);
    expect(code(mergePolicy({ cooldownHours: 6 }, null), ctx({ lastRequestAt: last }))).toBe("cooldown");
    expect(code(mergePolicy({ cooldownHours: 1 }, null), ctx({ lastRequestAt: last }))).toBe("ok");
  });
});
