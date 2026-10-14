import { describe, expect, it } from "vitest";
import { allowedOrigins, isAllowedOrigin, rejectForeignWrites } from "./cors.js";

const env = { PORTAL_BASE_URL: "https://www.studiodo.id/", PUBLIC_BASE_URL: "https://qr.studiodo.id", CORS_ALLOWED_ORIGINS: "https://partner.example, https://staging.studiodo.id/" };

describe("isAllowedOrigin", () => {
  it("allows non-browser callers, the Electron app, the website, the API itself and configured extras", () => {
    expect(isAllowedOrigin(undefined, env)).toBe(true);
    expect(isAllowedOrigin("null", env)).toBe(true);
    expect(isAllowedOrigin("https://www.studiodo.id", env)).toBe(true);
    expect(isAllowedOrigin("https://qr.studiodo.id", env)).toBe(true);
    expect(isAllowedOrigin("https://partner.example", env)).toBe(true);
    expect(isAllowedOrigin("https://staging.studiodo.id", env)).toBe(true);
    expect(isAllowedOrigin("http://localhost:5173", env)).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:3100", env)).toBe(true);
  });
  it("refuses everything else, including look-alikes", () => {
    for (const o of ["https://evil.example", "https://www.studiodo.id.evil.example", "http://www.studiodo.id", "https://studiodo.id", "http://localhost.evil.example", "https://localhost:5173", "http://evil.example:5173"]) {
      expect(isAllowedOrigin(o, env)).toBe(false);
    }
  });
  it("defaults to the website when nothing is configured", () => {
    expect([...allowedOrigins({})]).toEqual(["https://www.studiodo.id"]);
  });
});

describe("rejectForeignWrites", () => {
  const run = (method: string, origin?: string) => {
    let status = 200; let nexted = false;
    const res = { status(n: number) { status = n; return res; }, json() { return res; } };
    rejectForeignWrites({ method, headers: origin ? { origin } : {} } as never, res as never, () => { nexted = true; });
    return { status, nexted };
  };
  it("blocks a foreign page from changing data but lets it (CORS-blocked) read", () => {
    expect(run("POST", "https://evil.example")).toEqual({ status: 403, nexted: false });
    expect(run("DELETE", "https://evil.example").nexted).toBe(false);
    expect(run("GET", "https://evil.example").nexted).toBe(true);
    expect(run("OPTIONS", "https://evil.example").nexted).toBe(true);
  });
  it("never affects allowed origins or requests with no Origin (webhooks, server-to-server)", () => {
    expect(run("POST", "https://www.studiodo.id").nexted).toBe(true);
    expect(run("POST", "null").nexted).toBe(true);
    expect(run("POST").nexted).toBe(true);
  });
});
