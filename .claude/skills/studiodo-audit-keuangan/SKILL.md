---
name: studiodo-audit-keuangan
description: Audit rekonsiliasi uang STUDIODO (saldo QRIS tenant platform, ledger, penarikan). Pakai saat user minta cek saldo/pencairan, atau setelah mengubah kode pembayaran/penarikan.
---

# Audit keuangan tenant (baca-saja)

Tujuan: memastikan saldo tenant benar dan tidak ada celah pencairan. **Hanya SELECT.** Jangan menulis ke database, jangan mencetak kunci, secret, atau nomor rekening lengkap.

## Cara menjalankan
Buat skrip sementara `server/scripts/_audit_*.mjs` (awalan `_`), pakai `dotenv/config` + paket `postgres` (`prepare: false`, `max: 1`), jalankan dengan `node`, lalu HAPUS skripnya. Jangan commit.

## Pemeriksaan (tabel: `tenants`, `wallet_ledger`, `withdrawals`, `sessions`, `platform_settings`, `payment_gateways`)
1. Tenant `qris_settlement = 'platform'` dan `qris_platform_since`.
2. Total ledger per tenant: jumlah dan gross/fee/net untuk `kind='payment'`, jumlah `adjustment`.
3. Penarikan per tenant dan status (`pending|processing|paid|rejected`).
4. **Belum dikredit:** sesi `payment_status='success'`, `payment_method in ('qris','doku')`, `total_amount>0`, tenant platform, tanpa baris ledger `kind='payment'` untuk `session_id` itu.
5. **Kelebihan kredit:** ledger payment yang sesinya bukan qris/doku sukses, atau jumlah gross per sesi > `total_amount` sesi.
6. **Saldo negatif:** penarikan (`pending|processing|paid`) > total `net_amount` ledger.
7. **Anomali penarikan:** `paid` tanpa `processed_by` / `transfer_reference`; penarikan yang berpindah status final.
8. Konfigurasi platform: DOKU (Client ID, secret, **mode sandbox vs production**, mode checkout/snap) hanya sebagai boolean "terisi". Selama DOKU sandbox, saldo sengaja tidak dikredit.

## Aturan domain yang harus dipahami
- Saldo = Σ net ledger payment − yang masih ditahan (`available_at`) + penyesuaian − penarikan non-rejected. Ledger append-only; kredit idempoten lewat `ref` unik `(tenant, kind, ref)`.
- Hanya panggilan yang mengubah sesi menjadi lunas yang mengkredit (`settlePayment` di `server/routes/payment.ts`); webhook ganda tidak boleh mengkredit dua kali. Notifikasi `-additional-` hanya melunasi cetak tambahan, dan sebaliknya.
- Perubahan status penarikan harus compare-and-set; `paid` tidak boleh menjadi `rejected`.
- Rekonsiliasi manual (`creditMissingPayments`) menyembunyikan pembayaran DOKU saat sandbox.

## Laporan
Tabel ringkas per pemeriksaan (angka, bukan data pribadi), tandai temuan, dan jelaskan apa yang TIDAK bisa diverifikasi (misalnya transfer bank sungguhan, atau notifikasi DOKU QRIS langsung yang formatnya belum terdokumentasi). Jangan sarankan mencairkan saldo sebelum satu transaksi produksi kecil terbukti benar.
