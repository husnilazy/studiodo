import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanPrefsPatch, resolvePrefs } from "./emailPrefs.js";

// Pure rules always run; the DB part (unsubscribe link → preference → delivery) needs PGlite, otherwise it skips.
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
const CREATOR = "50000000-0000-0000-0000-000000000001";

describe("email preference rules", () => {
  it("everything is on by default and unknown keys are ignored", () => {
    expect(resolvePrefs("tenant", {})).toEqual({ subscription: true, receipts: true });
    expect(resolvePrefs("tenant", { receipts: false, bogus: false })).toEqual({ subscription: true, receipts: false });
  });
  it("a patch keeps only known boolean categories", () => {
    expect(cleanPrefsPatch("tenant", { subscription: false, receipts: "no", password: false })).toEqual({ subscription: false });
    expect(cleanPrefsPatch("creator", { reviews: true, submitted: false })).toEqual({ reviews: true, submitted: false });
    expect(cleanPrefsPatch("tenant", { password: false })).toBeNull();
    expect(cleanPrefsPatch("tenant", null)).toBeNull();
  });
});

describe.skipIf(!PGlite)("email preferences end to end (real SQL, fetch stubbed)", () => {
  const sent: { to: string[]; html: string; text: string; headers?: Record<string, string> }[] = [];
  let lib: typeof import("./emailPrefs.js");
  let emails: typeof import("./emails.js");
  let tokens: typeof import("./emailTokens.js");
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    process.env.JWT_SECRET = "integration-test-secret";
    process.env.RESEND_API_KEY = "test-key";
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => { sent.push(JSON.parse(String(init?.body))); return new Response("{}", { status: 200 }); }) as typeof fetch;
    const pg = new PGlite!();
    const dir = path.resolve(__dirname, "../db/migrations");
    const journal = JSON.parse(fs.readFileSync(path.join(dir, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
    for (const { tag } of journal.entries) {
      for (const stmt of fs.readFileSync(path.join(dir, `${tag}.sql`), "utf8").split("--> statement-breakpoint")) if (stmt.trim()) await pg.exec(stmt);
    }
    const { drizzle } = await import("drizzle-orm/pglite");
    holder.db = drizzle(pg as never, { schema: await import("../db/schema.js") });
    await pg.exec(`INSERT INTO tenants (id, name, slug) VALUES ('${T1}', 'Satu', 'satu')`);
    await pg.exec(`INSERT INTO admins (tenant_id, email, password_hash) VALUES ('${T1}', 'budi@x.com', 'h')`);
    await pg.exec(`INSERT INTO creators (id, name, email, password_hash) VALUES ('${CREATOR}', 'Aruna', 'aruna@x.com', 'h')`);
    lib = await import("./emailPrefs.js");
    emails = await import("./emails.js");
    tokens = await import("./emailTokens.js");
  });
  afterAll(() => { globalThis.fetch = realFetch; delete process.env.RESEND_API_KEY; });

  const mail = { subject: "Tes", html: "<html><body><table><tr><td><table><tr><td>isi</td></tr></table></td></tr></table></body></html>", text: "isi" };
  const cat = { key: "receipts", label: "Kuitansi pembayaran" };

  it("an optional mail carries an unsubscribe link + header; mandatory mail does not", async () => {
    await emails.deliverToTenant(T1, mail, "tes", cat);
    expect(sent).toHaveLength(1);
    expect(sent[0].headers?.["List-Unsubscribe"]).toMatch(/berhenti-langganan\?token=/);
    expect(sent[0].text).toContain("Berhenti menerima email");
    await emails.deliverToTenant(T1, mail, "wajib");
    expect(sent).toHaveLength(2);
    expect(sent[1].headers).toBeUndefined();
  });

  it("using the unsubscribe token switches the category off and later mail is skipped", async () => {
    const token = new URL(sent[0].headers!["List-Unsubscribe"].slice(1, -1)).searchParams.get("token")!;
    expect(lib.describeUnsubscribe(token)).toMatchObject({ ok: true, category: "receipts", realm: "tenant" });
    const r = await lib.applyUnsubscribe(token);
    expect(r.ok).toBe(true);
    expect(await lib.getPrefs("tenant", T1)).toEqual({ subscription: true, receipts: false });
    const before = sent.length;
    await emails.deliverToTenant(T1, mail, "tes", cat); // receipts off → skipped
    expect(sent).toHaveLength(before);
    await emails.deliverToTenant(T1, mail, "tes", { key: "subscription", label: "Pengingat langganan" }); // other category still on
    expect(sent).toHaveLength(before + 1);
    await emails.deliverToTenant(T1, mail, "wajib"); // mandatory mail ignores preferences
    expect(sent).toHaveLength(before + 2);
  });

  it("creators: preference is honoured and a tenant token cannot switch a creator's mail", async () => {
    await lib.setPrefs("creator", CREATOR, { reviews: false });
    const before = sent.length;
    await emails.deliverToCreator(CREATOR, mail, "ulasan", { key: "reviews", label: "Ulasan baru" });
    expect(sent).toHaveLength(before);
    await emails.deliverToCreator(CREATOR, mail, "dikirim", { key: "submitted", label: "Konfirmasi template diterima" });
    expect(sent).toHaveLength(before + 1);
    const wrong = tokens.signEmailToken("unsub-tenant", CREATOR, "submitted", 60_000); // tenant realm, creator id, creator-only category
    expect((await lib.applyUnsubscribe(wrong)).ok).toBe(false);
  });

  it("garbage or expired unsubscribe tokens are refused", async () => {
    expect((await lib.applyUnsubscribe("nonsense")).ok).toBe(false);
    const expired = tokens.signEmailToken("unsub-tenant", T1, "subscription", 1000, 1);
    expect((await lib.applyUnsubscribe(expired)).ok).toBe(false);
  });
});
