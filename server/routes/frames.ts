import { Router } from "express";
import { db } from "../db/client.js";
import { templates, frameOverlays } from "../db/schema.js";
import { eq } from "drizzle-orm";

export const framesRouter = Router();

// GET /api/frames?orientation=portrait — kiosk "Pilih Frame" screen
framesRouter.get("/", async (req, res) => {
  const orientation = (req.query.orientation as string) || "portrait";

  const [customTemplates, overlays] = await Promise.all([
    db.select().from(templates).where(eq(templates.active, true)),
    db.select().from(frameOverlays).where(eq(frameOverlays.active, true)),
  ]);

  const merged = [
    ...customTemplates
      .filter((t) => t.orientation === orientation)
      .map((t) => ({ id: t.id, kind: "template" as const, name: t.name, imageUrl: t.frameImageUrl, slots: t.slots, canvasWidth: t.canvasWidth, canvasHeight: t.canvasHeight, orientation: t.orientation })),
    ...overlays
      .filter((o) => o.orientation === orientation)
      .map((o) => ({ id: o.id, kind: "overlay" as const, name: o.name, imageUrl: o.imageUrl })),
  ];

  res.json(merged);
});

// POST /api/frames — admin: persist an uploaded frame for every kiosk client
framesRouter.post("/", async (req, res) => {
  const { id, name, frameImageUrl, slots, canvasWidth, canvasHeight, orientation } = req.body;
  if (!String(name ?? "").trim() || !String(frameImageUrl ?? "").startsWith("data:image/") || !Array.isArray(slots)) {
    return res.status(400).json({ error: "Data frame tidak valid" });
  }

  const [row] = await db.insert(templates).values({
    ...(id ? { id } : {}),
    name: String(name).trim(),
    frameImageUrl: String(frameImageUrl),
    slots,
    canvasWidth: Number(canvasWidth) || 1200,
    canvasHeight: Number(canvasHeight) || 1800,
    orientation: orientation === "landscape" ? "landscape" : "portrait",
  }).returning();

  res.status(201).json({
    id: row.id,
    kind: "template",
    name: row.name,
    imageUrl: row.frameImageUrl,
    slots: row.slots,
  });
});

// DELETE /api/frames/:id — admin: hapus frame dari server
framesRouter.delete("/:id", async (req, res) => {
  const id = String(req.params.id);
  const [deleted] = await db.delete(templates).where(eq(templates.id, id)).returning();
  if (!deleted) return res.status(404).json({ error: "Frame tidak ditemukan" });
  res.json({ ok: true, id: deleted.id });
});
