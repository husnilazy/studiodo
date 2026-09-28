import type { NextFunction, Request, Response } from "express";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Register via `router.param(paramName, validateUuidParam(notFoundMessage))`.
 * A malformed id (a stale nanoid-style link from before the Postgres
 * migration, a bad guess, etc.) would otherwise reach the DB as a raw
 * `eq(column, "...")` and Postgres throws a type-cast error on the
 * malformed uuid literal — a generic 500 — instead of the clean 404 this
 * actually is.
 */
export function validateUuidParam(notFoundMessage = "Data tidak ditemukan") {
  return (req: Request, res: Response, next: NextFunction, value: string) => {
    if (!UUID_PATTERN.test(String(value))) {
      return res.status(404).json({ error: notFoundMessage });
    }
    next();
  };
}
