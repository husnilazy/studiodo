import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { admins } from "../db/schema.js";
import { esc, layout, sendMail, type MailInput, type MailResult } from "./mailer.js";
import { logEvent } from "./platformEvents.js";
import { portalBaseUrl } from "./urls.js";
import { signEmailToken, passwordBind } from "./emailTokens.js";
import { getPrefs, unsubscribeUrl } from "./emailPrefs.js";
import { creators } from "../db/schema.js";

// Every automatic email STUDIODO sends, in one place: the wording, the links, and the delivery wrapper that records
// failures. Callers fire-and-forget (`void deliver(...)`): an email problem must never break the action that caused it.

type Mail = Omit<MailInput, "to">;

const DAY = 86_400_000;
export const VERIFY_TTL_MS = 7 * DAY;
export const RESET_TTL_MS = 2 * 60 * 60_000; // password reset links live 2 hours
export const SETUP_TTL_MS = 7 * DAY; // first-time "set your password" links live a week

const button = (url: string, label: string) =>
  `<p style="margin:22px 0"><a href="${esc(url)}" style="background:#0b1020;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:999px;display:inline-block">${esc(label)}</a></p>
<p style="font-size:12px;color:#7b849c;word-break:break-all">Jika tombol tidak berfungsi, salin tautan ini ke browser:<br>${esc(url)}</p>`;

const web = (path: string) => `${portalBaseUrl()}${path}`;

// --- delivery ---------------------------------------------------------------------------------------------

/** Send and record. A skipped send (no API key) is silent here — the callers that matter log it themselves. */
export async function deliver(to: string, mail: Mail, ctx: { tenantId?: string | null; what: string }): Promise<MailResult> {
  const result = await sendMail({ to, ...mail }, { kind: ctx.what, tenantId: ctx.tenantId ?? null });
  if (!result.sent && result.reason !== "not_configured") {
    logEvent({ tenantId: ctx.tenantId ?? null, level: "warning", category: "system", action: "email.failed", message: `Email "${ctx.what}" ke ${to} gagal: ${result.detail ?? result.reason}`, actorType: "system" });
  }
  return result;
}

export async function tenantAdminEmails(tenantId: string): Promise<string[]> {
  const rows = await db.select({ email: admins.email }).from(admins).where(eq(admins.tenantId, tenantId));
  return rows.map((r) => r.email);
}

/** Adds a "stop these emails" footer and a List-Unsubscribe header to an OPTIONAL category mail. */
function withUnsubscribe(mail: Mail, url: string, label: string): Mail {
  const footer = `<tr><td style="padding-top:14px;font-size:12px;color:#7b849c">Tidak ingin menerima email "${esc(label)}"? <a href="${esc(url)}" style="color:#7b849c">Berhenti berlangganan kategori ini</a>.</td></tr>`;
  const html = mail.html.includes("</table></td></tr></table></body></html>") ? mail.html.replace("</table></td></tr></table></body></html>", `${footer}</table></td></tr></table></body></html>`) : mail.html;
  return { ...mail, html, text: `${mail.text}

Berhenti menerima email "${label}": ${url}`, headers: { "List-Unsubscribe": `<${url}>` } };
}

/** Email every admin of a tenant (usually one). Pass `category` for optional mail: it honours the tenant's preference and carries an unsubscribe link. */
export async function deliverToTenant(tenantId: string, mail: Mail, what: string, category?: { key: string; label: string }) {
  let toSend = mail;
  if (category) {
    if ((await getPrefs("tenant", tenantId))[category.key] === false) return;
    toSend = withUnsubscribe(mail, unsubscribeUrl("tenant", tenantId, category.key), category.label);
  }
  for (const to of await tenantAdminEmails(tenantId)) await deliver(to, toSend, { tenantId, what });
}

/** Email one creator an OPTIONAL category mail, honouring their preference. */
export async function deliverToCreator(creatorId: string, mail: Mail, what: string, category: { key: string; label: string }) {
  const [c] = await db.select({ email: creators.email }).from(creators).where(eq(creators.id, creatorId));
  if (!c) return;
  if ((await getPrefs("creator", creatorId))[category.key] === false) return;
  await deliver(c.email, withUnsubscribe(mail, unsubscribeUrl("creator", creatorId, category.key), category.label), { what });
}

// --- links ------------------------------------------------------------------------------------------------

export const verifyLink = (kind: "tenant" | "creator", id: string, email: string) =>
  web(`/verifikasi?jenis=${kind}&id=${encodeURIComponent(id)}&token=${encodeURIComponent(signEmailToken(kind === "tenant" ? "verify-tenant" : "verify-creator", id, email.toLowerCase(), VERIFY_TTL_MS))}`);

