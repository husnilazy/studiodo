import { describe, expect, it } from "vitest";
import { contactKeyOf, fillTemplate, isContactKey, normalizeEmail, normalizeWhatsapp, waLink } from "./crm.js";
import { boothState, sessionStage, startOfTodayWib } from "./live.js";

describe("normalizeWhatsapp", () => {
  it("treats every way of writing the same Indonesian number as one number", () => {
    for (const raw of ["0812-3456-7890", "+62 812 3456 7890", "6281234567890", "81234567890", " (0812) 3456.7890 "]) {
      expect(normalizeWhatsapp(raw)).toBe("6281234567890");
    }
  });
  it("keeps numbers from other countries and rejects junk", () => {
    expect(normalizeWhatsapp("+65 9123 4567")).toBe("6591234567");
    expect(normalizeWhatsapp("12345")).toBeNull();
    expect(normalizeWhatsapp("")).toBeNull();
    expect(normalizeWhatsapp(null)).toBeNull();
    expect(normalizeWhatsapp("1".repeat(20))).toBeNull();
  });
});

describe("contactKeyOf", () => {
  it("prefers the WhatsApp number, falls back to a lower-cased email", () => {
    expect(contactKeyOf("0812 3456 7890", "A@b.co")).toBe("wa:6281234567890");
    expect(contactKeyOf(null, " Rina@Mail.COM ")).toBe("em:rina@mail.com");
    expect(contactKeyOf("abc", "not-an-email")).toBeNull();
  });
  it("only accepts well-formed keys from the outside", () => {
    expect(isContactKey("wa:6281234567890")).toBe(true);
    expect(isContactKey("em:rina@mail.com")).toBe(true);
    expect(isContactKey("wa:12")).toBe(false);
    expect(isContactKey("'; drop table")).toBe(false);
  });
  it("normalizeEmail rejects non-emails", () => {
    expect(normalizeEmail("x@y")).toBeNull();
  });
});

describe("waLink / fillTemplate", () => {
  it("builds a click-to-chat link with an encoded message", () => {
    expect(waLink("6281234567890")).toBe("https://wa.me/6281234567890");
    expect(waLink("6281", "Halo kak & terima kasih")).toBe("https://wa.me/6281?text=Halo%20kak%20%26%20terima%20kasih");
  });
  it("fills placeholders and falls back to neutral words", () => {
    expect(fillTemplate("Halo {nama}, dari {brand}: {link}", { nama: "Rina", brand: "Studio X", link: "https://x/y" })).toBe("Halo Rina, dari Studio X: https://x/y");
    expect(fillTemplate("Halo {nama} di {brand}", {})).toBe("Halo kak di kami");
  });
});

describe("sessionStage / boothState", () => {
  const now = Date.parse("2026-10-14T05:00:00Z");
  const base = { completedAt: null, createdAt: new Date(now - 2 * 60 * 1000), photoCount: 0, packagePhotoCount: 4 };
  it("follows the customer through payment, capture and review", () => {
    expect(sessionStage({ ...base, paymentStatus: "pending" }, now)).toBe("payment");
    expect(sessionStage({ ...base, paymentStatus: "success", photoCount: 2 }, now)).toBe("capture");
    expect(sessionStage({ ...base, paymentStatus: "success", photoCount: 4 }, now)).toBe("review");
  });
  it("ignores finished, failed and abandoned sessions", () => {
    expect(sessionStage({ ...base, paymentStatus: "success", completedAt: new Date(now) }, now)).toBeNull();
    expect(sessionStage({ ...base, paymentStatus: "failed" }, now)).toBeNull();
    expect(sessionStage({ ...base, paymentStatus: "pending", createdAt: new Date(now - 60 * 60 * 1000) }, now)).toBeNull();
  });
  it("ranks locked above offline above what the customer is doing", () => {
    const recent = new Date(now - 60 * 1000);
    expect(boothState({ locked: true, lastUsedAt: recent, stage: "capture" }, now)).toBe("locked");
    expect(boothState({ locked: false, lastUsedAt: new Date(now - 20 * 60 * 1000), stage: "capture" }, now)).toBe("offline");
    expect(boothState({ locked: false, lastUsedAt: null, stage: null }, now)).toBe("offline");
    expect(boothState({ locked: false, lastUsedAt: recent, stage: "capture" }, now)).toBe("capture");
    expect(boothState({ locked: false, lastUsedAt: recent, stage: null }, now)).toBe("idle");
  });
});

describe("startOfTodayWib", () => {
  it("is midnight in Jakarta, not in UTC", () => {
    // 2026-10-14 03:00 UTC = 10:00 WIB on the 14th → today began 2026-10-13 17:00 UTC
    expect(startOfTodayWib(Date.parse("2026-10-14T03:00:00Z")).toISOString()).toBe("2026-10-13T17:00:00.000Z");
    // 2026-10-14 18:00 UTC = 01:00 WIB on the 15th → today began 2026-10-14 17:00 UTC
    expect(startOfTodayWib(Date.parse("2026-10-14T18:00:00Z")).toISOString()).toBe("2026-10-14T17:00:00.000Z");
  });
});
