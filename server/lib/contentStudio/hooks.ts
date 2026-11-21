// Cover hooks: one scroll-stopping line per feature, written from the owner's point of view (a question, a pain, a POV or
// a number), never from ours. "|" = line break, *word* = accent word (serif italic + gradient in the "kaca" style).
// Claims stay literal: a hook may dramatise the problem, but the answer behind it must be something the app really does.
// See docs/content-studio.md ("Hook") for the formulas. features.ts keeps a plain fallback hook for every entry.

export const HOOKS: Record<string, string> = {
  // Pembayaran
  "qris-otomatis": "Customer mau bayar,|kamu masih *cek mutasi?*",
  "pilih-penerima-qris": "Uang QRIS booth-mu|masuk lewat *siapa?*",
  "saldo-penarikan": "Saldo booth ada,|tapi *dari mana* asalnya?",
  "persetujuan-dua-orang": "Satu orang bisa tarik|*semua saldo?* Bahaya.",
  "voucher-promo": "Promo event masih|*dicatat manual?*",
  "invoice-tercatat": "Customer bayar telat,|uangnya *ke mana?*",
  "bayar-langganan": "Bayar langganan|*harus lewat chat?*",
  // Pengalaman booth
  "mode-alur": "Antrean event numpuk?|Coba *mode Kilat*",
  "gaya-kiosk": "Kiosk-mu mirip booth lain?|*Ganti gayanya.*",
  "frame-portrait-landscape": "Foto landscape|*kepotong* di frame?",
  "edit-di-kiosk": "Retake terus gara-gara|*posisi foto?*",
  "foto-gif-video": "Sekali foto,|*tiga hasil* jadi",
  "stop-motion": "Hasil booth-mu|masih *foto doang?*",
  "mirror-asli": "Tulisan di foto|*kebalik* pas dicetak?",
  "zoom-shutter": "Customer minta|*zoom?* Bisa.",
  "multi-kamera": "Satu booth,|*dua sudut* kamera",
  "sosmed-izin": "Posting foto customer,|*sudah izin?*",
  "pin-operator": "Customer iseng buka|*menu operator?*",
  // Hasil digital
  "galeri-qr": "Customer lupa minta softcopy?|*Cukup scan.*",
  "layar-hasil": "Customer bingung|cari *tombol cetak?*",
  "cetak-tambahan": "Customer mau cetak lagi?|*Satu ketukan.*",
  "data-pelanggan": "Ratusan foto,|nol *data pelanggan?*",
  // Kamera & cetak
  "kontrol-kamera": "Cahaya venue berubah?|Atur ISO *dari jauh*",
  "kamera-sdk": "Hubungkan Canon & Sony|*tanpa ribet*",
  "live-view": "Kamera nyala terus|*seharian?* Boros.",
  "printer-kertas": "Hasil cetak|*kepotong* terus?",
  // Operasional
  "dashboard-realtime": "Omzet hari ini?|*Satu layar* cukup.",
  "banyak-kiosk": "Dari 1 booth ke 10,|kerjaan *nggak ikut 10x*",
  "update-otomatis": "Update 10 booth|*harus keliling?*",
  "kesiapan-booth": "Besok event.|Booth-mu *sudah siap?*",
  "kasir-pos": "Kas selisih lagi|tiap *tutup shift?*",
  "bantuan-chat": "Booth bermasalah pas event?|*Tinggal chat.*",
  "monitor-error": "Tahu kiosk error dari|*komplain customer?*",
  "offline-aman": "Sinyal event jelek?|*Sesi tetap jalan.*",
  // Bisnis & growth
  "trial-lisensi": "Beli software booth|*tanpa mencoba?*",
  "login-tanpa-password": "Lupa password *lagi?*|Masuk pakai Google",
  "paket-plan": "Bayar fitur yang|*tidak kepakai?*",
  "marketplace-frame": "Bikin frame dari nol|*tiap event?*",
  "direktori-booth": "Booth-mu bagus,|tapi *tidak ada yang tahu?*",
  "panduan-onboarding": "Mau buka bisnis booth,|*mulai dari mana?*",
  // Tips bisnis
  "tips-harga-paket": "Harga paket booth-mu|*asal tembak?*",
  "tips-antrean-event": "Antrean event panjang?|*Ini caranya.*",
  "tips-lokasi-booth": "Booth-mu di pojok|*yang tidak kelihatan?*",
  "tips-frame-event": "Frame event wedding|*asal jadi?*",
  "tips-cek-sebelum-event": "H-1 event,|*sudah cek ini?*",
  "tips-konten-booth": "Ramai di lokasi,|*sepi di Instagram?*",
  "tips-pelanggan-kembali": "Sekali datang,|*lalu hilang?*",
  "tips-perawatan-printer": "Printer sering macet?|*Cek tiga hal ini.*",
  "tips-pencahayaan": "Wajah customer gelap?|*Periksa cahayanya.*",
  "tips-kesepakatan-event": "Job event tanpa|*kesepakatan tertulis?*",
  "tips-mulai-bisnis": "Baru mau buka booth?|*Mulai dari sini.*",
};

/** The word people comment to ask for the trial link: one fixed keyword so replies are easy to find and answer. */
export const CTA_KEYWORD = "COBA";

export const hookFor = (id: string, fallback: string): string => HOOKS[id] ?? fallback;
