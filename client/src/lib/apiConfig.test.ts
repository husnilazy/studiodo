import { describe, expect, it } from "vitest";
import { defaultApiBaseUrl } from "./apiConfig";

const baked = "https://qr.studiodo.id/api/";

describe("defaultApiBaseUrl", () => {
  it("web pages call the server that served them, whatever domain that is", () => {
    expect(defaultApiBaseUrl("https:", baked)).toBe("/api");
    expect(defaultApiBaseUrl("http:", baked)).toBe("/api");
  });
  it("the installed app (file://) uses the baked cloud address", () => {
    expect(defaultApiBaseUrl("file:", baked)).toBe("https://qr.studiodo.id/api");
  });
  it("falls back to /api when nothing is baked in", () => {
    expect(defaultApiBaseUrl("file:", undefined)).toBe("/api");
  });
});
