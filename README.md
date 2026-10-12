# NEXAINDO Management System — starter

Starter aplikasi web Next.js + Supabase untuk pengelolaan pelanggan ISP kecil. UI responsif untuk laptop/HP. Ini adalah fondasi implementasi, bukan sistem produksi yang sudah ter-deploy.

## Fitur yang ada di starter
- Dashboard: pelanggan, status koneksi manual, pemasukan bulan ini dari histori pembayaran, piutang terbuka.
- Tambah pelanggan dengan kode otomatis dan harga paket.
- Arsipkan/hapus pelanggan secara manual dan pulihkan kembali; histori tagihan/pembayaran tetap aman.
- Ubah status koneksi aktif/offline secara manual.
- Daftar tagihan, catat pembayaran penuh/sebagian, histori transaksi.
- Database PostgreSQL dan fungsi pembuatan tagihan bulanan yang idempotent.

## 1. Buat proyek Supabase gratis
1. Buat akun di https://supabase.com dan buat project baru.
2. Simpan database password di password manager; jangan taruh di kode frontend.
3. Buka **SQL Editor**, lalu jalankan seluruh isi `supabase/schema.sql`.
4. Di **Authentication → Users**, buat akun admin untuk aplikasi.
5. Di **SQL Editor**, promosikan hanya UUID akun admin yang kamu buat (lihat kolom User UID di Authentication → Users): `update public.profiles set is_admin = true where id = 'UUID-AKUN-ADMIN';` Ganti placeholder dengan UUID sebenarnya.
6. Untuk uji coba lokal, salin `.env.example` menjadi `.env.local`, lalu isi Project URL dan publishable/anon key dari **Project Settings → API**.
7. Jangan pernah menaruh `service_role`/secret key dalam variabel `NEXT_PUBLIC_*` atau mengirimkannya ke browser.

## 2. Jalankan lokal
Perlu Node.js versi LTS.

```bash
npm install
cp .env.example .env.local
# edit .env.local dengan nilai dari Supabase
npm run dev
```

Buka http://localhost:3000.

> Login email/password Supabase sudah disediakan. Buat akun admin di Authentication → Users sebelum login. Kebijakan RLS di schema membatasi tabel operasional ke profil yang `is_admin = true`; pastikan hanya akun yang kamu percaya yang dipromosikan menjadi admin.

## 3. Membuat tagihan bulanan
Fungsi database mencegah tagihan ganda untuk pelanggan dan periode yang sama. Jalankan dari SQL Editor untuk periode yang ingin dibuat, misalnya:

```sql
select public.generate_monthly_invoices('2026-10-01');
```

Untuk bulan berikutnya:

```sql
select public.generate_monthly_invoices('2026-11-01');
```

Fungsi hanya menagih pelanggan `is_active = true` yang masa berlangganannya mencakup periode tersebut. Nominal tagihan disalin dari harga pelanggan saat invoice dibuat. Tagihan jatuh tempo tanggal 1. Fungsi ini belum dijadwalkan otomatis; jadwalkan setelah login admin dan proses operasional sudah dites. Pada Supabase, penjadwalan dapat dilakukan menggunakan pg_cron/pg_net atau job terjadwal eksternal sesuai paket dan konfigurasi proyek.

## 4. Deploy gratis
Pilihan awal yang praktis adalah Vercel untuk Next.js dan Supabase Free untuk database.
1. Unggah folder ini ke repository GitHub pribadi.
2. Impor repository di https://vercel.com.
3. Tambahkan `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY` pada Environment Variables Vercel.
4. Deploy dan tes akses di laptop dan HP.
5. Periksa batas paket gratis dan kebijakan retensi/hibernasi terbaru sebelum menjadikan ini sistem operasional.

## Checklist wajib sebelum dipakai dengan data pelanggan asli
- Implementasikan login/logout Supabase Auth dan halaman terlindungi.
- Batasi akses ke akun admin yang diizinkan, bukan semua akun `authenticated`. Kebijakan awal ini ditujukan untuk satu organisasi/admin; lakukan audit keamanan jika aplikasi dipakai banyak organisasi.
- Tambahkan validasi pembayaran: total pembayaran tidak boleh melampaui saldo tagihan kecuali overpayment memang didukung secara sengaja.
- Tambahkan histori perubahan harga, audit log, backup, dan ekspor laporan.
- Uji pembuatan invoice berulang, pembayaran sebagian, pembayaran lunas, pelanggan berhenti, serta zona waktu Asia/Jakarta.
- Jangan menganggap status koneksi manual sebagai status pembayaran.
- Catatan: penghapusan pelanggan dilakukan dengan mengarsipkan (`is_active = false`) agar histori tagihan dan pembayaran tidak hilang. Pelanggan yang diarsipkan tidak menerima tagihan baru dan dapat dipulihkan. Kode UI starter saat ini belum menyediakan edit data pelanggan, pencetakan invoice, notifikasi WhatsApp, atau scheduler otomatis. Fungsi SQL dan koneksi database adalah fondasi yang perlu dilengkapi dan dites sebelum produksi.
