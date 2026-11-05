import { describe, expect, it } from "vitest";
import { markdownToHtml, onboardingGuide, renderDocPage, teamGuide, type DocFacts } from "./leadDocs.js";

const facts: DocFacts = { trialDays: 7, graceDays: 3, qrisFeePercent: 0.7, withdrawalMinAmount: 50000, withdrawalFlatFee: 2500, withdrawalSchedule: "Penarikan dibuka Senin, Selasa, 09:00–16:00 WIB", holdDays: 2, volumeTiers: [{ minBooths: 10, percent: 10 }], portalUrl: "https://www.studiodo.id" };

describe("guides use the platform's live numbers", () => {
  it("onboarding mentions trial days, fee, minimum, schedule, hold, grace and volume discount", () => {
    const md = onboardingGuide(facts).markdown;
    for (const needle of ["7 hari", "0.7%", "Rp 50.000", "Rp 2.500", "09:00–16:00", "2 hari", "3 hari", "10 booth atau lebih → diskon 10%"]) expect(md).toContain(needle);
  });
  it("team guide covers the stages, the first-follow-up questions and Midtrans/Xendit/DOKU", () => {
    const md = teamGuide(facts).markdown;
    for (const needle of ["Kontrak terkirim", "Trial diberikan", "Pertanyaan wajib", "Midtrans", "Xendit", "DOKU", "persetujuan dua orang", "draf"]) expect(md).toContain(needle);
  });
  it("omits the flat fee sentence when there is none", () => {
    expect(onboardingGuide({ ...facts, withdrawalFlatFee: 0, holdDays: 0 }).markdown).not.toMatch(/per penarikan|ditahan 0/);
  });
});

describe("markdown renderer", () => {
  it("renders headings, lists, tables, quotes and inline styles", () => {
    const html = markdownToHtml("# T\n\n- a **b**\n- c\n\n1. x\n2. y\n\n| H1 | H2 |\n|---|---|\n| 1 | 2 |\n\n> kutipan `kode`");
    expect(html).toContain("<h1>T</h1>");
    expect(html).toContain("<ul><li>a <strong>b</strong></li><li>c</li></ul>");
    expect(html).toContain("<ol><li>x</li><li>y</li></ol>");
    expect(html).toContain("<th>H1</th>");
    expect(html).toContain("<td>2</td>");
    expect(html).toContain("<blockquote>kutipan <code>kode</code></blockquote>");
  });
  it("escapes HTML in the source", () => {
    expect(markdownToHtml("<script>alert(1)</script>")).not.toContain("<script>");
    expect(renderDocPage("<b>x</b>", "# hi")).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});
