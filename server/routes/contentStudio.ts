import { Router } from "express";
import { IDEA_BACKLOG } from "../lib/contentStudio/decks.js";
import { deleteAsset, deleteDeck, getJob, jobFilePath, listAssets, listDecks, previewDoc, renderEnvironment, saveAsset, saveDeck, startRender } from "../lib/contentStudio/render.js";
import { loadPlan, parsePlan, reschedule, savePlan } from "../lib/contentStudio/plan.js";
import type { Deck } from "../lib/contentStudio/types.js";

// Superadmin → Konten Instagram: mounted under /api/superadmin/content-studio (auth applied by the parent router).
export const contentStudioAdminRouter = Router();

const KINDS = ["cover", "feature", "steps", "stat", "compare", "cta"];
const TONES = ["light", "dark", "indigo", "mint"];

function parseDeck(input: any): Deck | string {
  if (!input || typeof input !== "object") return "Deck tidak valid";
  const id = String(input.id ?? "").replace(/[^a-z0-9-]/gi, "").slice(0, 60);
  if (!id) return "ID deck wajib";
  if (!Array.isArray(input.slides) || input.slides.length > 14) return "Slide tidak valid (maks 14)";
  for (const s of input.slides) {
    if (!KINDS.includes(s?.kind) || typeof s?.title !== "string") return "Ada slide yang tidak valid";
    if (s.tone && !TONES.includes(s.tone)) return "Tone tidak valid";
  }
  return {
    id, title: String(input.title ?? "Tanpa judul").slice(0, 120),
    format: input.format === "reel" ? "reel" : "carousel",
    tone: TONES.includes(input.tone) ? input.tone : "light",
    handle: String(input.handle ?? "studiodo.id").replace(/^@/, "").slice(0, 60),
    caption: String(input.caption ?? "").slice(0, 2200),
    hashtags: Array.isArray(input.hashtags) ? input.hashtags.map(String).slice(0, 30) : [],
    slides: input.slides,
  };
}

contentStudioAdminRouter.get("/status", (_req, res) => res.json(renderEnvironment()));
contentStudioAdminRouter.get("/decks", async (_req, res) => res.json(await listDecks()));
contentStudioAdminRouter.get("/ideas", (_req, res) => res.json(IDEA_BACKLOG));

contentStudioAdminRouter.put("/decks/:id", async (req, res) => {
  const deck = parseDeck({ ...req.body, id: req.params.id });
  if (typeof deck === "string") return res.status(400).json({ error: deck });
  res.json(await saveDeck(deck));
});

contentStudioAdminRouter.delete("/decks/:id", async (req, res) => {
  await deleteDeck(req.params.id.replace(/[^a-z0-9-]/gi, ""));
  res.json({ ok: true });
});

// POST { deck, index } -> { html }. The editor drops it into an iframe, so the preview is the very template that is rendered.
contentStudioAdminRouter.post("/preview", async (req, res) => {
  const deck = parseDeck(req.body?.deck);
  if (typeof deck === "string") return res.status(400).json({ error: deck });
  try { res.json({ html: await previewDoc(deck, Number(req.body?.index) || 0) }); }
  catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : "Gagal membuat preview" }); }
});

contentStudioAdminRouter.post("/render", async (req, res) => {
  const deck = parseDeck(req.body?.deck);
  if (typeof deck === "string") return res.status(400).json({ error: deck });
  const mode = req.body?.mode === "mp4" ? "mp4" : "png";
  try { res.json(await startRender(deck, mode)); }
  catch (e) { res.status(409).json({ error: e instanceof Error ? e.message : "Gagal memulai render" }); }
});

contentStudioAdminRouter.get("/jobs/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job tidak ditemukan (server restart?)" });
  res.json(job);
});

contentStudioAdminRouter.get("/jobs/:id/files/:name", (req, res) => {
  const file = jobFilePath(req.params.id, req.params.name);
  if (!file) return res.status(404).json({ error: "File tidak ditemukan" });
  res.download(file);
});

contentStudioAdminRouter.get("/assets", async (_req, res) => res.json(await listAssets()));
contentStudioAdminRouter.post("/assets", async (req, res) => {
  try { res.json({ name: await saveAsset(String(req.body?.name ?? ""), String(req.body?.dataUrl ?? "")) }); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Gagal menyimpan" }); }
});
contentStudioAdminRouter.delete("/assets/:name", async (req, res) => { await deleteAsset(req.params.name); res.json({ ok: true }); });

// ---- content plan: order, schedule and per-post checklist ----
contentStudioAdminRouter.get("/plan", async (_req, res) => res.json(await loadPlan()));

contentStudioAdminRouter.put("/plan", async (req, res) => {
  const plan = parsePlan(req.body);
  if (typeof plan === "string") return res.status(400).json({ error: plan });
  res.json(await savePlan(plan));
});

// POST { startDate, days, time } -> the stored plan re-dated (posted items keep their date). The editor shows it, then saves.
contentStudioAdminRouter.post("/plan/reschedule", async (req, res) => {
  const base = parsePlan(req.body?.plan);
  if (typeof base === "string") return res.status(400).json({ error: base });
  try {
    const { startDate, days, time } = req.body ?? {};
    res.json(await savePlan(reschedule(base, { startDate: String(startDate), days: Array.isArray(days) ? days.map(Number) : [], time: String(time ?? "19:00") })));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Gagal menyusun jadwal" });
  }
});
