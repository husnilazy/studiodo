import crypto from "node:crypto";
import { quoteBooths, type BoothQuote, type VolumeTier } from "./boothPricing.js";
import type { PlanPricingInput } from "./planPricing.js";
import { describeSchedule, type WithdrawalPolicy } from "./withdrawalPolicy.js";

// Automatic cooperation letter ("surat kontrak kerja sama") for a prospective tenant. The terms are frozen into a snapshot at
// the moment it is generated (price, booths, fee and withdrawal policy as they were), then rendered as a printable page.
//
// IMPORTANT: this is a DRAFT TEMPLATE written by the product team, not legal advice. Every rendered page says so. The owner /
// legal counsel must review the clauses before it is sent to a real customer, and nothing here claims legal validity.

export const CONTRACT_DISCLAIMER = "DRAFT — belum ditinjau penasihat hukum. Isi dan klausul perlu diperiksa pemilik STUDIODO / penasihat hukum sebelum dipakai dengan pelanggan.";

export interface ContractLead {
  id: string;
  businessName: string;
  ownerName: string;
  ownerEmail: string;
  ownerWhatsapp: string | null;
  city: string | null;
  boothCount: number | null;
  boothLocation: string | null;
  plannedStart: string | null;
  paymentSetup: string | null;
  contractMonths: number | null;
}

export interface ContractSettings {
  qrisFeePercent: number;
  withdrawalMinAmount: number;
  withdrawalFlatFee: number;
  defaultTrialDays: number;
  gracePeriodDays: number;
}

export interface ContractIssuer { name: string; address: string; contact: string }

export interface ContractSnapshot {
  version: 1;
  number: string;
  generatedAt: string;
  issuer: ContractIssuer;
  customer: { businessName: string; ownerName: string; email: string; whatsapp: string | null; city: string | null; location: string | null; plannedStart: string | null };
  plan: { slug: string; name: string; interval: "monthly" | "yearly"; features: string[]; kioskLimit: number | null };
  booths: number;
  months: number;
  periods: number;
  unitFinal: number;
  discountPercent: number;
  discountSource: string;
  perPeriodTotal: number;
  contractTotal: number;
  trialDays: number;
  graceDays: number;
  paymentSetup: "own" | "platform";
  payout: { feePercent: number; minAmount: number; flatFee: number; schedule: string; holdDays: number; approvalThreshold: number; frozen: boolean };
  warnings: string[];
}

/** Stored issuer details (Superadmin → Calon Tenant → Pengaturan) over env fallbacks; anything missing stays a visible [placeholder]. */
export function resolveIssuer(stored: { name?: string; address?: string; contact?: string } | null | undefined, env: NodeJS.ProcessEnv = process.env): ContractIssuer {
  const pick = (a: string | undefined, b: string | undefined, placeholder: string) => a?.trim() || b?.trim() || placeholder;
  return {
    name: pick(stored?.name, env.CONTRACT_ISSUER_NAME, "[NAMA BADAN USAHA / PEMILIK STUDIODO — isi sebelum dikirim]"),
    address: pick(stored?.address, env.CONTRACT_ISSUER_ADDRESS, "[ALAMAT — isi sebelum dikirim]"),
    contact: pick(stored?.contact, env.CONTRACT_ISSUER_CONTACT, "[KONTAK RESMI — isi sebelum dikirim]"),
  };
}

export const issuerIncomplete = (i: ContractIssuer) => [i.name, i.address, i.contact].some((v) => v.startsWith("["));

export const newContractToken = () => crypto.randomBytes(32).toString("base64url");

