// Schema + defaults for the marketing website's editable sections. The web app
// (studiodo-web) renders whatever `resolveContent()` returns; the Superadmin
// "Konten Website" tab renders a generic form from these field descriptors, so
// adding a field or a whole section is a change to this one file.

export type FieldDef =
  | { key: string; label: string; type: "text"; max?: number; hint?: string }
  | { key: string; label: string; type: "textarea"; max?: number; hint?: string }
  | { key: string; label: string; type: "select"; options: { value: string; label: string }[]; hint?: string }
  // Value is the path of an uploaded site asset ("/api/public/assets/<uuid>") or "" for none.
  | { key: string; label: string; type: "image"; hint?: string }
  | { key: string; label: string; type: "list"; itemLabel: string; itemFields: FieldDef[]; maxItems?: number };

/** Icon names the website can draw (see studiodo-web src/components/Icon.tsx — keep the two lists in sync). */
export const ICON_OPTIONS: { value: string; label: string }[] = [
  { value: "qr", label: "Kode QR (QRIS)" },
  { value: "ticket", label: "Tiket (voucher)" },
  { value: "layout", label: "Tata letak" },
  { value: "camera", label: "Kamera" },
  { value: "image", label: "Foto" },
  { value: "video", label: "Video" },
  { value: "monitor", label: "Layar / kiosk" },
  { value: "printer", label: "Printer" },
  { value: "cloud", label: "Awan" },
  { value: "wallet", label: "Dompet" },
  { value: "sparkles", label: "Kilau" },
  { value: "chart", label: "Grafik" },
  { value: "users", label: "Pengguna" },
  { value: "map-pin", label: "Lokasi" },
  { value: "bolt", label: "Kilat" },
  { value: "shield", label: "Perisai" },
  { value: "palette", label: "Palet warna" },
  { value: "clock", label: "Jam" },
  { value: "heart", label: "Hati" },
  { value: "user-plus", label: "Daftar akun" },
  { value: "download", label: "Unduh" },
  { value: "sliders", label: "Pengaturan" },
  { value: "rocket", label: "Roket (mulai)" },
  { value: "star", label: "Bintang" },
  { value: "gift", label: "Hadiah" },
  { value: "globe", label: "Globe" },
  { value: "lock", label: "Gembok" },
];
export const ASSET_PATH_RE = /^\/api\/public\/assets\/[0-9a-f-]{36}$/i;

export type SectionDef = {
  key: string;
  label: string;
  description: string;
  /** "site" is global (footer/contact) — always on, not reorderable. */
  fixed?: boolean;
  fields: FieldDef[];
  defaults: Record<string, unknown>;
};

