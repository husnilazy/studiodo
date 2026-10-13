import { describe, expect, it } from "vitest";
import { createLoginGuard, LOCK_STEPS_MS } from "./loginGuard.js";

describe("loginGuard", () => {
  it("locks after maxFailures wrong passwords and reports it once", () => {
    let t = 1_000;
    const g = createLoginGuard({ maxFailures: 3, now: () => t });
    expect(g.fail("a")).toBeNull();
    expect(g.fail("a")).toBeNull();
    const lock = g.fail("a");
    expect(lock?.lockoutCount).toBe(1);
    expect(lock?.lockMs).toBe(LOCK_STEPS_MS[0]);
    expect(g.lockedFor("a")).toBe(LOCK_STEPS_MS[0]);
    t += LOCK_STEPS_MS[0] + 1;
    expect(g.lockedFor("a")).toBe(0);
  });

  it("each repeat lockout is longer, capped at the last step", () => {
    let t = 0;
    const g = createLoginGuard({ maxFailures: 1, now: () => t });
    const locks = [1, 2, 3, 4].map(() => { const l = g.fail("a")!; t = l.until + 1; return l.lockMs; });
    expect(locks).toEqual([LOCK_STEPS_MS[0], LOCK_STEPS_MS[1], LOCK_STEPS_MS[2], LOCK_STEPS_MS[2]]);
  });

  it("a successful login clears the history, and keys are independent", () => {
    const g = createLoginGuard({ maxFailures: 2 });
    g.fail("a"); g.fail("b");
    g.succeed("a");
    expect(g.fail("a")).toBeNull(); // counting from zero again
    expect(g.fail("b")?.lockoutCount).toBe(1);
  });

  it("forgets old failures after a day of quiet", () => {
    let t = 0;
    const g = createLoginGuard({ maxFailures: 2, now: () => t });
    g.fail("a");
    t += 25 * 60 * 60_000;
    expect(g.fail("a")).toBeNull(); // history was forgotten, so this is failure #1 again
  });
});
