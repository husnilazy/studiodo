// Two guides, generated with the platform's live numbers so they never drift from the settings:
//  - "onboarding": for a prospective tenant (sent by link / printed as PDF).
//  - "team": for the STUDIODO team — scripts, the lead → active flow, FAQ on payments, wallet and withdrawals.

export interface DocFacts {
  trialDays: number;
  graceDays: number;
  qrisFeePercent: number;
  withdrawalMinAmount: number;
  withdrawalFlatFee: number;
  withdrawalSchedule: string;
  holdDays: number;
  volumeTiers: { minBooths: number; percent: number }[];
  portalUrl: string;
}

const rp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
const volume = (f: DocFacts) => f.volumeTiers.length
  ? f.volumeTiers.map((t) => `beli ${t.minBooths} booth atau lebih → diskon ${t.percent}%`).join("; ")
  : "belum ada diskon volume yang aktif";

export function onboardingGuide(f: DocFacts): { title: string; markdown: string } {
  return {
    title: "Panduan Onboarding Calon Tenant STUDIODO",
    markdown: `# Panduan Onboarding STUDIODO

Selamat datang! Panduan ini menjelaskan dari awal sampai booth Anda bisa dipakai pelanggan.

## 1. Gambaran singkat

- **Dashboard** (web): kelola paket, frame, voucher, galeri, pembayaran, dan langganan di ${f.portalUrl}.
- **Aplikasi kiosk** (di PC booth): layar yang dipakai pengunjung untuk berfoto, membayar, dan mencetak.
- **Key kiosk**: kode yang menghubungkan satu PC booth ke akun Anda. Satu key = satu booth.

## 2. Alur dari daftar sampai booth berjalan

1. **Ngobrol singkat** — tim kami menanyakan rencana Anda: jumlah booth, lokasi, kapan mulai, dan cara pembayaran.
2. **Akun & key trial** — kami membuat akun dan mengirim detail login ke email Anda. Trial berlaku **${f.trialDays} hari**.
3. **Pasang aplikasi kiosk** di PC booth, lalu tempel key trial di layar *Setup / Pair kiosk*.
4. **Atur booth** — di dashboard: paket sesi dan harga, frame, tampilan kiosk, printer, dan kamera.
5. **Atur pembayaran** — lihat bagian 4.
6. **Coba satu sesi penuh** — foto, bayar (mode uji), cetak, buka galeri. Kabari kami bila ada yang janggal.
7. **Berlangganan** sebelum trial habis lewat menu *Booth & langganan* di dashboard (Midtrans: QRIS, transfer, kartu, e-wallet).
8. **Surat kerja sama** — bila Anda membeli banyak booth atau ingin kesepakatan tertulis, kami kirim surat kerja sama untuk dibaca dan disetujui.

## 3. Persiapan di lokasi

- PC Windows dengan internet stabil, kamera (DSLR/mirrorless atau webcam) dan printer yang sudah terpasang di Windows.
- Layar sentuh atau monitor + mouse, lampu yang cukup.
- Satu PC per booth. Jangan memakai key yang sama di dua PC.

## 4. Pembayaran pelanggan booth

Ada dua pilihan, bisa dipilih saat onboarding:

**A. Akun payment gateway sendiri (Midtrans, Xendit, atau DOKU)**
Uang dari pengunjung masuk langsung ke akun Anda. Anda mengisi kunci API di dashboard (menu pembayaran). STUDIODO tidak menyentuh dana tersebut.

**B. Ditampung STUDIODO (platform default)**
Tidak perlu punya akun gateway. QRIS pengunjung masuk ke akun STUDIODO dan dicatat sebagai **saldo** Anda. Anda menarik saldo dari dashboard.
- Biaya layanan: **${f.qrisFeePercent}%** per pembayaran QRIS${f.withdrawalFlatFee > 0 ? `, plus ${rp(f.withdrawalFlatFee)} per penarikan` : ""}.
- Penarikan minimum **${rp(f.withdrawalMinAmount)}**.
- ${f.withdrawalSchedule}.${f.holdDays > 0 ? ` Dana ditahan ${f.holdDays} hari sebelum bisa ditarik.` : ""}
- Dana ditransfer ke rekening atas nama Anda. Rekening yang baru pertama dipakai dapat ditahan sebentar untuk verifikasi.

> Langganan STUDIODO sendiri selalu dibayar lewat Midtrans, apa pun pilihan pembayaran booth Anda.

## 5. Harga & diskon

Harga mengikuti paket yang aktif di halaman harga. Diskon volume: ${volume(f)}. Diskon khusus bisa dibicarakan untuk jumlah booth besar.

## 6. Setelah langganan habis

Booth tetap berjalan selama masa toleransi **${f.graceDays} hari**, lalu terkunci sampai diperpanjang. Data Anda tidak dihapus. Setelah diperpanjang, booth langsung aktif lagi.

## 7. Pertanyaan umum

**Apakah trial gratis?** Ya, selama masa trial. Tidak perlu kartu kredit.

**Bisa pakai kamera apa?** Webcam dan kamera yang didukung (mis. lewat digiCamControl untuk DSLR). Tim kami membantu memilih yang cocok.

**Bagaimana kalau internet mati?** Kiosk memerlukan internet untuk pembayaran QRIS; kabari kami untuk opsi lain sesuai lokasi Anda.

**Bagaimana menambah booth?** Beli lewat dashboard, kami terbitkan key baru per booth.

**Siapa yang menghubungi bila ada masalah?** Balas WhatsApp tim STUDIODO yang menghubungi Anda, atau email dari dashboard.
`,
  };
}

