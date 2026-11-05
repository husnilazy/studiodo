import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// WhatsApp to existing tenants (manual composer + automatic renewal reminders) against real SQL (PGlite) and real HTTP/JWT.
// The gateway is a stub that records what would have been sent. Skips itself when PGlite is not installed.

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

const T1 = "00000000-0000-0000-0000-0000000000e1"; // trial ending in ~2 days, has WhatsApp
const T2 = "00000000-0000-0000-0000-0000000000e2"; // paid, healthy
const T3 = "00000000-0000-0000-0000-0000000000e3"; // expired yesterday, NO WhatsApp number
const OWNER = "00000000-0000-0000-0000-0000000000c9";

describe.skipIf(!PGlite)("tenant WhatsApp (real SQL, real HTTP)", () => {
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let origin = "";
  let owner = "";
  let pg: InstanceType<NonNullable<typeof PGlite>>;
  const sent: { target: string; message: string }[] = [];
  const realFetch = globalThis.fetch;
  const adm = async (method: string, p: string, body?: unknown) => {
    const res = await realFetch(`${origin}/api/superadmin${p}`, { method, headers: { Authorization: `Bearer ${owner}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    try { json = JSON.parse(text); } catch { json = undefined; }
    return { status: res.status, json };
  };
  const settle = () => new Promise((r) => setTimeout(r, 150)); // logEvent is fire-and-forget
  const NOON_WIB = () => new Date(new Date().toISOString().slice(0, 10) + "T05:00:00Z");

  beforeAll(async () => {
    process.env.JWT_SECRET = "integration-test-secret";
    pg = new PGlite!();
    const dir = path.resolve(__dirname, "../db/migrations");
    const journal = JSON.parse(fs.readFileSync(path.join(dir, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
    for (const { tag } of journal.entries) for (const stmt of fs.readFileSync(path.join(dir, `${tag}.sql`), "utf8").split("--> statement-breakpoint")) if (stmt.trim()) await pg.exec(stmt);
    const { drizzle } = await import("drizzle-orm/pglite");
    const schema = await import("../db/schema.js");
    holder.db = drizzle(pg as never, { schema });
    const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
    await pg.exec(`
      INSERT INTO platform_settings (default_trial_days) VALUES (7);
      INSERT INTO tenants (id, name, slug, owner_name, owner_whatsapp) VALUES
        ('${T1}', 'Studio Satu', 'satu', 'Rina Wulandari', '081234567890'),
        ('${T2}', 'Studio Dua', 'dua', 'Budi', '081111111111'),
        ('${T3}', 'Studio Tiga', 'tiga', 'Cici', NULL);
      INSERT INTO kiosk_keys (tenant_id, key_hash, license_type, license_ends_at) VALUES
        ('${T1}', 'h1', 'trial', '${day(2)}'),
        ('${T2}', 'h2', 'paid', '${day(60)}'),
        ('${T3}', 'h3', 'paid', '${day(-1)}');
      INSERT INTO superadmins (id, email, password_hash, role) VALUES ('${OWNER}', 'owner@studiodo.id', 'x', 'owner');
    `);
    const { superadminRouter } = await import("./superadmin.js");
    const { signSuperadminToken } = await import("../lib/jwt.js");
    owner = signSuperadminToken({ superadminId: OWNER });
    const app = express();
    app.use(express.json());
    app.use("/api/superadmin", superadminRouter);
    server = app.listen(0);
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    vi.stubGlobal("fetch", async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).startsWith("https://api.fonnte.com")) {
        const form = new URLSearchParams(String(init?.body));
        sent.push({ target: form.get("target")!, message: form.get("message")! });
        return new Response(JSON.stringify({ status: true, id: ["1"] }), { status: 200 });
      }
      return realFetch(url as string, init);
    });
  }, 120_000);

  afterAll(() => { vi.unstubAllGlobals(); server?.close(); holder.db = undefined; });

  it("builds a filled-in composer for the tenant, with the right template suggested by licence state", async () => {
    const r = await adm("GET", `/tenant-wa/${T1}`);
    expect(r.status).toBe(200);
    expect(r.json.phone).toBe("6281234567890");
    expect(r.json.gateway).toBe(false);
    expect(r.json.licenceStage).toBe("d3");
    const expiring = r.json.templates.find((t: { key: string }) => t.key === "expiring");
    expect(expiring.text).toContain("Rina");
    expect(expiring.text).toContain("Studio Satu");
    expect(expiring.missing).toEqual([]);
    expect(expiring.waLink).toContain("https://wa.me/6281234567890");
    expect((await adm("GET", "/tenant-wa/not-a-uuid")).status).toBe(404);
  });

  it("manual wa.me sends are only logged; gateway sends need a gateway and a valid number", async () => {
    expect((await adm("POST", `/tenant-wa/${T1}/send`, { text: "  " })).status).toBe(400);
    expect((await adm("POST", `/tenant-wa/${T3}/send`, { text: "halo", mode: "manual" })).status).toBe(400); // no number
    expect((await adm("POST", `/tenant-wa/${T1}/send`, { text: "halo", mode: "gateway" })).status).toBe(409); // no gateway yet
    expect((await adm("POST", `/tenant-wa/${T1}/send`, { text: "Halo Rina, dibuka manual", mode: "manual" })).status).toBe(201);
    await settle();
    const history = (await adm("GET", `/tenant-wa/${T1}`)).json.history;
    expect(history[0]).toMatchObject({ action: "tenant.wa", actor: "owner@studiodo.id" });
    expect(history[0].metadata.via).toBe("wa.me");
    expect(sent).toHaveLength(0);
  });

  it("sends through the gateway once it is configured, and logs it", async () => {
    await adm("PUT", "/leads/settings/all", { whatsapp: { provider: "fonnte", token: "fonnte-token-123456" } });
    expect((await adm("POST", `/tenant-wa/${T1}/send`, { text: "Halo Rina, lewat gateway", mode: "gateway" })).status).toBe(201);
    expect(sent.at(-1)).toMatchObject({ target: "6281234567890", message: "Halo Rina, lewat gateway" });
    await settle();
    expect((await adm("GET", `/tenant-wa/${T1}`)).json.history.some((h: { action: string; metadata: { via: string } }) => h.action === "tenant.wa" && h.metadata.via === "gateway")).toBe(true);
  });

  it("shows the reminder queue, and sends nothing automatically until the owner switches it on", async () => {
    const { runTenantWaReminders } = await import("../lib/tenantWhatsapp.js");
    const overview = (await adm("GET", "/tenant-wa/overview")).json;
    expect(overview.auto.enabled).toBe(false);
    expect(overview.gateway).toBe(true);
    expect(overview.upcoming.map((u: { name: string }) => u.name).sort()).toEqual(["Studio Satu", "Studio Tiga"]);
    expect(overview.upcoming.find((u: { name: string }) => u.name === "Studio Tiga")).toMatchObject({ stage: "expired", phone: null, sent: false });
    const before = sent.length;
    expect(await runTenantWaReminders(NOON_WIB())).toBe(0);
    expect(sent).toHaveLength(before);
  });

  it("automatic reminders: only inside sending hours, once per stage, skipping tenants without a number", async () => {
    const { runTenantWaReminders } = await import("../lib/tenantWhatsapp.js");
    expect((await adm("PUT", "/tenant-wa/auto", { enabled: true, stages: ["d7", "d3", "d1", "expired"] })).status).toBe(200);
    const before = sent.length;
    expect(await runTenantWaReminders(new Date(new Date().toISOString().slice(0, 10) + "T18:00:00Z"))).toBe(0); // 01:00 WIB
    expect(await runTenantWaReminders(NOON_WIB())).toBe(1); // Studio Satu only: Studio Tiga has no number, Studio Dua is healthy
    expect(sent).toHaveLength(before + 1);
    expect(sent.at(-1)!.target).toBe("6281234567890");
    expect(sent.at(-1)!.message).toContain("Studio Satu");
    await settle();
    expect(await runTenantWaReminders(NOON_WIB())).toBe(0); // already sent for this stage → not again
    const overview = (await adm("GET", "/tenant-wa/overview")).json;
    expect(overview.upcoming.find((u: { name: string }) => u.name === "Studio Satu").sent).toBe(true);
    const history = (await adm("GET", `/tenant-wa/${T1}`)).json.history;
    expect(history.some((h: { action: string }) => h.action === "tenant.wa.auto")).toBe(true);
  });
});
