import { describe, expect, it } from "vitest";
import { normalizeSignupMode, slugify, validateSignup } from "./instantSignup.js";

const good = { businessName: "Snap Corner Booth", ownerName: "Budi Santoso", email: "Budi@Example.com ", password: "rahasia-123", whatsapp: "0812-3456-7890", city: "Jogja", businessType: "studio", plan: "Starter", wantsToPay: true };

describe("validateSignup", () => {
  it("accepts a complete signup and normalises it", () => {
    const r = validateSignup(good);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ email: "budi@example.com", whatsapp: "081234567890", businessType: "studio", plan: "starter", wantsToPay: true });
  });
  it("rejects weak or odd input with a readable reason", () => {
    expect(validateSignup({ ...good, password: "short" })).toMatchObject({ ok: false });
    expect(validateSignup({ ...good, email: "not-an-email" })).toMatchObject({ ok: false });
    expect(validateSignup({ ...good, businessName: "A" })).toMatchObject({ ok: false });
    expect(validateSignup({ ...good, password: "budi@example.com" })).toMatchObject({ ok: false });
    expect(validateSignup({ ...good, whatsapp: "12" })).toMatchObject({ ok: false });
  });
  it("drops unknown business types and plan slugs with odd characters; wantsToPay must be literally true", () => {
    const r = validateSignup({ ...good, businessType: "hacker", plan: "<script>", wantsToPay: "true" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ businessType: null, plan: null, wantsToPay: false });
  });
});

describe("slugify / mode", () => {
  it("builds a url-safe slug", () => {
    expect(slugify("Snap Corner Booth!")).toBe("snap-corner-booth");
    expect(slugify("Fotobox Jogja & Co. ✨")).toBe("fotobox-jogja-co");
    expect(slugify("!!!")).toBe("booth");
    expect(slugify("é à ü")).toBe("e-a-u");
  });
  it("only 'instant' turns instant sign-up on (anything else is the review queue)", () => {
    expect(normalizeSignupMode("instant")).toBe("instant");
    expect(normalizeSignupMode("application")).toBe("application");
    expect(normalizeSignupMode(undefined)).toBe("application");
    expect(normalizeSignupMode("INSTANT")).toBe("application");
  });
});
