import { describe, expect, it } from "vitest";
import { FEATURES } from "./features.js";
import { CAPTION_VARIANTS, captionFor, featureDeck, localToIso, planAutopilot, postingSlots, withPhotos } from "./generator.js";
import { displayUrls } from "./sourcePhotos.js";
import { buildCaption, discoverAccounts, publishPost, type Fetcher } from "./instagram.js";
import { approvable, capStatus, duePrepare, duePublish, localDayKey, retryDelayMs, revisionPatch, type ScheduledPost } from "./schedule.js";
import { HOOKS, CTA_KEYWORD } from "./hooks.js";
import { buildContactReelDoc, buildContactSlideDoc } from "./styleContact.js";
import { buildKacaReelDoc, buildKacaSlideDoc } from "./styleKaca.js";
import { THEMES } from "./types.js";

const MOCKUPS = ["none", "dashboard", "macbook", "qris", "gallery", "booth", "queue", "hub", "strip", "qris-l", "booth-l", "gallery-l", "print-l"];

describe("feature catalog + generator", () => {
  it("has unique ids and complete copy for every feature", () => {
    expect(new Set(FEATURES.map((f) => f.id)).size).toBe(FEATURES.length);
    for (const f of FEATURES) {
      expect(f.pain).toHaveLength(3);
      expect(f.gain).toHaveLength(3);
      expect(f.how.length).toBeGreaterThanOrEqual(3);
      expect(MOCKUPS).toContain(f.mockup);
      expect(f.hook.split("*").length % 2).toBe(1); // balanced highlight markers
    }
  });

  it("builds a valid carousel and reel for every feature, within Instagram limits", () => {
    for (const f of FEATURES) {
      for (const format of ["carousel", "reel"] as const) {
        const d = featureDeck(f, format, 1);
        expect(d.style).toBe("kaca");
        expect(THEMES).toContain(d.theme);
        expect(d.featureId).toBe(f.id);
        expect(d.slides.length).toBeGreaterThanOrEqual(2);
        expect(d.slides.length).toBeLessThanOrEqual(10);
        expect(d.caption.length).toBeLessThanOrEqual(2200);
        expect(d.hashtags.length).toBeLessThanOrEqual(30);
        const html = format === "reel" ? buildKacaReelDoc(d).html : buildKacaSlideDoc(d, 0);
        expect(html).toContain("kc-");
      }
    }
  });

  it("renders every slide kind in the Contact Sheet style without throwing", () => {
    const deck = featureDeck(FEATURES[0], "carousel");
    for (let i = 0; i < deck.slides.length; i++) expect(buildContactSlideDoc(deck, i)).toContain("<section");
    expect(buildContactSlideDoc({ ...deck, slides: [{ kind: "chat", title: "Tanya", chat: [{ from: "them", text: "Halo" }, { from: "us", text: "Hai" }] }, { kind: "note", title: "Catatan", items: ["a", "b"] }, { kind: "hook", title: "Hei *kamu*", emoji: "👋" }] }, 0)).toContain("kchat");
  });

  it("has a distinct, balanced hook for every feature and a comment CTA in every caption", () => {
    for (const f of FEATURES) {
      const h = HOOKS[f.id];
      expect(h, f.id).toBeTruthy();
      expect(h.split("*").length % 2).toBe(1);
      expect(h.split("|").length).toBeLessThanOrEqual(2);
      for (let v = 0; v < CAPTION_VARIANTS; v++) expect(captionFor(f, v)).toContain(`Komen "${CTA_KEYWORD}"`);
    }
    expect(new Set(Object.values(HOOKS)).size).toBe(FEATURES.length);
    expect(Object.keys(HOOKS).sort()).toEqual(FEATURES.map((f) => f.id).sort());
  });

  it("renders every slide kind and every composition in the Kaca style", () => {
    const kinds = [
      { kind: "cover", title: "Hai *kamu*", body: "b", mockup: "booth" }, { kind: "hook", title: "Hei *kamu*", emoji: "👋" },
      { kind: "steps", title: "Cara", items: ["a", "b", "c"] }, { kind: "stat", title: "Fakta", stat: { value: 4, label: "mode" } },
      { kind: "compare", title: "Beda", itemsBefore: ["x"], items: ["y"] }, { kind: "note", title: "Catatan", items: ["a", "b"] },
      { kind: "chat", title: "Tanya", chat: [{ from: "them", text: "Halo" }] }, { kind: "cta", title: "Yuk *mulai*" }, { kind: "feature", title: "Fitur", mockup: "qris" },
    ] as const;
    const seen = new Set<string>();
    for (let n = 0; n < 40; n++) {
      const deck = { ...featureDeck(FEATURES[0], "carousel"), id: `x${n}`, slides: kinds.map((k) => ({ ...k })) as any };
      for (let i = 0; i < kinds.length; i++) {
        const html = buildKacaSlideDoc(deck, i);
        expect(html).toContain("<section");
        for (const m of html.matchAll(/class="ks kc-\w+ (\w*)/g)) seen.add(`${kinds[i].kind}:${m[1]}`);
      }
    }
    expect(seen.size).toBeGreaterThan(kinds.length); // at least one kind has several compositions
    const photo = buildKacaSlideDoc({ ...featureDeck(FEATURES[0], "carousel"), slides: [{ kind: "cover", title: "Foto", bgImage: "data:image/png;base64,AAAA" }] }, 0);
    expect(photo).toContain("cvP");
  });

  it("rotates caption voices and never exceeds the variant count", () => {
    const f = FEATURES[0];
    const caps = new Set(Array.from({ length: CAPTION_VARIANTS }, (_, i) => captionFor(f, i)));
    expect(caps.size).toBe(CAPTION_VARIANTS);
    expect(captionFor(f, CAPTION_VARIANTS)).toBe(captionFor(f, 0));
    expect(captionFor(f, -1)).toBe(captionFor(f, CAPTION_VARIANTS - 1));
  });
});

describe("autopilot planning", () => {
  const base = { startDate: "2026-11-23", weeks: 4, days: [1, 3, 5, 0], times: ["19:00"], reelEvery: 3, tzOffsetMin: 420, used: [] as { featureId: string; format: "carousel" | "reel" }[] };

  it("converts WIB wall-clock to UTC", () => {
    expect(localToIso("2026-11-23", "19:00", 420)).toBe("2026-11-23T12:00:00.000Z");
    expect(localToIso("2026-11-23", "03:30", 420)).toBe("2026-11-22T20:30:00.000Z");
  });

  it("only uses the chosen weekdays, in time order", () => {
    const slots = postingSlots(base);
    expect(slots).toHaveLength(16);
    expect(slots[0].date).toBe("2026-11-23"); // a Monday
    expect(slots.map((s) => s.date + s.time)).toEqual([...slots].map((s) => s.date + s.time).sort());
  });

  it("never repeats a feature+format and mixes pillars and formats", () => {
    const plan = planAutopilot(base);
    expect(plan).toHaveLength(16);
    expect(new Set(plan.map((p) => `${p.featureId}:${p.format}`)).size).toBe(plan.length);
    expect(plan.filter((p) => p.format === "reel")).toHaveLength(5); // every 3rd of 16
    const pillar = (id: string) => FEATURES.find((f) => f.id === id)!.pillar;
    for (let i = 1; i < plan.length; i++) expect(pillar(plan[i].featureId)).not.toBe(pillar(plan[i - 1].featureId));
  });

  it("skips what is already queued and stops when the catalog is used up", () => {
    const used = FEATURES.flatMap((f) => [{ featureId: f.id, format: "carousel" as const }, { featureId: f.id, format: "reel" as const }]);
    expect(planAutopilot({ ...base, used })).toHaveLength(0);
    const one = planAutopilot({ ...base, used: used.slice(1), weeks: 8 });
    expect(one).toHaveLength(1);
    expect(one[0].featureId).toBe(FEATURES[0].id);
  });
});

const post = (over: Partial<ScheduledPost>): ScheduledPost => ({
  id: "p", deckId: "d", title: "t", format: "carousel", scheduledAt: "2026-11-23T12:00:00.000Z", mode: "auto", status: "scheduled", caption: "", hashtags: [],
  carouselMedia: "image", token: "x".repeat(36), attempts: 0, createdAt: "2026-11-01T00:00:00.000Z", log: [], ...over,
});

describe("queue rules", () => {
  const now = new Date("2026-11-23T11:45:00.000Z");
  it("prepares posts inside the lead window only, honouring retry waits", () => {
    const list = [post({ id: "a" }), post({ id: "b", scheduledAt: "2026-11-24T12:00:00.000Z" }), post({ id: "c", nextTryAt: "2026-11-23T11:50:00.000Z" }), post({ id: "d", status: "draft" })];
    expect(duePrepare(list, now, 30).map((p) => p.id)).toEqual(["a"]);
  });

  it("publishes only due, rendered, auto posts and respects the daily cap", () => {
    const day = (iso: string) => localDayKey(iso, 420);
    const at = new Date("2026-11-23T13:00:00.000Z");
    const list = [
      post({ id: "r1", status: "ready" }), post({ id: "r2", status: "ready" }), post({ id: "manual", status: "ready", mode: "manual" }),
      post({ id: "future", status: "ready", scheduledAt: "2026-11-23T20:00:00.000Z" }), post({ id: "done", status: "posted", postedAt: "2026-11-23T05:00:00.000Z" }),
    ];
    expect(duePublish(list, at, 5, day).map((p) => p.id)).toEqual(["r1", "r2"]);
    expect(duePublish(list, at, 2, day).map((p) => p.id)).toEqual(["r1"]); // one already posted today
  });

  it("lets a forced post through even when the daily cap is used up, and reports the cap", () => {
    const day = (iso: string) => localDayKey(iso, 420);
    const at = new Date("2026-11-23T13:00:00.000Z");
    const posted = [1, 2].map((i) => post({ id: `d${i}`, status: "posted", postedAt: "2026-11-23T05:00:00.000Z" }));
    const list = [...posted, post({ id: "auto", status: "ready" }), post({ id: "asked", status: "ready", force: true })];
    expect(duePublish(list, at, 2, day).map((p) => p.id)).toEqual(["asked"]); // cap of 2 already used: only the forced one goes
    expect(duePublish(list, at, 3, day).map((p) => p.id)).toEqual(["asked"]); // the forced post counts: 2 posted + 1 = 3
    expect(duePublish(list, at, 4, day).map((p) => p.id)).toEqual(["asked", "auto"]);
    expect(capStatus(list, at, 2, day)).toEqual({ postedToday: 2, reached: true });
    expect(capStatus(list, at, 5, day)).toEqual({ postedToday: 2, reached: false });
  });

  it("backs off 5 and 20 minutes, then gives up", () => {
    expect([retryDelayMs(1), retryDelayMs(2), retryDelayMs(3)]).toEqual([300_000, 1_200_000, null]);
  });
});

describe("illustrated decks", () => {
  it("gives every feature a cover and a fix illustration that exist", async () => {
    const { FEATURE_ART, decodeArt, encodeArt } = await import("./scenes.js");
    const { SCENES } = await import("./art.js");
    expect(Object.keys(FEATURE_ART).sort()).toEqual(FEATURES.map((f) => f.id).sort());
    for (const pair of Object.values(FEATURE_ART)) for (const a of [pair.cover, pair.fix]) {
      expect(SCENES).toContain(a.scene);
      expect(decodeArt(encodeArt(a))).toEqual({ scene: a.scene, expr: a.expr, hair: a.hair, skin: a.skin });
    }
  });
  it("uses at least three different story shapes and many compositions across the catalog", () => {
    const shapes = new Set(FEATURES.map((f) => featureDeck(f, "carousel").slides.map((s) => s.kind).join(">")));
    expect(shapes.size).toBeGreaterThanOrEqual(4);
    const covers = new Set<string>();
    for (const f of FEATURES) for (const format of ["carousel", "reel"] as const) {
      const d = featureDeck(f, format);
      const html = buildKacaSlideDoc({ ...d, format: "carousel" }, 0);
      const m = /class="ks kc-\w+ (\w+)/.exec(html);
      if (m) covers.add(m[1]);
      expect(html).toContain("<svg");
    }
    expect(covers.size).toBeGreaterThanOrEqual(5);
  });
});

describe("photo material", () => {
  it("puts photos on the cover, a backdrop on slide 2 and strips in the mockups", () => {
    const base = featureDeck(FEATURES.find((f) => f.mockup === "strip")!, "carousel");
    const d = withPhotos({ ...base, slides: [...base.slides.slice(0, 2), { kind: "feature", title: "Hasil", mockup: "strip" }, ...base.slides.slice(2)] }, ["a.jpg", "b.jpg"], ["s.png"]);
    expect(d.slides[0].bgImage).toBe("asset:a.jpg");
    expect(d.slides[1].bgImage).toBe("asset:b.jpg");
    expect(d.slides[2].images).toEqual(["asset:s.png", "asset:a.jpg", "asset:b.jpg"]);
    expect(buildKacaSlideDoc({ ...d, slides: [{ ...d.slides[0], bgImage: "data:image/png;base64,AAAA" }] }, 0)).toContain("cvP");
  });
  it("leaves a deck untouched without photos", () => {
    const d = featureDeck(FEATURES[0], "reel");
    expect(withPhotos(d, [], [])).toEqual(d);
  });
  it("prefers Drive previews and makes stored paths absolute", () => {
    process.env.PUBLIC_BASE_URL = "https://qr.example";
    const r = displayUrls({ photoUrls: ["/storage/t/f/1.jpg", "https://r2/x.jpg"], drivePhotoIds: [], stripUrl: "/storage/t/f/s.jpg", driveStripId: null });
    expect(r.photos).toEqual(["https://qr.example/storage/t/f/1.jpg", "https://r2/x.jpg"]);
    expect(r.strip).toBe("https://qr.example/storage/t/f/s.jpg");
    const d = displayUrls({ photoUrls: ["u"], drivePhotoIds: [{ fileId: "f", viewUrl: "", downloadUrl: "", previewUrl: "https://drive/p" }], stripUrl: null, driveStripId: "sid" });
    expect(d.photos).toEqual(["https://drive/p"]);
    expect(d.strip).toContain("id=sid");
  });
});

describe("revision notes", () => {
  it("pulls the post back to draft and blocks approval until cleared", () => {
    const patch = revisionPatch("  hook kurang tajam  ", "2026-11-19T10:00:00.000Z");
    expect(patch.revision).toEqual({ text: "hook kurang tajam", at: "2026-11-19T10:00:00.000Z" });
    expect(patch.status).toBe("draft");
    const scheduled = post({ status: "scheduled" });
    expect(approvable({ ...scheduled, ...patch })).toBe(false);
    expect(approvable(post({ status: "draft" }))).toBe(true);
  });
  it("clears the request on an empty note without changing the status", () => {
    const patch = revisionPatch("   ", "2026-11-19T10:00:00.000Z");
    expect(patch).toEqual({ revision: undefined });
    expect(approvable({ ...post({ status: "draft" }), ...patch })).toBe(true);
  });
  it("caps very long notes", () => {
    expect(revisionPatch("x".repeat(5000), "t").revision?.text.length).toBe(1000);
  });
});

describe("Instagram account discovery", () => {
  const app = { id: "123456", secret: "s".repeat(32) };
  function meta(pages: unknown, fail?: { code: number; message: string }): { f: Fetcher; urls: string[] } {
    const urls: string[] = [];
    const f: Fetcher = async (url) => {
      urls.push(url);
      if (fail) return { ok: false, status: 400, json: async () => ({ error: fail }) };
      return { ok: true, status: 200, json: async () => (url.includes("oauth/access_token") ? { access_token: "LONG" + "x".repeat(30) } : { data: pages }) };
    };
    return { f, urls };
  }
  it("exchanges the token and returns the page token for pages with an Instagram account", async () => {
    const { f, urls } = meta([{ name: "STUDIODO", access_token: "PAGE" + "y".repeat(30), instagram_business_account: { id: "17841", username: "studiodo.id" } }, { name: "Tanpa IG", access_token: "p" }]);
    const r = await discoverAccounts("SHORT" + "z".repeat(30), app, f);
    expect(r).toEqual([{ igUserId: "17841", username: "studiodo.id", pageName: "STUDIODO", pageToken: "PAGE" + "y".repeat(30) }]);
    expect(urls[0]).toContain("grant_type=fb_exchange_token");
    expect(urls[1]).toContain("access_token=LONG");
  });
  it("returns an empty list when no page has an Instagram account", async () => {
    expect(await discoverAccounts("t".repeat(30), app, meta([{ name: "A", access_token: "p" }]).f)).toEqual([]);
  });
  it("surfaces Meta errors without echoing the app secret", async () => {
    const { f } = meta([], { code: 190, message: "Invalid OAuth access token" });
    await expect(discoverAccounts("t".repeat(30), app, f)).rejects.toThrow(/Invalid OAuth access token \(kode 190\)/);
    await expect(discoverAccounts("t".repeat(30), app, f)).rejects.not.toThrow(new RegExp(app.secret));
  });
});

describe("Instagram publishing", () => {
  const conn = { userId: "1789", token: "T".repeat(30), host: "https://graph.example", version: "v21.0" };
  function fake(): { f: Fetcher; calls: { url: string; body: URLSearchParams }[] } {
    const calls: { url: string; body: URLSearchParams }[] = [];
    let n = 0;
    const f: Fetcher = async (url, init) => {
      const body = new URLSearchParams(init?.body ?? url.split("?")[1] ?? "");
      calls.push({ url: url.split("?")[0], body });
      const json = url.includes("fields=status_code") ? { status_code: "FINISHED" } : url.includes("fields=permalink") ? { permalink: "https://instagram.com/p/abc" } : { id: `id${++n}` };
      return { ok: true, status: 200, json: async () => json };
    };
    return { f, calls };
  }
  const noSleep = async () => undefined;

  it("publishes a carousel: items, container, publish", async () => {
    const { f, calls } = fake();
    const r = await publishPost(conn, { type: "images", urls: ["https://x/1.jpg", "https://x/2.jpg"], caption: "hi" }, f, noSleep);
    const posts = calls.filter((c) => c.body.has("is_carousel_item") || c.body.get("media_type") === "CAROUSEL" || c.url.endsWith("media_publish"));
    expect(posts.map((c) => c.url.split("/").pop())).toEqual(["media", "media", "media", "media_publish"]);
    expect(posts[2].body.get("children")).toBe("id1,id2");
    expect(posts[2].body.get("caption")).toBe("hi");
    expect(posts[3].body.get("creation_id")).toBe("id3");
    expect(r).toEqual({ id: "id4", permalink: "https://instagram.com/p/abc" });
  });

  it("publishes a reel with cover and share_to_feed", async () => {
    const { f, calls } = fake();
    await publishPost(conn, { type: "reel", urls: ["https://x/r.mp4"], coverUrl: "https://x/c.jpg", caption: "c" }, f, noSleep);
    expect(calls[0].body.get("media_type")).toBe("REELS");
    expect(calls[0].body.get("video_url")).toBe("https://x/r.mp4");
    expect(calls[0].body.get("cover_url")).toBe("https://x/c.jpg");
    expect(calls[0].body.get("share_to_feed")).toBe("true");
  });

  it("surfaces Instagram errors and processing failures", async () => {
    const bad: Fetcher = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: "Invalid token", code: 190 } }) });
    await expect(publishPost(conn, { type: "images", urls: ["https://x/1.jpg"], caption: "" }, bad, noSleep)).rejects.toThrow(/Invalid token.*190/);
    let step = 0;
    const err: Fetcher = async () => ({ ok: true, status: 200, json: async () => (step++ === 0 ? { id: "c1" } : { status_code: "ERROR", status: "bad video" }) });
    await expect(publishPost(conn, { type: "reel", urls: ["https://x/r.mp4"], caption: "" }, err, noSleep)).rejects.toThrow(/ERROR/);
    await expect(publishPost(conn, { type: "images", urls: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"], caption: "" }, fake().f, noSleep)).rejects.toThrow(/2 sampai 10/);
  });

  it("trims captions to Instagram's limits", () => {
    expect(buildCaption("hi", ["#a", "#b"])).toBe("hi\n\n#a #b");
    expect(buildCaption("x".repeat(3000), []).length).toBe(2200);
    expect(buildCaption("hi", Array.from({ length: 40 }, (_, i) => `#t${i}`)).split(" ").length).toBeLessThanOrEqual(31);
  });
});

