import { Router } from "express";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { siteContent, superadmins } from "../db/schema.js";
import { SECTION_DEFS, SECTION_KEYS, getDef, resolveContent, sanitizeSectionData, type StoredRow } from "../lib/siteContent.js";
import { logEvent } from "../lib/platformEvents.js";

async function loadRows(): Promise<StoredRow[]> {
  const rows = await db.select().from(siteContent);
  return rows.map((r) => ({ key: r.key, data: r.data, enabled: r.enabled, sortOrder: r.sortOrder }));
}

// --- Public: what the marketing website renders --------------------------------

export const publicContentRouter = Router();

// GET /api/public/content — PUBLIC, no auth. Enabled sections in display order,
// each with its data already merged over the built-in defaults.
publicContentRouter.get("/content", async (_req, res) => {
  const { site, sections } = resolveContent(await loadRows());
  res.set("Cache-Control", "public, max-age=30");
  res.json({
    site: site.data,
    sections: sections.filter((s) => s.enabled).map((s) => ({ key: s.def.key, data: s.data })),
  });
});

// --- Superadmin: mounted under /api/superadmin/site-content (auth applied by the parent router)

export const siteContentAdminRouter = Router();

// GET /api/superadmin/site-content — every section with its field schema, defaults and current state.
siteContentAdminRouter.get("/", async (_req, res) => {
  const { site, sections } = resolveContent(await loadRows());
  const toDto = (m: typeof site) => ({
    key: m.def.key,
    label: m.def.label,
    description: m.def.description,
    fixed: !!m.def.fixed,
    fields: m.def.fields,
    defaults: m.def.defaults,
    data: m.data,
    enabled: m.enabled,
    customized: m.customized,
  });
  res.json([...sections.map(toDto), toDto(site)]);
});

async function actor(req: { superadminId?: string }) {
  if (!req.superadminId) return null;
  const [row] = await db.select({ email: superadmins.email }).from(superadmins).where(eq(superadmins.id, req.superadminId));
  return row?.email ?? null;
}

// PUT /api/superadmin/site-content/order — { keys: string[] } new display order of the reorderable sections.
// Registered before "/:key" so "order" is never read as a section key.
siteContentAdminRouter.put("/order", async (req, res) => {
  const keys: unknown = req.body?.keys;
  const reorderable = SECTION_DEFS.filter((d) => !d.fixed).map((d) => d.key);
  if (!Array.isArray(keys) || keys.length !== reorderable.length || !keys.every((k) => typeof k === "string") || new Set(keys).size !== keys.length || !keys.every((k) => reorderable.includes(k))) {
    return res.status(400).json({ error: "Urutan tidak valid: harus memuat semua section tepat satu kali" });
  }
  const email = await actor(req);
  await db.transaction(async (tx) => {
    for (const [index, key] of (keys as string[]).entries()) {
      await tx.insert(siteContent)
        .values({ key, data: {}, sortOrder: index, updatedBy: email })
        .onConflictDoUpdate({ target: siteContent.key, set: { sortOrder: index, updatedBy: email, updatedAt: new Date() } });
    }
  });
  logEvent({ category: "system", action: "site_content.reordered", message: "Urutan section website diubah", actorType: "superadmin", actorLabel: email ?? undefined });
  res.json({ ok: true });
});

// PUT /api/superadmin/site-content/:key — { data?, enabled? }
siteContentAdminRouter.put("/:key", async (req, res) => {
  const def = getDef(req.params.key);
  if (!def) return res.status(404).json({ error: "Section tidak ditemukan" });

  const email = await actor(req);
  const patch: { data?: Record<string, unknown>; enabled?: boolean } = {};
  if (req.body?.data !== undefined) {
    try {
      patch.data = sanitizeSectionData(def, req.body.data);
    } catch (e) {
      return res.status(400).json({ error: e instanceof Error ? e.message : "Data tidak valid" });
    }
  }
  if (req.body?.enabled !== undefined) {
    if (typeof req.body.enabled !== "boolean") return res.status(400).json({ error: "enabled harus true/false" });
    if (def.fixed && req.body.enabled === false) return res.status(400).json({ error: "Pengaturan umum tidak bisa dinonaktifkan" });
    patch.enabled = req.body.enabled;
  }
  if (patch.data === undefined && patch.enabled === undefined) return res.status(400).json({ error: "Tidak ada perubahan" });

  await db.insert(siteContent)
    .values({ key: def.key, data: patch.data ?? {}, enabled: patch.enabled ?? true, updatedBy: email })
    .onConflictDoUpdate({
      target: siteContent.key,
      set: { ...patch, updatedBy: email, updatedAt: new Date() },
    });
  logEvent({ category: "system", action: "site_content.updated", message: `Konten website "${def.label}" diperbarui`, actorType: "superadmin", actorLabel: email ?? undefined });
  res.json({ ok: true });
});

// DELETE /api/superadmin/site-content/:key — reset a section back to the built-in defaults.
siteContentAdminRouter.delete("/:key", async (req, res) => {
  if (!SECTION_KEYS.includes(req.params.key)) return res.status(404).json({ error: "Section tidak ditemukan" });
  await db.delete(siteContent).where(inArray(siteContent.key, [req.params.key]));
  const email = await actor(req);
  logEvent({ category: "system", action: "site_content.reset", message: `Konten website "${req.params.key}" dikembalikan ke default`, actorType: "superadmin", actorLabel: email ?? undefined });
  res.json({ ok: true });
});
