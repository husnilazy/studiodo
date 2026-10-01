import type { Request } from "express";

// The server is reached through a Cloudflare Tunnel, so req.ip is always the local tunnel
// connector — every visitor looks identical and a per-IP limit becomes one global limit
// (five submissions an hour from anyone would lock out everyone). Cloudflare's edge sets
// CF-Connecting-IP to the real client on the public path and overwrites any client-supplied
// value, so on that path it can't be spoofed. Direct access on the LAN could send the header
// itself, which only lets someone on the LAN dodge an anti-abuse limit — acceptable here, and
// never use this for anything security-critical.
export function clientIp(req: Request): string {
  const cf = req.headers["cf-connecting-ip"];
  const value = Array.isArray(cf) ? cf[0] : cf;
  if (value && value.length <= 64) return value.trim();
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

/** Small in-memory sliding-window limiter (single process, like the login guards). Returns true when over the limit. */
export function makeRateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(key, recent);
    // Opportunistic cleanup so the map can't grow without bound.
    if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
    return recent.length > max;
  };
}
