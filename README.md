# ePoin Nesaratas 2627 (SMP Negeri 1 Rajapolah)

Aplikasi Pencatatan Kedisiplinan & Poin Karakter Siswa SMPN 1 Rajapolah berbasis Web App dengan database PostgreSQL di Supabase dan hosting di Vercel.

---

## 🚀 Fitur Utama
1. **Pencatatan Poin Siswa (Positif & Negatif)**:
   - Apresiasi Prestasi Siswa Teladan (+)
   - Pelanggaran & Tata Tertib Siswa (-)
2. **Formula Skor Sisa Terstandar**:
   $$\text{Skor Sisa} = 200 + \text{Poin Apresiasi (+)} - \text{Poin Pelanggaran (-)}$$
3. **Dashboard & Statistik Interaktif**:
   - 10 Siswa Paling Berprestasi
   - 10 Siswa Membutuhkan Bimbingan Khusus
   - Rekapitulasi per kelas & grafik bulanan
4. **Cetak Rekapitulasi & Rapor Karakter**:
   - Kop Surat Resmi SMPN 1 Rajapolah
   - Filter cetak per kelas atau seluruh siswa
   - Lembar tanda tangan Koordinator BK dan Wali Kelas
5. **Manajemen Siswa & Transaksi**:
   - Edit biodata siswa
   - Edit & hapus riwayat transaksi poin

---

## 🗄️ Struktur Database (Supabase / PostgreSQL)
Skema database lengkap tersedia di [`supabase_schema.sql`](./supabase_schema.sql):
- `siswa`: Biodata pokok siswa
- `master_poin`: Daftar aturan dan bobot poin
- `log_poin`: Riwayat transaksi poin siswa
- `pembinaan`: Catatan konseling BK dan surat peringatan (SP)
- `app_config`: Konfigurasi sistem (skor awal 200, ambang batas SP)
- `v_rekap_siswa`: View kalkulasi otomatis Skor Sisa dan status disiplin

---

## 🌐 Hosting di Vercel
Konfigurasi hosting Vercel telah disediakan di [`vercel.json`](./vercel.json).
Aplikasi terhubung ke Supabase melalui Supabase JS SDK (`@supabase/supabase-js`).