export function teamGuide(f: DocFacts): { title: string; markdown: string } {
  return {
    title: "Panduan Follow-up Calon Tenant (Tim STUDIODO)",
    markdown: `# Panduan Follow-up Calon Tenant

Untuk tim STUDIODO. Tujuan: setiap calon tenant dibalas cepat, ditanya hal yang sama, dan tidak ada yang terlupa.

## 1. Alur lead sampai aktif

| Tahap | Arti | Yang dilakukan | Target waktu |
|---|---|---|---|
| Baru | Lead masuk (form web / chat / Instagram) | Balas dengan sapaan awal | di hari yang sama |
| Dihubungi | Sudah dibalas | Isi data: jumlah booth, lokasi, rencana mulai, pembayaran | 1–2 hari |
| Trial diberikan | Akun dan key trial terkirim | Check-in di hari ke-2 dan ke-5 | selama trial (${f.trialDays} hari) |
| Negosiasi | Membahas paket & harga | Kirim ringkasan harga, diskon volume | 3 hari |
| Kontrak terkirim | Surat kerja sama sudah dikirim | Ingatkan bila 2 hari belum disetujui | 2–3 hari |
| Aktif | Sudah jadi tenant | Kirim ucapan & panduan, pantau langganan pertama | — |
| Batal | Tidak lanjut | Catat alasan, jadwalkan cek 3 bulan lagi bila perlu | — |

Aturan praktis: **setiap lead terbuka selalu punya satu tugas follow-up berikutnya.** Selesai kontak → langsung buat tugas berikutnya.

## 2. Skrip chat

**Sapaan awal** (lead baru)
> Halo {nama}, kami dari STUDIODO. Terima kasih sudah mengajukan {usaha}. Boleh kami tahu sedikit tentang rencana booth Anda (jumlah booth, lokasi, kapan mulai)? Dengan itu kami bisa menyiapkan akun & key trial yang pas.

**Tanya pembayaran** (setelah lead menjawab)
> Sebelum key trial disiapkan: untuk pembayaran pelanggan di booth, apakah sudah punya akun sendiri (Midtrans/Xendit/DOKU) atau mau lewat platform STUDIODO?

**Follow-up trial**
> Bagaimana trial-nya? Ada kendala di kamera, printer, atau pembayaran QRIS? Kami siap bantu lewat chat atau panggilan singkat.

**Kirim kontrak**
> Berikut surat kerja sama untuk {usaha}: {link_kontrak}. Silakan dibaca dulu. Bila sudah sesuai, tekan "Setuju" di halaman itu.

Semua skrip ada sebagai template di CRM (Superadmin → Calon Tenant → pilih lead → WhatsApp) dan bisa diedit di Pengaturan WhatsApp.

## 3. Pertanyaan wajib saat follow-up pertama

1. Berapa booth yang direncanakan? (menentukan paket dan diskon volume)
2. Di mana lokasinya? (event / mall / studio tetap)
3. Kapan mulai?
4. Pembayaran: sudah punya akun sendiri atau pakai platform default?
5. Perangkat: sudah punya PC, kamera, dan printer?

Catat jawabannya di kartu lead. Kontrak dibuat dari data ini.

## 4. FAQ pembayaran

**Midtrans, Xendit, DOKU — apa bedanya untuk tenant?**
Langganan STUDIODO selalu lewat **Midtrans**. Untuk QRIS di booth, tenant boleh memakai akun **Midtrans, Xendit, atau DOKU miliknya** (uang langsung ke tenant), atau **ditampung STUDIODO** lewat akun DOKU STUDIODO.

**Tenant belum punya akun gateway.**
Tawarkan opsi ditampung STUDIODO — tanpa pendaftaran gateway. Jelaskan biaya ${f.qrisFeePercent}% dan aturan penarikan di bawah.

**Tenant sudah punya akun.**
Minta mereka mengisi kunci API di dashboard (menu pembayaran). Kunci disimpan terenkripsi dan tidak pernah ditampilkan lagi.

**Langganan terkunci padahal sudah bayar?**
Cek *Pembayaran* di Superadmin. Bila status gateway sudah berhasil tetapi booth belum aktif, jalankan rekonsiliasi pesanan di sana.

## 5. FAQ wallet & penarikan (tenant ditampung STUDIODO)

- Setiap pembayaran QRIS dicatat sebagai baris di buku saldo dengan biaya ${f.qrisFeePercent}% yang dibekukan saat itu.
- Minimum tarik ${rp(f.withdrawalMinAmount)}${f.withdrawalFlatFee > 0 ? `, biaya tetap ${rp(f.withdrawalFlatFee)} per penarikan` : ""}. ${f.withdrawalSchedule}.${f.holdDays > 0 ? ` Ada masa tahan ${f.holdDays} hari.` : ""}
- Tenant mengajukan penarikan di dashboard; tim keuangan memproses manual (pending → diproses → dibayar atau ditolak dengan alasan).
- Penarikan besar butuh persetujuan dua orang. Rekening baru dapat ditahan beberapa jam.
- Kebijakan per tenant bisa diubah (atau dibekukan) di Superadmin → Saldo & Kebijakan.
- **Jangan menjanjikan** jadwal transfer di luar kebijakan yang berlaku.

## 6. Harga, diskon, dan trial

- Trial standar ${f.trialDays} hari. Key trial dibuat dari Superadmin → Lisensi & Trial.
- Diskon volume: ${volume(f)}. Diskon negosiasi per tenant diatur di profil tenant (maks. 90%).
- Setelah langganan habis: toleransi ${f.graceDays} hari, lalu booth terkunci.

## 7. Surat kerja sama

1. Pada kartu lead, isi paket, jumlah booth, masa kontrak, dan pilihan pembayaran.
2. Tekan **Buat kontrak** → periksa pratinjau. Isinya **draf** yang harus ditinjau pemilik / penasihat hukum sebelum dikirim.
3. Tekan **Kirim** → salin tautan ke WhatsApp. Lead membaca dan menekan "Setuju".
4. Status kontrak tercatat di kartu lead (terkirim → disetujui) dan lead pindah ke tahap berikutnya.
5. Setelah disetujui: **Jadikan tenant** → kirim ucapan & panduan onboarding.

## 8. Etika follow-up

- Jangan mengirim lebih dari satu pesan per hari tanpa balasan; setelah 3 kali tanpa respons, pindahkan ke Batal dengan alasan "tidak merespons".
- Hormati bila lead meminta berhenti dihubungi — catat dan tutup lead.
- Jangan meminta kata sandi, kunci API, atau OTP lewat chat.
`,
  };
}

