import { Router } from "express";
import { clientIp, makeRateLimiter } from "../lib/clientIp.js";
import { applyUnsubscribe, describeUnsubscribe } from "../lib/emailPrefs.js";
import { confirmPasswordReset, requestPasswordReset, resendVerification, verifyEmail, type Realm } from "../lib/accountEmail.js";

// Public endpoints behind the links in emails (no login: the signed token IS the credential).
// Mounted under /api/public. All of them are rate limited per client IP; the "request" ones also per address.

export const accountEmailRouter = Router();

const ipLimited = makeRateLimiter(20, 60 * 60 * 1000);
const resetByEmail = makeRateLimiter(3, 60 * 60 * 1000);
const resendByEmail = makeRateLimiter(3, 60 * 60 * 1000);
const UUID_RE = /^[0-9a-f-]{36}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const realmOf = (v: unknown): Realm | null => (v === "tenant" || v === "creator" ? v : null);
const statusFor = (error: string) => (error === "not_found" ? 404 : error === "expired" || error === "used" ? 410 : 400);

// POST /verify-email — { jenis: "tenant"|"creator", id, token }
accountEmailRouter.post("/verify-email", async (req, res) => {
  if (ipLimited(clientIp(req))) return res.status(429).json({ error: "Terlalu banyak percobaan. Coba lagi nanti." });
  const kind = realmOf(req.body?.jenis);
  const id = String(req.body?.id ?? "");
  if (!kind || !UUID_RE.test(id)) return res.status(400).json({ error: "Tautan tidak valid" });
  const r = await verifyEmail(kind, id, String(req.body?.token ?? ""));
  if (!r.ok) return res.status(statusFor(r.error)).json({ error: r.message, code: r.error });
  res.json({ ok: true });
});

// POST /resend-verification — { jenis, email }. Always 200, whether or not such a signup exists.
accountEmailRouter.post("/resend-verification", async (req, res) => {
  const ip = clientIp(req);
  if (ipLimited(ip)) return res.status(429).json({ error: "Terlalu banyak percobaan. Coba lagi nanti." });
  const kind = realmOf(req.body?.jenis);
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  if (!kind || !EMAIL_RE.test(email)) return res.status(400).json({ error: "Isi alamat email yang valid" });
  if (!resendByEmail(`${kind}:${email}`)) void resendVerification(kind, email).catch((e) => console.error("[STUDIODO] resend verifikasi gagal:", e instanceof Error ? e.message : e));
  res.json({ ok: true });
});

// POST /password-reset/request — { jenis, email }. Always 200 (no account enumeration).
accountEmailRouter.post("/password-reset/request", async (req, res) => {
  const ip = clientIp(req);
  if (ipLimited(ip)) return res.status(429).json({ error: "Terlalu banyak percobaan. Coba lagi nanti." });
  const realm = realmOf(req.body?.jenis);
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  if (!realm || !EMAIL_RE.test(email)) return res.status(400).json({ error: "Isi alamat email yang valid" });
  if (!resetByEmail(`${realm}:${email}`)) void requestPasswordReset(realm, email).catch((e) => console.error("[STUDIODO] reset password gagal:", e instanceof Error ? e.message : e));
  res.json({ ok: true });
});

// POST /password-reset/confirm — { jenis, token, password }
accountEmailRouter.post("/password-reset/confirm", async (req, res) => {
  if (ipLimited(clientIp(req))) return res.status(429).json({ error: "Terlalu banyak percobaan. Coba lagi nanti." });
  const realm = realmOf(req.body?.jenis);
  if (!realm) return res.status(400).json({ error: "Tautan tidak valid" });
  const r = await confirmPasswordReset(realm, String(req.body?.token ?? ""), String(req.body?.password ?? ""));
  if (!r.ok) return res.status(statusFor(r.error)).json({ error: r.message, code: r.error });
  res.json({ ok: true });
});

// GET /email-unsubscribe?token= — what the link would switch off (changes nothing: mail scanners open links).
accountEmailRouter.get("/email-unsubscribe", (req, res) => {
  const r = describeUnsubscribe(String(req.query.token ?? ""));
  if (!r.ok) return res.status(400).json({ error: r.message });
  res.json({ category: r.category, label: r.label, realm: r.realm });
});

// POST /email-unsubscribe — { token } in the body or ?token= (supports mail clients' one-click unsubscribe).
accountEmailRouter.post("/email-unsubscribe", async (req, res) => {
  if (ipLimited(clientIp(req))) return res.status(429).json({ error: "Terlalu banyak percobaan. Coba lagi nanti." });
  const r = await applyUnsubscribe(String(req.body?.token ?? req.query.token ?? ""));
  if (!r.ok) return res.status(400).json({ error: r.message });
  res.json({ ok: true, label: r.label });
});
