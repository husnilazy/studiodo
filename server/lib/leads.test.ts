import { describe, expect, it } from "vitest";
import {
  canMoveTo, DEFAULT_TEMPLATES, maskSecrets, dueFromPreset, renderTemplate, resolveTemplates, sanitizeLeadPatch, sanitizeTemplateOverrides, summarizeFunnel, taskState, whatsappFallbackLink,
} from "./leads.js";

describe("pipeline moves", () => {
  it("lets a lead move freely in either direction", () => {
    expect(canMoveTo("new", "negotiation", false).ok).toBe(true);
    expect(canMoveTo("contract_sent", "contacted", false).ok).toBe(true);
    expect(canMoveTo("lost", "new", false).ok).toBe(true);
  });
  it("reserves Aktif for a lead that really became a tenant", () => {
    const r = canMoveTo("negotiation", "active", false);
    expect(r.ok).toBe(false);
    expect(canMoveTo("negotiation", "active", true).ok).toBe(true);
  });
  it("does not pull a converted tenant back into the funnel", () => {
    expect(canMoveTo("active", "new", true).ok).toBe(false);
  });
});

describe("sanitizeLeadPatch", () => {
  it("accepts a clean patch and normalizes empties to null", () => {
    const r = sanitizeLeadPatch({ boothCount: "3", boothLocation: "  ", paymentSetup: "platform", contractMonths: 12, leadSource: "instagram", ownerEmail: " A@B.com " });
    expect(r).toEqual({ patch: { boothCount: 3, boothLocation: null, paymentSetup: "platform", contractMonths: 12, leadSource: "instagram", ownerEmail: "a@b.com" } });
  });
  it("rejects bad values with a readable error", () => {
    expect(sanitizeLeadPatch({ boothCount: 0 })).toHaveProperty("error");
    expect(sanitizeLeadPatch({ boothCount: 9999 })).toHaveProperty("error");
    expect(sanitizeLeadPatch({ paymentSetup: "bitcoin" })).toHaveProperty("error");
    expect(sanitizeLeadPatch({ ownerEmail: "bukan-email" })).toHaveProperty("error");
    expect(sanitizeLeadPatch({ ownerWhatsapp: "123" })).toHaveProperty("error");
    expect(sanitizeLeadPatch({ leadSource: "tiktok" })).toHaveProperty("error");
    expect(sanitizeLeadPatch({ contractMonths: 99 })).toHaveProperty("error");
  });
  it("lets booth count be cleared with null but keeps untouched fields out of the patch", () => {
    expect(sanitizeLeadPatch({ boothCount: null })).toEqual({ patch: { boothCount: null } });
    expect(sanitizeLeadPatch({})).toEqual({ patch: {} });
  });
  it("requires names when creating, and allows a missing email (WhatsApp-only lead)", () => {
    expect(sanitizeLeadPatch({ businessName: "Fotosut" }, { requireNames: true })).toHaveProperty("error");
    expect(sanitizeLeadPatch({ businessName: "Fotosut", ownerName: "Dika", ownerWhatsapp: "0877-7737-3108" }, { requireNames: true })).toHaveProperty("patch");
  });
});

describe("follow-up task state (WIB calendar)", () => {
  const now = new Date("2026-11-05T05:00:00Z"); // 12:00 WIB
  it("flags a past due date as overdue, even earlier today", () => {
    expect(taskState({ dueAt: new Date("2026-11-05T03:00:00Z") }, now)).toBe("overdue");
    expect(taskState({ dueAt: new Date("2026-11-01T03:00:00Z") }, now)).toBe("overdue");
  });
  it("is 'today' later the same WIB day and 'upcoming' after midnight WIB", () => {
    expect(taskState({ dueAt: new Date("2026-11-05T16:00:00Z") }, now)).toBe("today"); // 23:00 WIB
    expect(taskState({ dueAt: new Date("2026-11-05T17:30:00Z") }, now)).toBe("upcoming"); // 00:30 WIB next day
  });
  it("a finished task is done whatever its date", () => {
    expect(taskState({ dueAt: new Date("2020-01-01"), doneAt: new Date() }, now)).toBe("done");
  });
  it("presets", () => {
    expect(dueFromPreset("1d", now)!.toISOString()).toBe("2026-11-06T05:00:00.000Z");
    expect(dueFromPreset("nope", now)).toBeNull();
  });
});

