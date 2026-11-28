import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import cors from "cors";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { corsOptions, rejectForeignWrites } from "../lib/cors.js";

// "Luncurkan di HP" end to end against real SQL (PGlite), real HTTP and the real CORS rules: the PC app (Origin "null") makes a
// link on APP_BASE_URL, and the phone page on that domain trades it for a session. Skips itself when PGlite is not installed.

const spec = process.env.PGLITE_MODULE ?? "@electric-sql/pglite";
let PGlite: (new () => { exec(sql: string): Promise<unknown> }) | null = null;
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

const T1 = "00000000-0000-0000-0000-0000000000f1";
const A1 = "00000000-0000-0000-0000-0000000000f2";
const PANEL = "https://panel.example.id";

describe.skipIf(!PGlite)("Luncurkan di HP (real SQL, real HTTP, real CORS)", () => {
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let origin = "";
  let adminToken = "";
  const saved = { ...process.env };

  const post = async (p: string, from: string, body: unknown, token?: string) => {
    const res = await fetch(`${origin}/api/auth${p}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: from, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    return { status: res.status, allow: res.headers.get("access-control-allow-origin"), json: (await res.json()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = "integration-test-secret";
    process.env.APP_BASE_URL = PANEL;
    process.env.PUBLIC_BASE_URL = "https://qr.example.id";
    const pg = new PGlite!();
    const dir = path.resolve(__dirname, "../db/migrations");
    const journal = JSON.parse(fs.readFileSync(path.join(dir, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
    for (const { tag } of journal.entries) for (const stmt of fs.readFileSync(path.join(dir, `${tag}.sql`), "utf8").split("--> statement-breakpoint")) if (stmt.trim()) await pg.exec(stmt);
    const { drizzle } = await import("drizzle-orm/pglite");
    const schema = await import("../db/schema.js");
    holder.db = drizzle(pg as never, { schema });
    await pg.exec(`
      INSERT INTO platform_settings (default_trial_days) VALUES (7);
      INSERT INTO tenants (id, name, slug) VALUES ('${T1}', 'Studio Satu', 'satu');
      INSERT INTO admins (id, tenant_id, email, password_hash) VALUES ('${A1}', '${T1}', 'rina@example.com', 'x');
    `);
    const { authRouter } = await import("./auth.js");
    const { authAltRouter } = await import("./authAlt.js");
    const { signAdminToken } = await import("../lib/jwt.js");
    const { sessionVersion } = await import("../lib/sessionGuard.js");
    adminToken = signAdminToken({ adminId: A1, tenantId: T1, pv: sessionVersion("x") });
    const app = express();
    app.use(cors(corsOptions));
    app.use(rejectForeignWrites);
    app.use(express.json());
    app.use("/api/auth", authRouter);
    app.use("/api/auth", authAltRouter);
    server = app.listen(0);
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 120_000);

  afterAll(() => { server?.close(); holder.db = undefined; process.env = saved; });

  it("the PC app makes a link, and the phone page on that domain trades it for a session exactly once", async () => {
    const made = await post("/phone-link", "null", {}, adminToken);
    expect(made.status).toBe(201);
    expect(made.json.url.startsWith(`${PANEL}/#/hp/`)).toBe(true);
    const code = made.json.url.split("#/hp/")[1];

    const phoneOrigin = new URL(made.json.url).origin;
    const redeemed = await post("/phone-link/redeem", phoneOrigin, { code });
    expect(redeemed.status).toBe(200);
    expect(redeemed.allow).toBe(PANEL);
    const me = await fetch(`${origin}/api/auth/me`, { headers: { Authorization: `Bearer ${redeemed.json.token}`, Origin: PANEL } });
    expect(me.status).toBe(200);

    expect((await post("/phone-link/redeem", phoneOrigin, { code })).status).toBe(400);
  });

  it("still refuses a stranger's page", async () => {
    const refused = await post("/phone-link/redeem", "https://evil.example", { code: "x.y" });
    expect(refused.status).toBe(403);
    expect(refused.allow).toBeNull();
  });
});
