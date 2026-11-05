import { afterEach, describe, expect, it } from "vitest";
import { appBaseUrl } from "./urls.js";

const saved = { app: process.env.APP_BASE_URL, pub: process.env.PUBLIC_BASE_URL, portal: process.env.PORTAL_BASE_URL };
afterEach(() => {
  for (const [key, value] of [["APP_BASE_URL", saved.app], ["PUBLIC_BASE_URL", saved.pub], ["PORTAL_BASE_URL", saved.portal]] as const) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

describe("appBaseUrl", () => {
  it("prefers APP_BASE_URL, so link pages stay off the photo-download domain", () => {
    process.env.APP_BASE_URL = "https://app.studiodo.id/";
    process.env.PUBLIC_BASE_URL = "https://qr.studiodo.id";
    expect(appBaseUrl()).toBe("https://app.studiodo.id");
  });
  it("falls back to PUBLIC_BASE_URL, then the website", () => {
    delete process.env.APP_BASE_URL;
    process.env.PUBLIC_BASE_URL = "https://qr.studiodo.id";
    expect(appBaseUrl()).toBe("https://qr.studiodo.id");
    delete process.env.PUBLIC_BASE_URL;
    delete process.env.PORTAL_BASE_URL;
    expect(appBaseUrl()).toBe("https://www.studiodo.id");
  });
});
