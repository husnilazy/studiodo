import { existsSync } from "node:fs";
import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { featureById } from "./features.js";
import { hashtagsFor } from "./generator.js";
import { renderHeroReel } from "./render.js";
import { buildMusic, buildSfx, mixAudio, type MusicStyle, type SfxEvent } from "./sfx.js";
import type { Deck } from "./types.js";

// "Reel cerita": hand-timed 9:16 reels (problem -> STUDIODO as the fix) with a voice over, synthesised music and sound effects.
// Each one is a scene module (reelNN*.ts) + a voice-over file in server/assets/story-reels. They are first-class content: the calendar
// can queue them like any deck (deck.storyReel = id), the phone review screen previews them, and the publisher renders them on the PC.
// To add one: write the scene module, put its voice over in server/assets/story-reels/<id>.mp3, register it here.

export type CtaType = "coba" | "tag" | "simpan" | "tanya" | "link";
export type StoryReelModule = { buildReelDoc: () => { html: string; durationSec: number }; SFX: SfxEvent[]; DURATION: number; MUSIC?: MusicStyle };
export type StoryReel = {
  id: string;
  featureId: string; // the catalog feature this reel is about (claims must stay literal to it)
  title: string; // internal name
  hook: string; // the line on screen / first second
  caption: string;
  cta: CtaType; // rotate: never the same CTA two reels in a row
  music: MusicStyle;
  coverAt: number; // seconds: frame used as the cover
  needsCheck?: string; // shown in the UI before posting
  load: () => Promise<StoryReelModule>;
};

const assetDir = () => path.join(process.cwd(), "server", "assets", "story-reels");
const LINK = "🔗 Info lengkap di studiodo.id (link di bio).";

