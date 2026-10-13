import { describe, expect, it } from "vitest";
import { reviewChecks, type ReviewInput } from "./moderation.js";

const good: ReviewInput = {
  name: "Rose Gold Wedding", description: "Frame elegan bernuansa rose gold untuk resepsi pernikahan.", canvasWidth: 1200, canvasHeight: 1800, orientation: "portrait", hasFrame: true,
  slots: [{ x: 100, y: 100, w: 1000, h: 700 }, { x: 100, y: 900, w: 1000, h: 700 }],
};
const byId = (t: ReviewInput, names: string[] = []) => Object.fromEntries(reviewChecks(t, names).map((c) => [c.id, c.status]));

describe("reviewChecks", () => {
  it("a clean template passes every check", () => {
    expect(Object.values(byId(good)).every((s) => s === "ok")).toBe(true);
  });
  it("flags slots outside the canvas and overlapping slots", () => {
    const r = byId({ ...good, slots: [{ x: 1000, y: 100, w: 400, h: 400 }, { x: 100, y: 100, w: 500, h: 500 }, { x: 200, y: 200, w: 500, h: 500 }] });
    expect(r.bounds).toBe("fail");
    expect(r.overlap).toBe("warn");
  });
  it("flags a missing frame / no slots / thin description", () => {
    const r = byId({ ...good, hasFrame: false, slots: [], description: "bagus" });
    expect(r.frame).toBe("fail");
    expect(r.slots).toBe("fail");
    expect(r.description).toBe("fail");
  });
  it("warns on a default name and on a name already in the catalog", () => {
    expect(byId({ ...good, name: "Template baru" }).name).toBe("warn");
    expect(byId(good, ["rose gold wedding"]).name).toBe("warn");
  });
  it("warns when the declared orientation contradicts the canvas", () => {
    expect(byId({ ...good, orientation: "landscape" }).orientation).toBe("warn");
  });
});
