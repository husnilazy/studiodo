import { describe, expect, it, vi } from "vitest";
import { ALERT_RULES, alertFromEvent, channelsFor, sanitizePrefs, whatsappText } from "./adminAlerts.js";

vi.mock("../db/client.js", () => ({ db: {}, client: { end: async () => undefined } }));

describe("alert rules", () => {
  it("turns the important events into alerts and ignores routine ones", () => {
    expect(alertFromEvent({ action: "application.submitted", message: 'Aplikasi tenant baru masuk: "Fotosut"' })).toMatchObject({ kind: "application.submitted", title: "Pendaftaran tenant baru", link: "applications" });
    expect(alertFromEvent({ action: "payment.received", message: "Rp 1", tenantId: "t1" })).toMatchObject({ severity: "success", link: "billing", tenantId: "t1" });
    expect(alertFromEvent({ action: "withdrawal.requested", message: "x" })?.severity).toBe("warning");
    expect(alertFromEvent({ action: "blog.updated", message: "x" })).toBeNull();
    expect(alertFromEvent({ action: "settings.updated", message: "x" })).toBeNull();
  });
  it("covers sign-ups, payments, withdrawals, help messages and server errors by WhatsApp by default", () => {
    for (const kind of ["application.submitted", "payment.received", "withdrawal.requested", "support.message", "server.unhandled_error"]) expect(channelsFor(kind, {}).whatsapp).toBe(true);
    for (const kind of ["lead.followup_due", "email.failed", "marketplace.reported"]) expect(channelsFor(kind, {}).whatsapp).toBe(false);
  });
  it("owner preferences override the defaults, and unknown kinds are dropped", () => {
    expect(channelsFor("payment.received", { "payment.received": { whatsapp: false } })).toEqual({ inApp: true, whatsapp: false });
    expect(channelsFor("email.failed", { "email.failed": { whatsapp: true, inApp: false } })).toEqual({ inApp: false, whatsapp: true });
    expect(sanitizePrefs({ "payment.received": { whatsapp: false, junk: 1 }, bogus: { whatsapp: true }, "email.failed": "x" })).toEqual({ "payment.received": { whatsapp: false } });
  });
  it("truncates a long body and writes a compact WhatsApp text", () => {
    const d = alertFromEvent({ action: "payment.received", message: "x".repeat(2000) })!;
    expect(d.body.length).toBe(600);
    const text = whatsappText({ ...d, body: "Rp 150.000 dari Fotosut" });
    expect(text).toContain("*STUDIODO — Pembayaran diterima*");
    expect(text).toContain("Rp 150.000 dari Fotosut");
  });
  it("every rule has a title, a section to open, and a label", () => {
    for (const [kind, rule] of Object.entries(ALERT_RULES)) { expect(rule.title, kind).toBeTruthy(); expect(rule.link, kind).toBeTruthy(); expect(rule.label, kind).toBeTruthy(); }
  });
});
