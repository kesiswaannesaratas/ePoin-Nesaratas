// Vercel Serverless Function: Fetch live data from Google Sheets GViz API
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1N3-OviSIJYuHO6K9RO9PgR9EGopKGr_HXI0xJUvQ7Ng';

async function fetchSheetGViz(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
  if (!res.ok) throw new Error(`HTTP error ${res.status} fetching ${sheetName}`);
  const text = await res.text();
  const jsonStr = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
  const data = JSON.parse(jsonStr);
  return data.table || { rows: [] };
}

function parseGVizDate(cell) {
  if (!cell) return '';
  if (cell.f) return cell.f;
  const val = String(cell.v);
  const m = val.match(/Date\((\d+),(\d+),(\d+)/);
  if (m) {
    const y = m[1];
    const mon = String(Number(m[2]) + 1).padStart(2, '0');
    const d = String(m[3]).padStart(2, '0');
    return `${y}-${mon}-${d}`;
  }
  return val;
}

module.exports = async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const [tSiswa, tMaster, tLog, tConfig] = await Promise.all([
      fetchSheetGViz('SISWA'),
      fetchSheetGViz('MASTER_POIN'),
      fetchSheetGViz('LOG_POIN'),
      fetchSheetGViz('CONFIG').catch(() => ({ rows: [] }))
    ]);

    // Parse Config
    const config = {
      skorAwal: 200,
      ambangSp1: 75,
      ambangSp2: 100,
      ambangSp3: 150,
      ambangSkorsing: 175,
      ambangDikembalikan: 200,
      namaSekolah: 'SMPN 1 Rajapolah',
      alamatSekolah: 'Jln. Kebon Kalapa No.48, Desa Manggungjaya, Kec. Rajapolah, Kab. Tasikmalaya, Jawa Barat',
      kepalaSekolah: 'H. Ucu Karni, S.Pd., M.Pd.',
      nipKepalaSekolah: '196711161992031005',
      koordinatorBk: 'Aris Sunandar, S.Pd.',
      nipKoordinatorBk: '199609022025211089',
      pembinaKesiswaan: 'Cepiana Abas, S.Pd., M.Pd.'
    };

    if (tConfig && tConfig.rows) {
      tConfig.rows.forEach(r => {
        if (!r.c) return;
        const k = r.c[0] ? String(r.c[0].v).trim() : '';
        const v = r.c[1] ? r.c[1].v : '';
        if (k === 'skor_awal_perilaku') config.skorAwal = Number(v) || 200;
        else if (k === 'ambang_sp1') config.ambangSp1 = Number(v) || 75;
        else if (k === 'ambang_sp2') config.ambangSp2 = Number(v) || 100;
        else if (k === 'ambang_sp3') config.ambangSp3 = Number(v) || 150;
        else if (k === 'ambang_skorsing') config.ambangSkorsing = Number(v) || 175;
        else if (k === 'ambang_dikembalikan') config.ambangDikembalikan = Number(v) || 200;
        else if (k === 'nama_sekolah') config.namaSekolah = String(v);
        else if (k === 'alamat_sekolah') config.alamatSekolah = String(v);
        else if (k === 'kepala_sekolah') config.kepalaSekolah = String(v);
        else if (k === 'nip_kepala_sekolah') config.nipKepalaSekolah = String(v);
        else if (k === 'koordinator_bk') config.koordinatorBk = String(v);
        else if (k === 'nip_koordinator_bk') config.nipKoordinatorBk = String(v);
        else if (k === 'pembina_kesiswaan') config.pembinaKesiswaan = String(v);
      });
    }

    // Parse Master Poin
    const masterPoin = [];
    tMaster.rows.forEach(r => {
      if (!r.c) return;
      const c = r.c;
      const id = c[0] ? String(c[0].v).trim() : '';
      if (!id) return;
      masterPoin.push({
        id: id,
        jenis: c[1] ? String(c[1].v).trim() : 'Negatif',
        kategori: c[2] ? String(c[2].v).trim() : '',
        nama: c[3] ? String(c[3].v).trim() : '',
        bobot: c[4] && c[4].v != null ? Number(c[4].v) : 0,
        tindakanDefault: c[5] ? String(c[5].v).trim() : ''
      });
    });

    // Parse Logs
    const logsByNis = {};
    const logsByNama = {};
    const adminLogs = [];

    tLog.rows.forEach((r, idx) => {
      if (!r.c) return;
      const c = r.c;
      const id = c[0] ? String(c[0].v).trim() : `LOG-${idx + 1}`;
      const tgl = parseGVizDate(c[1]);
      const nis = c[2] ? String(c[2].v).trim() : '';
      const nama = c[3] ? String(c[3].v).trim() : '';
      const kelas = c[4] ? String(c[4].v).trim() : '';
      const jenisRaw = c[5] ? String(c[5].v).trim().toLowerCase() : 'negatif';
      const jenis = jenisRaw === 'positif' ? 'positif' : 'negatif';
      const idAturan = c[6] ? String(c[6].v).trim() : '';
      const namaAturan = c[7] ? String(c[7].v).trim() : '';
      const poin = c[8] && c[8].v != null ? Math.abs(Number(c[8].v)) : 0;
      const keterangan = c[9] ? String(c[9].v).trim() : '';
      const guru = c[10] ? String(c[10].v).trim() : '';

      const logItem = {
        id,
        rowNumber: idx + 2,
        tanggal: tgl,
        nis,
        nama,
        kelas,
        jenis,
        idAturan,
        namaAturan,
        poin,
        keterangan,
        guru
      };

      adminLogs.push(logItem);

      if (nis) {
        if (!logsByNis[nis]) logsByNis[nis] = [];
        logsByNis[nis].push(logItem);
      }
      if (nama) {
        if (!logsByNama[nama]) logsByNama[nama] = [];
        logsByNama[nama].push(logItem);
      }
    });

    // Parse Siswa
    const siswaList = [];
    tSiswa.rows.forEach(r => {
      if (!r.c) return;
      const c = r.c;
      const foto = c[0] && c[0].v ? String(c[0].v).trim() : '';
      const nis = c[1] ? String(c[1].v).trim() : '';
      const nisn = c[2] ? String(c[2].v).trim() : '';
      const nama = c[3] ? String(c[3].v).trim() : '';
      const gender = c[4] ? String(c[4].v).trim() : 'L';
      const kelas = c[5] ? String(c[5].v).trim() : '';
      const waliKelas = c[6] ? String(c[6].v).trim() : '';
      const status = c[7] ? String(c[7].v).trim() : 'Aktif';
      const hpOrtu = c[8] && c[8].v ? String(c[8].v).trim() : '';

      if (!nisn && !nama) return;

      const sLogs = logsByNis[nis] || logsByNama[nama] || [];
      let pPos = 0;
      let pNeg = 0;
      sLogs.forEach(l => {
        if (l.jenis === 'positif') pPos += l.poin;
        else pNeg += l.poin;
      });

      // Skor Sisa = 200 + Poin Positif - Poin Negatif
      const skorPerilaku = config.skorAwal + pPos - pNeg;

      // Status Sanksi
      let statusSanksi = 'Aman';
      let statusLevel = 'aman';
      if (pNeg >= config.ambangDikembalikan) {
        statusSanksi = 'Dikembalikan ke Orang Tua';
        statusLevel = 'peringatan5';
      } else if (pNeg >= config.ambangSkorsing) {
        statusSanksi = 'Skorsing Belajar di Rumah';
        statusLevel = 'peringatan4';
      } else if (pNeg >= config.ambangSp3) {
        statusSanksi = 'Pemanggilan Orang Tua 2 (SP3)';
        statusLevel = 'peringatan3';
      } else if (pNeg >= config.ambangSp2) {
        statusSanksi = 'Pemanggilan Orang Tua 1 (SP2)';
        statusLevel = 'peringatan2';
      } else if (pNeg >= config.ambangSp1) {
        statusSanksi = 'Pembinaan Wali Kelas (SP1)';
        statusLevel = 'peringatan1';
      } else if (pPos > 0 && pNeg === 0) {
        statusSanksi = 'Siswa Teladan: Tanpa Pelanggaran';
      }

      // Pastikan logs diurutkan kronologis terbaru dulu
      const sortedLogs = [...sLogs].sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''));

      siswaList.push({
        foto,
        nis,
        nisn,
        nama,
        gender,
        kelas,
        waliKelas,
        status,
        hpOrtu,
        poinPositif: pPos,
        poinNegatif: pNeg,
        skorPerilaku,
        statusSanksi,
        statusLevel,
        logs: sortedLogs
      });
    });

    // Top 10 Berprestasi (diurutkan berdasarkan Skor Sisa tertinggi)
    const topPrestasi = [...siswaList]
      .sort((a, b) => b.skorPerilaku - a.skorPerilaku || b.poinPositif - a.poinPositif)
      .slice(0, 10);

    // Top 10 Bimbingan Khusus (diurutkan berdasarkan Poin Pelanggaran terbanyak)
    const topPerhatian = [...siswaList]
      .filter(s => s.poinNegatif > 0)
      .sort((a, b) => b.poinNegatif - a.poinNegatif)
      .slice(0, 10);

    // Kelas stats
    const kelasMap = {};
    siswaList.forEach(s => {
      if (!s.kelas) return;
      if (!kelasMap[s.kelas]) {
        kelasMap[s.kelas] = { kelas: s.kelas, totalSiswa: 0, totalPelanggaran: 0, totalApresiasi: 0 };
      }
      kelasMap[s.kelas].totalSiswa++;
      kelasMap[s.kelas].totalPelanggaran += s.poinNegatif;
      kelasMap[s.kelas].totalApresiasi += s.poinPositif;
    });

    const totalPelanggaran = siswaList.reduce((sum, s) => sum + s.poinNegatif, 0);
    const totalApresiasi = siswaList.reduce((sum, s) => sum + s.poinPositif, 0);

    const dashboard = {
      totalSiswa: siswaList.length,
      totalApresiasi,
      totalPelanggaran,
      kasusBulanIni: adminLogs.filter(l => l.jenis === 'negatif').length,
      topPrestasi,
      topPerhatian,
      kelasStats: Object.values(kelasMap).sort((a, b) => a.kelas.localeCompare(b.kelas)),
      config
    };

    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      config,
      dashboard,
      masterPoin,
      siswaList,
      adminLogs: adminLogs.slice(-200) // 200 logs terbaru untuk tab riwayat admin
    });

  } catch (err) {
    console.error('API Data Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Internal Server Error'
    });
  }
};