export const STORY_REELS: StoryReel[] = [
  {
    id: "wifi", featureId: "offline-aman", title: "Wifi mal mati: booth tetap jalan", hook: "Wifi mal mati. Booth-mu ikut mati?", cta: "coba", music: "synthwave", coverAt: 1.6,
    caption: `Wifi mal mati jam ramai, layar booth cuma bilang "error", antrean bubar satu per satu. 😮‍💨\n\nDi STUDIODO sesi tersimpan di booth, lalu tersinkron otomatis saat internet kembali. (Pembayaran QRIS tetap butuh internet.)\n\n💬 Komen "COBA" dan kami bantu mulai trial gratis.\n${LINK}`,
    needsCheck: "Mode offline belum diuji dengan pemutusan internet sungguhan di kiosk. Cek dulu sebelum posting.", load: () => import("./reel01Wifi.js"),
  },
  {
    id: "invoice", featureId: "invoice-tercatat", title: "Uangnya masuk, fotonya enggak", hook: "Uangnya masuk. Fotonya enggak.", cta: "simpan", music: "lofi", coverAt: 1.6,
    caption: `Customer bayar setelah QR kedaluwarsa: uang masuk, sesi foto tidak jalan, selisih kas dicari satu per satu. 🧾\n\nDi STUDIODO tiap invoice QRIS tersimpan per sesi, yang terlambat ditandai, dan selisih bisa ditelusuri.\n\n📌 Simpan buat pengingat, atau kirim ke partner bisnismu yang suka pusing soal rekonsiliasi.\n${LINK}`,
    needsCheck: "Pastikan tanda 'terlambat' benar-benar tampil di akun live.", load: () => import("./reel02Invoice.js"),
  },
  {
    id: "error", featureId: "monitor-error", title: "Tahu booth error dari komentar customer", hook: "Kamu tahu booth-mu error dari... komentar customer?", cta: "tag", music: "techno", coverAt: 1.6,
    caption: `Booth error di jam ramai, kamu di rumah nggak tahu apa-apa, kabarnya baru sampai lewat komentar. 🚨\n\nDi STUDIODO error dari kiosk dilaporkan ke dashboard dengan konteks, dan status online/offline kelihatan.\n\n👇 Tag operator booth-mu yang suka telat lapor.\n${LINK}`,
    needsCheck: "Cek apakah pemilik booth (tenant) bisa melihat laporan error kiosk di dashboard-nya, bukan hanya Superadmin.", load: () => import("./reel03Error.js"),
  },
  {
    id: "approval", featureId: "persetujuan-dua-orang", title: "Satu orang bisa tarik saldo sendirian?", hook: "Satu orang bisa tarik saldo booth-mu sendirian?", cta: "tanya", music: "house", coverAt: 1.6,
    caption: `Rekening baru ditambahkan, saldo booth tiba-tiba kosong, dan kamu baru tahu belakangan. 😬 (Ini ilustrasi, bukan kejadian nyata.)

Di STUDIODO penarikan besar perlu persetujuan orang kedua, rekening baru ditahan dulu, dan setiap persetujuan ada jejaknya.

💭 Uang booth-mu dijaga siapa: satu orang, atau berdua? Ceritakan di komentar.
${LINK}`,
    needsCheck: "Pastikan batas nominal 'penarikan besar' dan penahanan rekening baru sudah aktif di akun live sebelum diposting.", load: () => import("./reel04Approval.js"),
  },
  {
    id: "pin", featureId: "pin-operator", title: "Anak iseng membuka pengaturan booth", hook: "Anak iseng ini baru saja membuka pengaturan booth-mu.", cta: "link", music: "chill", coverAt: 1.6,
    caption: `Satu anak iseng ketuk-ketuk layar booth: pojok kiri, pojok kanan, dan pengaturan terbuka. Harga berubah, tampilan berantakan, di tengah keramaian mal. 😅 (Ilustrasi.)

Di STUDIODO konsol operator dikunci PIN: ketuk sudut yang benar, masukkan PIN, baru terbuka. Cuma kru yang tahu.

🔗 Info lengkap di link bio (studiodo.id).`,
    needsCheck: "Cek pengaturan sudut dan jumlah ketukan di akun live agar sesuai dengan yang digambarkan.", load: () => import("./reel05Pin.js"),
  },
  {
    id: "mirror", featureId: "mirror-asli", title: "Cetakan terbalik: mode cermin atau asli", hook: "Cetakannya terbalik. Ini bukan aku!", cta: "tag", music: "synthwave", coverAt: 1.6,
    caption: `Di layar tulisannya benar, di hasil cetak malah kebalik. Customer bingung, strip foto dibuang. 🪞

Di STUDIODO ada tombol Cermin/Asli di editor foto, jadi hasil cetak cocok dengan tampilan di layar dan tulisan tidak kebalik.

👇 Tag temanmu yang fotonya pernah kebalik!
🔗 studiodo.id (link di bio).`,
    needsCheck: "Pastikan tombol Cermin/Asli tampil seperti di video pada versi kiosk yang terpasang.", load: () => import("./reel06Mirror.js"),
  },
  {
    id: "voucher", featureId: "voucher-promo", title: "Voucher event 100 orang, kuota jebol di ke-101", hook: "Voucher event 100 orang. Kuota jebol di orang ke-101.", cta: "simpan", music: "lofi", coverAt: 1.6,
    caption: `Event dengan 100 tamu, kode promo dibagiin dan dicatat manual. Tamu ke-101 masih minta, kodenya sudah habis. Siapa yang kebagian, siapa yang nggak? 🎟️ (Ilustrasi.)

Di STUDIODO tiap kode voucher punya kuota: lewat batas otomatis ditolak, dan pemakaiannya kelihatan di dashboard.

📌 Simpan buat checklist event berikutnya.
🔗 studiodo.id (link di bio).`,
    needsCheck: "Contoh kode dan nama event di video hanya ilustrasi; cek tampilan voucher di dashboard live.", load: () => import("./reel07Voucher.js"),
  },
  {
    id: "mode", featureId: "mode-alur", title: "Antrean 30 menit: 4 mode alur kiosk", hook: "Antrean 30 menit karena alurnya kepanjangan.", cta: "tanya", music: "house", coverAt: 1.6,
    caption: `Event ramai, tapi alur kiosk kepanjangan: pilih paket, frame, filter, edit... antrean 30 menit, tamu bubar. ⏱️ (Ilustrasi.)

STUDIODO punya 4 mode alur: Lengkap, Ringkas, Satu harga, dan Kilat. Event ramai pakai Kilat, booth premium pakai Lengkap.

💭 Antrean terlama di booth-mu berapa menit? Ceritakan di komentar.
🔗 studiodo.id (link di bio).`,
    load: () => import("./reel08Mode.js"),
  },
  {
    id: "kamera", featureId: "kamera-sdk", title: "Kamera Canon & Sony tersambung langsung", hook: "Kamera Canon-mu bagus. Tapi disambungin ke booth?", cta: "simpan", music: "techno", coverAt: 1.6,
    caption: `Kamera bagus, tapi menyambungkannya ke booth: pasang software ini, driver itu, ujungnya "kamera tidak terdeteksi" dan balik lagi ke webcam. 📸 (Ilustrasi.)

Di STUDIODO ada bridge kamera Canon (lewat SDK resmi Canon) dan Sony bawaan aplikasi: hubungkan kamera ke PC, terdeteksi otomatis, pilih, lalu mulai sesi. Tanpa instalasi tambahan.

📌 Simpan buat checklist setup booth barumu. Kamera apa yang kamu pakai? Ceritakan di komentar.
${LINK}`,
    needsCheck: "Canon sudah diuji pada kamera fisik dan berhasil (SDK resmi dari Canon), jadi boleh disebut di caption. Sony belum diuji pada kamera fisik: jangan sebut 'terbukti' untuk Sony. Cek daftar kamera yang didukung sebelum posting.", load: () => import("./reel09Kamera.js"),
  },
  {
    id: "multicam", featureId: "multi-kamera", title: "Multi kamera: dua sudut dalam satu booth", hook: "Satu booth, satu sudut kamera.", cta: "tag", music: "synthwave", coverAt: 1.6,
    caption: `Dari foto pertama sampai kesepuluh, hasilnya mirip-mirip terus karena cuma satu sudut kamera. 📷 (Ilustrasi.)

Di STUDIODO ada multi kamera: pasang kamera kedua sebagai Sudut 2. Mode bergantian (foto 1 kamera utama, foto 2 Sudut 2) atau mode dua sudut (satu jepretan, dua foto; pelanggan memilih sudut di layar Preview).

👇 Tag temanmu yang suka eksperimen sudut foto.
${LINK}`,
    needsCheck: "Belum diuji dengan dua kamera fisik. Kombinasi paling aman: dua webcam, atau satu DSLR + satu webcam. Cek tampilan pilihan sudut di layar Preview.", load: () => import("./reel10Multicam.js"),
  },
  {
    id: "kontrol", featureId: "kontrol-kamera", title: "Atur ISO & shutter dari dashboard", hook: "Lampu venue berubah, kamu harus lari ke booth?", cta: "coba", music: "house", coverAt: 1.6,
    caption: `Sore lampu venue terang, malam mendadak gelap, foto di booth jadi suram, dan kamu harus lari ke booth buat ubah setelan satu per satu. 🌙 (Ilustrasi.)

Di STUDIODO ISO, shutter, aperture, dan white balance bisa diatur dari dashboard, tanpa menyentuh kameranya. Live view ada di sebelahnya dan setelan tersimpan. (Untuk kamera yang didukung digiCamControl.)

💬 Komen "COBA" dan kami bantu mulai trial gratis.
${LINK}`,
    needsCheck: "Berlaku untuk kamera yang didukung digiCamControl. Pastikan panel Admin > Kiosk > Kamera tampil seperti di video.", load: () => import("./reel11Kontrol.js"),
  },
];

