import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Real-SQL tests (PGlite, in memory, real migrations) for review/report rules. Skips when PGlite isn't installed.
const spec = process.env.PGLITE_MODULE ?? "@electric-sql/pglite";
let PGlite: (new () => { exec(sql: string): Promise<unknown>; query(sql: string): Promise<{ rows: Record<string, unknown>[] }> }) | null = null;
try {
  PGlite = ((await import(/* @vite-ignore */ spec)) as { PGlite: typeof PGlite }).PGlite;
} catch {
  PGlite = null;
}
const holder: { db?: unknown } = {};
vi.mock("../db/client.js", () => ({ get db() { return holder.db; }, client: { end: async () => undefined } }));

const T1 = "00000000-0000-0000-0000-0000000000a1";
const T2 = "00000000-0000-0000-0000-0000000000a2";
const M1 = "20000000-0000-0000-0000-000000000001";

describe.skipIf(!PGlite)("marketplace reviews & reports (real SQL)", () => {
  let pg: InstanceType<NonNullable<typeof PGlite>>;
  let lib: typeof import("./marketplaceFeedback.js");

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
    await pg.exec(`INSERT INTO tenants (id, name, slug) VALUES ('${T1}', 'Satu', 'satu'), ('${T2}', 'Dua', 'dua')`);
    await pg.exec(`INSERT INTO marketplace_templates (id, name, frame_image_url, slots, canvas_width, canvas_height) VALUES ('${M1}', 'Frame', 'https://x/y.png', '[]', 1200, 1800)`);
    // Tenant 1 installed it, tenant 2 did not.
    await pg.exec(`INSERT INTO templates (tenant_id, name, frame_image_url, slots, canvas_width, canvas_height, marketplace_template_id) VALUES ('${T1}', 'Frame', 'https://x/y.png', '[]', 1200, 1800, '${M1}')`);
    lib = await import("./marketplaceFeedback.js");
  });

  it("only an installing tenant can review, with a valid rating", async () => {
    expect((await lib.upsertReview(T2, M1, 5, "bagus")).ok).toBe(false);
    const r = await lib.upsertReview(T2, M1, 5, "bagus");
    expect(!r.ok && r.error).toBe("not_installed");
    const bad = await lib.upsertReview(T1, M1, 9, "");
    expect(!bad.ok && bad.error).toBe("invalid");
    expect((await lib.upsertReview(T1, M1, 4, "cantik")).ok).toBe(true);
  });

  it("re-reviewing edits the same review instead of adding another", async () => {
    await lib.upsertReview(T1, M1, 5, "update");
    const rows = (await pg.query("SELECT rating, comment FROM marketplace_reviews")).rows;
    expect(rows).toEqual([{ rating: 5, comment: "update" }]);
    const s = (await lib.ratingSummaries([M1])).get(M1);
    expect(s).toEqual({ average: 5, count: 1 });
  });

  it("hidden reviews drop out of the rating", async () => {
    const [{ id }] = (await pg.query("SELECT id FROM marketplace_reviews")).rows as { id: string }[];
    await lib.setReviewStatus(id, "hidden");
    expect((await lib.ratingSummaries([M1])).has(M1)).toBe(false);
  });

  it("a tenant can report once while the report is open; 'lainnya' needs a description", async () => {
    const bad = await lib.createReport(T2, M1, "lainnya", "x");
    expect(!bad.ok && bad.error).toBe("invalid");
    expect((await lib.createReport(T2, M1, "rusak", "")).ok).toBe(true);
    const dup = await lib.createReport(T2, M1, "hak_cipta", "");
    expect(!dup.ok && dup.error).toBe("duplicate");
  });

  it("resolving with 'hide' removes the template from the catalog and closes its open reports", async () => {
    await lib.createReport(T1, M1, "menyesatkan", "");
    const [{ id }] = (await pg.query("SELECT id FROM marketplace_reports WHERE tenant_id = '" + T2 + "'")).rows as { id: string }[];
    const r = await lib.resolveReport(id, "hide", "Melanggar hak cipta", "admin@x");
    expect(r.ok && r.value.closed).toBe(2);
    expect((await pg.query("SELECT active FROM marketplace_templates")).rows).toEqual([{ active: false }]);
    expect((await pg.query("SELECT count(*)::int AS n FROM marketplace_reports WHERE status = 'open'")).rows).toEqual([{ n: 0 }]);
    const again = await lib.resolveReport(id, "dismiss", "", null);
    expect(!again.ok && again.error).toBe("closed");
  });

  it("a hidden template can no longer be reviewed", async () => {
    const r = await lib.upsertReview(T1, M1, 5, "");
    expect(!r.ok && r.error).toBe("not_found");
  });
});