export const resetLink = (realm: "tenant" | "creator", id: string, passwordHash: string, ttlMs = RESET_TTL_MS) =>
  web(`/atur-password?jenis=${realm}&token=${encodeURIComponent(signEmailToken(realm === "tenant" ? "reset-tenant" : "reset-creator", id, passwordBind(passwordHash), ttlMs))}`);

// --- templates --------------------------------------------------------------------------------------------

export function verifyEmailMail(p: { name: string; url: string; what: string }): Mail {
  return {
    subject: "Verifikasi email Anda — STUDIODO",
    html: layout("Verifikasi alamat email", `<p>Halo ${esc(p.name)}, satu langkah lagi: pastikan alamat email ini milik Anda agar kami bisa mengirim kabar tentang ${esc(p.what)}.</p>${button(p.url, "Verifikasi email")}<p>Tautan berlaku 7 hari.</p>`),
    text: `Halo ${p.name}, verifikasi alamat email Anda (berlaku 7 hari): ${p.url}`,
  };
}

export function welcomeTenantMail(p: { ownerName: string; businessName: string; email: string; setupUrl: string; trialDays: number }): Mail {
  return {
    subject: `Selamat datang di STUDIODO, ${p.businessName}!`,
    html: layout("Akun Anda sudah aktif", `<p>Halo ${esc(p.ownerName)}, pengajuan <strong>${esc(p.businessName)}</strong> sudah disetujui. Trial <strong>${p.trialDays} hari</strong> sudah berjalan.</p>
<p>Email login Anda: <strong>${esc(p.email)}</strong>. Atur kata sandi Anda sendiri lewat tombol di bawah (berlaku 7 hari):</p>${button(p.setupUrl, "Atur kata sandi")}
<p><strong>Langkah berikutnya</strong></p><ol style="padding-left:20px"><li>Masuk ke dashboard, buka <em>Booth &amp; langganan</em> untuk melihat key booth Anda.</li><li>Unduh aplikasi kiosk dari menu <em>Unduh aplikasi</em> dan pasang di PC booth.</li><li>Atur paket, frame, dan pembayaran QRIS.</li></ol>`),
    text: `Halo ${p.ownerName}, akun STUDIODO untuk ${p.businessName} sudah aktif (trial ${p.trialDays} hari). Login: ${p.email}. Atur kata sandi (7 hari): ${p.setupUrl}`,
  };
}

export function welcomeCreatorMail(p: { name: string; email: string; setupUrl: string }): Mail {
  return {
    subject: "Akun kreator STUDIODO Anda sudah siap",
    html: layout("Selamat bergabung, kreator!", `<p>Halo ${esc(p.name)}, akun kreator Anda sudah dibuat. Email login: <strong>${esc(p.email)}</strong>.</p>${button(p.setupUrl, "Atur kata sandi")}<p>Setelah masuk, baca panduan format frame, lengkapi profil publik Anda, lalu unggah template pertama.</p>`),
    text: `Halo ${p.name}, akun kreator STUDIODO Anda siap. Login: ${p.email}. Atur kata sandi (7 hari): ${p.setupUrl}`,
  };
}

export function passwordResetMail(p: { name: string | null; url: string }): Mail {
  return {
    subject: "Atur ulang kata sandi STUDIODO",
    html: layout("Atur ulang kata sandi", `<p>${esc(p.name ? `Halo ${p.name}, k` : "K")}ami menerima permintaan untuk mengatur ulang kata sandi akun STUDIODO Anda.</p>${button(p.url, "Buat kata sandi baru")}<p>Tautan berlaku 2 jam dan hanya bisa dipakai sekali. Jika bukan Anda yang meminta, abaikan email ini — kata sandi Anda tidak berubah.</p>`),
    text: `Atur ulang kata sandi STUDIODO (berlaku 2 jam, sekali pakai): ${p.url}\nJika bukan Anda yang meminta, abaikan email ini.`,
  };
}

export function passwordChangedMail(p: { name: string | null; when: string }): Mail {
  return {
    subject: "Kata sandi akun STUDIODO Anda diubah",
    html: layout("Kata sandi diubah", `<p>${esc(p.name ? `Halo ${p.name}, k` : "K")}ata sandi akun STUDIODO Anda baru saja diubah (${esc(p.when)}).</p><p>Jika itu Anda, tidak perlu melakukan apa pun. <strong>Jika bukan</strong>, segera hubungi tim STUDIODO.</p>`),
    text: `Kata sandi akun STUDIODO Anda diubah (${p.when}). Jika bukan Anda, segera hubungi STUDIODO.`,
  };
}

