import { describe, expect, it } from "vitest";
import { computeKeyLock, summarizeLicenses } from "./license.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-13T00:00:00Z");
const at = (days: number) => new Date(NOW + days * DAY);

describe("computeKeyLock", () => {
  it("locks an unpaid booth immediately", () => {
    const lock = computeKeyLock("active", { licenseType: "unpaid", licenseEndsAt: null }, 3, NOW);
    expect(lock).toMatchObject({ locked: true, reason: "unpaid" });
  });

  it("lets a trial run until its end date and locks right after, with no grace period", () => {
    expect(computeKeyLock("active", { licenseType: "trial", licenseEndsAt: at(2) }, 3, NOW)).toMatchObject({ locked: false, daysRemaining: 2 });
    expect(computeKeyLock("active", { licenseType: "trial", licenseEndsAt: at(-0.01) }, 3, NOW)).toMatchObject({ locked: true, reason: "trial_expired" });
  });

  it("never turns a trial without an end date into a free forever licence", () => {
    expect(computeKeyLock("active", { licenseType: "trial", licenseEndsAt: null }, 3, NOW).locked).toBe(true);
  });

  it("gives a paid booth the grace period, then locks", () => {
    expect(computeKeyLock("active", { licenseType: "paid", licenseEndsAt: at(5) }, 3, NOW)).toMatchObject({ locked: false, graceDaysRemaining: null });
    expect(computeKeyLock("active", { licenseType: "paid", licenseEndsAt: at(-1) }, 3, NOW)).toMatchObject({ locked: false, graceDaysRemaining: 2 });
    expect(computeKeyLock("active", { licenseType: "paid", licenseEndsAt: at(-4) }, 3, NOW)).toMatchObject({ locked: true, reason: "expired", graceDaysRemaining: 0 });
  });

  it("treats a paid booth without an end date as unlimited", () => {
    expect(computeKeyLock("active", { licenseType: "paid", licenseEndsAt: null }, 3, NOW)).toMatchObject({ locked: false, lockAt: null });
  });

  it("locks everything when the tenant is suspended", () => {
    expect(computeKeyLock("suspended", { licenseType: "paid", licenseEndsAt: at(100) }, 3, NOW)).toMatchObject({ locked: true, reason: "suspended" });
  });

  it("treats an unknown licence type as unpaid", () => {
    expect(computeKeyLock("active", { licenseType: "weird", licenseEndsAt: at(10) }, 3, NOW).locked).toBe(true);
  });
});

describe("summarizeLicenses", () => {
  it("counts booths by state and ignores revoked keys", () => {
    const keys = [
      { revokedAt: null, licenseType: "paid", licenseEndsAt: at(3) },
      { revokedAt: null, licenseType: "paid", licenseEndsAt: at(40) },
      { revokedAt: null, licenseType: "trial", licenseEndsAt: at(-1) },
      { revokedAt: null, licenseType: "unpaid", licenseEndsAt: null },
      { revokedAt: new Date(), licenseType: "paid", licenseEndsAt: at(99) },
    ];
    const s = summarizeLicenses("active", keys, 3, NOW);
    expect(s).toMatchObject({ activeKeys: 4, paid: 2, trial: 1, unpaid: 1, locked: 2, expiringSoon: 1 });
    expect(s.nearestEndsAt?.getTime()).toBe(at(3).getTime());
  });
});
