-- ============================================================================
-- SKEMA DATABASE SUPABASE (POSTGRESQL) - ePOIN SMPN 1 RAJAPOLAH (NESARATAS)
-- Dibuat otomatis untuk migrasi dari Google Spreadsheet ke Supabase Database
-- ============================================================================

-- 1. AKTIFKAN EKSTENSI UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TIPE DATA ENUM
DO $$ BEGIN
    CREATE TYPE jenis_poin AS ENUM ('positif', 'negatif');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE gender_siswa AS ENUM ('L', 'P');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE status_siswa AS ENUM ('Aktif', 'Pindah', 'Keluar', 'Alumni');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- 3. TABEL PENGATURAN APLIKASI (APP_CONFIG)
-- ============================================================================
CREATE TABLE IF NOT EXISTS app_config (
    key VARCHAR(50) PRIMARY KEY,
    value VARCHAR(255) NOT NULL,
    deskripsi TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Nilai konfigurasi standar
INSERT INTO app_config (key, value, deskripsi) VALUES
('skor_awal_perilaku', '200', 'Skor dasar awal perilaku seluruh siswa'),
('ambang_sp1', '75', 'Ambang batas poin pelanggaran pembinaan wali kelas (SP1)'),
('ambang_sp2', '100', 'Ambang batas poin pelanggaran pemanggilan orang tua 1 (SP2)'),
('ambang_sp3', '150', 'Ambang batas poin pelanggaran pemanggilan orang tua 2 (SP3)'),
('ambang_skorsing', '175', 'Ambang batas poin pelanggaran skorsing belajar di rumah'),
('ambang_dikembalikan', '200', 'Ambang batas poin pelanggaran dikembalikan ke orang tua')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ============================================================================
-- 4. TABEL SISWA
-- ============================================================================
CREATE TABLE IF NOT EXISTS siswa (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nis VARCHAR(20) UNIQUE,
    nisn VARCHAR(20) UNIQUE NOT NULL,
    nama VARCHAR(150) NOT NULL,
    gender gender_siswa DEFAULT 'L',
    kelas VARCHAR(10) NOT NULL, -- Contoh: 'VIII-A', 'IX-J'
    wali_kelas VARCHAR(150),
    status status_siswa DEFAULT 'Aktif',
    hp_ortu VARCHAR(30),
    foto TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_siswa_kelas ON siswa(kelas);
CREATE INDEX IF NOT EXISTS idx_siswa_nama ON siswa(nama);
CREATE INDEX IF NOT EXISTS idx_siswa_nisn ON siswa(nisn);

-- ============================================================================
-- 5. TABEL MASTER ATURAN & POIN (MASTER_POIN)
-- ============================================================================
CREATE TABLE IF NOT EXISTS master_poin (
    id VARCHAR(20) PRIMARY KEY, -- Contoh: 'AP-001', 'NEG-014'
    jenis jenis_poin NOT NULL,
    kategori VARCHAR(100) NOT NULL, -- Contoh: 'Kedisiplinan Waktu', 'Prestasi Akademik'
    nama_aturan TEXT NOT NULL,
    bobot INT NOT NULL CHECK (bobot > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_master_poin_jenis ON master_poin(jenis);
CREATE INDEX IF NOT EXISTS idx_master_poin_kategori ON master_poin(kategori);

-- ============================================================================
-- 6. TABEL LOG TRANSAKSI POIN SISWA (LOG_POIN)
-- ============================================================================
CREATE TABLE IF NOT EXISTS log_poin (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    siswa_id UUID NOT NULL REFERENCES siswa(id) ON DELETE CASCADE,
    aturan_id VARCHAR(20) REFERENCES master_poin(id) ON DELETE SET NULL,
    tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
    jenis jenis_poin NOT NULL,
    poin INT NOT NULL CHECK (poin > 0),
    keterangan TEXT,
    guru_pelapor VARCHAR(150) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_log_siswa_id ON log_poin(siswa_id);
CREATE INDEX IF NOT EXISTS idx_log_tanggal ON log_poin(tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_log_jenis ON log_poin(jenis);

-- ============================================================================
-- 7. TABEL PEMBINAAN & KONSELING BK (PEMBINAAN)
-- ============================================================================
CREATE TABLE IF NOT EXISTS pembinaan (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    siswa_id UUID NOT NULL REFERENCES siswa(id) ON DELETE CASCADE,
    tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
    tingkat_sanksi VARCHAR(100) NOT NULL, -- 'SP1', 'SP2', 'SP3', 'Skorsing', dll.
    catatan_konseling TEXT,
    status VARCHAR(50) DEFAULT 'Proses', -- 'Proses', 'Selesai'
    petugas_bk VARCHAR(150) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pembinaan_siswa_id ON pembinaan(siswa_id);

-- ============================================================================
-- 8. VIEW REKAPITULASI RESMI & SKOR SISA SISWA
--    Formula Sesuai Ketentuan: 200 + 'Poin Apresiasi (+)' - 'Poin Pelanggaran (-)'
-- ============================================================================
CREATE OR REPLACE VIEW v_rekap_siswa AS
SELECT 
    s.id AS siswa_id,
    s.nis,
    s.nisn,
    s.nama,
    s.gender,
    s.kelas,
    s.wali_kelas,
    s.status,
    s.hp_ortu,
    s.foto,
    COALESCE(SUM(CASE WHEN l.jenis = 'positif' THEN l.poin ELSE 0 END), 0) AS total_apresiasi,
    COALESCE(SUM(CASE WHEN l.jenis = 'negatif' THEN l.poin ELSE 0 END), 0) AS total_pelanggaran,
    200 + COALESCE(SUM(CASE WHEN l.jenis = 'positif' THEN l.poin ELSE 0 END), 0) 
        - COALESCE(SUM(CASE WHEN l.jenis = 'negatif' THEN l.poin ELSE 0 END), 0) AS skor_sisa,
    CASE 
        WHEN COALESCE(SUM(CASE WHEN l.jenis = 'negatif' THEN l.poin ELSE 0 END), 0) >= 200 THEN 'Dikembalikan ke Orang Tua'
        WHEN COALESCE(SUM(CASE WHEN l.jenis = 'negatif' THEN l.poin ELSE 0 END), 0) >= 175 THEN 'Skorsing'
        WHEN COALESCE(SUM(CASE WHEN l.jenis = 'negatif' THEN l.poin ELSE 0 END), 0) >= 150 THEN 'Panggilan Ortu 2 (SP3)'
        WHEN COALESCE(SUM(CASE WHEN l.jenis = 'negatif' THEN l.poin ELSE 0 END), 0) >= 100 THEN 'Panggilan Ortu 1 (SP2)'
        WHEN COALESCE(SUM(CASE WHEN l.jenis = 'negatif' THEN l.poin ELSE 0 END), 0) >= 75 THEN 'Pembinaan Wali Kelas (SP1)'
        WHEN COALESCE(SUM(CASE WHEN l.jenis = 'negatif' THEN l.poin ELSE 0 END), 0) > 0 THEN 'Catatan Disiplin Ringan'
        ELSE 'Aman & Teladan'
    END AS status_disiplin
FROM siswa s
LEFT JOIN log_poin l ON s.id = l.siswa_id
GROUP BY s.id;

-- ============================================================================
-- 9. KEAMANAN & HAK AKSES (ROW LEVEL SECURITY / RLS)
-- ============================================================================
ALTER TABLE siswa ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_poin ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_poin ENABLE ROW LEVEL SECURITY;
ALTER TABLE pembinaan ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- Kebijakan Akses: Publik dapat melihat data (Read-Only)
CREATE POLICY "Publik dapat membaca data siswa" ON siswa FOR SELECT USING (true);
CREATE POLICY "Publik dapat membaca master aturan" ON master_poin FOR SELECT USING (true);
CREATE POLICY "Publik dapat membaca log poin" ON log_poin FOR SELECT USING (true);
CREATE POLICY "Publik dapat membaca pembinaan" ON pembinaan FOR SELECT USING (true);
CREATE POLICY "Publik dapat membaca config" ON app_config FOR SELECT USING (true);

-- Kebijakan Akses: Hanya Authenticated / Service Role yang bisa Tambah, Edit, Hapus
CREATE POLICY "Admin dapat mengelola data siswa" ON siswa FOR ALL TO authenticated USING (true);
CREATE POLICY "Admin dapat mengelola master aturan" ON master_poin FOR ALL TO authenticated USING (true);
CREATE POLICY "Admin dapat mengelola log poin" ON log_poin FOR ALL TO authenticated USING (true);
CREATE POLICY "Admin dapat mengelola pembinaan" ON pembinaan FOR ALL TO authenticated USING (true);
CREATE POLICY "Admin dapat mengelola config" ON app_config FOR ALL TO authenticated USING (true);