describe("story reels", () => {
  it("every registered reel points at a real feature and builds a one-slide reel deck", async () => {
    const { STORY_REELS, storyReelDeck } = await import("./storyReels.js");
    const { featureById } = await import("./features.js");
    expect(STORY_REELS.length).toBeGreaterThan(0);
    for (const r of STORY_REELS) {
      expect(featureById(r.featureId), r.id).toBeTruthy();
      const d = storyReelDeck(r);
      expect(d.format).toBe("reel");
      expect(d.storyReel).toBe(r.id);
      expect(d.slides.length).toBe(1);
    }
  });
  it("never uses the same call to action twice in a row", async () => {
    const { STORY_REELS } = await import("./storyReels.js");
    STORY_REELS.slice(1).forEach((r, i) => expect(r.cta, `${STORY_REELS[i].id} -> ${r.id}`).not.toBe(STORY_REELS[i].cta));
  });
});

describe("program 1 bulan (3 posts a day)", () => {
  const base = { startDate: "2026-11-23", weeks: 5, days: [0, 1, 2, 3, 4, 5, 6], times: ["09:00", "14:00", "18:30"], reelEvery: 0, tzOffsetMin: 420, used: [] as { featureId: string; format: "carousel" | "reel" }[] };
  const slotFormats = { "09:00": "reel", "14:00": "carousel", "18:30": "reel" } as const;
  it("puts a reel at 09:00 and 18:30 and a carousel at 14:00, every day", () => {
    const slots = planAutopilot({ ...base, slotFormats: { ...slotFormats } });
    expect(slots.length).toBeGreaterThanOrEqual(90);
    for (const s of slots) expect(s.format, s.local).toBe(slotFormats[s.local.slice(11) as keyof typeof slotFormats]);
  });
  it("keeps going when a format runs out (second round) instead of stopping early", () => {
    const slots = planAutopilot({ ...base, weeks: 12, slotFormats: { ...slotFormats } });
    expect(slots.filter((s) => s.format === "reel").length).toBeGreaterThan(FEATURES.length);
  });
  it("never picks excluded features", () => {
    const skip = FEATURES.slice(0, 8).map((f) => f.id);
    const slots = planAutopilot({ ...base, slotFormats: { ...slotFormats }, excludeFeatureIds: skip });
    expect(slots.some((s) => skip.includes(s.featureId))).toBe(false);
  });
  it("holds back anything flagged cek-dulu until the owner confirms it", async () => {
    const { heldKeys } = await import("./publisher.js");
    const none = heldKeys([]);
    expect(none.features.length).toBeGreaterThan(0);
    const confirmed = heldKeys([`f:${none.features[0]}`]);
    expect(confirmed.features).not.toContain(none.features[0]);
    expect(none.reels.length).toBeGreaterThan(0);
  });
  it("validates slot formats and confirmed keys in settings", async () => {
    const { DEFAULT_SETTINGS, parseSettings } = await import("./schedule.js");
    const out = parseSettings({ ...DEFAULT_SETTINGS, slotFormats: { "09:00": "reel", "bad": "reel", "10:00": "x" }, checkedKeys: ["f:kamera-sdk", "oops", "r:wifi"] }, DEFAULT_SETTINGS);
    expect(typeof out).not.toBe("string");
    if (typeof out !== "string") { expect(out.slotFormats).toEqual({ "09:00": "reel" }); expect(out.checkedKeys).toEqual(["f:kamera-sdk", "r:wifi"]); }
  });
});
