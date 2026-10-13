import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Real-SQL tests for the email links: verifying an address and the single-use password reset. Skips without PGlite.
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
const APP = "30000000-0000-0000-0000-000000000001";
const SUB = "30000000-0000-0000-0000-000000000002";
const ADMIN = "40000000-0000-0000-0000-000000000001";
const CREATOR = "50000000-0000-0000-0000-000000000001";

describe.skipIf(!PGlite)("account email links (real SQL)", () => {
  let pg: InstanceType<NonNullable<typeof PGlite>>;
  let lib: typeof import("./accountEmail.js");
  let tokens: typeof import("./emailTokens.js");
  let hashOf: (id: string, table: "admins" | "creators") => Promise<string>;

  beforeAll(async () => {
    process.env.JWT_SECRET = "integration-test-secret";
    delete process.env.RESEND_API_KEY; // never send for real
    pg = new PGlite!();
    const dir = path.resolve(__dirname, "../db/migrations");
    const journal = JSON.parse(fs.readFileSync(path.join(dir, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
    for (const { tag } of journal.entries) {
      for (const stmt of fs.readFileSync(path.join(dir, `${tag}.sql`), "utf8").split("--> statement-breakpoint")) if (stmt.trim()) await pg.exec(stmt);
    }
    const { drizzle } = await import("drizzle-orm/pglite");
    holder.db = drizzle(pg as never, { schema: await import("../db/schema.js") });
    const { hashPassword } = await import("./passwordHash.js");
    await pg.exec(`INSERT INTO tenants (id, name, slug, owner_name) VALUES ('${T1}', 'Satu', 'satu', 'Budi')`);
    await pg.exec(`INSERT INTO admins (id, tenant_id, email, password_hash) VALUES ('${ADMIN}', '${T1}', 'budi@x.com', '${hashPassword("passwordlama1")}')`);
    await pg.exec(`INSERT INTO creators (id, name, email, password_hash) VALUES ('${CREATOR}', 'Aruna', 'aruna@x.com', '${hashPassword("passwordlama1")}')`);
    await pg.exec(`INSERT INTO tenant_applications (id, business_name, owner_name, owner_email) VALUES ('${APP}', 'Snap', 'Budi', 'Budi@X.com')`);
    await pg.exec(`INSERT INTO creator_submissions (id, name, email, portfolio_url) VALUES ('${SUB}', 'Aruna', 'aruna@x.com', 'https://x.com')`);
    lib = await import("./accountEmail.js");
    tokens = await import("./emailTokens.js");
    hashOf = async (id, table) => ((await pg.query(`SELECT password_hash AS h FROM ${table} WHERE id = '${id}'`)).rows[0] as { h: string }).h;
  });

  it("verifies an application's email once, case-insensitively, and rejects a wrong id or purpose", async () => {
    const token = tokens.signEmailToken("verify-tenant", APP, "budi@x.com", 60_000);
    expect((await lib.verifyEmail("tenant", "30000000-0000-0000-0000-00000000ffff", token)).ok).toBe(false);
    expect((await lib.verifyEmail("creator", APP, token)).ok).toBe(false);
    expect((await lib.verifyEmail("tenant", APP, token)).ok).toBe(true);
    expect((await pg.query(`SELECT email_verified_at IS NOT NULL AS v FROM tenant_applications WHERE id = '${APP}'`)).rows).toEqual([{ v: true }]);
    expect((await lib.verifyEmail("tenant", APP, token)).ok).toBe(true); // idempotent
  });

  it("a verification token for an old address stops working once the address on file differs", async () => {
    const stale = tokens.signEmailToken("verify-creator", SUB, "old@x.com", 60_000);
    const r = await lib.verifyEmail("creator", SUB, stale);
    expect(!r.ok && r.error).toBe("invalid");
    expect((await lib.verifyEmail("creator", SUB, tokens.signEmailToken("verify-creator", SUB, "aruna@x.com", 60_000))).ok).toBe(true);
  });

  it("a reset link sets the new password exactly once", async () => {
    const { verifyPassword } = await import("./passwordHash.js");
    const token = tokens.signEmailToken("reset-tenant", ADMIN, tokens.passwordBind(await hashOf(ADMIN, "admins")), 60_000);
    expect((await lib.confirmPasswordReset("tenant", token, "short")).ok).toBe(false);
    expect((await lib.confirmPasswordReset("tenant", token, "passwordbaru1")).ok).toBe(true);
    expect(verifyPassword("passwordbaru1", await hashOf(ADMIN, "admins"))).toBe(true);
    const again = await lib.confirmPasswordReset("tenant", token, "passwordlain2");
    expect(!again.ok && again.error).toBe("used");
  });

  it("an expired reset link is refused and a creator token cannot reset a tenant", async () => {
    const hash = await hashOf(CREATOR, "creators");
    const expired = tokens.signEmailToken("reset-creator", CREATOR, tokens.passwordBind(hash), 1000, 1);
    const r = await lib.confirmPasswordReset("creator", expired, "passwordbaru1");
    expect(!r.ok && r.error).toBe("expired");
    const fine = tokens.signEmailToken("reset-creator", CREATOR, tokens.passwordBind(hash), 60_000);
    const cross = await lib.confirmPasswordReset("tenant", fine, "passwordbaru1");
    expect(cross.ok).toBe(false);
    expect((await lib.confirmPasswordReset("creator", fine, "passwordbaru1")).ok).toBe(true);
  });

  it("requesting a reset for an unknown address is silent and sends nothing", async () => {
    await expect(lib.requestPasswordReset("tenant", "nobody@x.com")).resolves.toBeUndefined();
    await expect(lib.requestPasswordReset("tenant", "budi@x.com")).resolves.toBeUndefined(); // no API key: skipped, no throw
  });
});
