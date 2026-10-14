import { esc, type MailInput } from "./mailer.js";
import type { InvoiceView } from "./invoice.js";

// The invoice / payment-receipt email. Tables + inline styles only (email clients ignore stylesheets), STUDIODO's
// indigo palette, and a status pill that changes meaning: "Menunggu pembayaran" vs "Lunas".

type Mail = Omit<MailInput, "to">;

const ACCENT = "#4f4fe8";
const INK = "#0b1020";
const MUTED = "#7b849c";

const rupiah = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");
const dateTime = (iso: string) => new Date(iso).toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jakarta" }) + " WIB";
const dateOnly = (iso: string) => new Date(iso).toLocaleDateString("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" });

const PILL = {
  paid: { text: "LUNAS", bg: "#dff7ec", fg: "#0f6b45" },
  pending: { text: "MENUNGGU PEMBAYARAN", bg: "#fff3d6", fg: "#7a5a00" },
  failed: { text: "GAGAL", bg: "#ffe3e3", fg: "#a12626" },
  expired: { text: "KEDALUWARSA", bg: "#eceef6", fg: "#5b6478" },
} as const;

const btn = (url: string, label: string, primary = true) =>
  `<a href="${esc(url)}" style="display:inline-block;text-decoration:none;font-weight:700;font-size:14px;padding:13px 26px;border-radius:999px;${primary ? `background:${INK};color:#ffffff;` : `background:#eef0fb;color:${INK};`}">${esc(label)}</a>`;

const row = (k: string, v: string, strong = false) =>
  `<tr><td style="padding:7px 0;color:${MUTED};font-size:13px">${esc(k)}</td><td style="padding:7px 0;text-align:right;font-size:13px;${strong ? "font-weight:700" : "font-weight:600"}">${esc(v)}</td></tr>`;