describe("WhatsApp templates", () => {
  it("fills variables and reports the ones that are missing", () => {
    const out = renderTemplate("Halo {nama}, {usaha} {booth} booth {link_kontrak}", { nama: "Dika", usaha: "Fotosut", booth: 2 });
    expect(out.text).toBe("Halo Dika, Fotosut 2 booth");
    expect(out.missing).toEqual(["link_kontrak"]);
  });
  it("renders every default template for a fully-filled lead without leaving a placeholder behind", () => {
    const vars = { nama: "Dika", usaha: "Fotosut", booth: 2, kota: "Bandung", paket: "PRO", harga: "Rp 1.000.000", link_kontrak: "https://x/k", link_panduan: "https://x/p", pengirim: "Tim", masa_trial: 7, link_login: "https://x", email_login: "d@x.id", link_setup: "https://x/s", key_trial: "k" };
    for (const t of DEFAULT_TEMPLATES) {
      const out = renderTemplate(t.text, vars);
      expect(out.text).not.toMatch(/[{}]/);
      expect(out.missing).toEqual([]);
    }
  });
  it("owner edits override defaults, and only known keys with real changes are stored", () => {
    const saved = sanitizeTemplateOverrides({ greeting: "Halo {nama}!", bogus: "x", contract: DEFAULT_TEMPLATES.find((t) => t.key === "contract")!.text, trial_key: "   " });
    expect(saved).toEqual({ greeting: "Halo {nama}!" });
    expect(resolveTemplates(saved).find((t) => t.key === "greeting")!.text).toBe("Halo {nama}!");
    expect(resolveTemplates(saved).find((t) => t.key === "pricing")!.text).toBe(DEFAULT_TEMPLATES.find((t) => t.key === "pricing")!.text);
  });
});

describe("secret masking", () => {
  it("hides a 64-hex kiosk key but leaves other text alone", () => {
    const key = "ab12cd" + "0".repeat(58);
    expect(maskSecrets(`Key:\n${key}\nSelesai`)).toBe("Key:\nab12cd…(key disembunyikan)\nSelesai");
    expect(maskSecrets("tidak ada rahasia 123456")).toBe("tidak ada rahasia 123456");
  });
});

describe("wa.me fallback link", () => {
  it("normalizes the phone and encodes the message", () => {
    expect(whatsappFallbackLink("+62 877-7737-3108", "Halo kak & terima kasih")).toBe("https://wa.me/6287777373108?text=Halo%20kak%20%26%20terima%20kasih");
    expect(whatsappFallbackLink("0877 7737 3108", "x")).toBe("https://wa.me/6287777373108?text=x");
  });
  it("returns null without a usable number", () => {
    expect(whatsappFallbackLink(null, "x")).toBeNull();
    expect(whatsappFallbackLink("abc", "x")).toBeNull();
  });
});

describe("funnel summary", () => {
  it("counts per stage, in pipeline order, including empty stages", () => {
    const rows = summarizeFunnel([{ pipelineStage: "new" }, { pipelineStage: "new" }, { pipelineStage: "lost" }]);
    expect(rows.map((r) => r.stage)).toEqual(["new", "contacted", "trial_given", "negotiation", "contract_sent", "active", "lost"]);
    expect(rows.find((r) => r.stage === "new")!.count).toBe(2);
    expect(rows.find((r) => r.stage === "contacted")!.count).toBe(0);
  });
});
