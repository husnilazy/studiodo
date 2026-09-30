import { Router } from "express";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { blogPosts, superadmins } from "../db/schema.js";
import { logEvent } from "../lib/platformEvents.js";

// --- Public: what the marketing website's /blog renders ---------------------------

export const publicBlogRouter = Router();

// GET /api/public/blog — published posts, newest first (no body; the list only needs the teaser).
publicBlogRouter.get("/blog", async (_req, res) => {
  const rows = await db
    .select({ slug: blogPosts.slug, title: blogPosts.title, excerpt: blogPosts.excerpt, author: blogPosts.author, publishedAt: blogPosts.publishedAt })
    .from(blogPosts)
    .where(and(eq(blogPosts.status, "published"), isNotNull(blogPosts.publishedAt)))
    .orderBy(desc(blogPosts.publishedAt))
    .limit(100);
  res.set("Cache-Control", "public, max-age=30");
  res.json(rows);
});

// GET /api/public/blog/:slug — one published post with its Markdown body.
publicBlogRouter.get("/blog/:slug", async (req, res) => {
  const [row] = await db
    .select({ slug: blogPosts.slug, title: blogPosts.title, excerpt: blogPosts.excerpt, body: blogPosts.body, author: blogPosts.author, publishedAt: blogPosts.publishedAt })
    .from(blogPosts)
    .where(and(eq(blogPosts.slug, req.params.slug), eq(blogPosts.status, "published")));
  if (!row) return res.status(404).json({ error: "Artikel tidak ditemukan" });
  res.set("Cache-Control", "public, max-age=30");
  res.json(row);
});

// --- Superadmin: mounted under /api/superadmin/blog (auth applied by the parent router) ---

export const blogAdminRouter = Router();

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function actor(superadminId?: string) {
  if (!superadminId) return null;
  const [row] = await db.select({ email: superadmins.email }).from(superadmins).where(eq(superadmins.id, superadminId));
  return row?.email ?? null;
}

type Input = { slug: string; title: string; excerpt: string; body: string; author: string | null; status: "draft" | "published" };

function parseInput(body: unknown): { ok: true; value: Input } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const slug = str(b.slug).toLowerCase();
  const title = str(b.title);
  const excerpt = str(b.excerpt);
  const text = typeof b.body === "string" ? b.body : "";
  const author = str(b.author) || null;
  const status = b.status === "published" ? "published" : "draft";
  if (!title) return { ok: false, error: "Judul wajib diisi" };
  if (title.length > 150) return { ok: false, error: "Judul maksimal 150 karakter" };
  if (!slug || slug.length > 80 || !SLUG_RE.test(slug)) return { ok: false, error: "Slug hanya boleh huruf kecil, angka, dan tanda hubung (maks. 80 karakter)" };
  if (excerpt.length > 300) return { ok: false, error: "Ringkasan maksimal 300 karakter" };
  if (text.length > 50_000) return { ok: false, error: "Isi artikel maksimal 50.000 karakter" };
  if (author && author.length > 80) return { ok: false, error: "Nama penulis maksimal 80 karakter" };
  if (status === "published" && !text.trim()) return { ok: false, error: "Artikel yang dipublikasikan tidak boleh kosong" };
  return { ok: true, value: { slug, title, excerpt, body: text, author, status } };
}

// GET /api/superadmin/blog — every post (drafts included), newest edit first; body omitted from the list.
blogAdminRouter.get("/", async (_req, res) => {
  const rows = await db
    .select({ id: blogPosts.id, slug: blogPosts.slug, title: blogPosts.title, status: blogPosts.status, publishedAt: blogPosts.publishedAt, updatedAt: blogPosts.updatedAt })
    .from(blogPosts)
    .orderBy(desc(blogPosts.updatedAt));
  res.json(rows);
});

// GET /api/superadmin/blog/:id — full post for the editor.
blogAdminRouter.get("/:id", async (req, res) => {
  const [row] = await db.select().from(blogPosts).where(eq(blogPosts.id, req.params.id));
  if (!row) return res.status(404).json({ error: "Artikel tidak ditemukan" });
  res.json(row);
});

blogAdminRouter.post("/", async (req, res) => {
  const parsed = parseInput(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  const v = parsed.value;
  const [dupe] = await db.select({ id: blogPosts.id }).from(blogPosts).where(eq(blogPosts.slug, v.slug));
  if (dupe) return res.status(409).json({ error: "Slug sudah dipakai artikel lain" });
  const [row] = await db.insert(blogPosts).values({ ...v, publishedAt: v.status === "published" ? new Date() : null }).returning();
  logEvent({ category: "system", action: "blog.created", message: `Artikel blog "${v.title}" dibuat (${v.status})`, actorType: "superadmin", actorLabel: (await actor(req.superadminId)) ?? undefined });
  res.status(201).json(row);
});

blogAdminRouter.put("/:id", async (req, res) => {
  const [existing] = await db.select().from(blogPosts).where(eq(blogPosts.id, req.params.id));
  if (!existing) return res.status(404).json({ error: "Artikel tidak ditemukan" });
  const parsed = parseInput(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  const v = parsed.value;
  if (v.slug !== existing.slug) {
    const [dupe] = await db.select({ id: blogPosts.id }).from(blogPosts).where(eq(blogPosts.slug, v.slug));
    if (dupe) return res.status(409).json({ error: "Slug sudah dipakai artikel lain" });
  }
  // Keep the original publish date across edits; only stamp it the first time a post goes live,
  // and clear it if the post is pulled back to draft so re-publishing gets a fresh date.
  const publishedAt = v.status === "published" ? existing.publishedAt ?? new Date() : null;
  const [row] = await db.update(blogPosts).set({ ...v, publishedAt, updatedAt: new Date() }).where(eq(blogPosts.id, existing.id)).returning();
  logEvent({ category: "system", action: "blog.updated", message: `Artikel blog "${v.title}" diperbarui (${v.status})`, actorType: "superadmin", actorLabel: (await actor(req.superadminId)) ?? undefined });
  res.json(row);
});

blogAdminRouter.delete("/:id", async (req, res) => {
  const [row] = await db.delete(blogPosts).where(eq(blogPosts.id, req.params.id)).returning({ title: blogPosts.title });
  if (!row) return res.status(404).json({ error: "Artikel tidak ditemukan" });
  logEvent({ category: "system", action: "blog.deleted", message: `Artikel blog "${row.title}" dihapus`, actorType: "superadmin", actorLabel: (await actor(req.superadminId)) ?? undefined });
  res.json({ ok: true });
});