export const SECTION_DEFS: SectionDef[] = [
  {
    key: "hero",
    label: "Hero (bagian atas)",
    description: "Headline utama dan tombol ajakan di paling atas halaman.",
    fields: [
      { key: "badge", label: "Lencana kecil", type: "text", max: 80 },
      { key: "titleLine1", label: "Judul baris 1", type: "text", max: 60 },
      { key: "titleLine2", label: "Judul baris 2 (tebal)", type: "text", max: 60 },
      { key: "subtitle", label: "Subjudul", type: "textarea", max: 300 },
      { key: "primaryCta", label: "Tombol utama", type: "text", max: 40 },
      { key: "secondaryCta", label: "Tombol kedua", type: "text", max: 40 },
      { key: "bullets", label: "Poin di bawah tombol", type: "list", itemLabel: "Poin", maxItems: 5, itemFields: [{ key: "text", label: "Teks", type: "text", max: 60 }] },
      { key: "visualImages", label: "Foto di layar kiosk (slideshow)", type: "list", itemLabel: "Foto", maxItems: 5, itemFields: [{ key: "image", label: "Foto", type: "image", hint: "Foto hasil booth asli. Tampil bergantian di layar kiosk pada ilustrasi hero, lengkap dengan hitung mundur dan efek blitz. Disarankan rasio potret (3:4), PNG/JPG/WebP ≤ 600 KB." }] },
      { key: "cameraLabel", label: "Label di layar kamera", type: "text", max: 30 },
      { key: "startButton", label: "Teks tombol di layar kiosk", type: "text", max: 24 },
      { key: "paymentLabel", label: "Kartu melayang 1 — label", type: "text", max: 40 },
      { key: "paymentValue", label: "Kartu melayang 1 — nominal", type: "text", max: 20, hint: "Contoh: Rp 35.000" },
      { key: "boothLabel", label: "Kartu melayang 2 — label", type: "text", max: 40 },
      { key: "boothValue", label: "Kartu melayang 2 — nilai", type: "text", max: 20, hint: "Kosongkan agar otomatis menampilkan jumlah kiosk nyata di platform." },
      { key: "galleryLabel", label: "Kartu melayang 3 — teks", type: "text", max: 40 },
    ],
    defaults: {
      visualImages: [],
      cameraLabel: "Preview kamera",
      startButton: "Mulai Foto",
      paymentLabel: "Pembayaran QRIS masuk",
      paymentValue: "Rp 35.000",
      boothLabel: "Booth aktif hari ini",
      boothValue: "",
      galleryLabel: "Galeri siap dibagikan",
      badge: "Platform photobooth untuk pemilik booth",
      titleLine1: "Kelola booth foto,",
      titleLine2: "tanpa ribet.",
      subtitle: "QRIS otomatis, template dari kreator, galeri cloud, dan dashboard real-time untuk semua booth Anda.",
      primaryCta: "Mulai Trial Gratis",
      secondaryCta: "Lihat Demo",
      bullets: [{ text: "Tanpa kartu kredit" }, { text: "Setup 15 menit" }, { text: "Windows 10/11" }],
    },
  },
  {
    key: "trust",
    label: "Logo klien",
    description: "Baris nama/logo bisnis yang memakai STUDIODO. Kosongkan daftar untuk menyembunyikan baris logo.",
    fields: [
      { key: "caption", label: "Keterangan", type: "text", max: 120 },
      { key: "logos", label: "Klien", type: "list", itemLabel: "Klien", maxItems: 10, itemFields: [{ key: "name", label: "Nama", type: "text", max: 50 }, { key: "image", label: "Logo (gambar, opsional)", type: "image", hint: "Jika ada logo, logo yang tampil; nama dipakai sebagai teks alternatif." }] },
    ],
    // Empty until real clients are added — the website hides this row when there are no logos, so a
    // fresh install never shows made-up customers.
    defaults: { caption: "Dipakai oleh bisnis photobooth seperti", logos: [] },
  },
  {
    key: "features",
    label: "Fitur",
    description: "Kartu fitur. Kartu terakhir tampil dengan gaya gelap sebagai sorotan.",
    fields: [
      { key: "eyebrow", label: "Label kecil", type: "text", max: 40 },
      { key: "title", label: "Judul", type: "text", max: 120 },
      { key: "items", label: "Fitur", type: "list", itemLabel: "Fitur", maxItems: 9, itemFields: [{ key: "icon", label: "Ikon", type: "select", options: ICON_OPTIONS }, { key: "title", label: "Judul", type: "text", max: 60 }, { key: "body", label: "Deskripsi", type: "textarea", max: 200 }] },
    ],
    defaults: {
      eyebrow: "Fitur",
      title: "Semua yang booth Anda butuhkan, dalam satu tempat.",
      items: [
        { icon: "qr", title: "QRIS otomatis", body: "Pelanggan bayar langsung dari layar kiosk, dana masuk otomatis." },
        { icon: "ticket", title: "Voucher promo", body: "Buat kode diskon dan pantau performanya per event." },
        { icon: "layout", title: "Screen Builder", body: "Atur tampilan kiosk sesuai brand Anda tanpa coding." },
        { icon: "camera", title: "Kontrol kamera live", body: "ISO, shutter, aperture, dan white balance dari dashboard." },
        { icon: "image", title: "Foto, GIF, dan video", body: "Galeri cloud dengan link share dan cetak tambahan." },
        { icon: "monitor", title: "Satu akun, banyak kiosk", body: "Pantau semua lokasi dan update otomatis dari satu dashboard." },
      ],
    },
  },
  {
    key: "howItWorks",
    label: "Cara kerja",
    description: "Langkah-langkah dari daftar sampai booth jalan.",
    fields: [
      { key: "eyebrow", label: "Label kecil", type: "text", max: 40 },
      { key: "title", label: "Judul", type: "text", max: 120 },
      { key: "steps", label: "Langkah", type: "list", itemLabel: "Langkah", maxItems: 6, itemFields: [{ key: "icon", label: "Ikon", type: "select", options: ICON_OPTIONS }, { key: "title", label: "Judul", type: "text", max: 40 }, { key: "body", label: "Deskripsi", type: "textarea", max: 160 }] },
    ],
    defaults: {
      eyebrow: "Cara kerja",
      title: "Empat langkah, booth Anda jalan.",
      steps: [
        { icon: "user-plus", title: "Daftar", body: "Isi form singkat, tim kami aktifkan akun tenant Anda." },
        { icon: "download", title: "Install", body: "Unduh aplikasi Windows, pasangkan dengan kunci kiosk." },
        { icon: "sliders", title: "Atur", body: "Pilih template, paket, harga, dan tampilan kiosk." },
        { icon: "rocket", title: "Jalan", body: "Terima pembayaran dan pantau omzet dari dashboard." },
      ],
    },
  },
  {
    key: "templates",
    label: "Marketplace template",
    description: "Judul dan kategori pada bagian template. Kartu template diambil otomatis dari menu Marketplace; bila katalog kosong, tampil pesan \"segera hadir\".",
    fields: [
      { key: "eyebrow", label: "Label kecil", type: "text", max: 40 },
      { key: "title", label: "Judul", type: "text", max: 120 },
      { key: "tags", label: "Kategori", type: "list", itemLabel: "Kategori", maxItems: 10, itemFields: [{ key: "text", label: "Nama", type: "text", max: 30 }] },
    ],
    defaults: {
      eyebrow: "Marketplace template",
      title: "Frame dari kreator, siap pakai di booth Anda.",
      tags: [{ text: "Semua" }, { text: "Wedding" }, { text: "Ulang Tahun" }, { text: "Korporat" }, { text: "Wisuda" }, { text: "Premium" }],
    },
  },
  {
    key: "pricing",
    label: "Harga",
    description: "Judul bagian harga. Daftar paket diambil otomatis dari menu Plans.",
    fields: [
      { key: "eyebrow", label: "Label kecil", type: "text", max: 40 },
      { key: "title", label: "Judul", type: "text", max: 120 },
      { key: "subtitle", label: "Sub-judul", type: "textarea", max: 240 },
      { key: "volumeTitle", label: "Penawaran banyak booth: judul", type: "text", max: 80 },
      { key: "volumeBody", label: "Penawaran banyak booth: penjelasan", type: "textarea", max: 300 },
      { key: "volumePerks", label: "Penawaran banyak booth: keuntungan", type: "list", itemLabel: "Keuntungan", maxItems: 6, itemFields: [{ key: "text", label: "Teks", type: "text", max: 80 }] },
      { key: "volumeCta", label: "Penawaran banyak booth: teks tombol", type: "text", max: 40 },
    ],
    defaults: {
      eyebrow: "Harga",
      title: "Bayar per kiosk, batal kapan saja.",
      subtitle: "Pilih paket sesuai jumlah booth Anda. Hemat lebih banyak dengan langganan tahunan.",
      volumeTitle: "Punya lebih dari 10 booth?",
      volumeBody: "Kelola puluhan booth dari satu dashboard dengan harga khusus per kiosk. Tim kami bantu dari instalasi sampai operasional.",
      volumePerks: [
        { text: "Harga khusus per kiosk untuk 10+ booth" },
        { text: "Pendampingan instalasi dan pelatihan crew" },
        { text: "Dukungan prioritas lewat WhatsApp" },
        { text: "Satu tagihan untuk semua booth" },
      ],
      volumeCta: "Minta penawaran",
    },
  },
  {
    key: "community",
    label: "Komunitas",
    description: "Teks komunitas dan daftar manfaat.",
    fields: [
      { key: "eyebrow", label: "Label kecil", type: "text", max: 40 },
      { key: "title", label: "Judul", type: "text", max: 120 },
      { key: "body", label: "Paragraf", type: "textarea", max: 400 },
      { key: "perks", label: "Manfaat", type: "list", itemLabel: "Manfaat", maxItems: 6, itemFields: [{ key: "icon", label: "Ikon", type: "select", options: ICON_OPTIONS }, { key: "title", label: "Judul", type: "text", max: 60 }, { key: "body", label: "Deskripsi", type: "text", max: 100 }] },
    ],
    defaults: {
      eyebrow: "Komunitas",
      title: "Tumbuh bareng sesama pemilik booth.",
      body: "Temukan dan ditemukan: tampilkan booth Anda di direktori publik, pasang frame dari para desainer, atau kirim desain sendiri untuk ikut mengisi katalog.",
      perks: [
        { icon: "map-pin", title: "Direktori booth", body: "Calon pelanggan mencari booth di kotanya" },
        { icon: "palette", title: "Marketplace template", body: "Frame siap pakai dari desainer, dipasang satu klik" },
        { icon: "sparkles", title: "Blog dan panduan", body: "Tips bisnis photobooth dan cara memakai STUDIODO" },
      ],
    },
  },
  {
    key: "testimonials",
    label: "Testimoni",
    description: "Testimoni pelanggan nyata. Kosongkan daftar untuk menyembunyikan bagian ini.",
    fields: [
      { key: "title", label: "Judul", type: "text", max: 80 },
      { key: "items", label: "Testimoni", type: "list", itemLabel: "Testimoni", maxItems: 9, itemFields: [{ key: "quote", label: "Kutipan", type: "textarea", max: 400 }, { key: "name", label: "Nama", type: "text", max: 60 }, { key: "business", label: "Nama booth", type: "text", max: 60 }, { key: "city", label: "Kota", type: "text", max: 40 }] },
    ],
    // Empty on purpose: testimonials must be real. The website hides the section until some are added here.
    defaults: { title: "Kata pemilik booth.", items: [] },
  },
  {
    key: "faq",
    label: "FAQ",
    description: "Pertanyaan yang sering muncul.",
    fields: [
      { key: "eyebrow", label: "Label kecil", type: "text", max: 40 },
      { key: "title", label: "Judul", type: "text", max: 120 },
      { key: "items", label: "Pertanyaan", type: "list", itemLabel: "Pertanyaan", maxItems: 15, itemFields: [{ key: "q", label: "Pertanyaan", type: "text", max: 150 }, { key: "a", label: "Jawaban", type: "textarea", max: 800 }] },
    ],
    defaults: {
      eyebrow: "FAQ",
      title: "Pertanyaan yang sering muncul.",
      items: [
        { q: "Perangkat apa yang dibutuhkan?", a: "Aplikasi kiosk berjalan di PC atau laptop Windows 10/11 (64-bit). Untuk kamera, Anda bisa memakai webcam atau kamera DSLR/mirrorless lewat digiCamControl. Untuk cetak, cukup printer yang punya driver Windows. Layar sentuh disarankan untuk pengalaman kiosk yang nyaman." },
        { q: "Apakah bisa dipakai tanpa internet?", a: "Sesi foto yang sedang berjalan tetap tersimpan di perangkat dan dikirim otomatis begitu koneksi kembali. Fitur yang butuh internet, seperti pembayaran QRIS dan galeri cloud, akan menunggu sampai koneksi tersedia." },
        { q: "Bagaimana pembayaran QRIS masuk ke rekening saya?", a: "Pembayaran QRIS di kiosk diproses lewat akun Xendit milik Anda sendiri, yang Anda hubungkan di menu pengaturan pembayaran. Dana mengikuti ketentuan dan jadwal pencairan Xendit ke rekening Anda; STUDIODO tidak menahan uang pelanggan Anda." },
        { q: "Bisa berhenti berlangganan kapan saja?", a: "Bisa. Langganan tidak diperpanjang otomatis, jadi Anda berhenti dengan tidak memperpanjang. Setelah masa aktif dan masa tenggang berakhir, kiosk terkunci sampai langganan diperpanjang." },
        { q: "Bagaimana cara menjadi kreator template?", a: "Buka halaman Jadi Kreator, kirim tautan portofolio Anda, dan tim kami akan menghubungi bila cocok. Template yang diterbitkan tampil di marketplace dengan kredit nama Anda." },
      ],
    },
  },
  {
    key: "cta",
    label: "Ajakan penutup",
    description: "Blok besar di akhir halaman.",
    fields: [
      { key: "title", label: "Judul", type: "text", max: 100 },
      { key: "body", label: "Teks", type: "textarea", max: 200 },
      { key: "primaryCta", label: "Tombol utama", type: "text", max: 40 },
      { key: "secondaryCta", label: "Tombol kedua", type: "text", max: 40 },
    ],
    defaults: { title: "Siap buka booth berikutnya?", body: "Coba semua fitur gratis 7 hari. Tanpa kartu kredit.", primaryCta: "Mulai Trial Gratis", secondaryCta: "Konsultasi via WhatsApp" },
  },
  {
    key: "site",
    label: "Pengaturan umum situs",
    description: "Kontak dan teks footer yang dipakai di seluruh halaman.",
    fixed: true,
    fields: [
      { key: "logoUrl", label: "Logo situs — mode terang (opsional)", type: "image", hint: "Tampil di navbar dan footer menggantikan logo bawaan. Disarankan PNG/WebP transparan, tinggi ≥ 64 px. Pakai versi yang gelap/berwarna supaya terlihat di latar terang." },
      { key: "logoDarkUrl", label: "Logo situs — mode gelap (opsional)", type: "image", hint: "Versi logo yang terbaca di latar gelap (biasanya putih/terang). Bila kosong, logo mode terang dipakai di kedua mode." },
      { key: "faviconUrl", label: "Favicon (ikon tab browser, opsional)", type: "image", hint: "PNG/WebP persegi, minimal 64×64 px (disarankan 256×256)." },
      { key: "tagline", label: "Teks footer", type: "text", max: 160 },
      { key: "whatsappNumber", label: "Nomor WhatsApp (628…, tanpa + atau spasi)", type: "text", max: 20, hint: "Dipakai untuk tombol konsultasi. Kosongkan untuk menyembunyikan." },
      { key: "supportEmail", label: "Email dukungan", type: "text", max: 100 },
    ],
    defaults: { logoUrl: "", logoDarkUrl: "", faviconUrl: "", tagline: "Platform photobooth oleh Frameless Creative.", whatsappNumber: "", supportEmail: "" },
  },
];

