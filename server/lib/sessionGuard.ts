import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { admins, creators, superadmins } from "../db/schema.js";
import { passwordBind } from "./emailTokens.js";

// Makes login tokens revocable. A JWT is stateless and valid for 12 hours, so by itself it survives a password change,
// a reset or a stolen laptop. Every token now carries `pv`, a short fingerprint of the account's CURRENT password hash;
// the auth middlewares compare it with the live hash. Changing or resetting the password changes the hash, which makes
// every token issued before it stop working — on the next request (this process) or within the cache TTL (any other).
//
// Tokens issued before this existed have no `pv`. They are still accepted so nobody is logged out the moment this ships;
// they expire on their own within 12 hours, after which every valid token is revocable.

export type Realm = "admin" | "superadmin" | "creator";

const CACHE_TTL_MS = 20_000;
const cache = new Map<string, { hash: string | null; expires: number }>();
const keyOf = (realm: Realm, id: string) => `${realm}:${id}`;

/** What goes into a new token: ties it to the password it was issued under. */
export const sessionVersion = (passwordHash: string) => passwordBind(passwordHash);

/** Pure: does a token's `pv` still match the account? A missing `pv` is a pre-revocation (legacy) token. */
export function versionMatches(tokenPv: string | undefined, currentHash: string | null): boolean {
  if (tokenPv === undefined) return true; // legacy token: accepted until it expires (see the header comment)
  return currentHash !== null && sessionVersion(currentHash) === tokenPv;
}

async function currentHash(realm: Realm, id: string): Promise<string | null> {
  const hit = cache.get(keyOf(realm, id));
  if (hit && hit.expires > Date.now()) return hit.hash;
  const rows =
    realm === "admin" ? await db.select({ h: admins.passwordHash }).from(admins).where(eq(admins.id, id))
    : realm === "superadmin" ? await db.select({ h: superadmins.passwordHash }).from(superadmins).where(eq(superadmins.id, id))
    : await db.select({ h: creators.passwordHash }).from(creators).where(eq(creators.id, id));
  const hash = rows[0]?.h ?? null;
  cache.set(keyOf(realm, id), { hash, expires: Date.now() + CACHE_TTL_MS });
  return hash;
}

/** True when this token may still be used. Legacy tokens (no `pv`) skip the database lookup entirely. */
export async function isSessionCurrent(realm: Realm, id: string, tokenPv: string | undefined): Promise<boolean> {
  if (tokenPv === undefined) return true;
  return versionMatches(tokenPv, await currentHash(realm, id));
}

/** Call right after a password changed so this process stops honouring old tokens immediately (not after the cache TTL). */
export function revokeSessions(realm: Realm, id: string) {
  cache.delete(keyOf(realm, id));
}

export function clearSessionCache() {
  cache.clear();
}
