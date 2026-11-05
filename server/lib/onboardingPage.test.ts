import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderOnboardingPage } from "./onboardingPage.js";
import type { DocFacts } from "./leadDocs.js";

const facts: DocFacts = {
  trialDays: 14, graceDays: 3, qrisFeePercent: 0.7, withdrawalMinAmount: 50_000, withdrawalFlatFee: 2_500,
  withdrawalSchedule: "Penarikan bisa diajukan setiap Senin", holdDays: 2, volumeTiers: [{ minBooths: 10, percent: 10 }, { minBooths: 25, percent: 15 }], portalUrl: "https://www.studiodo.id",
};

describe("onboarding guide page", () => {
  const html = renderOnboardingPage(facts);

  it("shows the live platform numbers, so the guide never disagrees with the settings", () => {
    expect(html).toContain("Trial gratis 14 hari");
    expect(html).toContain("0.7%");
    expect(html).toContain("Rp 50.000");
    expect(html).toContain("Rp 2.500");
    expect(html).toContain("Penarikan bisa diajukan setiap Senin");
    expect(html).toContain("ditahan 2 hari");
    expect(html).toContain("3 hari setelah langganan berbayar habis");
    expect(html).toContain("10 booth atau lebih");
    expect(html).toContain("<b>15%</b>");
  });

  it("copes with no volume discount and no payout fee or hold", () => {
    const plain = renderOnboardingPage({ ...facts, volumeTiers: [], withdrawalFlatFee: 0, holdDays: 0 });
    expect(plain).toContain("Belum ada diskon volume yang aktif");
    expect(plain).not.toContain("per penarikan");
    expect(plain).not.toContain("dana ditahan");
  });

  it("escapes anything that comes from settings", () => {
    const evil = renderOnboardingPage({ ...facts, withdrawalSchedule: "<script>alert(1)</script>", portalUrl: 'https://x.test/"><img src=x onerror=alert(1)>' });
    expect(evil).not.toContain("<script>alert(1)</script>");
    expect(evil).not.toContain('"><img src=x');
  });

  it("has a section for every step in the table of contents", () => {
    for (const id of ["masuk", "tampilan", "paket", "frame", "alat", "bayar", "coba", "pantau", "langganan", "faq", "bantuan"]) {
      expect(html).toContain(`id="${id}"`);
      expect(html).toContain(`href="#${id}"`);
    }
  });

  it("only points at screenshots that exist in client/public/guide (a missing file would be a broken picture in front of a customer)", () => {
    const dir = path.resolve(__dirname, "../../client/public/guide");
    const referenced = [...new Set([...html.matchAll(/\/guide\/([\w.-]+\.jpg)/g)].map((m) => m[1]))];
    expect(referenced.length).toBeGreaterThan(15);
    for (const file of referenced) expect(fs.existsSync(path.join(dir, file)), `${file} is missing`).toBe(true);
  });

  it("does not claim Midtrans for the booth's own payment account (only the subscription uses it)", () => {
    const optionA = html.slice(html.indexOf("Pilihan A"), html.indexOf("Pilihan B"));
    expect(optionA).toContain("Xendit atau DOKU");
    expect(optionA).not.toContain("Midtrans");
  });
});
