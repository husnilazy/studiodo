import type { NextFunction, Request, Response } from "express";

// Which browser origins may call the API. It used to be `cors()` with no options: ANY website could read responses from
// this API in a visitor's browser. Tokens travel in headers (never cookies), so the damage was limited, but there is no
// reason to let strangers' pages talk to it.
//
// Allowed:
//  - no Origin header at all: servers, curl, the website's own server-side calls, payment-gateway webhooks
//  - "null": the packaged Electron app loads its UI from file:// and its origin is "null". Every protected route still needs
//    a token or a device-bound key, so this does not open anything by itself
//  - the website (PORTAL_BASE_URL, default https://www.studiodo.id), this API's own address (PUBLIC_BASE_URL), and
//    anything listed in CORS_ALLOWED_ORIGINS (comma separated)
//  - http://localhost and http://127.0.0.1 on any port (development, tools running on the same PC)

const DEFAULTS = ["https://www.studiodo.id"];
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

const clean = (v: string | undefined) => (v ?? "").trim().replace(/\/$/, "");

export function allowedOrigins(env: Record<string, string | undefined> = process.env): Set<string> {
  const set = new Set<string>(DEFAULTS);
  for (const v of [env.PORTAL_BASE_URL, env.PUBLIC_BASE_URL]) {
    const o = clean(v);
    if (/^https?:\/\/[^/]+$/.test(o)) set.add(o);
  }
  for (const v of String(env.CORS_ALLOWED_ORIGINS ?? "").split(",")) {
    const o = clean(v);
    if (o) set.add(o);
  }
  return set;
}

export function isAllowedOrigin(origin: string | undefined, env: Record<string, string | undefined> = process.env): boolean {
  if (!origin) return true;
  if (origin === "null") return true;
  if (LOCAL.test(origin)) return true;
  return allowedOrigins(env).has(origin.replace(/\/$/, ""));
}

/** `cors` options: reflect the origin only when it is allowed (a disallowed page gets no CORS headers, so its browser blocks the response). */
export const corsOptions = {
  origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
    callback(null, isAllowedOrigin(origin));
  },
  maxAge: 600,
};

/**
 * CORS only stops a page from READING a response; the request still reaches the server. For anything that changes data, a
 * browser request from a foreign origin is refused outright (a non-browser client sends no Origin, so it is unaffected).
 */
export function rejectForeignWrites(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (origin && !["GET", "HEAD", "OPTIONS"].includes(req.method) && !isAllowedOrigin(origin)) {
    return res.status(403).json({ error: "Asal permintaan tidak diizinkan", code: "origin_not_allowed" });
  }
  next();
}
