# Tur aplikasi (Admin) — cara memeliharanya

Tur ada di Admin aplikasi desktop. Langkahnya ditulis di satu tempat: `client/src/lib/tourSteps.ts` (`TOUR_STEPS`).

## Perilaku
- **Tenant baru** (belum pernah selesai/melewati tur): otomatis melihat semua langkah saat pertama membuka Admin di aplikasi desktop.
- **Tenant lama setelah update**: hanya melihat langkah BARU, dengan judul "Yang baru di STUDIODO".
- Tombol **Tur aplikasi** di menu samping memutar ulang semuanya kapan saja.
- Status "sudah lihat" disimpan per tenant di `localStorage` komputer itu (`studiodo-tour-seen:<tenantId>`), jadi komputer lain atau
  data aplikasi yang dihapus akan menampilkan tur lagi. Di HP (web) tur tidak muncul otomatis.

## WAJIB saat merilis fitur baru yang terlihat tenant
1. Tambahkan satu objek di AKHIR `TOUR_STEPS`:
   - `id` unik dan belum pernah dipakai (jangan mengganti id lama; id inilah yang mengingat apa yang sudah dilihat),
   - `since` = versi aplikasi rilis itu (mis. `"0.1.41"`),
   - `section` (+ `kioskSubtab` / `financeSubtab` bila perlu) supaya Admin pindah ke bagian itu saat langkah tampil,
   - `title` dan `body` dalam bahasa sederhana untuk pemilik booth.
2. Bila fitur mengubah/menghapus bagian yang sudah dijelaskan di langkah lama, perbarui teks langkah lama itu.
3. Jangan menghapus id lama kecuali fiturnya benar-benar hilang.
4. Cek dengan klik "Tur aplikasi": setiap langkah harus membuka bagian yang benar.

Ini sudah dimasukkan ke checklist skill `studiodo-release` (bagian 4).
