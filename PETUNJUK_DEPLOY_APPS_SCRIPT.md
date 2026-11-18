# Panduan Deploy & Pembaruan Aplikasi Web ePoin SMPN 1 Rajapolah
**ePoin Nesaratas 2627 - Sistem Karakter, Kedisiplinan & Prestasi Terpadu**

---

## 📌 Mengapa Tombol Sebelumnya Tidak Berfungsi / Tidak Berubah?

Ada 2 penyebab teknis utama yang telah diperbaiki:
1. **Google Apps Script Cache (Paling Sering Terjadi)**:
   - Jika Anda hanya klik *Save (Simpan)* di editor Apps Script, Web App yang dibuka pengguna **belum berubah** karena Google Apps Script tetap melayani versi penerapan (*deployment*) yang lama.
   - **Solusi**: Wajib memilih **"New version" (Versi Baru)** saat mengklik **Deploy > Manage deployments (Kelola penerapan)**.
2. **Timing `DOMContentLoaded` pada Iframe Apps Script**:
   - Web App Apps Script dimuat di dalam iframe. Seringkali browser telah selesai memuat DOM sebelum skrip inline dieksekusi, sehingga event `DOMContentLoaded` terlewat dan inisialisasi aplikasi tidak berjalan.
   - **Solusi**: Di file `Index.html` terbaru, logika inisialisasi telah diperbaiki dengan pengecekan `document.readyState` dan seluruh fungsi tombol diikatkan secara eksplisit ke objek global `window`.

---

## 🚀 Langkah Pembaruan di Google Apps Script (2 Menit)

### Langkah 1: Buka Editor Apps Script
1. Buka spreadsheet [ePoin Nesaratas 2627](https://docs.google.com/spreadsheets/d/1N3-OviSIJYuHO6K9RO9PgR9EGopKGr_HXI0xJUvQ7Ng/edit).
2. Klik menu **Ekstensi** (*Extensions*) > **Apps Script**.

### Langkah 2: Salin Kode Terbaru
1. **File `Code.gs`**:
   - Buka file `Code.gs` di editor Apps Script.
   - Hapus seluruh isinya (`Ctrl+A` lalu `Backspace`), kemudian salin seluruh isi berkas [`Code.gs`](./Code.gs) dan tempel (`Ctrl+V`).
2. **File `Index.html`**:
   - Buka file `Index.html` di editor Apps Script. *(Pastikan nama filenya `Index` atau `index`)*.
   - Hapus seluruh isinya (`Ctrl+A` lalu `Backspace`), kemudian salin seluruh isi berkas [`Index.html`](./Index.html) dan tempel (`Ctrl+V`).
3. Tekan **Simpan** (ikon disket / `Ctrl+S`).

### Langkah 3: Uji Coba Cepat (Test Run Backend)
1. Pada toolbar atas editor Apps Script, di dropdown fungsi sebelah tombol "Jalankan", pilih fungsi **`testRun`**.
2. Klik tombol **Jalankan** (*Run*).
3. Jika muncul permintaan izin (*Authorization Required*), klik *Review permissions* > pilih akun Google Anda > *Advanced (Lanjutan)* > *Go to ePoin (unsafe)* > *Allow (Izinkan)*.
4. Di bagian Log Eksekusi akan muncul pesan:
   `BERHASIL: Spreadsheet terhubung (1094 siswa terdata).`
   Ini menandakan seluruh fungsi backend sudah berjalan sempurna!

### Langkah 4: Terapkan Versi Baru (*Wajib agar Tombol & Fitur Aktif!*)
1. Di pojok kanan atas editor Apps Script, klik tombol biru **Deploy** > **Manage deployments** (*Kelola penerapan*).
2. Klik ikon **Edit** (ikon pensil ✏️) pada deployment aktif Web App Anda.
3. Pada baris **Version**, ubah dropdown dari versi lama menjadi **New version** (*Versi baru*).
4. Klik tombol **Deploy**.
5. Buka tautan Web App URL (`.../exec`).
6. Tekan tombol `Ctrl + Shift + R` (Hard Reload) di browser Anda untuk menghapus cache browser lama.
7. Semua tombol (Edit Siswa, Edit Transaksi, Hapus, Filter, Pencarian Aturan, dll.) sekarang aktif dan dapat diakses dengan lancar!

---

## 💻 Pengujian Langsung di Browser (Offline Preview)
Anda juga dapat langsung mengklik ganda file [`Index.html`](./Index.html) di laptop Anda (buka di Google Chrome atau Microsoft Edge). Seluruh antarmuka, tombol Edit Siswa, Edit Transaksi Poin, modal pencarian aturan, dan perhitungan Skor Sisa (200 + Apresiasi - Pelanggaran) dapat langsung dicoba dan berfungsi normal.
