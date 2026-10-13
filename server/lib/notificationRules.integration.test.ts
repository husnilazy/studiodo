import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { planNotifications, type RuleKey } from "./notificationRules.js";

// Pure rules always run; the SQL part (dedupe) runs when PGLITE_MODULE / @electric-sql/pglite is available.
const spec = process.env.PGLITE_MODULE ?? "@electric-sql/pglite";
let PGlite: (new () => { exec(sql: string): Promise<unknown>; query(sql: string): Promise<{ rows: Record<string, unknown>[] }> }) | null = null;
try {
  PGlite = ((await import(/* @vite-ignore */ spec)) as { PGlite: typeof PGlite }).PGlite;
} catch {
  PGlite = null;
}
const holder: { db?: unknown } = {};
vi.mock("../db/client.js", () => ({ get db() { return holder.db; }, client: { end: async () => undefined } }));

const DAY = 86_400_000;
const HOUR = 3_600_000;
const now = Date.parse("2026-10-13T10:00:00Z");
const key = (over: Partial<RuleKey>): RuleKey => ({ id: "k1", tenantId: "t1", label: "Mall", licenseType: "paid", licenseEndsAt: new Date(now + 60 * DAY), lastUsedAt: new Date(now - HOUR), paired: true, ...over });

describe("planNotifications", () => {
  it("quiet booth produces nothing", () => {
    expect(planNotifications([key({})], now)).toEqual([]);
  });
  it("warns inside the 7 day window, once per end date", () => {
    const [n] = planNotifications([key({ licenseEndsAt: new Date(now + 3 * DAY) })], now);
    expect(n.severity).toBe("warning");
    expect(n.title).toContain("berakhir 3 hari lagi");
    expect(n.dedupeKey).toBe("expiring:k1:2026-10-16");
  });
  it("trial wording differs from paid", () => {
    expect(planNotifications([key({ licenseType: "trial", licenseEndsAt: new Date(now + DAY) })], now)[0].title).toMatch(/^Trial/);
  });
  it("raises a critical alert for a just-expired booth, but not an old one", () => {
    expect(planNotifications([key({ licenseEndsAt: new Date(now - DAY) })], now)[0].severity).toBe("critical");
    expect(planNotifications([key({ licenseEndsAt: new Date(now - 10 * DAY) })], now).filter((n) => n.dedupeKey.startsWith("expired"))).toEqual([]);
  });
  it("unlimited paid booth (null end) never warns about expiry", () => {
    expect(planNotifications([key({ licenseEndsAt: null })], now)).toEqual([]);
  });
  it("offline only after 24h, only when paired and licensed, and not for long-abandoned booths", () => {
    expect(planNotifications([key({ lastUsedAt: new Date(now - 23 * HOUR) })], now)).toEqual([]);
    expect(planNotifications([key({ lastUsedAt: new Date(now - 30 * HOUR) })], now)[0].dedupeKey.startsWith("offline:")).toBe(true);
    expect(planNotifications([key({ lastUsedAt: new Date(now - 30 * HOUR), paired: false })], now)).toEqual([]);
    expect(planNotifications([key({ lastUsedAt: new Date(now - 30 * DAY) })], now)).toEqual([]);
    expect(planNotifications([key({ lastUsedAt: new Date(now - 30 * HOUR), licenseType: "unpaid" })], now)).toEqual([]);
  });
});

describe.skipIf(!PGlite)("runNotificationRules (real SQL)", () => {
  let pg: InstanceType<NonNullable<typeof PGlite>>;
  beforeAll(async () => {
    process.env.JWT_SECRET = "integration-test-secret";
    pg = new PGlite!();
    const dir = path.resolve(__dirname, "../db/migrations");
    const journal = JSON.parse(fs.readFileSync(path.join(dir, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
    for (const { tag } of journal.entries) {
      for (const stmt of fs.readFileSync(path.join(dir, `${tag}.sql`), "utf8").split("--> statement-breakpoint")) if (stmt.trim()) await pg.exec(stmt);
    }
    const { drizzle } = await import("drizzle-orm/pglite");
    holder.db = drizzle(pg as never, { schema: await import("../db/schema.js") });
    await pg.exec(`INSERT INTO tenants (id, name, slug) VALUES ('00000000-0000-0000-0000-0000000000a1', 'Satu', 'satu')`);
    await pg.exec(`INSERT INTO kiosk_keys (id, tenant_id, key_hash, label, license_type, license_ends_at, bound_device_id, last_used_at)
      VALUES ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'h1', 'Mall', 'paid', now() + interval '2 days', 'dev', now())`);
  });

  it("inserts alerts once; a second run adds nothing", async () => {
    const { runNotificationRules } = await import("./notificationRules.js");
    expect(await runNotificationRules()).toBe(1);
    expect(await runNotificationRules()).toBe(0);
    const rows = (await pg.query("SELECT created_by, kind FROM notifications")).rows;
    expect(rows).toEqual([{ created_by: "system", kind: "billing" }]);
  });
});
