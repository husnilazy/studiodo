import { Router } from "express";
import { db } from "../db/client.js";
import { packages } from "../db/schema.js";
import { eq } from "drizzle-orm";

export const packagesRouter = Router();

// GET /api/packages — kiosk "Pilih Paket" screen
packagesRouter.get("/", async (_req, res) => {
  const rows = await db
    .select()
    .from(packages)
    .where(eq(packages.active, true))
    .orderBy(packages.sortOrder);
  res.json(rows);
});

// GET /api/packages/all — admin panel (includes inactive)
packagesRouter.get("/all", async (_req, res) => {
  const rows = await db.select().from(packages).orderBy(packages.sortOrder);
  res.json(rows);
});

// POST /api/packages — admin: tambah paket
packagesRouter.post("/", async (req, res) => {
  const { name, price, photoCount, hasGif, hasVideo, extraPrints = [], sortOrder } = req.body;
  if (!String(name ?? "").trim() || Number(price) < 0 || Number(photoCount) < 1) {
    return res.status(400).json({ error: "Nama, harga, dan jumlah foto tidak valid" });
  }
  const [row] = await db
    .insert(packages)
    .values({ name: String(name).trim(), price, photoCount, hasGif: Boolean(hasGif), hasVideo: Boolean(hasVideo), extraPrints, sortOrder })
    .returning();
  res.status(201).json(row);
});

// PATCH /api/packages/:id — admin: edit paket
packagesRouter.patch("/:id", async (req, res) => {
  const [row] = await db
    .update(packages)
    .set(req.body)
    .where(eq(packages.id, req.params.id))
    .returning();
  if (!row) return res.status(404).json({ error: "Paket tidak ditemukan" });
  res.json(row);
});

// DELETE /api/packages/:id — admin: hapus paket
packagesRouter.delete("/:id", async (req, res) => {
  await db.delete(packages).where(eq(packages.id, req.params.id));
  res.status(204).end();
});
