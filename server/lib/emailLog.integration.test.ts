import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Every sendMail attempt is recorded (sent / failed / skipped) without the body; old rows are pruned. Needs PGlite.
const spec = process.env.PGLITE_MODULE ?? "@electric-sql/pglite";
let PGlite: (new () => { exec(sql: string): Promise<unknown>; query(sql: string): Promise<{ rows: Record<string, unknown>[] }> }) | null = null;
try {
  PGlite = ((await import(/* @vite-ignore */ spec)) as { PGlite: typeof PGlite }).PGlite;
} catch {
  PGlite = null;
}
const holder: { db?: unknown } = {};
vi.mock("../db/client.js", () => ({ get db() { return holder.db; }, client: { end: async () => undefined } }));

describe.skipIf(!PGlite)("email log (real SQL, fetch stubbed)", () => {
  let pg: InstanceType<NonNullable<typeof PGlite>>;
  let mailer: typeof import("./mailer.js");
  let log: typeof import("./emailLog.js");
  const realFetch = globalThis.fetch;
  let respond: () => Response = () => new Response("{}", { status: 200 });

  beforeAll(async () => {
    process.env.JWT_SECRET = "integration-test-secret";
    globalThis.fetch = vi.fn(async () => respond()) as typeof fetch;
    pg = new PGlite!();
    const dir = path.resolve(__dirname, "../db/migrations");
    const journal = JSON.parse(fs.readFileSync(path.join(dir, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
    for (const { tag } of journal.entries) {
      for (const stmt of fs.readFileSync(path.join(dir, `${tag}.sql`), "utf8").split("--> statement-breakpoint")) if (stmt.trim()) await pg.exec(stmt);
    }
    const { drizzle } = await import("drizzle-orm/pglite");
    holder.db = drizzle(pg as never, { schema: await import("../db/schema.js") });
    mailer = await import("./mailer.js");
    log = await import("./emailLog.js");
  });
  afterAll(() => { globalThis.fetch = realFetch; delete process.env.RESEND_API_KEY; });

  const mail = { to: "a@x.com", subject: "Halo", html: "<p>RAHASIA-ISI</p>", text: "RAHASIA-ISI" };

  it("records a skipped send when there is no API key", async () => {
    delete process.env.RESEND_API_KEY;
    const r = await mailer.sendMail(mail, { kind: "tes" });
    expect(r.sent).toBe(false);
    const rows = (await pg.query("SELECT status, kind, error FROM email_log")).rows;
    expect(rows).toEqual([{ status: "skipped", kind: "tes", error: "RESEND_API_KEY belum diisi" }]);
  });

  it("records sent and failed sends, and never stores the body", async () => {
    process.env.RESEND_API_KEY = "k";
    expect((await mailer.sendMail(mail, { kind: "ok" })).sent).toBe(true);
    respond = () => new Response("domain not verified", { status: 403 });
    expect((await mailer.sendMail({ ...mail, to: "b@x.com" }, { kind: "gagal" })).sent).toBe(false);
    const rows = (await pg.query("SELECT to_email, status, error FROM email_log ORDER BY created_at, to_email")).rows as { to_email: string; status: string; error: string | null }[];
    expect(rows.map((r) => r.status).sort()).toEqual(["failed", "sent", "skipped"]);
    expect(rows.find((r) => r.status === "failed")?.error).toContain("403");
    expect(JSON.stringify((await pg.query("SELECT * FROM email_log")).rows)).not.toContain("RAHASIA-ISI");
  });

  it("summarises the last 7 days and filters the list", async () => {
    const s = await log.emailLogSummary();
    expect(s.last7Days).toEqual({ sent: 1, failed: 1, skipped: 1 });
    expect(s.configured).toBe(true);
    expect((await log.listEmailLog({ status: "failed" })).map((r) => r.toEmail)).toEqual(["b@x.com"]);
    expect((await log.listEmailLog({ q: "a@x" })).length).toBe(2);
    expect((await log.listEmailLog({})).length).toBe(3);
  });

  it("prunes rows older than 90 days only", async () => {
    await pg.exec(`INSERT INTO email_log (to_email, subject, status, created_at) VALUES ('old@x.com', 'lama', 'sent', now() - interval '120 days')`);
    expect(await log.pruneEmailLog()).toBe(1);
    expect((await log.listEmailLog({})).length).toBe(3);
  });
});
