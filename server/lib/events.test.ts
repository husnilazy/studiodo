import { describe, expect, it } from "vitest";
import { eventState, isEventInWindow, normalizeBoothMode, pickLiveEvent, sanitizeBranding, sanitizeEventInput, shouldRevertToStandard } from "./events.js";

const NOW = new Date("2026-11-20T10:00:00Z").getTime();
const d = (iso: string) => new Date(iso);

describe("isEventInWindow", () => {
  it("is off when switched off, even inside the schedule", () => {
    expect(isEventInWindow({ enabled: false, startsAt: null, endsAt: null }, NOW)).toBe(false);
  });
  it("respects start and end, and treats a missing bound as open", () => {
    expect(isEventInWindow({ enabled: true, startsAt: d("2026-11-20T09:00:00Z"), endsAt: d("2026-11-20T12:00:00Z") }, NOW)).toBe(true);
    expect(isEventInWindow({ enabled: true, startsAt: d("2026-11-20T10:30:00Z"), endsAt: null }, NOW)).toBe(false);
    expect(isEventInWindow({ enabled: true, startsAt: null, endsAt: d("2026-11-20T09:59:00Z") }, NOW)).toBe(false);
    expect(isEventInWindow({ enabled: true, startsAt: null, endsAt: null }, NOW)).toBe(true);
  });
});

describe("eventState", () => {
  const base = { enabled: true, startsAt: null, endsAt: null, sessionCap: null as number | null };
  it("labels each stage", () => {
    expect(eventState({ ...base, enabled: false }, 0, NOW)).toBe("off");
    expect(eventState({ ...base, startsAt: d("2026-11-21T00:00:00Z") }, 0, NOW)).toBe("scheduled");
    expect(eventState({ ...base, endsAt: d("2026-11-19T00:00:00Z") }, 0, NOW)).toBe("ended");
    expect(eventState(base, 0, NOW)).toBe("live");
  });
  it("is full once the session cap is reached", () => {
    expect(eventState({ ...base, sessionCap: 100 }, 99, NOW)).toBe("live");
    expect(eventState({ ...base, sessionCap: 100 }, 100, NOW)).toBe("full");
  });
});

describe("pickLiveEvent", () => {
  it("prefers the event that started most recently", () => {
    const a = { id: "a", startsAt: d("2026-11-20T08:00:00Z"), createdAt: d("2026-11-01T00:00:00Z") };
    const b = { id: "b", startsAt: d("2026-11-20T09:00:00Z"), createdAt: d("2026-11-02T00:00:00Z") };
    const open = { id: "open", startsAt: null, createdAt: d("2026-11-03T00:00:00Z") };
    expect(pickLiveEvent([a, b, open])?.id).toBe("b");
    expect(pickLiveEvent([open, a])?.id).toBe("a");
    expect(pickLiveEvent([])).toBeNull();
  });
});

describe("sanitizeEventInput", () => {
  it("requires a name and a sane schedule", () => {
    expect(sanitizeEventInput({ name: "  " }).ok).toBe(false);
    expect(sanitizeEventInput({ name: "X", startsAt: "bukan tanggal" }).ok).toBe(false);
    expect(sanitizeEventInput({ name: "X", startsAt: "2026-11-20T10:00:00Z", endsAt: "2026-11-20T09:00:00Z" }).ok).toBe(false);
  });
  it("clamps numbers, applies defaults and keeps only valid booth ids", () => {
    const r = sanitizeEventInput({ name: " Pernikahan Sari ", sessionTimerMinutes: 99, maxPhotos: -4, sessionCap: "250", kioskKeyIds: ["11111111-1111-1111-1111-111111111111", "x", "11111111-1111-1111-1111-111111111111"] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ name: "Pernikahan Sari", freeEntry: true, enabled: true, sessionTimerMinutes: 30, maxPhotos: 0, sessionCap: 250, hasVideo: true, hasGif: false });
    expect(r.value.kioskKeyIds).toEqual(["11111111-1111-1111-1111-111111111111"]);
  });
  it("keeps only valid, unique frame ids", () => {
    const f = "22222222-2222-2222-2222-222222222222";
    const r = sanitizeEventInput({ name: "X", frameIds: [f, f, "nope", 7] });
    expect(r.ok && r.value.frameIds).toEqual([f]);
    expect(sanitizeEventInput({ name: "X" }).ok && (sanitizeEventInput({ name: "X" }) as any).value.frameIds).toEqual([]);
  });
  it("a blank cap means unlimited", () => {
    const r = sanitizeEventInput({ name: "X", sessionCap: "" });
    expect(r.ok && r.value.sessionCap).toBe(null);
  });
});

describe("normalizeBoothMode", () => {
  it("only event_only is special", () => {
    expect(normalizeBoothMode("event_only")).toBe("event_only");
    expect(normalizeBoothMode("anything")).toBe("standard");
    expect(normalizeBoothMode(undefined)).toBe("standard");
  });
});

describe("sanitizeBranding", () => {
  it("keeps only whitelisted keys and drops empties", () => {
    const r = sanitizeBranding({ brandName: "  Sari & Dimas ", accentColor: "#112233", hacker: "x", operatorPin: "1234", tagline: "", logoUrl: " /storage/a.png " });
    expect(r).toEqual({ ok: true, value: { brandName: "Sari & Dimas", accentColor: "#112233", logoUrl: "/storage/a.png" } });
  });
  it("rejects bad colours and non-text values", () => {
    expect(sanitizeBranding({ textColor: "red" }).ok).toBe(false);
    expect(sanitizeBranding({ brandName: 5 }).ok).toBe(false);
    expect(sanitizeBranding([]).ok).toBe(false);
  });
  it("nothing sent means no branding", () => {
    expect(sanitizeBranding(undefined)).toEqual({ ok: true, value: {} });
  });
  it("travels through the event form", () => {
    const r = sanitizeEventInput({ name: "X", branding: { idleHeadline: "Halo", nope: "1" } });
    expect(r.ok && r.value.branding).toEqual({ idleHeadline: "Halo" });
  });
});

describe("shouldRevertToStandard", () => {
  const ended = { enabled: true, startsAt: d("2026-11-19T08:00:00Z"), endsAt: d("2026-11-19T20:00:00Z"), revertToStandard: true };
  it("reverts once a flagged event has ended and nothing else is live or coming", () => {
    expect(shouldRevertToStandard([ended], d("2026-11-10T00:00:00Z"), NOW)).toBe(true);
  });
  it("does nothing when the event did not ask for it", () => {
    expect(shouldRevertToStandard([{ ...ended, revertToStandard: false }], d("2026-11-10T00:00:00Z"), NOW)).toBe(false);
  });
  it("waits while another event is live or still coming", () => {
    const live = { enabled: true, startsAt: d("2026-11-20T09:00:00Z"), endsAt: d("2026-11-20T12:00:00Z"), revertToStandard: false };
    const coming = { enabled: true, startsAt: d("2026-11-25T09:00:00Z"), endsAt: d("2026-11-25T12:00:00Z"), revertToStandard: false };
    expect(shouldRevertToStandard([ended, live], null, NOW)).toBe(false);
    expect(shouldRevertToStandard([ended, coming], null, NOW)).toBe(false);
  });
  it("ignores an event that ended BEFORE the booth was last switched to event-only", () => {
    expect(shouldRevertToStandard([ended], d("2026-11-20T08:00:00Z"), NOW)).toBe(false);
  });
  it("an event without an end date never reverts", () => {
    expect(shouldRevertToStandard([{ ...ended, endsAt: null }], null, NOW)).toBe(false);
  });
});