export const SECTION_KEYS = SECTION_DEFS.map((d) => d.key);
export function getDef(key: string): SectionDef | undefined {
  return SECTION_DEFS.find((d) => d.key === key);
}

const DEFAULT_TEXT_MAX = 300;
const DEFAULT_TEXTAREA_MAX = 1200;
const DEFAULT_LIST_MAX = 12;

function sanitizeFields(fields: FieldDef[], input: unknown, path: string): Record<string, unknown> {
  const src = (input && typeof input === "object" && !Array.isArray(input) ? input : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = src[f.key];
    if (f.type === "list") {
      if (raw !== undefined && !Array.isArray(raw)) throw new Error(`${path}${f.label}: harus berupa daftar`);
      const items = (raw ?? []) as unknown[];
      const max = f.maxItems ?? DEFAULT_LIST_MAX;
      if (items.length > max) throw new Error(`${path}${f.label}: maksimal ${max} item`);
      out[f.key] = items.map((it, i) => sanitizeFields(f.itemFields, it, `${f.label} #${i + 1} → `));
    } else if (f.type === "select") {
      const v = raw === undefined || raw === "" ? "" : String(raw);
      if (v && !f.options.some((o) => o.value === v)) throw new Error(`${path}${f.label}: pilihan tidak valid`);
      out[f.key] = v;
    } else if (f.type === "image") {
      const v = raw === undefined || raw === null ? "" : String(raw).trim();
      if (v && !ASSET_PATH_RE.test(v)) throw new Error(`${path}${f.label}: gambar tidak valid (unggah lewat tombol Unggah)`);
      out[f.key] = v;
    } else {
      if (raw !== undefined && typeof raw !== "string") throw new Error(`${path}${f.label}: harus berupa teks`);
      const max = f.max ?? (f.type === "textarea" ? DEFAULT_TEXTAREA_MAX : DEFAULT_TEXT_MAX);
      const text = String(raw ?? "").trim();
      if (text.length > max) throw new Error(`${path}${f.label}: maksimal ${max} karakter`);
      out[f.key] = text;
    }
  }
  return out;
}

