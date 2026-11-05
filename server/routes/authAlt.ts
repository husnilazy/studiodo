import express, { Router, type Request } from "express";
import { esc } from "../lib/mailer.js";
import { clientIp } from "../lib/clientIp.js";
import { logEvent } from "../lib/platformEvents.js";
import { deliver, magicLinkMail } from "../lib/emails.js";
import { exchangeGoogleCode, googleAuthUrl, googleClientId, googleCodeFlowConfigured, googleConfigured, verifyGoogleIdToken } from "../lib/googleAuth.js";
import { MAGIC_PER_EMAIL_PER_HOUR, approve, attachMagicSecret, findAdminByEmail, getLiveHandoff, markFailed, markVerified, poll, recentMagicCount, startHandoff, tokenFor, verifyMagic } from "../lib/loginHandoff.js";
import { mailConfigured } from "../lib/mailer.js";

// Passwordless tenant-admin sign-in, mounted next to the password login at /api/auth. See lib/loginHandoff.ts for the model.
export const authAltRouter = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_REGISTERED = "Email ini belum terdaftar sebagai admin tenant STUDIODO. Gunakan email yang sama dengan akun Anda, atau hubungi tim STUDIODO.";

/** This API's own public address (Google redirects back here). PUBLIC_BASE_URL wins; otherwise derived from the request. */
function publicBase(req: Request): string {
  const fixed = (process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  if (fixed) return fixed;
  const proto = String(req.headers["x-forwarded-proto"] ?? req.protocol).split(",")[0];
  return `${proto}://${req.get("host")}`;
}

// A small per-IP brake on starting flows (the per-email cap for magic links lives in the database).
const starts = new Map<string, number[]>();
function tooManyStarts(ip: string): boolean {
  const now = Date.now();
  const recent = (starts.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  recent.push(now);
  starts.set(ip, recent);
  if (starts.size > 5000) starts.clear();
  return recent.length > 30;
}

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} — STUDIODO</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f5fb;font-family:system-ui,Segoe UI,sans-serif;color:#0b1020}main{width:min(92vw,420px);background:#fff;border-radius:24px;padding:32px;box-shadow:0 20px 60px -20px rgba(20,20,60,.25)}h1{font-size:22px;margin:0 0 8px}p{color:#4b5470;line-height:1.5;font-size:15px}button{width:100%;border:0;border-radius:14px;background:#6c63ff;color:#fff;font-weight:700;font-size:16px;padding:14px;cursor:pointer;margin-top:8px}.meta{background:#f4f5fb;border-radius:12px;padding:10px 14px;font-size:13px;color:#4b5470}.ok{font-size:40px}</style></head><body><main>${body}</main></body></html>`;
  return { status, html };
}
const send = (res: express.Response, p: { status: number; html: string }) => res.status(p.status).type("html").setHeader("Cache-Control", "no-store").send(p.html);

// GET /providers — what the login screen may offer
authAltRouter.get("/providers", (_req, res) => {
  res.json({ google: googleCodeFlowConfigured(), googleButton: googleConfigured(), googleClientId: googleConfigured() ? googleClientId() : null, magic: mailConfigured() });
});

// POST /google { credential } — web "Masuk dengan Google" button (Google Identity Services hands the page an ID token)
authAltRouter.post("/google", async (req, res) => {
  const credential = String(req.body?.credential ?? "");
  if (!credential) return res.status(400).json({ error: "Token Google tidak ada." });
  if (!googleConfigured()) return res.status(503).json({ error: "Login Google belum diaktifkan." });
  const verified = await verifyGoogleIdToken(credential);
  if (!verified.ok) return res.status(401).json({ error: verified.error });
  const admin = await findAdminByEmail(verified.identity.email);
  if (!admin) return res.status(404).json({ error: NOT_REGISTERED });
  logEvent({ tenantId: admin.tenantId, level: "info", category: "auth", action: "login.google", message: `${admin.email} masuk dengan Google`, actorType: "tenant_admin", actorLabel: admin.email });
  res.json({ token: tokenFor(admin) });
});

// POST /handoff/google — the app asks for a browser sign-in; returns the URL to open and a secret to poll with
authAltRouter.post("/handoff/google", async (req, res) => {
  if (!googleCodeFlowConfigured()) return res.status(503).json({ error: "Login Google belum diaktifkan." });
  const ip = clientIp(req);
  if (tooManyStarts(ip)) return res.status(429).json({ error: "Terlalu banyak percobaan, coba lagi nanti." });
  const { id, poll: secret } = await startHandoff("google", { ip, ua: req.get("user-agent") ?? null });
  res.status(201).json({ id, poll: secret, url: `${publicBase(req)}/api/auth/google/start?h=${id}`, expiresInSeconds: 600 });
});

authAltRouter.get("/google/start", async (req, res) => {
  const id = String(req.query.h ?? "");
  const row = UUID.test(id) ? await getLiveHandoff(id) : undefined;
  if (!row || row.kind !== "google" || row.status !== "pending" || !googleCodeFlowConfigured()) return send(res, page("Tautan tidak berlaku", "<h1>Tautan tidak berlaku</h1><p>Permintaan masuk ini sudah kedaluwarsa. Kembali ke aplikasi dan mulai lagi.</p>", 410));
  res.redirect(googleAuthUrl(`${publicBase(req)}/api/auth/google/callback`, id));
});

