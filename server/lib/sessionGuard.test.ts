import { beforeEach, describe, expect, it, vi } from "vitest";

// What the database "currently" holds for each account, controlled per test.
const hashes: Record<string, string | undefined> = {};
vi.mock("../db/client.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(Object.values(hashes).length ? [{ h: hashes.current }].filter((r) => r.h !== undefined) : []),
      }),
    }),
  },
  client: {},
}));

let guard: typeof import("./sessionGuard.js");
beforeEach(async () => {
  process.env.JWT_SECRET = "session-guard-test";
  guard = await import("./sessionGuard.js");
  guard.clearSessionCache();
  for (const k of Object.keys(hashes)) delete hashes[k];
});

describe("versionMatches", () => {
  it("a token is valid only for the password it was issued under", () => {
    const pv = guard.sessionVersion("hash-A");
    expect(guard.versionMatches(pv, "hash-A")).toBe(true);
    expect(guard.versionMatches(pv, "hash-B")).toBe(false); // password changed
    expect(guard.versionMatches(pv, null)).toBe(false); // account deleted
  });
  it("tokens issued before revocation existed (no pv) are still accepted until they expire", () => {
    expect(guard.versionMatches(undefined, "hash-A")).toBe(true);
  });
  it("the fingerprint does not reveal the password hash", () => {
    const pv = guard.sessionVersion("super-secret-hash");
    expect(pv).toHaveLength(16);
    expect(pv).not.toContain("super");
  });
});

describe("isSessionCurrent", () => {
  it("revokeSessions makes a password change take effect at once instead of after the cache TTL", async () => {
    hashes.current = "hash-A";
    const pv = guard.sessionVersion("hash-A");
    expect(await guard.isSessionCurrent("admin", "acc-1", pv)).toBe(true);
    hashes.current = "hash-B"; // password changed in the database
    expect(await guard.isSessionCurrent("admin", "acc-1", pv)).toBe(true); // still cached: up to 20s for other processes
    guard.revokeSessions("admin", "acc-1"); // what the password-change route calls
    expect(await guard.isSessionCurrent("admin", "acc-1", pv)).toBe(false);
  });
  it("legacy tokens never touch the database", async () => {
    expect(await guard.isSessionCurrent("superadmin", "acc-2", undefined)).toBe(true);
  });
  it("a token for an account that no longer exists is refused", async () => {
    expect(await guard.isSessionCurrent("creator", "gone", guard.sessionVersion("whatever"))).toBe(false);
  });
});
