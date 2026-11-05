import type { DocFacts } from "./leadDocs.js";

// The public onboarding guide (/api/public/panduan/onboarding): a designed, illustrated page sent to prospective tenants by link
// or saved as PDF. The numbers (trial length, fees, discounts, grace period) come from the live platform settings so the guide can
// never disagree with what actually happens. Screenshots live in client/public/guide and are served at /guide/*.jpg.

const esc = (v: unknown) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const rp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

const IMG = "/guide/";

/** A dashboard screenshot inside a browser-style frame, with numbered pins explaining what to look at. */
function shot(file: string, path: string, caption: string, pins: string[] = [], size: [number, number] = [1600, 1001]): string {
  return `<figure class="shot">
  <div class="frame"><div class="bar"><i></i><i></i><i></i><span>${esc(path)}</span></div>
  <img src="${IMG}${file}" width="${size[0]}" height="${size[1]}" loading="lazy" alt="${esc(caption)}"></div>
  <figcaption>${caption}</figcaption>
  ${pins.length ? `<ol class="pins">${pins.map((p) => `<li>${p}</li>`).join("")}</ol>` : ""}
</figure>`;
}

const phone = (file: string, n: number, label: string, w = 684, h = 1216) =>
  `<figure class="phone"><div class="device"><img src="${IMG}${file}" width="${w}" height="${h}" loading="lazy" alt="${esc(label)}"></div><figcaption><b>${n}</b> ${esc(label)}</figcaption></figure>`;

const note = (kind: "tip" | "warn" | "info", title: string, body: string) =>
  `<div class="note ${kind}"><b>${kind === "tip" ? "💡" : kind === "warn" ? "⚠️" : "ℹ️"} ${esc(title)}</b><p>${body}</p></div>`;

const step = (n: number, id: string, title: string, time: string, intro: string, body: string) =>
  `<section id="${id}" class="step"><header><span class="num">${n}</span><div><h2>${esc(title)}</h2><p class="time">⏱ ${esc(time)}</p></div></header><p class="intro">${intro}</p>${body}</section>`;

