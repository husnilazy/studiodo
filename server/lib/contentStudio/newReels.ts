import { BLUE, CREAM, INK, LIL, MINT, ORG, PINK, TEAL, YEL } from "./heroReel2.js";
import { camera, laptop, shot, slider, webcam } from "./reelCam.js";
import { defineReel, K, type Ctx, type ReelDef } from "./reelKit.js";
import type { FigEd } from "./art4.js";

// The 20 "feature" story reels (reelKit). Each scene = one voice-over sentence, text is the on-screen line, art is the illustration for that beat.
// Order of scenes must match the sentences in reelScripts.ts (the last two sentences are the brand line and the CTA, handled by the kit).

const H = ["short", "long", "bun", "hijab", "curly"] as const;
type PS = Partial<FigEd> & { x: number };
const who = (c: Ctx, o: PS, dt = 0.4) => c.person({ y: 1700, s: 0.7, hair: H[Math.floor(o.x / 200) % 5], skin: 1, color: 1, pose: "hold", ...o } as FigEd, dt);

const DEFS: ReelDef[] = [
  // 1 ------------------------------------------------------------------------------------------------ pilih-penerima-qris
  { id: "rekening", music: "house", voice: "finn", brand: "Kamu yang menentukan alur uangnya.",
    cta: { text: "Simpan, biar tidak lupa *setting* pembayaranmu!", btn: "Simpan buat checklist ↓" },
    scenes: [
      { text: "Uang QRIS masuk ke *mana?*", bg: YEL, art: (c) => c.A(K.qr(540, 1250, 1.5), 0.3) + c.A(K.txt(300, 1560, "?", 150, ORG), 0.9) + c.A(K.txt(540, 1560, "?", 150, ORG), 1.2) + c.A(K.txt(780, 1560, "?", 150, ORG), 1.5) },
      { text: "Satu rekening buat semua? *Ribet* bagi hasil!", bg: PINK, art: (c) => c.A(K.wallet(540, 1280, 1.6), 0.3) + [0, 1, 2].map((i) => c.A(K.coin(240 + i * 300, 1560, 56), 0.7 + i * 0.4)).join("") + who(c, { x: 150, expr: "khawatir", hair: "bun", pose: "up" }, 0.5) + who(c, { x: 930, expr: "bingung", hair: "short", skin: 2, color: 2, pose: "chin" }, 0.8) },
      { text: "Di STUDIODO, *kamu yang pilih* sendiri!", bg: BLUE, dark: true, art: (c) => c.A(K.card(540, 1250, 800, 220, "Penerima uang QRIS", "Pilih sendiri", INK, ORG), 0.3) + c.A(K.chip(540, 1520, "Pengaturan pembayaran", MINT, INK, 40), 0.9) },
      { text: "Lewat *akun STUDIODO,* atau gateway milikmu.", bg: CREAM, art: (c) => c.A(K.tickBox(540, 1190, "Akun STUDIODO", true, 780), 0.4) + c.A(K.tickBox(540, 1360, "Gateway milikmu", false, 780), 1.4) + c.A(K.chip(540, 1580, "Simpan, QRIS ikut pilihanmu", ORG, "#fff", 36), 2.2) },
      { text: "Saldo & riwayat *terpantau.*", bg: MINT, art: (c) => c.A(K.bars(380, 1280, [0.4, 0.7, 0.5, 0.9, 0.65], 1.2), 0.3) + c.A(K.receipt(790, 1300, 1.2, 5), 0.8) + c.A(K.coin(790, 1560, 60), 1.2) },
    ] },
  // 2 ------------------------------------------------------------------------------------------------ saldo-penarikan
  { id: "saldo", music: "lofi", voice: "maya", brand: "Uang masuk dan keluar, selalu bisa ditelusuri.",
    cta: { text: "Tag temanmu yang masih *catat saldo* di buku!", kw: "Tag di komentar ↓" },
    scenes: [
      { text: "Berapa saldo booth-mu *sekarang?*", bg: LIL, art: (c) => c.A(K.wallet(540, 1280, 1.7), 0.3) + c.A(K.txt(540, 1330, "Rp ???", 90, "#fff"), 0.9) + who(c, { x: 200, expr: "bingung", pose: "chin", hair: "curly" }, 0.6) },
      { text: "Uang masuk, catatannya *entah di mana.*", bg: "#14122b", dark: true, art: (c) => [0, 1, 2, 3].map((i) => c.A(K.coin(250 + i * 190, 1200 + (i % 2) * 150, 54), 0.4 + i * 0.3)).join("") + c.A(K.chip(540, 1580, "Catatan: hilang", "#e5384f", "#fff", 44), 1.8) },
      { text: "Saldo & riwayat, *satu layar.*", bg: BLUE, dark: true, art: (c) => c.A(laptop(540, 1280, 1.45, K.txt(0, -50, "Saldo", 40, INK) + K.txt(0, 30, "Rp 4.250.000", 54, BLUE) + K.txt(0, 90, "Contoh tampilan", 22, "#8a8fb3", 700, "middle", "Inter")), 0.3) },
      { text: "Mau tarik? *Ajukan* dari dashboard.", bg: YEL, art: (c) => c.A(K.card(540, 1200, 780, 190, "Ajukan penarikan", "ke rekening", INK, ORG), 0.3) + c.A(K.arrow(540, 1330, 540, 1440), 1.2) + c.A(K.chip(540, 1540, "Status: diproses", TEAL, "#fff", 42), 1.8) + c.A(K.chip(540, 1540, "Status: selesai", MINT, INK, 42), 3.6) },
      { text: "Setiap perubahan *tercatat.*", bg: MINT, art: (c) => [0, 1, 2, 3].map((i) => c.A(K.card(540, 1100 + i * 150, 760, 120, ["Pembayaran masuk", "Penarikan diajukan", "Saldo diperbarui", "Riwayat tersimpan"][i], "", INK, [BLUE, ORG, TEAL, "#7b5cff"][i]), 0.3 + i * 0.5)).join("") },
    ] },
  // 3 ------------------------------------------------------------------------------------------------ cetak-tambahan
  { id: "cetak", music: "synthwave", voice: "siti", brand: "Pendapatan tambahan, tanpa tambahan kerja.",
    cta: { text: "Booth-mu pernah *kehilangan* cetakan tambahan?", kw: "Ceritakan di komentar ↓" },
    scenes: [
      { text: "“Mau cetak lagi dong!” *“Nanti ya...”*", bg: PINK, size: 96, art: (c) => who(c, { x: 230, expr: "senang", hair: "long", pose: "up" }, 0.4) + who(c, { x: 850, expr: "khawatir", hair: "short", skin: 2, color: 2, pose: "chin" }, 0.9) + c.A(K.chip(300, 1050, "Mau cetak lagi!", "#fff", INK, 44), 0.6) + c.A(K.chip(800, 1050, "Nanti ya...", INK, "#fff", 44), 1.2) },
      { text: "Padahal itu *uang yang melayang!*", bg: "#14122b", dark: true, art: (c) => [0, 1, 2].map((i) => c.A(K.coin(250 + i * 280, 1500 - i * 110, 62), 0.3 + i * 0.4)).join("") + c.A(K.txt(540, 1200, "↑ ↑ ↑", 110, YEL), 1.2) },
      { text: "Cetak tambahan, *satu ketukan!*", bg: BLUE, dark: true, art: (c) => c.A(K.card(540, 1230, 800, 220, "Cetak tambahan", "", INK, ORG), 0.3) + c.A(K.chip(640, 1230, "−", "#e3e6f5", INK, 56, 110) + K.txt(745, 1250, "2", 90, INK) + K.chip(850, 1230, "+", ORG, "#fff", 56, 110), 0.9) },
      { text: "Gabung *2R + 4R,* total langsung kelihatan.", bg: CREAM, art: (c) => c.A(K.photo(330, 1250, 250, 330, BLUE, "2R"), 0.3) + c.A(K.photo(640, 1250, 330, 420, ORG, "4R"), 0.8) + c.A(K.chip(540, 1640, "Total Rp 45.000 (contoh)", MINT, INK, 38), 1.6) },
    ] },
  // 4 ------------------------------------------------------------------------------------------------ foto-gif-video
  { id: "gif", music: "techno", voice: "finn", brand: "Nilai lebih, tanpa kerja ekstra.",
    cta: { text: "Info lengkap? *Cek link bio!*", btn: "Link di bio →" },
    scenes: [
      { text: "Foto, GIF, *dan video?*", bg: ORG, dark: true, art: (c) => c.A(K.photo(300, 1250, 260, 340, BLUE, "Foto"), 0.3) + c.A(K.photo(570, 1250, 260, 340, PINK, "GIF"), 0.8) + c.A(K.photo(840, 1250, 260, 340, TEAL, "Video"), 1.3) },
      { text: "Bikin *satu-satu?* Capek!", bg: "#14122b", dark: true, art: (c) => who(c, { x: 540, expr: "khawatir", pose: "up", hair: "bun", s: 0.62 }, 0.3) + c.A(K.txt(250, 1250, "…", 180, YEL), 0.9) + c.A(K.txt(830, 1250, "…", 180, YEL), 1.2) },
      { text: "Satu sesi, *tiga hasil!*", bg: YEL, art: (c) => c.A(K.strip(540, 1280, 4, 1.2), 0.3) + c.A(K.chip(250, 1240, "Foto", BLUE, "#fff", 40), 1.0) + c.A(K.chip(830, 1180, "GIF", PINK, INK, 40), 1.4) + c.A(K.chip(830, 1340, "Video", TEAL, "#fff", 40), 1.8) },
      { text: "Foto, GIF & video dari *satu pemotretan.*", bg: LIL, art: (c) => c.A(camera(300, 1280, 1.0, "#2b2f6b", ORG), 0.3) + c.A(K.arrow(460, 1280, 600, 1280), 0.9) + c.A(K.play(760, 1280, 100), 1.2) + c.A(K.chip(760, 1470, "GIF + video", "#fff", INK, 36), 1.5) },
      { text: "Semua ada di *galeri QR.*", bg: MINT, art: (c) => c.A(K.qr(330, 1300, 1.3), 0.3) + c.A(K.photo(740, 1250, 260, 330, BLUE), 0.8) + c.A(K.photo(800, 1450, 220, 280, PINK, "", true), 1.2) },
    ] },
  // 5 ------------------------------------------------------------------------------------------------ stop-motion
  { id: "stopmotion", music: "house", voice: "maya", brand: "Satu alasan lagi buat customer berbagi.",
    cta: { text: "Yuk, *coba gratis* sekarang!", btn: "Coba gratis →" },
    scenes: [
      { text: "Hasil booth-mu *itu-itu saja?*", bg: CREAM, art: (c) => [0, 1, 2].map((i) => c.A(K.photo(260 + i * 280, 1280, 240, 320, BLUE, "", true), 0.3 + i * 0.3)).join("") + who(c, { x: 540, expr: "bingung", pose: "down", hair: "long", y: 1830, s: 0.45 }, 1.2) },
      { text: "Coba mode *stop-motion!*", bg: PINK, art: (c) => c.A(K.play(540, 1260, 150, ORG), 0.3) + c.A(K.chip(540, 1500, "Stop-motion", INK, "#fff", 46), 0.9) },
      { text: "Berpose beberapa kali, *video jadi otomatis!*", bg: BLUE, dark: true, art: (c) => [0, 1, 2, 3].map((i) => c.A(K.photo(190 + i * 233, 1280, 200, 260, [ORG, PINK, TEAL, YEL][i], "", true), 0.3 + i * 0.45)).join("") + c.A(K.arrow(300, 1500, 800, 1500, "#fff"), 2.3) + c.A(K.play(540, 1600, 60, ORG), 2.7) },
      { text: "Putar ulang, *gampang dibagikan.*", bg: MINT, art: (c) => c.A(K.photo(540, 1260, 380, 480, PINK, "", true), 0.3) + c.A(K.play(540, 1260, 80, INK), 0.6) + c.A(K.heart(780, 1000, 0.7), 1.4) + c.A(K.heart(300, 1060, 0.5, ORG), 1.8) },
    ] },
  // 6 ------------------------------------------------------------------------------------------------ zoom-shutter
  { id: "zoom", music: "chill", voice: "siti", brand: "Kontrol di tangan customer.",
    cta: { text: "Tag temanmu yang selalu *kepotong* di foto booth!", kw: "Tag di komentar ↓" },
    scenes: [
      { text: "Tamu tinggi, tamu pendek, *satu kamera.*", bg: YEL, art: (c) => who(c, { x: 300, s: 0.95, expr: "senang", pose: "hold", hair: "short" }, 0.3) + who(c, { x: 560, s: 0.5, expr: "bingung", hair: "bun", skin: 2, color: 2 }, 0.6) + c.A(camera(840, 1250, 0.7), 0.9) },
      { text: "Kasih kontrolnya *ke tamu!*", bg: BLUE, dark: true, art: (c) => c.A(K.chip(540, 1250, "Kontrol", ORG, "#fff", 72), 0.3) + who(c, { x: 540, s: 0.6, y: 1750, expr: "lega", pose: "up", hair: "curly" }, 0.8) },
      { text: "*Zoom digital* sendiri!", bg: MINT, art: (c) => c.A(K.photo(540, 1250, 420, 520, PINK, "", true), 0.3) + c.A(K.chip(790, 1050, "+", ORG, "#fff", 70, 120), 0.9) + c.A(K.chip(300, 1050, "−", INK, "#fff", 70, 120), 1.2) + c.A(K.txt(540, 1630, "Zoom digital", 46, INK), 1.5) },
      { text: "Shutter *otomatis* atau *manual?*", bg: CREAM, art: (c) => c.A(K.card(540, 1200, 780, 150, "Shutter otomatis", "", INK, TEAL), 0.3) + c.A(K.card(540, 1390, 780, 150, "Shutter manual", "", INK, ORG), 1.0) + c.A(K.chip(540, 1590, "Mereka yang pilih", INK, "#fff", 40), 1.8) },
    ] },
  // 7 ------------------------------------------------------------------------------------------------ edit-di-kiosk
  { id: "edit", music: "synthwave", voice: "finn", brand: "Foto pas, tanpa retake berulang.",
    cta: { text: "Simpan buat *briefing* kru boothmu!", btn: "Simpan buat briefing ↓" },
    scenes: [
      { text: "Foto bagus, *posisi geser!* Retake lagi...", bg: PINK, art: (c) => c.A(K.photo(380, 1290, 360, 460, BLUE), 0.3) + c.A(K.chip(540, 1600, "Retake ×3", "#e5384f", "#fff", 46), 1.0) + who(c, { x: 850, expr: "khawatir", pose: "up", hair: "bun" }, 0.8) },
      { text: "Edit *langsung di kiosk!*", bg: BLUE, dark: true, art: (c) => c.A(laptop(540, 1280, 1.5, K.photo(0, 0, 200, 150, ORG, "", true)), 0.3) },
      { text: "Geser, zoom *cubit,* ketuk dua kali reset.", bg: YEL, size: 88, art: (c) => c.A(K.photo(540, 1250, 460, 560, "#ff6fa5", "", true), 0.3) + c.A(K.chip(300, 1620, "Geser", INK, "#fff", 36), 0.9) + c.A(K.chip(540, 1620, "Zoom", ORG, "#fff", 36), 1.5) + c.A(K.chip(790, 1620, "Reset ×2", BLUE, "#fff", 36), 2.4) },
      { text: "Tinggal lanjut *ke hasil!*", bg: MINT, art: (c) => c.A(K.photo(540, 1260, 420, 520, TEAL, "", true), 0.3) + c.A(K.chip(540, 1600, "Lanjut →", INK, "#fff", 54), 1.0) },
    ] },
  // 8 ------------------------------------------------------------------------------------------------ frame-portrait-landscape
  { id: "frame", music: "lofi", voice: "maya", brand: "Satu booth, dua gaya frame.",
    cta: { text: "Portrait atau landscape? *Jawab di komentar!*", kw: "Pilih di komentar ↓" },
    scenes: [
      { text: "Frame portrait, foto *landscape.* Kepotong!", bg: "#14122b", dark: true, art: (c) => c.A(K.photo(330, 1300, 280, 420, BLUE), 0.3) + c.A(K.photo(720, 1300, 420, 280, ORG), 0.8) + c.A(K.chip(720, 1470, "Kepotong", "#e5384f", "#fff", 40), 1.5) },
      { text: "Dua-duanya *bisa!*", bg: YEL, art: (c) => c.A(K.photo(340, 1290, 300, 460, PINK, "Portrait"), 0.3) + c.A(K.photo(740, 1290, 460, 300, TEAL, "Landscape"), 0.9) },
      { text: "Pemilih frame *tampilkan orientasi benar.*", bg: LIL, size: 92, art: (c) => c.A(K.card(540, 1180, 780, 130, "Frame Event A", "Portrait", INK, PINK), 0.3) + c.A(K.card(540, 1340, 780, 130, "Frame Event B", "Landscape", INK, TEAL), 0.9) + c.A(K.chip(540, 1530, "Tanda orientasi pas", MINT, INK, 38), 1.6) },
      { text: "Cetak *ikut bentuk frame.*", bg: MINT, art: (c) => c.A(K.strip(380, 1290, 3, 1.2), 0.3) + c.A(K.photo(750, 1290, 360, 240, ORG, "", true), 0.9) },
    ] },
  // 9 ------------------------------------------------------------------------------------------------ gaya-kiosk
  { id: "gaya", music: "house", voice: "siti", brand: "Booth-mu, rasa brand-mu.",
    cta: { text: "Intip *semua gayanya!*", btn: "Link di bio →" },
    scenes: [
      { text: "Tampilan booth-mu *sama persis* dengan yang lain?", bg: CREAM, size: 92, art: (c) => [0, 1, 2].map((i) => c.A(K.photo(260 + i * 280, 1290, 240, 380, BLUE, "", false), 0.3 + i * 0.3)).join("") },
      { text: "Ubah jadi *wajah brand-mu!*", bg: PINK, art: (c) => c.A(K.photo(260, 1290, 240, 380, BLUE, "", false), 0.2) + c.A(K.photo(540, 1290, 240, 380, ORG, "", false), 0.5) + c.A(K.photo(820, 1290, 240, 380, TEAL, "", false), 0.8) + c.A(K.heart(540, 1100, 0.6, "#fff"), 1.2) },
      { text: "Gaya siap pakai, *warna & teks* ganti sendiri.", bg: BLUE, dark: true, size: 92, art: (c) => c.A(K.card(540, 1180, 800, 140, "Pilih gaya", "Siap pakai", INK, ORG), 0.3) + [YEL, PINK, MINT, ORG, TEAL].map((cc, i) => c.A(K.coin(240 + i * 150, 1420, 52, "").replace(YEL, cc), 0.8 + i * 0.25)).join("") + c.A(K.chip(540, 1600, "Tanpa programmer", "#fff", INK, 40), 2.2) },
      { text: "Pratinjau *persis kiosk.*", bg: MINT, art: (c) => c.A(laptop(540, 1280, 1.4, K.photo(0, 0, 200, 160, PINK, "", true)), 0.3) + c.A(K.chip(540, 1620, "Lihat hasilnya langsung", INK, "#fff", 38), 1.0) },
    ] },
  // 10 ----------------------------------------------------------------------------------------------- galeri-qr + layar-hasil
  { id: "galeri", music: "techno", voice: "finn", brand: "Hasil sampai ke tangan customer sebelum pulang.",
    cta: { text: "Tag temanmu yang foto booth-nya *dikirim lewat chat!*", kw: "Tag di komentar ↓" },
    scenes: [
      { text: "Customer pulang, *fotonya nggak dibawa.*", bg: "#14122b", dark: true, art: (c) => who(c, { x: 800, expr: "senang", pose: "wave", hair: "hijab", s: 0.6, color: 3 }, 0.3) + c.A(K.photo(300, 1300, 300, 400, BLUE), 0.8) + c.A(K.chip(300, 1560, "Ketinggalan", "#e5384f", "#fff", 40), 1.5) },
      { text: "Satu layar, *semua aksi.*", bg: BLUE, dark: true, art: (c) => c.A(laptop(540, 1280, 1.5, K.photo(-90, -10, 130, 160, PINK, "", true) + K.chip(80, -50, "QR", ORG, "#fff", 22, 70) + K.chip(80, 0, "Cetak", MINT, INK, 22, 100) + K.chip(80, 50, "Kirim", YEL, INK, 22, 100)), 0.3) },
      { text: "Pratinjau, QR, cetak, kirim. *Tanpa scroll!*", bg: YEL, size: 92, art: (c) => ["Pratinjau", "QR", "Cetak", "Kirim"].map((l, i) => c.A(K.chip(540, 1110 + i * 130, l, [BLUE, ORG, TEAL, "#7b5cff"][i], "#fff", 48, 560), 0.3 + i * 0.5)).join("") },
      { text: "Scan QR, *langsung di HP!*", bg: MINT, art: (c) => c.A(K.qr(330, 1300, 1.4), 0.3) + c.A(K.arrow(500, 1300, 600, 1300), 0.9) + c.A(K.photo(780, 1280, 220, 380, PINK, "", true), 1.2) },
    ] },
  // 11 ----------------------------------------------------------------------------------------------- sosmed-izin
  { id: "izin", music: "chill", voice: "maya", brand: "Konten aman, customer dihargai.",
    cta: { text: "Simpan buat *checklist event* berikutnya!", btn: "Simpan buat checklist ↓" },
    scenes: [
      { text: "Mau posting foto customer, *izinnya jelas?*", bg: PINK, size: 92, art: (c) => c.A(K.photo(380, 1280, 380, 480, BLUE, "", true), 0.3) + c.A(K.txt(800, 1250, "?", 260, INK), 0.9) },
      { text: "Tanya dulu, *langsung di kiosk!*", bg: BLUE, dark: true, art: (c) => c.A(laptop(540, 1280, 1.5, K.txt(0, -30, "Boleh dibagikan?", 40, INK) + K.chip(-70, 40, "Boleh", MINT, INK, 26, 110) + K.chip(80, 40, "Tidak", "#e3e6f5", INK, 26, 110)), 0.3) },
      { text: "Pop-up izin *sebelum layar hasil.*", bg: YEL, art: (c) => c.A(K.card(540, 1200, 780, 180, "Izin media sosial", "Sebelum layar hasil", INK, ORG), 0.3) + c.A(K.arrow(540, 1330, 540, 1440), 1.2) + c.A(K.chip(540, 1540, "Layar hasil", INK, "#fff", 46), 1.7) },
      { text: "Jawaban *tersimpan* di sesi. Nyala/mati?", bg: MINT, size: 92, art: (c) => c.A(K.card(540, 1160, 780, 140, "Jawaban tersimpan", "Di data sesi", INK, TEAL), 0.3) + c.A(K.chip(380, 1400, "ON", MINT, INK, 54, 200), 1.2) + c.A(K.chip(700, 1400, "OFF", "#e3e6f5", INK, 54, 200), 1.6) },
    ] },
  // 12 ----------------------------------------------------------------------------------------------- dashboard-realtime + banyak-kiosk
  { id: "dashboard", music: "synthwave", voice: "finn", brand: "Keputusan pakai data, bukan tebakan.",
    cta: { text: "Yuk, *coba gratis* sekarang!", btn: "Coba gratis →" },
    scenes: [
      { text: "Punya lima booth? *Mana yang offline?*", bg: "#14122b", dark: true, size: 92, art: (c) => [0, 1, 2, 3, 4].map((i) => c.A(K.photo(190 + i * 175, 1290, 150, 250, [BLUE, ORG, TEAL, PINK, YEL][i], "", false), 0.3 + i * 0.25)).join("") + c.A(K.txt(540, 1600, "? ? ? ? ?", 120, YEL), 1.6) },
      { text: "Rekap lewat chat *tiap malam.*", bg: CREAM, art: (c) => [0, 1, 2].map((i) => c.A(K.chatBubble(i % 2 ? 640 : 420, 1150 + i * 140, 560, ["Booth A: Rp ...", "Booth C belum lapor", "Rekap malam ini?"][i], i % 2 === 0), 0.3 + i * 0.5)).join("") },
      { text: "Satu layar, *semua booth.*", bg: BLUE, dark: true, art: (c) => c.A(laptop(540, 1260, 1.55, [0, 1, 2, 3].map((i) => K.card(-90 + (i % 2) * 190, -45 + Math.floor(i / 2) * 85, 170, 70, "", "", INK, [MINT, MINT, "#e5384f", MINT][i]).replace(/<text[^>]*>[^<]*<\/text>/g, "")).join("")), 0.3) },
      { text: "Omzet, grafik, status *online/offline.*", bg: MINT, size: 92, art: (c) => c.A(K.bars(380, 1280, [0.5, 0.7, 0.45, 0.9, 0.6], 1.2), 0.3) + c.A(K.chip(790, 1180, "Online", TEAL, "#fff", 36), 0.9) + c.A(K.chip(790, 1320, "Offline", "#e5384f", "#fff", 36), 1.3) },
      { text: "Tambah booth? *Pasang kunci kiosk.*", bg: YEL, art: (c) => c.A(K.card(540, 1200, 780, 150, "Kunci kiosk", "Pasang di PC booth baru", INK, ORG), 0.3) + c.A(K.arrow(540, 1300, 540, 1430), 1.1) + c.A(K.photo(540, 1560, 180, 180, BLUE, "", false), 1.6) },
    ] },
  // 13 ----------------------------------------------------------------------------------------------- update-otomatis
  { id: "update", music: "house", voice: "siti", brand: "Semua booth selalu terbaru.",
    cta: { text: "Pernah kiosk-mu *restart* di tengah event?", kw: "Ceritakan di komentar ↓" },
    scenes: [
      { text: "Update pas event *berlangsung?* Jangan!", bg: "#14122b", dark: true, art: (c) => c.A(K.clock(540, 1240, 1.2), 0.3) + c.A(K.chip(540, 1580, "Event sedang ramai", "#e5384f", "#fff", 40), 1.0) },
      { text: "Versi beda-beda, *kiosk restart tiba-tiba!*", bg: PINK, size: 92, art: (c) => [0, 1, 2].map((i) => c.A(K.chip(260 + i * 280, 1230 + (i % 2) * 120, ["v1.2", "v1.4", "v1.3"][i], [BLUE, ORG, TEAL][i], "#fff", 52, 200), 0.3 + i * 0.4)).join("") + c.A(K.txt(540, 1600, "↻ ↻ ↻", 120, INK), 1.8) },
      { text: "Kiosk *unduh sendiri,* di latar belakang.", bg: BLUE, dark: true, art: (c) => c.A(laptop(540, 1260, 1.45, K.txt(0, -30, "Mengunduh pembaruan…", 28, INK) + '<rect x="-130" y="10" width="260" height="22" rx="11" style="fill:#e3e6f5"/><rect x="-130" y="10" width="170" height="22" rx="11" style="fill:#3ddc97"/>'), 0.3) },
      { text: "Terpasang *saat idle,* bisa dimatikan per kiosk.", bg: MINT, size: 86, art: (c) => c.A(K.card(540, 1200, 780, 150, "Terpasang saat idle", "", INK, TEAL), 0.3) + c.A(K.tickBox(540, 1400, "Update otomatis per kiosk", true, 780), 1.0) },
    ] },
  // 14 ----------------------------------------------------------------------------------------------- kesiapan-booth
  { id: "siap", music: "techno", voice: "maya", brand: "Datang ke event dengan tenang.",
    cta: { text: "Tag temanmu yang *panik* H-1 event!", kw: "Tag di komentar ↓" },
    scenes: [
      { text: "H-1 event! Siap semua, *atau deg-degan?*", bg: ORG, dark: true, size: 92, art: (c) => c.A(K.cal(540, 1280, 1.4, "H-1", "EVENT"), 0.3) + who(c, { x: 200, expr: "khawatir", pose: "up", hair: "bun", s: 0.6 }, 0.9) },
      { text: "Ceklis kesiapan *booth!*", bg: BLUE, dark: true, art: (c) => c.A(K.tickBox(540, 1130, "Harga paket", true, 760), 0.4) + c.A(K.tickBox(540, 1280, "Tampilan & teks", true, 760), 0.9) + c.A(K.tickBox(540, 1430, "Kamera & printer", false, 760), 1.4) },
      { text: "Harga paket, tampilan & teks, *per booth.*", bg: YEL, size: 90, art: (c) => c.A(K.card(540, 1160, 780, 140, "Booth A", "Paket + tampilan", INK, ORG), 0.3) + c.A(K.card(540, 1330, 780, 140, "Booth B", "Paket + tampilan", INK, TEAL), 0.9) },
      { text: "Langsung kelihatan *yang kurang.*", bg: PINK, art: (c) => c.A(K.tickBox(540, 1180, "Kamera & printer", false, 780), 0.3) + c.A(K.chip(540, 1380, "Belum siap: 1 item", "#e5384f", "#fff", 44), 1.0) + c.A(K.arrow(540, 1260, 540, 1320), 0.7) },
    ] },
  // 15 ----------------------------------------------------------------------------------------------- bantuan-chat
  { id: "chat", music: "lofi", voice: "finn", brand: "Bantuan tidak pernah jauh.",
    cta: { text: "Info lengkap? *Cek link bio!*", btn: "Link di bio →" },
    scenes: [
      { text: "Booth bermasalah, minta bantuan lewat *lima jalur?*", bg: PINK, size: 88, art: (c) => ["WA", "Telepon", "DM", "Email", "Grup"].map((l, i) => c.A(K.chip(260 + (i % 3) * 280, 1180 + Math.floor(i / 3) * 170, l, [BLUE, ORG, TEAL, "#7b5cff", INK][i], "#fff", 42, 230), 0.3 + i * 0.35)).join("") },
      { text: "Tinggal *chat* dari dashboard!", bg: BLUE, dark: true, art: (c) => c.A(laptop(540, 1270, 1.5, K.chatBubble(-40, -50, 230, "Booth error", false, "#e3e6f5") + K.chatBubble(40, 20, 230, "Kami cek ya", true)), 0.3) },
      { text: "Kirim *screenshot* & tautan.", bg: YEL, art: (c) => c.A(K.chatBubble(540, 1160, 640, "Ini layarnya error", true), 0.3) + c.A(K.photo(540, 1380, 380, 240, TEAL, "Screenshot", false), 0.9) },
      { text: "Riwayat laporan *tersimpan,* pantau balasan.", bg: MINT, size: 90, art: (c) => [0, 1, 2].map((i) => c.A(K.card(540, 1150 + i * 150, 780, 120, ["Laporan #1", "Laporan #2", "Laporan #3"][i], ["Dibalas", "Dibalas", "Menunggu"][i], INK, [TEAL, TEAL, ORG][i]), 0.3 + i * 0.6)).join("") },
    ] },
  // 16 ----------------------------------------------------------------------------------------------- live-view
  { id: "liveview", music: "chill", voice: "siti", brand: "Live view, hanya saat perlu.",
    cta: { text: "Simpan, biar kamera booth-mu *awet!*", btn: "Simpan buat checklist ↓" },
    scenes: [
      { text: "Kamera menyala *8 jam nonstop?*", bg: "#14122b", dark: true, art: (c) => c.A(camera(380, 1290, 1.0, "#2b2f6b", ORG), 0.3) + c.A(K.thermo(800, 1280, 1.0, 0.9), 0.8) + c.A(K.battery(800, 1560, 0.8, 0.15, "#e5384f"), 1.4) },
      { text: "Live view, *saat dibutuhkan!*", bg: BLUE, dark: true, art: (c) => c.A(K.play(540, 1280, 150, ORG), 0.3) + c.A(K.chip(540, 1530, "Live view on demand", "#fff", INK, 42), 0.9) },
      { text: "Sesi mulai: *menyala.* Selesai: *hemat.*", bg: YEL, size: 92, art: (c) => c.A(K.chip(300, 1250, "Sesi mulai", MINT, INK, 42, 290), 0.3) + c.A(K.battery(300, 1420, 0.8, 0.9), 0.7) + c.A(K.chip(780, 1250, "Selesai", "#e3e6f5", INK, 42, 290), 2.0) + c.A(K.battery(780, 1420, 0.8, 0.95), 2.4) },
      { text: "Kamera *awet,* sesi tetap lancar.", bg: MINT, art: (c) => c.A(camera(540, 1260, 1.3), 0.3) + c.A(K.thermo(850, 1280, 0.8, 0.3, TEAL), 0.9) + c.A(K.chip(540, 1600, "Lebih adem", "#fff", INK, 42), 1.5) },
    ] },
  // 17 ----------------------------------------------------------------------------------------------- printer-kertas
  { id: "printer", music: "synthwave", voice: "maya", brand: "Satu kali atur, cetak rapi terus.",
    cta: { text: "Ukuran kertas apa *di booth-mu?*", kw: "Tulis di komentar ↓" },
    scenes: [
      { text: "Hasil cetak *terpotong* lagi?", bg: PINK, art: (c) => c.A(K.photo(540, 1280, 340, 460, BLUE, "", true), 0.3) + c.A(K.chip(540, 1590, "Kertas nggak pas", "#e5384f", "#fff", 44), 1.0) },
      { text: "Atur *sekali,* cetak rapi terus!", bg: BLUE, dark: true, art: (c) => c.A(K.gear(540, 1260, 130, "#fff"), 0.3) + c.A(K.chip(540, 1540, "Sekali atur", YEL, INK, 46), 0.9) },
      { text: "Ukuran *4R, 5R, 6R, A4.*", bg: YEL, art: (c) => ["4R", "5R", "6R", "A4"].map((l, i) => c.A(K.photo(200 + i * 227, 1300 + (i % 2) * 40, 160 + i * 20, 220 + i * 30, [BLUE, ORG, TEAL, PINK][i], l, false), 0.3 + i * 0.4)).join("") },
      { text: "Margin, fit, & *2-up* hemat kertas.", bg: MINT, size: 92, art: (c) => c.A(K.photo(380, 1280, 240, 340, ORG, "", true), 0.3) + c.A(K.photo(700, 1280, 240, 340, TEAL, "", true), 0.6) + c.A(K.chip(540, 1580, "2-up: dua strip, satu kertas", INK, "#fff", 38), 1.2) },
    ] },
  // 18 ----------------------------------------------------------------------------------------------- data-pelanggan
  { id: "pelanggan", music: "house", voice: "finn", brand: "Customer hari ini, pelanggan besok.",
    cta: { text: "Yuk, *coba gratis* sekarang!", btn: "Coba gratis →" },
    scenes: [
      { text: "Hari ini ramai. Besok? *Tamu hilang tanpa jejak.*", bg: "#14122b", dark: true, size: 86, art: (c) => [0, 1, 2, 3].map((i) => who(c, { x: 150 + i * 250, s: 0.62, expr: i % 2 ? "senang" : "lega", hair: H[i], skin: i % 4, color: i }, 0.3 + i * 0.25)).join("") },
      { text: "Ubah foto *jadi data!*", bg: BLUE, dark: true, art: (c) => c.A(K.photo(330, 1280, 260, 340, PINK, "", true), 0.3) + c.A(K.arrow(500, 1280, 600, 1280, "#fff"), 0.9) + c.A(K.card(790, 1280, 360, 220, "Kontak", "Per sesi", INK, ORG), 1.2) },
      { text: "Form kontak *opsional,* tersimpan per sesi.", bg: CREAM, size: 92, art: (c) => c.A(laptop(540, 1280, 1.5, K.txt(0, -60, "Nomor WhatsApp", 26, INK) + '<rect x="-130" y="-40" width="260" height="46" rx="14" style="fill:#e3e6f5"/>' + K.chip(0, 60, "Kirim", ORG, "#fff", 28, 140)), 0.3) },
      { text: "Bahan *follow-up* & promo berikutnya.", bg: MINT, art: (c) => c.A(K.mega(380, 1290, 1.3), 0.3) + c.A(K.mail(760, 1280, 1.0), 0.9) + c.A(K.chip(540, 1580, "Follow-up & promo", INK, "#fff", 42), 1.5) },
    ] },
  // 19 ----------------------------------------------------------------------------------------------- login-tanpa-password
  { id: "login", music: "lofi", voice: "siti", brand: "Satu klik, langsung kerja.",
    cta: { text: "Tag temanmu yang *lupa password* terus!", kw: "Tag di komentar ↓" },
    scenes: [
      { text: "Lupa password lagi? *Reset lagi?*", bg: PINK, art: (c) => c.A(K.card(540, 1230, 760, 150, "Password", "••••••••", INK, "#e5384f"), 0.3) + c.A(K.chip(540, 1470, "Reset ×∞", INK, "#fff", 46), 1.0) },
      { text: "Masuk pakai *Google,* satu klik!", bg: BLUE, dark: true, art: (c) => c.A(K.chip(540, 1260, "Masuk dengan Google", "#fff", INK, 52, 620), 0.3) + c.A(K.txt(540, 1480, "1 klik", 110, YEL), 1.0) },
      { text: "Atau *tautan email,* sekali klik.", bg: YEL, art: (c) => c.A(K.mail(540, 1260, 1.5), 0.3) + c.A(K.chip(540, 1540, "Tautan masuk", ORG, "#fff", 46), 1.0) },
    ] },
  // 20 ----------------------------------------------------------------------------------------------- trial-lisensi + panduan-onboarding
  { id: "trial", music: "techno", voice: "maya", brand: "Pemula pun bisa mulai sendiri.",
    cta: { text: "Daftar *sekarang!*", btn: "Link di bio →" },
    scenes: [
      { text: "Mau mulai bisnis booth, tapi *takut beli sebelum mencoba?*", bg: "#14122b", dark: true, size: 80, art: (c) => c.A(K.tag(540, 1280, 1.4, "???", "#e5384f"), 0.3) + who(c, { x: 200, expr: "khawatir", pose: "chin", hair: "curly", s: 0.6 }, 0.8) },
      { text: "Coba dulu, *baru putuskan!*", bg: MINT, art: (c) => c.A(K.chip(540, 1280, "Coba dulu", INK, "#fff", 84), 0.3) + c.A(K.arrow(540, 1400, 540, 1500), 1.0) + c.A(K.chip(540, 1600, "Baru putuskan", ORG, "#fff", 56), 1.4) },
      { text: "Daftar, dapat *kunci uji coba,* pasang di booth pertama.", bg: BLUE, dark: true, size: 84, art: (c) => c.A(K.card(540, 1130, 780, 120, "1. Daftar", "", INK, ORG), 0.3) + c.A(K.card(540, 1270, 780, 120, "2. Kunci uji coba", "", INK, TEAL), 1.0) + c.A(K.card(540, 1410, 780, 120, "3. Pasang di booth", "", INK, "#7b5cff"), 1.7) },
      { text: "Panduan bergambar, *login sampai printer.*", bg: YEL, art: (c) => c.A(K.photo(540, 1230, 520, 320, TEAL, "Panduan", false), 0.3) + c.A(K.chip(540, 1560, "Login → kamera → printer", INK, "#fff", 40), 1.2) },
    ] },
];

const BUILT = new Map(DEFS.map((d) => [d.id, defineReel(d)]));
export const loadNew = async (id: string) => { const r = BUILT.get(id); if (!r) throw new Error(`reel baru tidak dikenal: ${id}`); return r; };
export const NEW_REEL_IDS = DEFS.map((d) => d.id);
void CREAM; void LIL; void TEAL; void shot; void slider; void webcam; void ORG; void INK;