authAltRouter.get("/google/callback", async (req, res) => {
  const id = String(req.query.state ?? "");
  const code = String(req.query.code ?? "");
  const row = UUID.test(id) ? await getLiveHandoff(id) : undefined;
  if (!row || row.kind !== "google" || row.status !== "pending") return send(res, page("Tautan tidak berlaku", "<h1>Tautan tidak berlaku</h1><p>Permintaan masuk ini sudah kedaluwarsa. Kembali ke aplikasi dan mulai lagi.</p>", 410));
  const fail = async (message: string) => { await markFailed(id, message); return send(res, page("Gagal masuk", `<h1>Gagal masuk</h1><p>${esc(message)}</p><p>Anda bisa menutup halaman ini dan mencoba lagi dari aplikasi.</p>`, 400)); };
  if (!code || req.query.error) return fail("Masuk dengan Google dibatalkan.");
  const exchanged = await exchangeGoogleCode(code, `${publicBase(req)}/api/auth/google/callback`);
  if (!exchanged.ok) return fail(exchanged.error);
  const verified = await verifyGoogleIdToken(exchanged.idToken);
  if (!verified.ok) return fail(verified.error);
  const admin = await findAdminByEmail(verified.identity.email);
  if (!admin) return fail(NOT_REGISTERED);
  const confirm = await markVerified(id, admin.id, admin.email);
  if (!confirm) return fail("Permintaan masuk ini sudah tidak berlaku.");
  send(res, confirmPage(id, confirm, admin.email, row.requestIp, row.requestUa));
});

// POST /handoff/magic { email } — emails a sign-in link. Always answers the same, so it cannot be used to discover accounts.
authAltRouter.post("/handoff/magic", async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: "Masukkan alamat email yang valid." });
  const ip = clientIp(req);
  if (tooManyStarts(ip)) return res.status(429).json({ error: "Terlalu banyak percobaan, coba lagi nanti." });
  const { id, poll: secret } = await startHandoff("magic", { ip, ua: req.get("user-agent") ?? null, email });
  const admin = await findAdminByEmail(email);
  if (admin && (await recentMagicCount(email)) <= MAGIC_PER_EMAIL_PER_HOUR) {
    const token = await attachMagicSecret(id, admin.id, admin.email);
    void deliver(admin.email, magicLinkMail({ url: `${publicBase(req)}/api/auth/magic?h=${id}&t=${token}`, minutes: 10, device: req.get("user-agent") ?? "", ip }), { tenantId: admin.tenantId, what: "tautan masuk" });
    logEvent({ tenantId: admin.tenantId, level: "info", category: "auth", action: "login.magic_requested", message: `Tautan masuk dikirim ke ${admin.email}`, actorType: "system", actorLabel: admin.email });
  }
  res.status(201).json({ id, poll: secret, expiresInSeconds: 600 });
});

// GET /magic?h&t — the email link. Opening it only shows the confirm page; nothing is approved until the person clicks.
authAltRouter.get("/magic", async (req, res) => {
  const id = String(req.query.h ?? "");
  const token = String(req.query.t ?? "");
  if (!UUID.test(id) || !(await verifyMagic(id, token))) return send(res, page("Tautan tidak berlaku", "<h1>Tautan tidak berlaku</h1><p>Tautan masuk ini sudah dipakai atau kedaluwarsa. Minta tautan baru dari aplikasi.</p>", 410));
  const row = (await getLiveHandoff(id))!;
  send(res, confirmPage(id, token, row.email ?? "", row.requestIp, row.requestUa));
});

function confirmPage(id: string, confirm: string, email: string, ip: string | null, ua: string | null) {
  const device = (ua ?? "").includes("Electron") ? "aplikasi STUDIODO" : "perangkat lain";
  return page("Konfirmasi masuk", `<div class="ok">🔐</div><h1>Masuk ke STUDIODO?</h1><p>Ada permintaan masuk ke akun <b>${esc(email)}</b> dari ${esc(device)}${ip ? ` (IP ${esc(ip)})` : ""}.</p><p class="meta">Setujui hanya jika Anda sendiri yang memintanya barusan.</p>
<form method="post" action="/api/auth/confirm"><input type="hidden" name="h" value="${esc(id)}"><input type="hidden" name="c" value="${esc(confirm)}"><button type="submit">Ya, ini saya</button></form>`);
}

// POST /confirm — the click
authAltRouter.post("/confirm", express.urlencoded({ extended: false, limit: "4kb" }), async (req, res) => {
  const id = String(req.body?.h ?? "");
  const ok = UUID.test(id) && (await approve(id, String(req.body?.c ?? "")));
  if (!ok) return send(res, page("Gagal", "<h1>Tidak bisa dikonfirmasi</h1><p>Permintaan ini sudah kedaluwarsa atau sudah dipakai. Mulai lagi dari aplikasi.</p>", 410));
  send(res, page("Berhasil", '<div class="ok">✅</div><h1>Berhasil</h1><p>Anda sudah masuk. Kembali ke aplikasi STUDIODO — halaman ini boleh ditutup.</p>'));
});

// POST /handoff/:id/poll { poll } — the app collects the token once the person has approved
authAltRouter.post("/handoff/:id/poll", async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ status: "invalid" });
  const result = await poll(req.params.id, String(req.body?.poll ?? ""));
  res.setHeader("Cache-Control", "no-store").json(result);
});