export function invoiceMail(v: InvoiceView, url: string): Mail {
  const pill = PILL[v.status];
  const paid = v.status === "paid";
  const subject = paid ? `Pembayaran diterima — Invoice ${v.invoiceNumber}` : `Invoice ${v.invoiceNumber} — ${rupiah(v.total)} menunggu pembayaran`;
  const headline = paid ? "Pembayaran Anda sudah kami terima" : "Invoice langganan STUDIODO";
  const intro = paid
    ? `Terima kasih${v.customer.ownerName ? `, ${esc(v.customer.ownerName)}` : ""}! Pembayaran untuk <strong>${esc(v.customer.businessName)}</strong> sudah masuk dan masa aktif booth sudah diperbarui.`
    : `Halo${v.customer.ownerName ? ` ${esc(v.customer.ownerName)}` : ""}, berikut invoice langganan untuk <strong>${esc(v.customer.businessName)}</strong>. Selesaikan pembayaran sebelum <strong>${v.dueAt ? esc(dateTime(v.dueAt)) : "batas waktu"}</strong> agar masa aktif booth diperbarui otomatis.`;

  const booths = v.booths.length
    ? `<tr><td colspan="2" style="padding:10px 0 2px;color:${MUTED};font-size:12px">Booth: ${esc(v.booths.slice(0, 8).join(", "))}${v.booths.length > 8 ? ` +${v.booths.length - 8} lainnya` : ""}</td></tr>`
    : "";

  const html = `<!doctype html><html><body style="margin:0;background:#f3f4fa;font-family:Arial,Helvetica,sans-serif;color:${INK}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:24px;overflow:hidden">
<tr><td style="background:${ACCENT};background-image:linear-gradient(135deg,#4f4fe8 0%,#7a7aff 60%,#9aa6ff 100%);padding:26px 32px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="font-size:22px;font-weight:700;letter-spacing:.02em;color:#ffffff">STUDIODO</td>
    <td align="right" style="font-size:12px;letter-spacing:.18em;color:#dfe3ff;font-weight:700">INVOICE</td>
  </tr></table>
</td></tr>
<tr><td style="padding:30px 32px 6px">
  <span style="display:inline-block;background:${pill.bg};color:${pill.fg};font-size:11px;font-weight:800;letter-spacing:.1em;padding:6px 12px;border-radius:999px">${pill.text}</span>
  <div style="font-size:24px;font-weight:700;line-height:1.25;margin:14px 0 8px">${esc(headline)}</div>
  <div style="font-size:15px;line-height:1.65;color:#2b3350">${intro}</div>
</td></tr>
<tr><td style="padding:18px 32px 4px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7ff;border-radius:18px"><tr><td style="padding:20px 22px">
    <div style="font-size:12px;color:${MUTED};letter-spacing:.06em">${paid ? "TOTAL DIBAYAR" : "TOTAL TAGIHAN"}</div>
    <div style="font-size:34px;font-weight:800;letter-spacing:-.02em;color:${INK};margin-top:4px">${esc(rupiah(v.total))}</div>
    <div style="font-size:12px;color:${MUTED};margin-top:4px">${esc(v.invoiceNumber)}</div>
  </td></tr></table>
</td></tr>
<tr><td style="padding:14px 32px 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e4e7f2">
    ${row("Tanggal invoice", dateOnly(v.issuedAt))}
    ${paid && v.paidAt ? row("Dibayar pada", dateTime(v.paidAt)) : ""}
    ${paid && v.paymentMethod ? row("Metode pembayaran", v.paymentMethod) : ""}
    ${row("Paket", v.plan)}
    ${row("Periode", `${v.periodDays} hari`)}
    ${row("Jumlah booth", String(v.boothCount))}
    ${booths}
  </table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e4e7f2;margin-top:10px">
    ${row(`Harga ${v.boothCount} booth × ${rupiah(v.unitPrice)}`, rupiah(v.subtotal))}
    ${v.discountPercent > 0 ? row(`Diskon ${v.discountPercent}%`, "−" + rupiah(v.discountAmount)) : ""}
    <tr><td style="padding:12px 0 0;font-size:15px;font-weight:700;border-top:1px solid #e4e7f2">Total</td><td style="padding:12px 0 0;text-align:right;font-size:15px;font-weight:800;border-top:1px solid #e4e7f2">${esc(rupiah(v.total))}</td></tr>
  </table>
</td></tr>
<tr><td style="padding:26px 32px 8px">
  ${!paid && v.payUrl ? `${btn(v.payUrl, "Bayar sekarang")}&nbsp;&nbsp;` : ""}${btn(url, "Lihat invoice", paid || !v.payUrl)}
  <p style="font-size:12px;color:${MUTED};margin:16px 0 0;line-height:1.6;word-break:break-all">${paid ? "Simpan email ini sebagai bukti pembayaran. Invoice bisa dibuka dan dicetak/diunduh sebagai PDF kapan saja:" : "Tautan invoice (bisa dibuka tanpa login):"}<br>${esc(url)}</p>
</td></tr>
<tr><td style="padding:20px 32px 30px;border-top:1px solid #eef0f8;margin-top:18px">
  <div style="font-size:12px;color:${MUTED};line-height:1.7">Diterbitkan oleh <strong style="color:${INK}">${esc(v.seller.name)}</strong> · ${esc(v.seller.company)}${v.seller.email ? `<br>Pertanyaan tagihan: ${esc(v.seller.email)}` : ""}${v.seller.whatsapp ? `<br>WhatsApp: +${esc(v.seller.whatsapp)}` : ""}<br>Email ini dikirim otomatis ke alamat yang terdaftar pada akun STUDIODO Anda.</div>
</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    paid ? `Pembayaran diterima — ${rupiah(v.total)}` : `Invoice ${v.invoiceNumber} — ${rupiah(v.total)} menunggu pembayaran`,
    `Invoice: ${v.invoiceNumber}`,
    `${v.plan} · ${v.boothCount} booth · ${v.periodDays} hari`,
    v.discountPercent > 0 ? `Diskon ${v.discountPercent}%: -${rupiah(v.discountAmount)}` : "",
    `Total: ${rupiah(v.total)}`,
    paid && v.paidAt ? `Dibayar: ${dateTime(v.paidAt)}${v.paymentMethod ? ` via ${v.paymentMethod}` : ""}` : v.dueAt ? `Bayar sebelum: ${dateTime(v.dueAt)}` : "",
    !paid && v.payUrl ? `Bayar: ${v.payUrl}` : "",
    `Lihat invoice: ${url}`,
  ].filter(Boolean).join("\n");

  return { subject, html, text };
}