export const storyReelById = (id: string) => STORY_REELS.find((r) => r.id === id);
export const storyReelDeckId = (id: string) => `story-${id}`;

/** A one-slide placeholder deck so the existing calendar / review / publisher code treats the reel like any other post. */
export function storyReelDeck(r: StoryReel): Deck {
  const f = featureById(r.featureId);
  return {
    id: storyReelDeckId(r.id), title: `🎬 ${r.title}`, format: "reel", tone: "dark", handle: "@studiodo.app", caption: r.caption,
    hashtags: f ? hashtagsFor(f) : [], featureId: r.featureId, storyReel: r.id, slides: [{ kind: "cover", title: r.hook }], updatedAt: new Date().toISOString(),
  };
}

/** Renders the reel (music + sfx + voice over mixed, 1080x1920 MP4 + cover) into `dir`. Used by the publisher. */
export async function renderStoryReelForPublish(id: string, dir: string): Promise<{ type: "reel"; files: string[]; cover?: string }> {
  const r = storyReelById(id);
  if (!r) throw new Error(`Reel cerita tidak dikenal: ${id}`);
  const vo = path.join(assetDir(), `${id}.mp3`);
  if (!existsSync(vo)) throw new Error(`Voice over belum ada: server/assets/story-reels/${id}.mp3`);
  const mod = await r.load();
  await mkdir(dir, { recursive: true });
  const sfx = path.join(dir, "sfx.wav"), music = path.join(dir, "music.wav"), mix = path.join(dir, "mix.wav");
  buildSfx(mod.SFX, mod.DURATION, sfx);
  buildMusic(mod.DURATION, music, mod.MUSIC ?? r.music);
  mixAudio({ vo, sfx, music, duration: mod.DURATION, out: mix });
  const out = path.join(dir, "reel.mp4");
  const stillsDir = path.join(dir, "stills");
  await renderHeroReel(out, { audio: mix, builder: mod.buildReelDoc, stills: { dir: stillsDir, at: [r.coverAt] } });
  const cover = path.join(dir, "cover.jpg");
  await copyFile(path.join(stillsDir, `t${String(Math.round(r.coverAt * 10)).padStart(3, "0")}.jpg`), cover);
  await Promise.all([sfx, music, mix, stillsDir, path.join(dir, "music-bar.wav")].map((f) => rm(f, { recursive: true, force: true })));
  return { type: "reel", files: ["reel.mp4"], cover: "cover.jpg" };
}
