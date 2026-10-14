import { describe, expect, it, vi } from "vitest";

vi.mock("../db/client.js", () => ({ db: {}, client: {} }));
vi.mock("./license.js", () => ({ getKeyLock: async () => ({ locked: false }) }));

const { featuresOf, bestOf, UNRESTRICTED, planLockedBody } = await import("./planFeatures.js");

const STARTER = { slug: "starter", name: "Starter", kioskLimit: null, screenBuilderEnabled: false, gifVideoEnabled: false };
const PRO = { slug: "pro", name: "PRO", kioskLimit: null, screenBuilderEnabled: true, gifVideoEnabled: true };
const MEDIA_ONLY = { slug: "media", name: "Media", kioskLimit: null, screenBuilderEnabled: false, gifVideoEnabled: true };

describe("featuresOf", () => {
  it("grants exactly what the plan row says", () => {
    expect(featuresOf("starter", STARTER)).toMatchObject({ planSlug: "starter", planName: "Starter", screenBuilderEnabled: false, gifVideoEnabled: false });
    expect(featuresOf("pro", PRO)).toMatchObject({ screenBuilderEnabled: true, gifVideoEnabled: true });
  });
  it("fails open when the slug matches no plan (legacy/complimentary), never locking a customer out over a data mismatch", () => {
    expect(featuresOf("trial", undefined)).toMatchObject({ planSlug: "trial", planName: null, screenBuilderEnabled: true, gifVideoEnabled: true });
    expect(UNRESTRICTED).toMatchObject({ screenBuilderEnabled: true, gifVideoEnabled: true });
  });
});

describe("bestOf (what the tenant's dashboard may configure)", () => {
  it("a feature is available if ANY running booth's plan includes it", () => {
    const best = bestOf([featuresOf("starter", STARTER), featuresOf("media", MEDIA_ONLY)]);
    expect(best).toMatchObject({ gifVideoEnabled: true, screenBuilderEnabled: false });
  });
  it("all booths on a limited plan -> limited", () => {
    expect(bestOf([featuresOf("starter", STARTER), featuresOf("starter", STARTER)])).toMatchObject({ gifVideoEnabled: false, screenBuilderEnabled: false });
  });
  it("one PRO booth lifts the editors, and the label follows the richest plan", () => {
    const best = bestOf([featuresOf("starter", STARTER), featuresOf("pro", PRO)]);
    expect(best).toMatchObject({ planSlug: "pro", gifVideoEnabled: true, screenBuilderEnabled: true });
  });
  it("no booths -> unrestricted (the caller falls back to the legacy tenant plan first)", () => {
    expect(bestOf([])).toMatchObject({ screenBuilderEnabled: true, gifVideoEnabled: true });
  });
});

describe("planLockedBody", () => {
  it("is recognisable by clients and names the feature", () => {
    expect(planLockedBody("gifVideo")).toMatchObject({ code: "plan_feature_locked", feature: "gifVideo" });
    expect(planLockedBody("screenBuilder")).toMatchObject({ code: "plan_feature_locked", feature: "screenBuilder" });
    expect(planLockedBody("gifVideo").error).toMatch(/Upgrade/);
  });
});