/** Validate + normalize a section's data. Throws Error(message) with a user-facing Indonesian message. */
export function sanitizeSectionData(def: SectionDef, input: unknown): Record<string, unknown> {
  const cleaned = sanitizeFields(def.fields, input, "");
  if (def.key === "site") {
    const wa = String(cleaned.whatsappNumber ?? "");
    if (wa && !/^\d{8,15}$/.test(wa)) throw new Error("Nomor WhatsApp harus berupa angka saja (8–15 digit), mis. 6281234567890");
  }
  return cleaned;
}

export type StoredRow = { key: string; data: Record<string, unknown>; enabled: boolean; sortOrder: number | null };

/** Merge stored rows over defaults into the ordered list the public site renders. */
export function resolveContent(rows: StoredRow[]) {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const merged = SECTION_DEFS.map((def, index) => {
    const row = byKey.get(def.key);
    return {
      def,
      enabled: def.fixed ? true : (row?.enabled ?? true),
      order: row?.sortOrder ?? index,
      // A stored row replaces defaults field-by-field so a newly added field still shows its default.
      data: { ...def.defaults, ...(row?.data ?? {}) },
      customized: !!row,
    };
  });
  const site = merged.find((m) => m.def.key === "site")!;
  const sections = merged
    .filter((m) => !m.def.fixed)
    .sort((a, b) => a.order - b.order);
  return { site, sections };
}
