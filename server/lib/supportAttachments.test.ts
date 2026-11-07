import { describe, expect, it, vi } from "vitest";

vi.mock("./storageConfig.js", () => ({ getStorageSettings: async () => ({ driver: "r2", r2PublicBaseUrl: "https://files.example.com/" }) }));
vi.mock("../storage.js", () => ({ saveUploadedFile: async () => "x" }));

const { cleanAttachments, detectImageExtension, sendCsv } = await import("./supportAttachments.js");
const T = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-2222-3333-4444-555555555555";

describe("detectImageExtension", () => {
  it("recognises real images by their first bytes", () => {
    expect(detectImageExtension(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("jpg");
    expect(detectImageExtension(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]))).toBe("png");
    expect(detectImageExtension(Buffer.from("GIF89a000000"))).toBe("gif");
    expect(detectImageExtension(Buffer.from("RIFF0000WEBPVP8 "))).toBe("webp");
  });
  it("rejects html / svg / scripts renamed as images", () => {
    expect(detectImageExtension(Buffer.from("<svg onload=alert(1)></svg>"))).toBeNull();
    expect(detectImageExtension(Buffer.from("<html><script>alert(1)</script>"))).toBeNull();
    expect(detectImageExtension(Buffer.from("tiny"))).toBeNull();
  });
});

describe("cleanAttachments", () => {
  const ok = `https://files.example.com/pre/${T}/support/abcdefghijkl.png`;
  it("accepts files stored for this tenant (R2 or local)", async () => {
    expect(await cleanAttachments(T, [{ url: ok, name: "a.png" }])).toHaveLength(1);
    expect(await cleanAttachments(T, [{ url: `/storage/${T}/support/abcdefghijkl.jpg`, name: "b.jpg" }])).toHaveLength(1);
    expect(await cleanAttachments(T, undefined)).toEqual([]);
  });
  it("refuses other sites, other tenants, odd extensions, and too many files", async () => {
    expect(await cleanAttachments(T, [{ url: `https://evil.example.com/${T}/support/abcdefghijkl.png`, name: "x" }])).toBeNull();
    expect(await cleanAttachments(T, [{ url: `https://files.example.com/${OTHER}/support/abcdefghijkl.png`, name: "x" }])).toBeNull();
    expect(await cleanAttachments(T, [{ url: `https://files.example.com/${T}/support/abcdefghijkl.html`, name: "x" }])).toBeNull();
    expect(await cleanAttachments(T, [{ url: `${ok}?x=1`, name: "x" }])).toBeNull();
    expect(await cleanAttachments(T, Array.from({ length: 5 }, () => ({ url: ok, name: "a" })))).toBeNull();
    expect(await cleanAttachments(T, "nope")).toBeNull();
  });
});

describe("sendCsv", () => {
  it("neutralises spreadsheet formulas in tenant-written text", () => {
    let body = "";
    const res = { setHeader() {}, send: (b: string) => { body = b; } } as never;
    sendCsv(res, "x.csv", ["a"], [["=HYPERLINK(\"http://evil\")"], ["+1"], ["normal"]]);
    expect(body).toContain("'=HYPERLINK");
    expect(body).toContain("'+1");
    expect(body).toContain("normal");
  });
});
