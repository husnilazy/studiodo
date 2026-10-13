// Transactional email (sign-up confirmation, security notices). Sends through Resend's HTTP API so no SMTP client is
// needed: set RESEND_API_KEY (and verify the studiodo.id domain in Resend), optionally MAIL_FROM. With no key the mail
// is NOT sent and the caller is told, so nothing pretends an email went out. Failures never throw: a mail problem must
// not break a sign-up or a login.

export interface MailInput { to: string; subject: string; html: string; text: string; headers?: Record<string, string> }
export interface MailResult { sent: boolean; reason?: "not_configured" | "rejected" | "network"; detail?: string }

const FROM = () => process.env.MAIL_FROM || "STUDIODO <no-reply@studiodo.id>";

export const mailConfigured = () => Boolean(process.env.RESEND_API_KEY);

export async function sendMail(input: MailInput): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: "not_configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM(), to: [input.to], subject: input.subject, html: input.html, text: input.text, ...(input.headers ? { headers: input.headers } : {}) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { sent: false, reason: "rejected", detail: `HTTP ${res.status} ${(await res.text()).slice(0, 200)}` };
    return { sent: true };
  } catch (error) {
    return { sent: false, reason: "network", detail: error instanceof Error ? error.message : String(error) };
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** One consistent, plain, client-safe layout (tables + inline styles, no external assets). */
function layout(title: string, bodyHtml: string) {
  return `<!doctype html><html><body style="margin:0;background:#f3f4fa;font-family:Arial,Helvetica,sans-serif;color:#0b1020">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;padding:36px">
<tr><td style="font-size:20px;font-weight:700;letter-spacing:.02em;padding-bottom:18px">STUDIODO</td></tr>
<tr><td style="font-size:22px;font-weight:700;padding-bottom:14px">${esc(title)}</td></tr>
<tr><td style="font-size:15px;line-height:1.65;color:#2b3350">${bodyHtml}</td></tr>
<tr><td style="padding-top:26px;font-size:12px;color:#7b849c">Email ini dikirim otomatis oleh STUDIODO. Jika Anda tidak merasa melakukan tindakan ini, abaikan email ini atau hubungi kami.</td></tr>
</table></td></tr></table></body></html>`;
}

export function applicationReceivedMail(p: { ownerName: string; businessName: string; supportWhatsapp?: string | null; verifyUrl?: string }): Omit<MailInput, "to"> {
  const verify = p.verifyUrl ? `<p style="margin:18px 0"><a href="${esc(p.verifyUrl)}" style="background:#0b1020;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:999px;display:inline-block">Verifikasi email saya</a></p><p style="font-size:12px;color:#7b849c">Verifikasi membantu kami memastikan kabar tentang akun Anda sampai ke orang yang tepat. Tautan berlaku 7 hari.</p>` : "";
  const wa = p.supportWhatsapp ? `<p>Ada pertanyaan? Hubungi kami di WhatsApp <a href="https://wa.me/${esc(p.supportWhatsapp)}">+${esc(p.supportWhatsapp)}</a>.</p>` : "";
  return {
    subject: "Pengajuan Anda sudah kami terima — STUDIODO",
    html: layout(`Halo ${p.ownerName}, pengajuan Anda sudah masuk`, `<p>Terima kasih sudah mendaftarkan <strong>${esc(p.businessName)}</strong> di STUDIODO.</p>
<p><strong>Apa selanjutnya?</strong></p><ol style="padding-left:20px"><li>Tim kami meninjau pengajuan Anda (biasanya 1×24 jam kerja).</li><li>Setelah disetujui, Anda menerima akun dashboard dan key booth untuk mencoba.</li><li>Pasang aplikasi di PC booth, masukkan key, dan booth siap dipakai.</li></ol>${verify}${wa}`),
    text: `Halo ${p.ownerName},\n\nTerima kasih sudah mendaftarkan ${p.businessName} di STUDIODO. Tim kami akan meninjau pengajuan Anda (biasanya 1x24 jam kerja) dan menghubungi Anda setelah disetujui.\n${p.verifyUrl ? `\nVerifikasi email: ${p.verifyUrl}\n` : ""}${p.supportWhatsapp ? `\nPertanyaan? WhatsApp +${p.supportWhatsapp}\n` : ""}\nSTUDIODO`,
  };
}

export function accountLockedMail(p: { ownerName: string | null; lockMinutes: number }): Omit<MailInput, "to"> {
  const who = p.ownerName ? `Halo ${p.ownerName}` : "Halo";
  return {
    subject: "Percobaan masuk gagal beruntun di akun STUDIODO Anda",
    html: layout("Akun dikunci sementara", `<p>${esc(who)}, kami mendeteksi beberapa kali kata sandi yang salah saat masuk ke akun STUDIODO Anda. Demi keamanan, login dikunci sementara selama <strong>${p.lockMinutes} menit</strong>.</p>
<p>Jika itu Anda, tunggu sebentar lalu coba lagi. Jika bukan, sebaiknya segera ganti kata sandi setelah masuk, atau hubungi tim STUDIODO.</p>`),
    text: `${who}, login ke akun STUDIODO Anda dikunci sementara selama ${p.lockMinutes} menit karena beberapa kali kata sandi salah. Jika itu bukan Anda, segera hubungi STUDIODO.`,
  };
}

export function templateReviewedMail(p: { creatorName: string; templateName: string; approved: boolean; note?: string | null; portalUrl: string }): Omit<MailInput, "to"> {
  if (p.approved) {
    return {
      subject: `Template "${p.templateName}" sudah terbit di marketplace STUDIODO`,
      html: layout("Selamat, template Anda terbit!", `<p>Halo ${esc(p.creatorName)}, template <strong>${esc(p.templateName)}</strong> sudah disetujui dan kini tampil di marketplace STUDIODO atas nama Anda.</p><p>Pantau jumlah pemasangannya di <a href="${esc(p.portalUrl)}">portal kreator</a>.</p>`),
      text: `Halo ${p.creatorName}, template "${p.templateName}" sudah disetujui dan terbit di marketplace STUDIODO. Pantau di ${p.portalUrl}`,
    };
  }
  return {
    subject: `Template "${p.templateName}" perlu diperbaiki`,
    html: layout("Template Anda perlu diperbaiki", `<p>Halo ${esc(p.creatorName)}, template <strong>${esc(p.templateName)}</strong> belum bisa terbit. Catatan dari peninjau:</p><blockquote style="margin:12px 0;padding:12px 16px;background:#f3f4fa;border-radius:12px">${esc(p.note ?? "")}</blockquote><p>Perbaiki lalu kirim ulang dari <a href="${esc(p.portalUrl)}">portal kreator</a>.</p>`),
    text: `Halo ${p.creatorName}, template "${p.templateName}" belum bisa terbit.\n\nCatatan: ${p.note ?? ""}\n\nPerbaiki dan kirim ulang di ${p.portalUrl}`,
  };
}

export { layout, esc };
