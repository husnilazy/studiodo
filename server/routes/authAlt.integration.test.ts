import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import express from "express";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Passwordless tenant login (Google + email link) against real SQL (PGlite) and real HTTP. Google and Resend are stubbed:
// Google's keys are a throwaway RSA pair generated here. Skips itself when PGlite is not installed.

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

const T1 = "00000000-0000-0000-0000-0000000000f1";
const A1 = "00000000-0000-0000-0000-0000000000f2";
const CLIENT_ID = "test-client.apps.googleusercontent.com";

describe.skipIf(!PGlite)("passwordless tenant login (real SQL, real HTTP)", () => {
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let origin = "";
  let pg: InstanceType<NonNullable<typeof PGlite>>;
  const mails: { to: string; text: string }[] = [];
  const realFetch = globalThis.fetch;
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...(publicKey.export({ format: "jwk" }) as object), kid: "k1", alg: "RS256", use: "sig" };
  const idToken = (claims: object, key = privateKey) => jwt.sign({ iss: "https://accounts.google.com", aud: CLIENT_ID, email_verified: true, ...claims }, key, { algorithm: "RS256", keyid: "k1", expiresIn: 300 });
  let nextIdToken = "";

  const post = async (p: string, body: unknown, form = false) => {
    const res = await realFetch(`${origin}/api/auth${p}`, { method: "POST", headers: { "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json" }, body: form ? new URLSearchParams(body as Record<string, string>).toString() : JSON.stringify(body) });
    const text = await res.text();
    let json: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    try { json = JSON.parse(text); } catch { json = undefined; }
    return { status: res.status, json, text };
  };
  const get = async (p: string) => { const res = await realFetch(`${origin}/api/auth${p}`, { redirect: "manual" }); return { status: res.status, text: await res.text(), location: res.headers.get("location") }; };
  const pollOnce = (id: string, poll: string) => post(`/handoff/${id}/poll`, { poll });

  beforeAll(async () => {
    process.env.JWT_SECRET = "integration-test-secret";
    process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    process.env.RESEND_API_KEY = "re_test";
    process.env.PUBLIC_BASE_URL = "http://placeholder";
    pg = new PGlite!();
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
    const { authAltRouter } = await import("./authAlt.js");
    const app = express();
    app.use(express.json());
    app.use("/api/auth", authAltRouter);
    server = app.listen(0);
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    process.env.PUBLIC_BASE_URL = origin;
    vi.stubGlobal("fetch", async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.startsWith("https://www.googleapis.com/oauth3/")) throw new Error("unexpected");
      if (u === "https://www.googleapis.com/oauth2/v3/certs") return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
      if (u === "https://oauth2.googleapis.com/token") return new Response(JSON.stringify({ id_token: nextIdToken }), { status: 200 });
      if (u.startsWith("https://api.resend.com")) {
        const body = JSON.parse(String(init?.body));
        mails.push({ to: Array.isArray(body.to) ? body.to[0] : body.to, text: String(body.text ?? "") });
        return new Response(JSON.stringify({ id: "m1" }), { status: 200 });
      }
      return realFetch(url as string, init);
    });
  }, 120_000);

  afterAll(() => { vi.unstubAllGlobals(); server?.close(); holder.db = undefined; });

  it("tells the login screen what is available", async () => {
    const r = await realFetch(`${origin}/api/auth/providers`);
    expect(await r.json()).toMatchObject({ google: true, googleButton: true, magic: true, googleClientId: CLIENT_ID });
  });

  it("web button: a valid Google ID token for a registered email returns a normal admin token", async () => {
    const ok = await post("/google", { credential: idToken({ email: "Rina@Example.com", name: "Rina", sub: "1" }) });
    expect(ok.status).toBe(200);
    const { verifyAdminToken } = await import("../lib/jwt.js");
    expect(verifyAdminToken(ok.json.token)).toMatchObject({ adminId: A1, tenantId: T1 });
  });

  it("web button rejects unregistered emails, unverified emails, wrong audience, forged signatures", async () => {
    expect((await post("/google", { credential: idToken({ email: "stranger@example.com", sub: "2" }) })).status).toBe(404);
    expect((await post("/google", { credential: idToken({ email: "rina@example.com", email_verified: false, sub: "1" }) })).status).toBe(401);
    expect((await post("/google", { credential: idToken({ email: "rina@example.com", aud: "other-app", sub: "1" }) })).status).toBe(401);
    const attacker = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
    expect((await post("/google", { credential: idToken({ email: "rina@example.com", sub: "1" }, attacker) })).status).toBe(401);
    expect((await post("/google", { credential: "not-a-jwt" })).status).toBe(401);
  });

  it("app flow with Google: nothing is released until the person confirms, and the token is released once", async () => {
    const start = await post("/handoff/google", {});
    expect(start.status).toBe(201);
    const { id, poll, url } = start.json;
    expect(url).toContain(`/api/auth/google/start?h=${id}`);
    expect((await pollOnce(id, poll)).json.status).toBe("pending");
    expect((await pollOnce(id, "wrong-secret")).json.status).toBe("invalid");

    const redirect = await get(`/google/start?h=${id}`);
    expect(redirect.status).toBe(302);
    expect(redirect.location).toContain("accounts.google.com");
    expect(new URL(redirect.location!).searchParams.get("state")).toBe(id);

    nextIdToken = idToken({ email: "rina@example.com", sub: "1" });
    const callback = await get(`/google/callback?code=abc&state=${id}`);
    expect(callback.text).toContain("Ya, ini saya");
    expect((await pollOnce(id, poll)).json.status).toBe("verified"); // identity proven, but not approved yet
    const confirm = /name="c" value="([^"]+)"/.exec(callback.text)![1];
    expect((await post("/confirm", { h: id, c: "guess" }, true)).status).toBe(410);
    expect((await post("/confirm", { h: id, c: confirm }, true)).status).toBe(200);
    const done = await pollOnce(id, poll);
    expect(done.json.status).toBe("approved");
    expect(typeof done.json.token).toBe("string");
    expect((await pollOnce(id, poll)).json.status).toBe("invalid"); // single use
  });

  it("app flow with Google fails clearly for an unregistered Google account", async () => {
    const { id, poll } = (await post("/handoff/google", {})).json;
    nextIdToken = idToken({ email: "stranger@example.com", sub: "9" });
    const callback = await get(`/google/callback?code=abc&state=${id}`);
    expect(callback.status).toBe(400);
    expect(callback.text).toContain("belum terdaftar");
    expect((await pollOnce(id, poll)).json).toMatchObject({ status: "failed" });
  });

  it("email link: mails a link for a registered address, a mail scanner opening it logs nobody in, the click does", async () => {
    mails.length = 0;
    const { id, poll } = (await post("/handoff/magic", { email: "rina@example.com" })).json;
    await new Promise((r) => setTimeout(r, 150));
    expect(mails).toHaveLength(1);
    const link = /(http:\/\/\S+\/api\/auth\/magic\?\S+)/.exec(mails[0].text)![1];
    const opened = await get(link.replace(origin + "/api/auth", ""));
    expect(opened.text).toContain("Ya, ini saya");
    expect((await pollOnce(id, poll)).json.status).toBe("verified"); // opening alone is not approval
    const confirm = /name="c" value="([^"]+)"/.exec(opened.text)![1];
    expect((await post("/confirm", { h: id, c: confirm }, true)).status).toBe(200);
    expect((await pollOnce(id, poll)).json.status).toBe("approved");
    expect((await get(link.replace(origin + "/api/auth", ""))).status).toBe(410); // the link cannot be replayed
  });

  it("email link: unknown addresses get the same answer but no email, and a bad address is rejected", async () => {
    mails.length = 0;
    const r = await post("/handoff/magic", { email: "nobody@example.com" });
    expect(r.status).toBe(201);
    expect(typeof r.json.poll).toBe("string");
    await new Promise((res) => setTimeout(res, 150));
    expect(mails).toHaveLength(0);
    expect((await post("/handoff/magic", { email: "bukan-email" })).status).toBe(400);
  });

  it("caps how many email links one address can get per hour", async () => {
    mails.length = 0;
    for (let i = 0; i < 8; i++) await post("/handoff/magic", { email: "rina@example.com" });
    await new Promise((r) => setTimeout(r, 200));
    expect(mails.length).toBeLessThanOrEqual(5);
  });
});
