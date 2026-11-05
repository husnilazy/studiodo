import { sql } from "drizzle-orm";

/**
 * A JS Date as a parameter inside a hand-written sql`` fragment.
 *
 * Drizzle only knows how to serialise a Date when it is compared through a typed column helper (gte(col, date)). Inside a raw
 * sql`` template the Date reaches the driver untouched: PGlite (tests) accepts it, but the real `postgres` driver rejects it with
 * 'The "string" argument must be of type string … Received an instance of Date'. The columns are `timestamp` (no zone, stored as UTC),
 * so the value is sent as an ISO string and cast explicitly.
 */
export const ts = (date: Date) => sql`${date.toISOString()}::timestamp`;
