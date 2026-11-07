import { describe, expect, it } from "vitest";
import { getExtension, saveUploadedFile } from "./storage.js";

describe("upload hardening", () => {
  it("keeps normal media extensions (any case)", () => {
    expect(getExtension("photo.JPG", ".jpg")).toBe(".jpg");
    expect(getExtension("clip.webm", ".mp4")).toBe(".webm");
  });
  it("never lets a client-chosen name store active content", () => {
    for (const name of ["x.html", "x.svg", "x.js", "x.php", "x", "x.html.jpg.exe"]) {
      expect([".jpg", ".png", ".webp", ".gif", ".mp4", ".webm"]).toContain(getExtension(name, ".jpg"));
    }
    expect(getExtension("x.html", ".html")).toBe(".jpg"); // even a bad fallback is neutralised
  });
  it("refuses SVG / HTML uploads with a readable message", async () => {
    for (const mimetype of ["image/svg+xml", "text/html", "application/xhtml+xml", "application/javascript"]) {
      await expect(saveUploadedFile("t", { buffer: Buffer.from("x"), originalname: "a.png", mimetype }, "branding")).rejects.toThrow(/SVG dan HTML tidak diizinkan/);
    }
  });
});
