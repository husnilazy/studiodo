import { describe, expect, it, vi } from "vitest";

vi.mock("../db/client.js", () => ({ db: {} })); // the helpers below are pure

const { compareVersions, estimateMrr, isAnomalousWithdrawal, licenceStage, scoreTenant } = await import("./insights.js");
const { digestText, sanitizeDigest, wib } = await import("./digest.js");
const { likePattern } = await import("./globalSearch.js");

const NOW = new Date("2026-11-05T05:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

describe("scoreTenant", () => {
  const base = { sessions30: 60, sessionsPrev30: 50, keys: 2, keysHealthy: 2, keysOnline: 2, licence: "ok" as const, unansweredSupport: false };
  it("a busy, healthy, paid-up tenant scores near the top", () => {
    const h = scoreTenant(base);
    expect(h.score).toBeGreaterThanOrEqual(95);
    expect(h.level).toBe("healthy");
    expect(h.reasons).toEqual([]);
  });
  it("a silent tenant with offline booths and an expired licence is at risk, with reasons", () => {
    const h = scoreTenant({ sessions30: 0, sessionsPrev30: 40, keys: 1, keysHealthy: 0, keysOnline: 0, licence: "expired", unansweredSupport: true });
    expect(h.level).toBe("risk");
    expect(h.score).toBeLessThan(20);
    expect(h.reasons.join(" ")).toMatch(/Tidak ada sesi/);
    expect(h.reasons.join(" ")).toMatch(/offline/);
    expect(h.reasons.join(" ")).toMatch(/sudah habis/);
    expect(h.reasons.join(" ")).toMatch(/belum dibalas/);
  });
  it("flags a sharp usage drop and an ending licence as 'watch'", () => {
    const h = scoreTenant({ ...base, sessions30: 12, sessionsPrev30: 50, licence: "ending" });
    expect(h.level).toBe("watch");
    expect(h.reasons.join(" ")).toMatch(/turun/);
  });
});

describe("licenceStage", () => {
  it("reads the per-booth licences", () => {
    expect(licenceStage([{ type: "paid", endsAt: day(60) }], NOW)).toBe("ok");
    expect(licenceStage([{ type: "paid", endsAt: null }], NOW)).toBe("ok"); // complimentary, unlimited
    expect(licenceStage([{ type: "trial", endsAt: day(3) }, { type: "paid", endsAt: day(60) }], NOW)).toBe("ending");
    expect(licenceStage([{ type: "paid", endsAt: day(-2) }], NOW)).toBe("expired");
    expect(licenceStage([{ type: "unpaid", endsAt: null }], NOW)).toBe("none");
    expect(licenceStage([], NOW)).toBe("none");
  });
});

describe("compareVersions / MRR / withdrawals", () => {
  it("orders versions numerically", () => {
    expect(compareVersions("0.1.9", "0.1.30")).toBeLessThan(0);
    expect(compareVersions("v0.2.0", "0.1.30")).toBeGreaterThan(0);
    expect(compareVersions("0.1.30", "0.1.30")).toBe(0);
    expect(compareVersions(null, "0.0.1")).toBeLessThan(0);
  });
  it("normalises payments to a month and ignores finished coverage", () => {
    const mrr = estimateMrr([
      { amount: 300_000, periodDays: 30, at: day(-10) },
      { amount: 3_600_000, periodDays: 360, at: day(-100) },
      { amount: 500_000, periodDays: 30, at: day(-45) }, // coverage ended
    ], NOW);
    expect(mrr).toBe(600_000);
  });
  it("flags payouts far above the tenant's history, or a big first payout", () => {
    expect(isAnomalousWithdrawal(4_000_000, [500_000, 700_000, 600_000])).toMatch(/3×/);
    expect(isAnomalousWithdrawal(900_000, [500_000, 700_000])).toBeNull();
    expect(isAnomalousWithdrawal(6_000_000, [])).toMatch(/pertama/);
    expect(isAnomalousWithdrawal(1_000_000, [])).toBeNull();
  });
});

describe("digest + search helpers", () => {
  const stats = { payments: 3, paymentsAmount: 1_200_000, newApplications: 2, expiring: 7, expiringNames: ["A", "B", "C", "D", "E", "F", "G"], overdueTasks: 1, newLeads: 2, needsReply: 1, boothIssues: 0, boothOffline: 4, openWithdrawals: 1, openWithdrawalsAmount: 750_000, anomalies: 0, uncredited: 0 };
  it("writes a WhatsApp-ready summary listing only what needs attention", () => {
    const text = digestText(stats, NOW, "https://app.example");
    expect(text).toContain("*Ringkasan pagi STUDIODO*");
    expect(text).toContain("Pembayaran 24 jam: 3");
    expect(text).toContain("7 tenant — A, B, C, D, E, …");
    expect(text).toContain("4 offline");
    expect(text).not.toContain("Anomali");
    expect(text).toContain("https://app.example");
  });
  it("says so when nothing is urgent", () => {
    expect(digestText({ ...stats, expiring: 0, expiringNames: [], overdueTasks: 0, newLeads: 0, needsReply: 0, boothOffline: 0, openWithdrawals: 0 }, NOW)).toContain("Tidak ada yang mendesak");
  });
  it("keeps the digest hour sane and reads the WIB day", () => {
    expect(sanitizeDigest({ enabled: true, hour: 3 })).toEqual({ enabled: true, hour: 7 });
    expect(sanitizeDigest({ enabled: true, hour: 9 })).toEqual({ enabled: true, hour: 9 });
    expect(wib(new Date("2026-11-05T20:00:00Z"))).toEqual({ day: "2026-11-06", hour: 3 });
  });
  it("escapes LIKE wildcards in search input", () => {
    expect(likePattern("50%_off")).toBe("%50\\%\\_off%");
  });
});
