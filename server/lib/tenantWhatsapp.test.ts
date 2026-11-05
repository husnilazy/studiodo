import { describe, expect, it, vi } from "vitest";

// The module imports the db client at load time; the pure helpers below never touch it.
vi.mock("../db/client.js", () => ({ db: {} }));

const { TENANT_TEMPLATES, daysLeft, dueReminders, renderTenantMessage, sanitizeAutoSettings, stageFor, withinSendingHours } = await import("./tenantWhatsapp.js");

const NOW = new Date("2026-11-05T05:00:00Z"); // 12:00 WIB
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000 - 3_600_000);

describe("stageFor", () => {
  it("maps the remaining time onto reminder stages", () => {
    expect(stageFor(inDays(30), NOW)).toBeNull();
    expect(stageFor(inDays(7), NOW)).toBe("d7");
    expect(stageFor(inDays(3), NOW)).toBe("d3");
    expect(stageFor(inDays(1), NOW)).toBe("d1");
    expect(stageFor(inDays(0), NOW)).toBe("d1");
    expect(stageFor(inDays(-1), NOW)).toBe("expired");
    expect(stageFor(inDays(-5), NOW)).toBeNull(); // too long ago to nag about
  });
  it("counts calendar days", () => { expect(daysLeft(new Date(NOW.getTime() + 36 * 3_600_000), NOW)).toBe(2); });
});

describe("dueReminders", () => {
  const rows = [
    { tenantId: "a", type: "paid", endsAt: inDays(6) },
    { tenantId: "a", type: "paid", endsAt: inDays(2) },
    { tenantId: "a", type: "paid", endsAt: inDays(2) },
    { tenantId: "b", type: "trial", endsAt: inDays(-1) },
    { tenantId: "c", type: "unpaid", endsAt: inDays(1) },
    { tenantId: "d", type: "paid", endsAt: null },
    { tenantId: "e", type: "paid", endsAt: inDays(40) },
  ];
  it("gives one reminder per tenant, at the most urgent stage, skipping unpaid / unlimited / far-off licences", () => {
    const due = dueReminders(rows, NOW);
    expect(due.map((d) => d.tenantId).sort()).toEqual(["a", "b"]);
    const a = due.find((d) => d.tenantId === "a")!;
    expect(a.stage).toBe("d3");
    expect(a.booths).toBe(2);
    expect(due.find((d) => d.tenantId === "b")!.stage).toBe("expired");
  });
  it("builds a stable dedupe key and honours the enabled stages", () => {
    const first = dueReminders(rows, NOW).find((d) => d.tenantId === "a")!;
    const later = dueReminders(rows, new Date(NOW.getTime() + 3_600_000)).find((d) => d.tenantId === "a")!;
    expect(first.key).toBe(later.key);
    expect(dueReminders(rows, NOW, ["expired"]).map((d) => d.tenantId)).toEqual(["b"]);
  });
});

describe("templates", () => {
  it("fills known variables and reports the ones with no value", () => {
    const out = renderTenantMessage("Halo {nama}, {bisnis} berakhir {tanggal} {foo}", { nama: "Rina", bisnis: "Rina Booth", tanggal: null });
    expect(out.text).toBe("Halo Rina, Rina Booth berakhir {tanggal} {foo}");
    expect(out.missing).toEqual(["tanggal"]);
  });
  it("ships the reminder templates the job relies on", () => {
    expect(TENANT_TEMPLATES.map((t) => t.key)).toEqual(expect.arrayContaining(["expiring", "expired"]));
  });
});

describe("settings + sending hours", () => {
  it("is off by default and only keeps known stages", () => {
    expect(sanitizeAutoSettings(undefined).enabled).toBe(false);
    expect(sanitizeAutoSettings({ enabled: true, stages: ["d3", "bogus"] })).toEqual({ enabled: true, stages: ["d3"] });
    expect(sanitizeAutoSettings({ enabled: "yes" }).enabled).toBe(false);
  });
  it("sends only between 08:00 and 20:00 WIB", () => {
    expect(withinSendingHours(new Date("2026-11-05T05:00:00Z"))).toBe(true); // 12:00 WIB
    expect(withinSendingHours(new Date("2026-11-05T18:00:00Z"))).toBe(false); // 01:00 WIB
    expect(withinSendingHours(new Date("2026-11-05T00:59:00Z"))).toBe(false); // 07:59 WIB
  });
});