export function contractNumber(leadId: string, at: Date): string {
  const ym = `${at.getUTCFullYear()}${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
  return `STD/KS/${ym}/${leadId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

export interface BuildInput {
  lead: ContractLead;
  plan: (PlanPricingInput & { slug: string; name: string; features?: string[] | null; kioskLimit?: number | null }) | null;
  tiers: VolumeTier[];
  tenantDiscountPercent?: number;
  settings: ContractSettings;
  policy: WithdrawalPolicy;
  issuer: ContractIssuer;
  now?: Date;
  /** Keep the number of an earlier version of the same contract when regenerating. */
  number?: string;
}

/** Pure. Returns an error string when the lead lacks what a contract needs (plan, booth count, term). */
export function buildContractSnapshot(input: BuildInput): { snapshot: ContractSnapshot } | { error: string } {
  const { lead, plan, tiers, settings, policy, issuer } = input;
  const now = input.now ?? new Date();
  if (!plan) return { error: "Pilih paket langganan dulu" };
  if (!lead.boothCount) return { error: "Isi jumlah booth dulu" };
  if (!lead.contractMonths) return { error: "Isi masa kontrak (bulan) dulu" };
  if (plan.kioskLimit != null && lead.boothCount > plan.kioskLimit) return { error: `Paket ${plan.name} dibatasi ${plan.kioskLimit} booth per tenant` };

  const months = lead.contractMonths;
  // A whole number of years is billed yearly when the plan offers it (cheaper); anything else month by month.
  let interval: "monthly" | "yearly" = "monthly";
  let quote: BoothQuote | null = quoteBooths(plan, "monthly", lead.boothCount, tiers, input.tenantDiscountPercent ?? 0, now);
  if (months % 12 === 0) {
    const yearly = quoteBooths(plan, "yearly", lead.boothCount, tiers, input.tenantDiscountPercent ?? 0, now);
    if (yearly) { interval = "yearly"; quote = yearly; }
  }
  if (!quote) return { error: `Paket ${plan.name} tidak punya harga untuk jumlah booth ini` };
  const periods = interval === "yearly" ? months / 12 : months;

  const warnings: string[] = [];
  for (const [label, value] of [["Nama badan usaha", issuer.name], ["Alamat", issuer.address], ["Kontak resmi", issuer.contact]] as const) {
    if (value.startsWith("[")) warnings.push(`${label} STUDIODO belum diisi (isi di Calon Tenant → Pengaturan → Data STUDIODO untuk kontrak).`);
  }
  if (!lead.paymentSetup) warnings.push("Pengaturan pembayaran belum dipilih (akun sendiri / platform) — dianggap akun sendiri.");
  if (!lead.ownerEmail) warnings.push("Email pemilik belum ada.");

  return {
    snapshot: {
      version: 1,
      number: input.number ?? contractNumber(lead.id, now),
      generatedAt: now.toISOString(),
      issuer,
      customer: { businessName: lead.businessName, ownerName: lead.ownerName, email: lead.ownerEmail, whatsapp: lead.ownerWhatsapp, city: lead.city, location: lead.boothLocation, plannedStart: lead.plannedStart },
      plan: { slug: plan.slug, name: plan.name, interval, features: plan.features ?? [], kioskLimit: plan.kioskLimit ?? null },
      booths: lead.boothCount,
      months,
      periods,
      unitFinal: quote.unitFinal,
      discountPercent: quote.discountPercent,
      discountSource: quote.discountSource,
      perPeriodTotal: quote.total,
      contractTotal: quote.total * periods,
      trialDays: settings.defaultTrialDays,
      graceDays: settings.gracePeriodDays,
      paymentSetup: lead.paymentSetup === "platform" ? "platform" : "own",
      payout: {
        feePercent: policy.feePercent ?? settings.qrisFeePercent,
        minAmount: policy.minAmount || settings.withdrawalMinAmount,
        flatFee: policy.flatFee ?? settings.withdrawalFlatFee,
        schedule: describeSchedule(policy),
        holdDays: policy.holdDays,
        approvalThreshold: policy.approvalThreshold,
        frozen: !policy.enabled,
      },
      warnings,
    },
  };
}

// --- Rendering -----------------------------------------------------------------

const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const rupiah = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
const dateId = (iso: string | Date) => new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });

export interface Clause { title: string; items: string[] }

/** The STUDIODO rules. Written from the snapshot so the numbers always match what the customer was quoted. */
export function buildClauses(s: ContractSnapshot): Clause[] {
  const per = s.plan.interval === "yearly" ? "tahun" : "bulan";
  const platform = s.paymentSetup === "platform";
  return [
    {
      title: "Pasal 1 — Layanan",
      items: [
        `STUDIODO menyediakan perangkat lunak photobooth berbasis langganan (aplikasi kiosk, dashboard pengelolaan, galeri hasil foto, dan fitur yang termasuk dalam paket ${s.plan.name}) kepada Pelanggan untuk dipakai pada ${s.booths} booth.`,
        "Layanan disediakan apa adanya sesuai paket. Fitur di luar paket, perangkat keras (kamera, printer, PC, layar), koneksi internet, dan lokasi acara adalah tanggung jawab Pelanggan.",
        `Pelanggan mendapat masa percobaan (trial) ${s.trialDays} hari bila belum pernah memakainya; masa trial tidak menambah masa kontrak.`,
      ],
    },
    {
      title: "Pasal 2 — Lisensi per booth",
      items: [
        "Lisensi diberikan per booth: satu key kiosk aktif untuk satu PC booth. Key tidak boleh dibagikan, dijual, atau dipakai di PC lain tanpa mengatur ulang lewat dashboard.",
        "Menambah booth di tengah masa kontrak dilakukan lewat dashboard dengan harga paket yang berlaku saat itu; jumlah booth pada surat ini tidak otomatis bertambah.",
        `Bila masa berlangganan sebuah booth berakhir, booth tetap berjalan selama masa toleransi ${s.graceDays} hari, lalu terkunci sampai langganan diperpanjang. Data tidak dihapus karena kunci.`,
      ],
    },
    {
      title: "Pasal 3 — Harga dan pembayaran langganan",
      items: [
        `Harga langganan: ${rupiah(s.unitFinal)} per booth per ${per}${s.discountPercent > 0 ? ` (sudah termasuk diskon ${s.discountPercent}%${s.discountSource === "volume" ? " volume" : ""})` : ""}, sehingga ${rupiah(s.perPeriodTotal)} per ${per} untuk ${s.booths} booth.`,
        `Masa kontrak ${s.months} bulan (${s.periods} periode ${per}); total ${rupiah(s.contractTotal)} sebelum pajak bila berlaku.`,
        "Langganan dibayar melalui dashboard STUDIODO lewat Midtrans (QRIS, transfer bank/virtual account, kartu, atau e-wallet sesuai yang tersedia). Booth aktif setelah pembayaran diterima.",
        "Harga dapat berubah untuk periode berikutnya; perubahan diberitahukan tertulis minimal 30 hari sebelum periode berjalan berakhir dan tidak berlaku surut.",
      ],
    },
    {
      title: "Pasal 4 — Pembayaran pelanggan booth dan penarikan saldo",
      items: platform
        ? [
            "Pelanggan memilih pembayaran QRIS booth ditampung STUDIODO. Pembayaran dari pengunjung booth masuk ke akun payment gateway milik STUDIODO, dicatat di buku saldo (wallet) Pelanggan per transaksi, dan dapat ditarik oleh Pelanggan dari dashboard.",
            `Biaya layanan: ${s.payout.feePercent}% dari setiap pembayaran QRIS${s.payout.flatFee > 0 ? `, ditambah biaya tetap ${rupiah(s.payout.flatFee)} per penarikan` : ""}. Biaya ini dapat diubah dengan pemberitahuan tertulis dan tidak berlaku surut pada transaksi yang sudah tercatat.`,
            `Penarikan minimum ${rupiah(s.payout.minAmount)}. ${s.payout.schedule}.${s.payout.holdDays > 0 ? ` Dana ditahan ${s.payout.holdDays} hari sejak dibayar sebelum bisa ditarik.` : ""}${s.payout.approvalThreshold > 0 ? ` Penarikan sebesar ${rupiah(s.payout.approvalThreshold)} atau lebih memerlukan persetujuan dua orang pada pihak STUDIODO.` : ""}`,
            "Penarikan dibayar ke rekening/e-wallet atas nama Pelanggan yang didaftarkan di dashboard. Rekening yang baru pertama kali dipakai dapat ditahan sementara untuk verifikasi.",
            "STUDIODO dapat menahan atau membekukan penarikan sementara bila ada dugaan penipuan, sengketa, pengembalian dana (refund/chargeback), atau permintaan dari penyedia payment gateway atau otoritas, dengan memberi tahu Pelanggan alasannya.",
            "Pelanggan bertanggung jawab atas kewajiban pajaknya sendiri atas pendapatan booth.",
          ]
        : [
            "Pelanggan memakai akun payment gateway miliknya sendiri (Midtrans, Xendit, atau DOKU). Dana pembayaran pengunjung booth masuk langsung ke akun Pelanggan; STUDIODO tidak menampung maupun menarik dana tersebut.",
            "Pelanggan bertanggung jawab atas kebenaran kunci API, biaya, dan kewajiban pajak pada akun gateway miliknya. Bila kelak Pelanggan ingin memakai pembayaran yang ditampung STUDIODO, ketentuan saldo dan penarikan yang berlaku saat itu akan diberitahukan dan disepakati terlebih dahulu.",
          ],
    },
    {
      title: "Pasal 5 — Penggunaan yang wajar",
      items: [
        "Pelanggan memakai layanan secara sah dan tidak melanggar hukum, hak cipta, atau hak pihak lain, termasuk pada foto, frame, dan template yang dipakai di booth.",
        "Dilarang mengganggu keamanan layanan, melakukan rekayasa balik, menjual ulang layanan tanpa izin tertulis, atau memakai layanan untuk konten yang melanggar hukum.",
        "STUDIODO dapat menangguhkan layanan bila ada pelanggaran serius, setelah memberi peringatan bila memungkinkan.",
      ],
    },
    {
      title: "Pasal 6 — Data dan privasi",
      items: [
        "Foto, video, dan data kontak pengunjung booth adalah data milik Pelanggan; STUDIODO memprosesnya hanya untuk menyediakan layanan (penyimpanan, galeri, pengiriman hasil) sesuai kebijakan privasi STUDIODO.",
        "Pelanggan wajib memberi tahu pengunjung bahwa foto mereka diproses dan, bila perlu, meminta persetujuan sesuai hukum perlindungan data pribadi yang berlaku.",
        "Kedua pihak menjaga kerahasiaan kredensial dan informasi non-publik pihak lain. STUDIODO menyimpan kunci pembayaran Pelanggan dalam bentuk terenkripsi.",
        "Setelah layanan berakhir, Pelanggan dapat mengunduh datanya dalam 30 hari; setelah itu data dapat dihapus.",
      ],
    },
    {
      title: "Pasal 7 — Pembatalan dan pengakhiran",
      items: [
        "Pelanggan dapat berhenti memperpanjang kapan saja; layanan tetap berjalan sampai akhir periode yang sudah dibayar. Pembayaran periode berjalan tidak dikembalikan, kecuali layanan tidak dapat dipakai karena kesalahan STUDIODO.",
        "Salah satu pihak dapat mengakhiri kerja sama bila pihak lain melanggar pasal-pasal di atas dan tidak memperbaikinya dalam 14 hari sejak pemberitahuan tertulis.",
        platform
          ? "Saat kerja sama berakhir, saldo yang sudah tercatat dan memenuhi syarat penarikan tetap dibayarkan kepada Pelanggan setelah dikurangi biaya yang berlaku dan sengketa yang masih berjalan."
          : "Saat kerja sama berakhir, kunci lisensi booth dinonaktifkan; akun payment gateway Pelanggan tidak terpengaruh.",
      ],
    },
    {
      title: "Pasal 8 — Tanggung jawab dan penyelesaian sengketa",
      items: [
        "STUDIODO berupaya menjaga layanan tetap tersedia, tetapi tidak menjamin bebas gangguan. Tanggung jawab STUDIODO terbatas pada nilai langganan periode berjalan, kecuali ditentukan lain oleh hukum.",
        "Perselisihan diselesaikan dengan musyawarah terlebih dahulu. Bila tidak tercapai, diselesaikan menurut hukum Republik Indonesia di wilayah hukum yang disepakati kedua pihak. [Tentukan domisili hukum — isi oleh pemilik/penasihat hukum]",
      ],
    },
  ];
}