export function renderOnboardingPage(f: DocFacts): string {
  const tiers = f.volumeTiers.length
    ? `<table class="tbl"><thead><tr><th>Jumlah booth yang dibeli sekaligus</th><th>Diskon</th></tr></thead><tbody>${f.volumeTiers.map((t) => `<tr><td>${esc(t.minBooths)} booth atau lebih</td><td><b>${esc(t.percent)}%</b></td></tr>`).join("")}</tbody></table>`
    : `<p class="muted">Belum ada diskon volume yang aktif saat ini. Untuk jumlah booth besar, tanyakan diskon khusus ke tim STUDIODO.</p>`;

  const overview: [string, string, string][] = [
    ["masuk", "Masuk & aktifkan komputer", "±5 menit"], ["tampilan", "Atur tampilan kiosk", "±10 menit"], ["paket", "Paket & harga", "±5 menit"], ["frame", "Frame foto", "±5 menit"],
    ["alat", "Kamera & printer", "±10 menit"], ["bayar", "Pembayaran", "±10 menit"], ["coba", "Coba satu sesi penuh", "±5 menit"], ["pantau", "Pantau & berlangganan", "setiap hari"],
  ];

  const html = `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>Panduan Memulai STUDIODO</title>
<style>
:root{--ink:#0b1020;--muted:#5b6478;--line:#e4e7f1;--bg:#f5f6fb;--card:#fff;--brand:#5046e5;--brand2:#8b5cf6;--ok:#0f9d6a;--warn:#b45309;--soft:#eef0ff}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:84px}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 "Plus Jakarta Sans","Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--brand)}img{max-width:100%;height:auto;display:block}
.top{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.86);backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.top div{max-width:1180px;margin:0 auto;padding:12px 20px;display:flex;align-items:center;gap:16px}
.logo{font-weight:800;font-size:22px;letter-spacing:-.03em}.logo span{color:var(--brand)}
.top .sp{flex:1}.btn{display:inline-flex;align-items:center;gap:8px;border:0;cursor:pointer;text-decoration:none;font:600 14px/1 inherit;padding:11px 18px;border-radius:999px;background:linear-gradient(135deg,var(--brand),var(--brand2));color:#fff;box-shadow:0 8px 22px -8px rgba(80,70,229,.6)}
.btn.ghost{background:#fff;color:var(--ink);box-shadow:none;border:1px solid var(--line)}
.hero{background:radial-gradient(1200px 500px at 85% -10%,#c9c4ff 0,transparent 60%),radial-gradient(900px 500px at 0% 110%,#ffd6ea 0,transparent 55%),#fbfbff;border-bottom:1px solid var(--line)}
.hero .in{max-width:1180px;margin:0 auto;padding:64px 20px 56px;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:40px;align-items:center}
.collage{position:relative;padding:10px 0 40px}.collage .big{transform:rotate(-1.6deg);box-shadow:0 40px 70px -34px rgba(30,20,120,.55)}.collage .small{position:absolute;right:-6px;bottom:-4px;width:36%;transform:rotate(2.5deg);box-shadow:0 34px 56px -22px rgba(10,10,50,.7)}
.badge{display:inline-block;padding:6px 14px;border-radius:999px;background:#fff;border:1px solid var(--line);font-size:13px;font-weight:600;color:var(--brand)}
h1{font-size:clamp(34px,5.5vw,58px);line-height:1.05;letter-spacing:-.035em;margin:18px 0 14px;max-width:16ch}
.lead{font-size:clamp(17px,2vw,20px);color:var(--muted);max-width:56ch;margin:0 0 26px}
.chips{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 28px}.chip{background:#fff;border:1px solid var(--line);border-radius:14px;padding:10px 16px;font-weight:600;font-size:14px;box-shadow:0 4px 14px -8px rgba(20,20,60,.25)}
.wrap{max-width:1180px;margin:0 auto;padding:0 20px;display:grid;grid-template-columns:230px minmax(0,1fr);gap:48px}
nav.toc{position:sticky;top:84px;align-self:start;padding:34px 0}
nav.toc b{display:block;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:10px}
nav.toc a{display:block;text-decoration:none;color:var(--ink);padding:8px 12px;border-radius:10px;font-size:14px;font-weight:500}nav.toc a:hover{background:var(--soft);color:var(--brand)}
main{padding:34px 0 80px;min-width:0}
.overview{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px;margin:0 0 56px}
.ov{display:flex;gap:12px;align-items:center;text-decoration:none;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:18px;padding:14px 16px;transition:.2s;box-shadow:0 6px 18px -14px rgba(20,20,60,.4)}
.ov:hover{transform:translateY(-2px);border-color:#c9c5fb;box-shadow:0 14px 28px -16px rgba(80,70,229,.5)}
.ov .n{flex:none;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-weight:800;color:#fff;background:linear-gradient(135deg,var(--brand),var(--brand2))}
.ov b{display:block;font-size:14px;line-height:1.3}.ov small{color:var(--muted);font-size:12px}
section{margin:0 0 64px}.step>header{display:flex;gap:16px;align-items:center;margin-bottom:10px}
.num{flex:none;width:48px;height:48px;border-radius:16px;display:grid;place-items:center;font-size:22px;font-weight:800;color:#fff;background:linear-gradient(135deg,var(--brand),var(--brand2));box-shadow:0 10px 22px -10px rgba(80,70,229,.7)}
h2{font-size:clamp(24px,3vw,32px);line-height:1.15;letter-spacing:-.025em;margin:0}h3{font-size:19px;margin:30px 0 8px;letter-spacing:-.01em}
.time{margin:2px 0 0;font-size:13px;color:var(--muted)}.intro{font-size:17px;color:#2c3550;max-width:68ch}.muted{color:var(--muted)}
.shot{margin:26px 0}.frame{background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden;box-shadow:0 26px 50px -28px rgba(20,20,70,.45)}
.bar{display:flex;align-items:center;gap:7px;padding:10px 14px;background:#f1f2f8;border-bottom:1px solid var(--line)}.bar i{width:10px;height:10px;border-radius:50%;background:#d3d6e4}
.bar span{margin-left:10px;font-size:12px;color:var(--muted);font-weight:600;background:#fff;border:1px solid var(--line);border-radius:999px;padding:3px 12px}
.shot figcaption{font-size:14px;color:var(--muted);margin:12px 4px 0}
.pins{counter-reset:p;list-style:none;margin:14px 0 0;padding:0;display:grid;gap:8px}.pins li{counter-increment:p;position:relative;padding-left:38px;font-size:15px}
.pins li:before{content:counter(p);position:absolute;left:0;top:1px;width:26px;height:26px;border-radius:50%;background:var(--ink);color:#fff;display:grid;place-items:center;font-size:13px;font-weight:700}
.duo{display:grid;grid-template-columns:1fr 1fr;gap:20px}.duo .shot{margin:16px 0}
.note{border-radius:16px;padding:14px 18px;margin:22px 0;border:1px solid}.note p{margin:4px 0 0;font-size:15px}.note b{font-size:15px}
.note.tip{background:#effaf5;border-color:#bfe9d6}.note.warn{background:#fff6e8;border-color:#f6d9a8}.note.info{background:var(--soft);border-color:#d4d2fb}
.phones{display:flex;gap:18px;overflow-x:auto;padding:10px 4px 24px;margin:20px -4px;scroll-snap-type:x mandatory}
.phone{flex:none;width:188px;margin:0;scroll-snap-align:start}.device{background:#0b1020;border-radius:26px;padding:7px;box-shadow:0 24px 40px -22px rgba(10,10,50,.6)}.device img{border-radius:20px}
.phone figcaption{text-align:center;font-size:13px;margin-top:10px;color:#2c3550}.phone figcaption b{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--brand);color:#fff;font-size:12px;margin-right:4px}
.cmp{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:24px 0}.opt{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:22px 24px;box-shadow:0 14px 30px -22px rgba(20,20,70,.5)}
.opt .tag{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--brand);background:var(--soft);padding:4px 10px;border-radius:999px}
.opt h3{margin:12px 0 6px}.opt ul{padding-left:20px;margin:10px 0 0}.opt li{margin:5px 0;font-size:15px}
.tbl{border-collapse:collapse;width:100%;max-width:520px;background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden;margin:14px 0}.tbl th,.tbl td{padding:11px 16px;text-align:left;border-bottom:1px solid var(--line);font-size:15px}.tbl th{background:#f1f2f8;font-size:13px;color:var(--muted)}.tbl tr:last-child td{border-bottom:0}
.flow{display:grid;grid-template-columns:repeat(4,1fr);gap:0;margin:26px 0;position:relative}.stage{position:relative;padding:18px 14px 0;text-align:center}
.stage:before{content:"";position:absolute;top:30px;left:50%;right:-50%;height:4px;background:var(--line)}.stage:last-child:before{display:none}
.dot{position:relative;z-index:1;width:26px;height:26px;border-radius:50%;margin:0 auto 12px;border:4px solid #fff;box-shadow:0 0 0 2px var(--line)}.stage b{display:block;font-size:15px}.stage small{display:block;color:var(--muted);font-size:13px;line-height:1.4;margin-top:4px}
.s1 .dot{background:var(--brand2)}.s2 .dot{background:var(--ok)}.s3 .dot{background:#f59e0b}.s4 .dot{background:#ef4444}
.three{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:22px 0}.mini{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:18px 20px}.mini .ic{font-size:26px}.mini b{display:block;margin:6px 0 4px}.mini p{margin:0;font-size:14.5px;color:var(--muted)}
.check{columns:2;column-gap:28px;padding:0;list-style:none;margin:12px 0}.check li{break-inside:avoid;padding:6px 0 6px 32px;position:relative}.check li:before{content:"";position:absolute;left:0;top:9px;width:20px;height:20px;border:2px solid #b9b4f7;border-radius:6px;background:#fff}
details{background:var(--card);border:1px solid var(--line);border-radius:16px;margin:10px 0;padding:2px 18px}summary{cursor:pointer;font-weight:700;padding:14px 0;list-style:none;display:flex;justify-content:space-between;gap:12px}summary::-webkit-details-marker{display:none}summary:after{content:"+";font-size:22px;color:var(--brand);line-height:1}details[open] summary:after{content:"–"}details p{margin:0 0 16px;color:#2c3550}
.contact{background:linear-gradient(135deg,#1c1850,#4b3fd8);color:#fff;border-radius:26px;padding:34px 36px;margin-top:40px}.contact h2{color:#fff}.contact p{color:#d9d6ff;max-width:60ch}
footer{text-align:center;color:var(--muted);font-size:13px;padding:30px 20px 50px}
@media(max-width:980px){.hero .in{grid-template-columns:1fr}.collage{max-width:560px}.wrap{grid-template-columns:1fr;gap:0}nav.toc{display:none}.duo,.cmp,.three{grid-template-columns:1fr}.flow{grid-template-columns:1fr 1fr;row-gap:22px}.stage:before{display:none}.check{columns:1}.top .btn.ghost{display:none}}
@media print{@page{size:A4;margin:12mm}body{background:#fff;font-size:12.5px}.top,nav.toc,.btn,.hero .btn{display:none!important}.wrap{display:block}.hero{background:#fff}.hero .in{padding:6px 0 14px}h1{font-size:34px}section{margin-bottom:26px;break-inside:auto}.shot,.opt,.note,.flow,.phones,details,.mini{break-inside:avoid}.phones{overflow:visible;flex-wrap:wrap}.frame,.device{box-shadow:none}details{display:block}details>*{display:block}.contact{background:#fff!important;color:#000!important;border:1px solid #999}.contact h2,.contact p{color:#000!important}a{color:inherit;text-decoration:none}}
</style></head><body>
<div class="top"><div><span class="logo">studiodo<span>.</span></span><span class="sp"></span><a class="btn ghost" href="#mulai">Lihat langkah</a><button class="btn" onclick="window.print()">Cetak / Simpan PDF</button></div></div>

<header class="hero"><div class="in"><div class="txt">
<span class="badge">Panduan resmi · selalu mengikuti pengaturan terbaru</span>
<h1>Dari akun pertama sampai booth Anda dipakai pelanggan.</h1>
<p class="lead">Panduan bergambar ini membawa Anda langkah demi langkah: mengaktifkan komputer booth, mengatur tampilan, paket, frame, kamera dan printer, sampai menerima pembayaran. Semua gambar diambil dari dashboard STUDIODO yang sebenarnya.</p>
<div class="chips"><span class="chip">🎁 Trial gratis ${esc(f.trialDays)} hari</span><span class="chip">⏱ ±1 jam sampai siap dipakai</span><span class="chip">💳 Tanpa kartu kredit</span><span class="chip">🧩 Satu key = satu booth</span></div>
<a class="btn" href="#mulai">Mulai dari langkah 1 →</a></div>
<div class="collage" aria-hidden="true"><div class="frame big"><div class="bar"><i></i><i></i><i></i><span>Dashboard → Kustomisasi Kiosk</span></div><img src="${IMG}t-style.jpg" width="1600" height="1001" alt=""></div><div class="device small"><img src="${IMG}k-packages.jpg" width="684" height="1216" alt=""></div></div></div></header>

<div class="wrap">
<nav class="toc" aria-label="Daftar isi"><b>Daftar isi</b>
<a href="#siap">Sebelum mulai</a>${overview.map(([id, t], i) => `<a href="#${id}">${i + 1}. ${esc(t)}</a>`).join("")}<a href="#langganan">Langganan & harga</a><a href="#faq">Pertanyaan umum</a><a href="#bantuan">Butuh bantuan?</a></nav>

<main id="mulai">
<div class="overview">${overview.map(([id, t, time], i) => `<a class="ov" href="#${id}"><span class="n">${i + 1}</span><span><b>${esc(t)}</b><small>${esc(time)}</small></span></a>`).join("")}</div>

<section id="siap"><h2>Sebelum mulai</h2>
<p class="intro">Tiga istilah yang akan sering Anda dengar, dan daftar singkat yang perlu disiapkan.</p>
<div class="three"><div class="mini"><div class="ic">🖥️</div><b>Dashboard</b><p>Tempat Anda mengatur semuanya: tampilan, paket, frame, pembayaran, laporan. Dibuka dengan akun Anda.</p></div>
<div class="mini"><div class="ic">📷</div><b>Aplikasi kiosk</b><p>Program di PC booth yang dilihat dan disentuh pengunjung untuk berfoto, membayar, dan mencetak.</p></div>
<div class="mini"><div class="ic">🔑</div><b>Key booth</b><p>Kode yang menghubungkan satu PC ke akun Anda. Satu key untuk satu booth, satu komputer.</p></div></div>
<h3>Daftar persiapan di lokasi</h3>
<ul class="check"><li>PC Windows dengan internet stabil</li><li>Kamera (DSLR/mirrorless atau webcam) terpasang</li><li>Printer terpasang dan bisa mencetak dari Windows</li><li>Layar sentuh, atau monitor dengan mouse</li><li>Pencahayaan yang cukup di area foto</li><li>Email aktif dan nomor WhatsApp pemilik</li><li>Key trial dari tim STUDIODO</li><li>Rekening atau akun payment gateway (untuk pembayaran, lihat langkah 6)</li></ul>
${note("info", "Satu PC per booth", "Jangan memakai key yang sama di dua komputer. Kalau perlu memindahkan booth ke PC lain, pakai tombol <b>Reset device</b> di dashboard (langkah 1).")}
</section>

${step(1, "masuk", "Masuk & aktifkan komputer", "±5 menit", "Pasang aplikasi kiosk di PC booth (installer dikirim tim kami), buka, lalu masuk dengan akun Anda. Setelah itu tempel key booth untuk mengaktifkan komputer ini.",
  `<div class="duo">${shot("t-pair.jpg", "Aplikasi kiosk · Langkah 1 dari 2", "Layar pertama aplikasi kiosk di PC booth: masuk dengan akun tenant.", [], [900, 1016])}${shot("t-login.jpg", "Dashboard admin · Login", "Login dashboard: lewat Google, email + password, atau tautan ke email.", [], [900, 1016])}</div>
  <h3>Tiga cara masuk</h3>
  <ul><li><b>Lanjutkan dengan Google</b> — pakai email Google yang sama dengan email akun STUDIODO Anda.</li><li><b>Email + password</b> — password dibuat sendiri lewat tautan di email sambutan (STUDIODO tidak pernah meminta password Anda).</li><li><b>Masuk tanpa password</b> — kami kirim tautan ke email; buka tautan itu lalu tekan <i>“Ya, ini saya”</i>.</li></ul>
  ${shot("t-kiosk-keys.jpg", "Dashboard → Kiosk → API Key", "Key setiap booth ada di menu Kiosk. Status online, versi aplikasi, dan hasil cek kamera/printer juga terlihat di sini.", ["Tab <b>API Key</b> berisi semua booth dan masa langganannya.", "Tombol <b>Lihat key</b> menampilkan key untuk ditempel di layar “Setup / Pair kiosk ini” pada PC booth.", "Lencana <b>Kamera · Printer · Jaringan</b> hijau berarti perangkat terdeteksi sehat; merah berarti perlu dicek.", "<b>Reset device</b> dipakai bila booth dipindah ke komputer lain."])}
  ${note("warn", "Jaga kerahasiaan key", "Siapa pun yang memegang key dan akun Anda bisa mengaktifkan komputer. Jangan dibagikan lewat grup atau media sosial.")}`)}

${step(2, "tampilan", "Atur tampilan kiosk", "±10 menit", "Menu <b>Kustomisasi Kiosk</b> mengubah wajah booth: gaya, logo, warna, huruf, tombol, dan teks. Setiap perubahan langsung terlihat di pratinjau kiosk asli di sebelah kanan, dan tersimpan otomatis ke semua booth.",
  `${shot("t-style.jpg", "Dashboard → Kustomisasi Kiosk → Gaya kiosk", "Pilih satu dari enam gaya siap pakai: Default, Minimalis, Sinematik, Ceria, Seru!, atau Kamera penuh.", ["Menu <b>Kustomisasi Kiosk</b> di sisi kiri.", "Tab pengaturan: <b>Gaya kiosk, Identitas, Layar awal, Warna & font, Tombol & tampilan, Teks layar</b>.", "<b>Pratinjau langsung</b>: ganti layar (awal, pilih paket, kamera, pembayaran…) dan orientasi tegak/lebar tanpa menyentuh booth.", "Tulisan hijau “Semua perubahan tersimpan” menandakan perubahan sudah dipakai semua kiosk."])}
  <div class="duo">${shot("t-identitas.jpg", "Kustomisasi Kiosk → Identitas", "Unggah logo (PNG transparan paling bagus) dan isi akun media sosial untuk halaman hasil pelanggan.")}${shot("t-warna.jpg", "Kustomisasi Kiosk → Warna & font", "Pilih tema terang/gelap, warna aksen, dan huruf. Pratinjau menyesuaikan seketika.")}</div>
  ${note("tip", "Mulai sederhana", "Pilih satu gaya, unggah logo, pilih warna aksen — itu sudah cukup untuk booth pertama. Detail lain bisa disempurnakan kapan saja, tanpa mengganggu booth yang sedang berjalan.")}`)}

${step(3, "paket", "Paket & harga", "±5 menit", "Paket adalah apa yang dibeli pengunjung: jumlah foto, ada tidaknya GIF dan video, dan harganya. Paket pertama di urutan teratas ditampilkan sebagai “Paling Populer”.",
  `${shot("t-packages.jpg", "Dashboard → Finance → Paket Foto", "Buat, ubah, atau nonaktifkan paket. Tambahkan juga “extra cetak” yang bisa dibeli pengunjung.", ["Tab <b>Paket Foto</b> di dalam menu Finance.", "<b>+ Buat paket baru</b>: nama, harga, jumlah foto, GIF, video.", "<b>Edit / Nonaktifkan / Hapus</b> pada tiap paket.", "<b>Tambah extra</b>: cetakan tambahan dengan harga tersendiri."])}
  ${shot("t-voucher.jpg", "Dashboard → Finance → Voucher & Promosi", "Voucher untuk diskon, gratis, atau potongan nominal, lengkap dengan kuota dan masa berlaku.")}`)}

${step(4, "frame", "Frame foto", "±5 menit", "Frame adalah bingkai desain tempat foto pengunjung ditempatkan. Unggah desain Anda sendiri (PNG) atau pakai template; tiap frame punya posisi foto (slot) dan kategori.",
  `${shot("t-frames.jpg", "Dashboard → Kelola Frame", "Pustaka frame yang aktif, dikelompokkan per kategori (mis. Wedding, Birthday, Minimal).", ["<b>+ Upload batch PNG</b> menambah banyak frame sekaligus.", "Panel kiri memfilter berdasarkan <b>kategori</b>; kolom cari menemukan frame cepat.", "Setiap kartu menampilkan nama, gaya, ukuran cetak (4R), dan jumlah slot foto.", "Tab lain: <b>Stop Motion</b>, <b>Stiker</b>, dan <b>Output & Layout</b> (susunan strip foto)."])}
  ${note("tip", "Ukuran yang aman", "Frame berukuran 4R (10,2 × 15,2 cm) cocok untuk kebanyakan printer foto. Tim STUDIODO bisa membantu mengatur posisi slot bila Anda punya desain khusus.")}`)}

${step(5, "alat", "Kamera & printer", "±10 menit", "Hubungkan kamera dan printer di Windows lebih dulu, lalu pilih keduanya di menu Kiosk. Aplikasi menampilkan status perangkat dan mencoba mendeteksinya otomatis.",
  `<div class="duo">${shot("t-kiosk-camera.jpg", "Dashboard → Kiosk → Kamera", "Pilih kamera, waktu hitung mundur, suara beep, dan jepret otomatis.")}${shot("t-kiosk-printer.jpg", "Dashboard → Kiosk → Printer", "Pilih printer, jumlah salinan, cetak otomatis, dan ukuran kertas. Ada tombol Test print.")}</div>
  <ul><li><b>Webcam</b> langsung bisa dipakai (Mode kamera = Webcam / virtual camera).</li><li><b>Kamera DSLR/mirrorless</b> disambungkan lewat USB; kami membantu memilih dan memasang program penghubungnya.</li><li><b>Test print</b> mencetak satu lembar uji, supaya ukuran kertas dan penyesuaian gambar bisa diperiksa sebelum dibuka untuk pelanggan.</li></ul>
  ${note("info", "Panduan ada di dalam aplikasi", "Tab Kamera dan Printer memuat kartu “Panduan” berisi daftar kamera yang didukung dan cara menyambungkannya.")}`)}

${step(6, "bayar", "Pembayaran", "±10 menit", "Ada dua pilihan. Pilih sesuai kebutuhan Anda; bisa diubah kapan saja dengan bantuan tim kami.",
  `<div class="cmp"><div class="opt"><span class="tag">Pilihan A</span><h3>Akun payment gateway sendiri</h3><p>Xendit atau DOKU. Uang pengunjung masuk <b>langsung ke akun Anda</b>.</p><ul><li>Isi kunci API di dashboard (Finance → Pembayaran)</li><li>STUDIODO tidak menyentuh dana Anda</li><li>Cocok bila Anda sudah punya akun gateway</li></ul></div>
  <div class="opt"><span class="tag">Pilihan B</span><h3>Ditampung STUDIODO</h3><p>Tanpa akun gateway. QRIS pengunjung masuk ke STUDIODO dan tercatat sebagai <b>saldo</b> Anda.</p><ul><li>Biaya layanan <b>${esc(f.qrisFeePercent)}%</b> per pembayaran QRIS${f.withdrawalFlatFee > 0 ? `, plus ${rp(f.withdrawalFlatFee)} per penarikan` : ""}</li><li>Penarikan minimum <b>${rp(f.withdrawalMinAmount)}</b></li><li>${esc(f.withdrawalSchedule)}${f.holdDays > 0 ? `; dana ditahan ${esc(f.holdDays)} hari sebelum bisa ditarik` : ""}</li><li>Ditransfer ke rekening atas nama Anda</li></ul></div></div>
  <div class="duo">${shot("t-gateway.jpg", "Finance → Pembayaran (Pilihan A)", "Pilih gateway yang dipakai kiosk lalu isi kunci API-nya. Alamat webhook yang perlu didaftarkan ditampilkan di bawahnya.")}${shot("t-withdraw.jpg", "Finance → Saldo & Penarikan (Pilihan B)", "Saldo yang bisa ditarik, biaya layanan, dan formulir pengajuan penarikan ke rekening Anda.")}</div>
  ${note("info", "Langganan STUDIODO", "Biaya langganan STUDIODO sendiri selalu dibayar lewat Midtrans (QRIS, transfer, kartu, e-wallet), apa pun pilihan pembayaran booth Anda.")}
  ${note("tip", "Rekening yang baru dipakai", "Penarikan pertama ke rekening baru dapat ditahan sebentar untuk verifikasi. Ini untuk melindungi dana Anda dari penyalahgunaan akun.")}`)}

${step(7, "coba", "Coba satu sesi penuh", "±5 menit", "Sebelum dibuka untuk umum, jalankan satu sesi seperti pengunjung: pilih paket, bayar (mode uji atau voucher gratis), berfoto, pilih frame, lalu cetak dan buka halaman hasil.",
  `<h3>Alur yang dilihat pengunjung</h3>
  <div class="phones">${phone("k-idle.jpg", 1, "Layar awal: “Sentuh untuk mulai”")}${phone("k-packages.jpg", 2, "Pilih paket dan lihat harganya")}${phone("k-camera.jpg", 3, "Pilih tampilan kamera")}${phone("k-payment.jpg", 4, "Bayar dengan QRIS atau voucher")}${phone("k-result.jpg", 5, "Hasil foto + QR untuk diunduh")}</div>
  <p class="muted">Urutan layar dan layar opsional (tutorial, pilih frame, dan lainnya) bisa diatur di menu <b>Flow Kiosk</b>; layar bertanda <i>Wajib</i> tidak bisa dimatikan.</p>
  ${shot("t-flow.jpg", "Dashboard → Flow Kiosk", "Atur urutan layar dengan drag, dan nyalakan/matikan layar opsional.")}
  <h3>Setelah foto: halaman hasil di HP pengunjung</h3>
  <p>Pengunjung memindai QR di layar hasil. Mereka membuka halaman dengan nama dan tautan media sosial Anda, lalu mengunduh foto (juga GIF atau video bila paketnya menyertakan). Isinya diatur di menu <b>Profil Gallery</b>.</p>
  <div class="duo">${shot("t-gallery.jpg", "Dashboard → Profil Gallery", "Nama brand, tagline, WhatsApp, dan media sosial yang tampil di halaman hasil.")}<figure class="phone" style="width:230px;margin:16px auto"><div class="device"><img src="${IMG}t-share.jpg" width="860" height="1802" loading="lazy" alt="Halaman hasil di HP pengunjung" style="aspect-ratio:9/16;object-fit:cover;object-position:top"></div><figcaption>Halaman hasil yang dibuka pengunjung</figcaption></figure></div>`)}

${step(8, "pantau", "Pantau bisnis & berlangganan", "setiap hari", "Setelah berjalan, dashboard membantu Anda melihat booth, penjualan, dan pelanggan dalam satu tempat.",
  `${shot("t-monitor.jpg", "Dashboard → Monitor Booth", "Semua booth dalam satu layar: siapa yang sedang sesi, menunggu bayar, atau offline, plus pendapatan hari ini.")}
  <div class="duo">${shot("t-traffic.jpg", "Dashboard → Traffic", "Grafik sesi dan pendapatan per hari (7, 14, 30, atau 90 hari).")}${shot("t-media.jpg", "Dashboard → Database Foto & Video", "Semua foto, GIF, dan video dari setiap sesi; bisa dicari berdasarkan tanggal atau nomor WhatsApp.")}</div>
  ${shot("t-crm.jpg", "Dashboard → Pelanggan / CRM", "Daftar pelanggan dari data sesi: hubungi lewat WhatsApp, beri catatan dan label, ekspor ke CSV.")}`)}

<section id="langganan"><h2>Langganan, harga & diskon</h2>
<p class="intro">Satu booth = satu langganan. Beli dan kelola semua booth sekaligus di dashboard web (menu <i>Booth & langganan</i>) di <a href="${esc(f.portalUrl)}">${esc(f.portalUrl.replace(/^https?:\/\//, ""))}</a>. Pembayaran lewat Midtrans.</p>
<div class="flow"><div class="stage s1"><div class="dot"></div><b>Trial</b><small>${esc(f.trialDays)} hari gratis. Coba semua fitur.</small></div><div class="stage s2"><div class="dot"></div><b>Berlangganan</b><small>Booth aktif selama masa langganan.</small></div><div class="stage s3"><div class="dot"></div><b>Masa tenggang</b><small>${esc(f.graceDays)} hari setelah langganan berbayar habis; booth tetap jalan.</small></div><div class="stage s4"><div class="dot"></div><b>Terkunci</b><small>Booth berhenti sampai diperpanjang. Data tidak dihapus.</small></div></div>
${note("info", "Trial tidak punya masa tenggang", "Saat trial habis, booth langsung terkunci sampai Anda berlangganan. Perpanjang sebelum habis agar booth tidak berhenti di tengah acara.")}
<h3>Diskon banyak booth</h3>${tiers}
<p class="muted">Harga mengikuti paket aktif di halaman harga. Diskon khusus per tenant bisa dibicarakan untuk jumlah booth besar; yang berlaku adalah diskon terbaik (tidak ditumpuk). Untuk kesepakatan tertulis, kami kirim <b>surat kerja sama</b> yang bisa dibaca dan disetujui lewat tautan.</p></section>

<section id="faq"><h2>Pertanyaan umum</h2>
<details><summary>Apakah trial gratis? Perlu kartu kredit?</summary><p>Gratis selama ${esc(f.trialDays)} hari dan tidak perlu kartu kredit.</p></details>
<details><summary>Kamera apa yang bisa dipakai?</summary><p>Webcam dan kamera yang didukung (mis. DSLR/mirrorless lewat USB dan program penghubung). Tim kami membantu memilih yang cocok untuk lokasi Anda.</p></details>
<details><summary>Bagaimana kalau internet mati?</summary><p>Kiosk memerlukan internet untuk pembayaran QRIS. Kabari kami bila lokasi Anda sering tidak stabil; kami bantu mencari opsi yang sesuai.</p></details>
<details><summary>Bagaimana menambah booth?</summary><p>Beli lewat dashboard web; kami menerbitkan key baru untuk tiap booth. Pasang aplikasi di PC baru dan tempel key itu (langkah 1).</p></details>
<details><summary>Lupa password atau tidak bisa masuk?</summary><p>Pakai <b>“Masuk tanpa password”</b> atau <b>Lanjutkan dengan Google</b> di layar login, atau minta tautan atur ulang password lewat email.</p></details>
<details><summary>Apakah foto pengunjung aman?</summary><p>Foto hanya bisa dibuka lewat tautan atau QR sesi masing-masing. Izin unggah ke media sosial ditanyakan ke pengunjung lewat pop-up yang bisa Anda nyalakan di menu Flow Kiosk.</p></details>
<details><summary>Siapa yang dihubungi bila ada masalah?</summary><p>Balas WhatsApp tim STUDIODO yang menghubungi Anda, atau pakai tombol <b>Bantuan</b> di pojok kanan bawah dashboard: pesan Anda langsung masuk ke tim kami.</p></details></section>

<section id="bantuan" class="contact"><h2>Butuh bantuan?</h2><p>Kami mendampingi sampai booth Anda berjalan lancar. Balas pesan WhatsApp dari tim STUDIODO, atau tekan tombol <b>Bantuan</b> di dashboard kapan saja.</p><p><a class="btn" href="#mulai" style="background:#fff;color:#1c1850">Kembali ke atas ↑</a></p></section>
</main></div>
<footer>© STUDIODO · Panduan ini dibuat otomatis dari pengaturan platform terbaru.</footer>
</body></html>`;
  return html;
}