export function subscriptionMail(p: { ownerName: string | null; boothName: string; kind: "expiring" | "expired"; days?: number; trial: boolean }): Mail {
  const what = p.trial ? "Trial" : "Langganan";
  const url = web("/portal/booth");
  if (p.kind === "expiring") {
    return {
      subject: `${what} ${p.boothName} berakhir ${p.days} hari lagi`,
      html: layout(`${what} hampir berakhir`, `<p>${esc(p.ownerName ? `Halo ${p.ownerName}, ` : "")}${esc(what.toLowerCase())} booth <strong>${esc(p.boothName)}</strong> berakhir dalam <strong>${p.days} hari</strong>. Perpanjang sekarang agar booth tidak terkunci.</p>${button(url, "Perpanjang booth")}<p>Punya 10 booth atau lebih? Ada diskon volume otomatis saat checkout.</p>`),
      text: `${what} booth ${p.boothName} berakhir ${p.days} hari lagi. Perpanjang: ${url}`,
    };
  }
  return {
    subject: `${what} ${p.boothName} sudah berakhir`,
    html: layout("Booth terkunci", `<p>${esc(p.ownerName ? `Halo ${p.ownerName}, ` : "")}masa aktif booth <strong>${esc(p.boothName)}</strong> sudah habis sehingga booth terkunci. Semua pengaturan dan data tetap aman; booth langsung aktif lagi setelah diperpanjang.</p>${button(url, "Aktifkan kembali")}`),
    text: `Booth ${p.boothName} terkunci karena masa aktif habis. Aktifkan kembali: ${url}`,
  };
}

export function templateSubmittedMail(p: { name: string; templateName: string }): Mail {
  return {
    subject: `Template "${p.templateName}" kami terima`,
    html: layout("Template sedang ditinjau", `<p>Halo ${esc(p.name)}, template <strong>${esc(p.templateName)}</strong> sudah masuk antrean tinjauan (biasanya 1–3 hari kerja). Kami akan mengabari Anda lewat email begitu ada keputusan.</p>${button(web("/kreator/portal"), "Buka portal kreator")}`),
    text: `Halo ${p.name}, template "${p.templateName}" masuk antrean tinjauan (1-3 hari kerja). Portal: ${web("/kreator/portal")}`,
  };
}

export function reviewReceivedMail(p: { name: string; templateName: string; rating: number; comment: string; tenantName: string; templateId: string }): Mail {
  const stars = "★".repeat(p.rating) + "☆".repeat(5 - p.rating);
  return {
    subject: `Ulasan baru untuk "${p.templateName}": ${p.rating}/5`,
    html: layout("Ada ulasan baru", `<p>Halo ${esc(p.name)}, <strong>${esc(p.tenantName)}</strong> memberi ulasan untuk <strong>${esc(p.templateName)}</strong>:</p><p style="font-size:22px;color:#f5b301;margin:6px 0">${stars}</p>${p.comment ? `<blockquote style="margin:10px 0;padding:12px 16px;background:#f3f4fa;border-radius:12px">${esc(p.comment)}</blockquote>` : ""}${button(web(`/template/${p.templateId}`), "Lihat di marketplace")}`),
    text: `${p.tenantName} memberi ${p.rating}/5 untuk "${p.templateName}"${p.comment ? `: ${p.comment}` : ""}\n${web(`/template/${p.templateId}`)}`,
  };
}

export function templateHiddenMail(p: { name: string; templateName: string; note: string }): Mail {
  return {
    subject: `Template "${p.templateName}" disembunyikan dari marketplace`,
    html: layout("Template disembunyikan", `<p>Halo ${esc(p.name)}, setelah ditinjau berdasarkan laporan, template <strong>${esc(p.templateName)}</strong> kami sembunyikan dari katalog marketplace.</p><blockquote style="margin:10px 0;padding:12px 16px;background:#f3f4fa;border-radius:12px">${esc(p.note)}</blockquote><p>Tenant yang sudah memasangnya tetap memiliki salinannya. Jika Anda merasa ini keliru, balas email ini atau hubungi kami lewat WhatsApp.</p>`),
    text: `Template "${p.templateName}" disembunyikan dari marketplace.\nAlasan: ${p.note}`,
  };
}

export function creatorSignupMail(p: { name: string; verifyUrl: string }): Mail {
  return {
    subject: "Pendaftaran kreator Anda sudah kami terima — STUDIODO",
    html: layout("Pendaftaran kreator diterima", `<p>Halo ${esc(p.name)}, terima kasih sudah mendaftar sebagai kreator STUDIODO. Tim kami akan melihat portofolio Anda dan menghubungi lewat email atau WhatsApp bila cocok.</p>${button(p.verifyUrl, "Verifikasi email saya")}<p>Tautan berlaku 7 hari.</p>`),
    text: `Halo ${p.name}, pendaftaran kreator STUDIODO Anda kami terima. Verifikasi email (7 hari): ${p.verifyUrl}`,
  };
}