export interface RenderOptions {
  status: "draft" | "sent" | "signed";
  signedAt?: string | null;
  signedName?: string | null;
  /** Public page: show the "Setuju" form (only while status = sent). */
  signUrl?: string | null;
}

export function renderContractHtml(s: ContractSnapshot, opts: RenderOptions): string {
  const per = s.plan.interval === "yearly" ? "tahun" : "bulan";
  const mark = (v: string) => esc(v).replace(/\[([^\]]+)\]/g, "<mark>[$1]</mark>");
  const clauses = buildClauses(s).map((c) => `<section class="clause"><h3>${esc(c.title)}</h3><ol>${c.items.map((i) => `<li>${mark(i)}</li>`).join("")}</ol></section>`).join("");
  const status = opts.status === "signed"
    ? `<p class="signed">Disetujui secara elektronik oleh <b>${esc(opts.signedName)}</b> pada ${esc(opts.signedAt ? dateId(opts.signedAt) : "")}.</p>`
    : "";
  const form = opts.status === "sent" && opts.signUrl
    ? `<form class="noprint approve" method="post" action="${esc(opts.signUrl)}">
        <h3>Persetujuan Pelanggan</h3>
        <p>Dengan menekan tombol di bawah, Anda menyatakan sudah membaca dan menyetujui isi surat ini atas nama usaha Anda.</p>
        <label>Nama lengkap penyetuju<input type="text" name="name" required maxlength="120" value="${esc(s.customer.ownerName)}"></label>
        <label class="chk"><input type="checkbox" name="agree" value="1" required> Saya menyetujui isi surat kerja sama ini.</label>
        <button type="submit">Setuju</button>
      </form>`
    : "";
  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Surat Kerja Sama ${esc(s.number)}</title>
