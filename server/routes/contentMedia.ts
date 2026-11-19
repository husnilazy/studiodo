import { Router } from "express";
import path from "node:path";
import { listPosts, publishDir } from "../lib/contentStudio/schedule.js";

// Public (no login): Instagram downloads the media of a post from here. The token in the URL is a random per-post secret
// and only works while the post is rendered and waiting to be / being published.
export const contentMediaRouter = Router();

contentMediaRouter.get("/ping", (_req, res) => res.json({ ok: true }));

contentMediaRouter.get("/:token/:file", async (req, res) => {
  const token = String(req.params.token);
  const file = path.basename(String(req.params.file));
  const post = token.length >= 24 ? (await listPosts()).find((p) => p.token === token && (p.status === "ready" || p.status === "posting")) : undefined;
  if (!post || ![...(post.files ?? []), post.coverFile].includes(file)) return res.status(404).json({ error: "Tidak ditemukan" });
  res.setHeader("Cache-Control", "private, max-age=300");
  res.sendFile(path.join(publishDir(post.id), file), { dotfiles: "allow" }, (err) => { if (err && !res.headersSent) res.status(404).end(); });
});
