import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Notifications against a real Postgres engine (PGlite, in memory) with the real migrations applied, so the
// broadcast/targeted visibility, per-tenant read state and expiry SQL are exercised rather than mocked.
// Same opt-in as billing.integration.test.ts: set PGLITE_MODULE to an installed copy, otherwise the suite skips itself.

const spec = process.env.PGLITE_MODULE ?? "@electric-sql/pglite";
let PGlite: (new () => { exec(sql: string): Promise<unknown>; query(sql: string): Promise<{ rows: Record<string, unknown>[] }> }) | null = null;
try {
  PGlite = ((await import(/* @vite-ignore */ spec)) as { PGlite: typeof PGlite }).PGlite;
} catch {
  PGlite = null;
}

const holder: { db?: unknown } = {};
vi.mock("../db/client.js", () => ({
  get db() { return holder.db; },
  client: { end: async () => undefined },
}));

const T1 = "00000000-0000-0000-0000-0000000000a1";
const T2 = "00000000-0000-0000-0000-0000000000a2";

describe("sanitizeLink", () => {
  it("keeps in-site paths and https links, drops everything else", async () => {
    const { sanitizeLink } = await import("./notifications.js");
    expect(sanitizeLink("/portal/booth")).toBe("/portal/booth");
    expect(sanitizeLink(" https://studiodo.id/x ")).toBe("https://studiodo.id/x");
    expect(sanitizeLink("javascript:alert(1)")).toBeNull();
    expect(sanitizeLink("//evil.example")).toBeNull();
    expect(sanitizeLink("http://insecure.example")).toBeNull();
    expect(sanitizeLink("")).toBeNull();
    expect(sanitizeLink(null)).toBeNull();
  });
});

describe.skipIf(!PGlite)("notifications (real SQL)", () => {
  let pg: InstanceType<NonNullable<typeof PGlite>>;
  let lib: typeof import("./notifications.js");

  beforeAll(async () => {
    process.env.JWT_SECRET = "integration-test-secret";
    pg = new PGlite!();
    const dir = path.resolve(__dirname, "../db/migrations");
    const journal = JSON.parse(fs.readFileSync(path.join(dir, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
    for (const { tag } of journal.entries) {
      for (const stmt of fs.readFileSync(path.join(dir, `${tag}.sql`), "utf8").split("--> statement-breakpoint")) {
        if (stmt.trim()) await pg.exec(stmt);
      }
    }
    const { drizzle } = await import("drizzle-orm/pglite");
    const schema = await import("../db/schema.js");
    holder.db = drizzle(pg as never, { schema });
    await pg.exec(`INSERT INTO tenants (id, name, slug) VALUES ('${T1}', 'Satu', 'satu'), ('${T2}', 'Dua', 'dua')`);
    lib = await import("./notifications.js");
  });
  afterAll(async () => { holder.db = undefined; });

  it("a broadcast reaches every tenant, a targeted one only its tenant", async () => {
    await lib.createNotification({ tenantId: null, title: "Untuk semua" });
    await lib.createNotification({ tenantId: T1, title: "Khusus satu", severity: "warning" });
    const one = await lib.listForTenant(T1);
    const two = await lib.listForTenant(T2);
    expect(one.items.map((n) => n.title).sort()).toEqual(["Khusus satu", "Untuk semua"]);
    expect(two.items.map((n) => n.title)).toEqual(["Untuk semua"]);
    expect(one.unread).toBe(2);
    expect(two.unread).toBe(1);
  });

  it("read state is per tenant: reading a broadcast for one tenant leaves it unread for the other", async () => {
    const before = await lib.listForTenant(T1);
    const broadcast = before.items.find((n) => n.title === "Untuk semua")!;
    await lib.markRead(T1, [broadcast.id]);
    expect((await lib.listForTenant(T1)).unread).toBe(1);
    expect((await lib.listForTenant(T2)).unread).toBe(1);
    // marking twice is harmless
    await lib.markRead(T1, [broadcast.id]);
    expect((await lib.listForTenant(T1)).unread).toBe(1);
  });

  it("a tenant cannot mark another tenant's targeted notification as read", async () => {
    const targeted = (await lib.listForTenant(T1)).items.find((n) => n.title === "Khusus satu")!;
    expect(await lib.markRead(T2, [targeted.id])).toBe(0);
    expect((await lib.listForTenant(T1)).unread).toBe(1);
  });

  it("'all' clears the unread count for that tenant only", async () => {
    await lib.markRead(T1, "all");
    expect((await lib.listForTenant(T1)).unread).toBe(0);
    expect((await lib.listForTenant(T2)).unread).toBe(1);
  });

  it("expired notifications are hidden", async () => {
    await lib.createNotification({ tenantId: T2, title: "Kedaluwarsa", expiresAt: new Date(Date.now() - 1000) });
    const two = await lib.listForTenant(T2);
    expect(two.items.map((n) => n.title)).not.toContain("Kedaluwarsa");
  });

  it("drops an unsafe link when creating", async () => {
    const row = await lib.createNotification({ tenantId: T2, title: "Link jahat", linkUrl: "javascript:alert(1)" });
    expect(row.linkUrl).toBeNull();
  });
});