<style>
  :root{color-scheme:light}*{box-sizing:border-box}
  body{margin:0;background:#f3f4f6;color:#111827;font:15px/1.65 Georgia,"Times New Roman",serif}
  .page{max-width:820px;margin:24px auto;background:#fff;padding:48px 56px;box-shadow:0 2px 20px rgba(0,0,0,.08)}
  .draft{border:2px solid #b45309;background:#fffbeb;color:#92400e;padding:10px 14px;font:600 13px/1.5 system-ui,sans-serif;border-radius:6px;margin-bottom:24px}
  h1{font-size:22px;text-align:center;margin:0 0 4px;letter-spacing:.02em}.no{text-align:center;color:#6b7280;margin:0 0 28px;font:13px system-ui,sans-serif}
  h3{font-size:15px;margin:22px 0 6px}table{width:100%;border-collapse:collapse;margin:8px 0 4px;font:14px system-ui,sans-serif}
  td,th{border:1px solid #d1d5db;padding:7px 10px;text-align:left;vertical-align:top}th{background:#f9fafb;width:34%}
  ol{margin:4px 0 0;padding-left:22px}li{margin:4px 0}mark{background:#fde68a;padding:0 2px}
  .signed{margin-top:28px;padding:12px 14px;border:1px solid #059669;background:#ecfdf5;color:#065f46;font:14px system-ui,sans-serif;border-radius:6px}
  .sign{display:flex;gap:24px;margin-top:36px}.sign div{flex:1;text-align:center;font-size:14px}.sign .line{height:70px;border-bottom:1px solid #9ca3af;margin-bottom:6px}
  .approve{margin-top:28px;padding:18px;border:1px solid #d1d5db;border-radius:10px;background:#f9fafb;font:14px system-ui,sans-serif}.approve h3{margin-top:0}
  .approve label{display:block;margin:10px 0}.approve input[type=text]{display:block;width:100%;padding:9px 10px;margin-top:4px;border:1px solid #9ca3af;border-radius:6px;font:inherit}
  .approve .chk{display:flex;gap:8px;align-items:flex-start}
  button{background:#111827;color:#fff;border:0;border-radius:8px;padding:11px 22px;font:600 14px system-ui,sans-serif;cursor:pointer}
  .bar{max-width:820px;margin:16px auto 0;text-align:right;font:14px system-ui,sans-serif}.bar button{background:#fff;color:#111827;border:1px solid #9ca3af}
  @media(max-width:640px){.page{padding:24px 18px;margin:0}.sign{flex-direction:column}}
  @media print{body{background:#fff}.page{box-shadow:none;margin:0;padding:0}.noprint{display:none!important}.clause{break-inside:avoid}}
</style></head><body>
<div class="bar noprint"><button type="button" onclick="window.print()">Cetak / Simpan PDF</button></div>
<main class="page">
  <div class="draft">${esc(CONTRACT_DISCLAIMER)}</div>
  <h1>SURAT KERJA SAMA LANGGANAN STUDIODO</h1>
  <p class="no">Nomor ${esc(s.number)} · ${esc(dateId(s.generatedAt))}</p>
  <p>Surat ini dibuat antara:</p>
  <table>
    <tr><th>Pihak Pertama (STUDIODO)</th><td>${mark(s.issuer.name)}<br>${mark(s.issuer.address)}<br>${mark(s.issuer.contact)}</td></tr>
    <tr><th>Pihak Kedua (Pelanggan)</th><td><b>${esc(s.customer.businessName)}</b><br>a.n. ${esc(s.customer.ownerName)}${s.customer.city ? `, ${esc(s.customer.city)}` : ""}<br>${esc([s.customer.email, s.customer.whatsapp].filter(Boolean).join(" · "))}</td></tr>
  </table>
  <h3>Ringkasan kesepakatan</h3>
  <table>
    <tr><th>Paket</th><td>${esc(s.plan.name)} (dibayar per ${per})</td></tr>
    <tr><th>Jumlah booth</th><td>${s.booths}${s.customer.location ? ` — lokasi: ${esc(s.customer.location)}` : ""}</td></tr>
    <tr><th>Rencana mulai</th><td>${esc(s.customer.plannedStart || "Sesuai kesepakatan")}</td></tr>
    <tr><th>Masa kontrak</th><td>${s.months} bulan</td></tr>
    <tr><th>Harga</th><td>${rupiah(s.unitFinal)} / booth / ${per}${s.discountPercent > 0 ? ` (diskon ${s.discountPercent}%)` : ""} → ${rupiah(s.perPeriodTotal)} / ${per}</td></tr>
    <tr><th>Total kontrak</th><td><b>${rupiah(s.contractTotal)}</b></td></tr>
    <tr><th>Pembayaran booth</th><td>${s.paymentSetup === "platform" ? "Ditampung STUDIODO (saldo/wallet, bisa ditarik)" : "Akun payment gateway milik Pelanggan"}</td></tr>
  </table>
  ${clauses}
  <p style="margin-top:24px">Surat ini berlaku setelah disetujui Pelanggan dan langganan pertama dibayar.</p>
  <div class="sign"><div><div class="line"></div>STUDIODO</div><div><div class="line"></div>${esc(s.customer.ownerName)}<br><small>${esc(s.customer.businessName)}</small></div></div>
  ${status}${form}
</main></body></html>`;
}