// --- tiny markdown renderer (headings, bold/italic/code, lists, tables, blockquotes) --------------------------------

const esc = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const inline = (value: string) => esc(value).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>");

export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) { out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`); i++; continue; }
    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        if (!/^\|[\s:|-]+\|?$/.test(lines[i])) rows.push(lines[i].replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
        i++;
      }
      const [head, ...body] = rows;
      out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    if (line.startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) { quote.push(lines[i].replace(/^>\s?/, "")); i++; }
      out.push(`<blockquote>${inline(quote.join(" "))}</blockquote>`);
      continue;
    }
    const ordered = /^\d+\.\s+/.test(line);
    if (ordered || /^[-*]\s+/.test(line)) {
      const tag = ordered ? "ol" : "ul";
      const items: string[] = [];
      while (i < lines.length && (ordered ? /^\d+\.\s+/ : /^[-*]\s+/).test(lines[i])) { items.push(lines[i].replace(/^(\d+\.|[-*])\s+/, "")); i++; }
      out.push(`<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</${tag}>`);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|\||>|[-*]\s|\d+\.\s)/.test(lines[i])) { para.push(lines[i]); i++; }
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return out.join("\n");
}

export function renderDocPage(title: string, markdown: string): string {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>:root{color-scheme:light}body{margin:0;background:#f3f4f6;color:#111827;font:16px/1.7 system-ui,sans-serif}
main{max-width:780px;margin:24px auto;background:#fff;padding:40px 48px;border-radius:12px;box-shadow:0 2px 20px rgba(0,0,0,.06)}
h1{font-size:28px;margin:0 0 12px}h2{font-size:20px;margin:32px 0 8px;border-bottom:1px solid #e5e7eb;padding-bottom:6px}p{margin:8px 0}
blockquote{margin:10px 0;padding:8px 14px;border-left:4px solid #6366f1;background:#eef2ff;border-radius:4px}
table{border-collapse:collapse;width:100%;font-size:14px;margin:10px 0}th,td{border:1px solid #d1d5db;padding:6px 10px;text-align:left;vertical-align:top}th{background:#f9fafb}
code{background:#f3f4f6;padding:1px 5px;border-radius:4px}.bar{max-width:780px;margin:16px auto 0;text-align:right}
button{border:1px solid #9ca3af;background:#fff;border-radius:8px;padding:8px 16px;font:600 14px system-ui;cursor:pointer}
@media(max-width:640px){main{padding:22px 18px;margin:0;border-radius:0}}@media print{body{background:#fff}main{box-shadow:none;margin:0;padding:0}.bar{display:none}}</style></head>
<body><div class="bar"><button type="button" onclick="window.print()">Cetak / Simpan PDF</button></div><main>${markdownToHtml(markdown)}</main></body></html>`;
}
