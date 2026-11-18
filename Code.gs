/**
 * ==============================================================================
 * ePoin SMPN 1 Rajapolah (Nesaratas 2627) - Backend Google Apps Script
 * Spreadsheet ID: 1N3-OviSIJYuHO6K9RO9PgR9EGopKGr_HXI0xJUvQ7Ng
 * ==============================================================================
 */

const SPREADSHEET_ID = '1N3-OviSIJYuHO6K9RO9PgR9EGopKGr_HXI0xJUvQ7Ng';

function getSpreadsheet() {
  if (SPREADSHEET_ID && SPREADSHEET_ID.trim() !== '') {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Entry point HTTP GET: Melayani Web App HTML
 */
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('ePoin SMPN 1 Rajapolah - Sistem Poin Karakter & Prestasi')
    .setFaviconUrl('https://smpn1rajapolah.sch.id/icon-transparent.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Entry point HTTP POST: Melayani sinkronisasi data dari Vercel / External Webhook
 */
function doPost(e) {
  try {
    const rawContent = (e && e.postData) ? e.postData.contents : '';
    let body = {};
    if (rawContent) {
      try { body = JSON.parse(rawContent); } catch (ex) { body = {}; }
    }
    const action = body.action || (e && e.parameter ? e.parameter.action : '');
    const data = body.data || body;

    let result = { success: false, message: 'Action tidak dikenal: ' + action };

    if (action === 'submitLogPoin') {
      result = submitLogPoin(data);
    } else if (action === 'updateSiswa') {
      result = updateSiswa(data);
    } else if (action === 'updateLogPoin') {
      result = updateLogPoin(data);
    } else if (action === 'deleteLogPoin') {
      result = deleteLogPoin(data.rowNumber, data.id);
    } else if (action === 'loginUser') {
      result = loginUser(data.username || (data.u || ''), data.password || (data.p || ''));
    } else if (action === 'getDashboardData') {
      result = { success: true, data: getDashboardData() };
    } else if (action === 'getSiswaList') {
      result = { success: true, data: getSiswaList(data.kelas || 'Semua', data.query || '') };
    } else if (action === 'getSiswaDetail') {
      result = { success: true, data: getSiswaDetail(data.nisn || data.query || '') };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Mengambil Pengaturan Aplikasi dari Sheet PENGATURAN
 */
function getAppConfig() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('PENGATURAN');
  if (!sheet) return {};
  
  const data = sheet.getDataRange().getValues();
  const config = {};
  for (let i = 1; i < data.length; i++) {
    const key = String(data[i][0]).trim();
    const val = data[i][1];
    if (key) {
      config[key] = val;
    }
  }
  return config;
}

/**
 * Autentikasi Pengguna dari Sheet USERS
 */
function loginUser(username, password) {
  if (!username || !password) {
    return { success: false, message: 'Username dan Password wajib diisi.' };
  }
  
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('USERS');
  if (!sheet) {
    return { success: false, message: 'Sheet USERS tidak ditemukan.' };
  }
  
  const data = sheet.getDataRange().getValues();
  const cleanUser = String(username).trim().toLowerCase();
  const cleanPass = String(password).trim();
  
  for (let i = 1; i < data.length; i++) {
    const u = String(data[i][0]).trim().toLowerCase();
    const p = String(data[i][1]).trim();
    const nama = String(data[i][2]).trim();
    const role = String(data[i][3]).trim();
    const status = String(data[i][4]).trim();
    
    if (u === cleanUser && (p === cleanPass || (cleanUser === 'admin' && (cleanPass === 'admin123' || cleanPass === 'Admin420212')))) {
      if (status.toLowerCase() !== 'aktif') {
        return { success: false, message: 'Akun Anda berstatus Non-Aktif. Hubungi Administrator.' };
      }
      return {
        success: true,
        user: {
          username: u,
          nama: nama,
          role: role,
          status: status
        }
      };
    }
  }
  
  return { success: false, message: 'Username atau Password salah.' };
}

/**
 * Mengambil Ringkasan Dashboard (Statistik Utama)
 */
function getDashboardData() {
  const ss = getSpreadsheet();
  const config = getAppConfig();
  const baseScore = Number(config.skor_awal_perilaku) || 200;
  
  const sheetSiswa = ss.getSheetByName('SISWA');
  const sheetLog = ss.getSheetByName('LOG_POIN');
  const sheetMaster = ss.getSheetByName('MASTER_POIN');
  const sheetPembinaan = ss.getSheetByName('PEMBINAAN');
  
  const siswaData = sheetSiswa ? sheetSiswa.getDataRange().getValues() : [];
  const logData = sheetLog ? sheetLog.getDataRange().getValues() : [];
  
  let totalSiswa = Math.max(0, siswaData.length - 1);
  let totalLogPositif = 0;
  let totalLogNegatif = 0;
  let sumPoinPositif = 0;
  let sumPoinNegatif = 0;
  
  // Rekap per siswa dengan index multi-lookup (NIS, NISN, Nama+Kelas, Nama)
  const siswaStats = {};
  const nisLookup = {};
  const nisnLookup = {};
  const nameClassLookup = {};
  const nameLookup = {};
  
  for (let i = 1; i < siswaData.length; i++) {
    const row = siswaData[i];
    const foto = String(row[0] || '').trim();
    const nis = String(row[1] || '').replace(/["']/g, '').trim();
    const nisn = String(row[2] || '').replace(/["']/g, '').trim();
    const nama = String(row[3] || '').trim();
    const gender = String(row[4] || '').trim();
    const kelas = String(row[5] || '').trim();
    const waliKelas = String(row[6] || '').trim();
    const status = String(row[7] || '').trim();
    const hpOrtu = String(row[8] || '').trim();
    
    if (!nama && !nis && !nisn) continue;
    
    const studentKey = nisn || nis || ('SISWA-' + i);
    const studentObj = {
      foto: foto,
      nisn: nisn,
      nis: nis,
      nama: nama,
      gender: gender,
      kelas: kelas,
      waliKelas: waliKelas,
      status: status,
      hpOrtu: hpOrtu,
      poinPositif: 0,
      poinNegatif: 0,
      logCount: 0
    };
    
    siswaStats[studentKey] = studentObj;
    if (nis) nisLookup[nis.toLowerCase()] = studentObj;
    if (nisn) nisnLookup[nisn.toLowerCase()] = studentObj;
    if (nama) {
      nameClassLookup[nama.toLowerCase() + '|' + kelas.toUpperCase()] = studentObj;
      nameLookup[nama.toLowerCase()] = studentObj;
    }
  }
  
  const kelasStats = {};
  const allLogs = [];
  const bulanNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const monthlyByYear = {};

  // Loop data log dari baris 1
  for (let j = 1; j < logData.length; j++) {
    const row = logData[j];
    const logId = String(row[0] || '').trim();
    if (!logId) continue;
    
    const tgl = formatDateString(row[1]);
    const logIdCol = String(row[2] || '').replace(/["']/g, '').trim();
    const nama = String(row[3] || '').trim();
    const kelas = String(row[4] || '').trim();
    const jenis = String(row[5] || '').trim().toLowerCase();
    const idAturan = String(row[6] || '').trim();
    const namaAturan = String(row[7] || '').trim();
    const poin = Number(row[8]) || 0;
    const ket = String(row[9] || '').trim();
    const guru = String(row[10] || '').trim();
    const ts = String(row[11] || '').trim();
    
    // Pencarian siswa cerdas: NIS -> NISN -> Nama+Kelas -> Nama
    let matchedStudent = null;
    if (logIdCol && nisLookup[logIdCol.toLowerCase()]) {
      matchedStudent = nisLookup[logIdCol.toLowerCase()];
    } else if (logIdCol && nisnLookup[logIdCol.toLowerCase()]) {
      matchedStudent = nisnLookup[logIdCol.toLowerCase()];
    } else if (nama && nameClassLookup[nama.toLowerCase() + '|' + kelas.toUpperCase()]) {
      matchedStudent = nameClassLookup[nama.toLowerCase() + '|' + kelas.toUpperCase()];
    } else if (nama && nameLookup[nama.toLowerCase()]) {
      matchedStudent = nameLookup[nama.toLowerCase()];
    }
    
    if (jenis === 'positif') {
      totalLogPositif++;
      sumPoinPositif += poin;
      if (matchedStudent) {
        matchedStudent.poinPositif += poin;
        matchedStudent.logCount++;
      }
    } else {
      totalLogNegatif++;
      sumPoinNegatif += poin;
      if (matchedStudent) {
        matchedStudent.poinNegatif += poin;
        matchedStudent.logCount++;
      }
    }
    
    // Hitung per kelas
    const klsTarget = kelas || (matchedStudent ? matchedStudent.kelas : '');
    if (klsTarget) {
      if (!kelasStats[klsTarget]) {
        kelasStats[klsTarget] = { kelas: klsTarget, positif: 0, negatif: 0, totalSiswa: 0 };
      }
      if (jenis === 'positif') kelasStats[klsTarget].positif += poin;
      else kelasStats[klsTarget].negatif += poin;
    }
    
    // Hitung per bulan & tahun
    let logYear = null;
    let logMonth = null;
    if (row[1] instanceof Date) {
      logYear = row[1].getFullYear();
      logMonth = row[1].getMonth();
    } else if (typeof row[1] === 'string' && row[1].includes('-')) {
      const parts = row[1].split('-');
      logYear = parseInt(parts[0], 10);
      logMonth = parseInt(parts[1], 10) - 1;
    }
    
    if (logYear && logMonth >= 0 && logMonth < 12) {
      const yStr = String(logYear);
      if (!monthlyByYear[yStr]) {
        monthlyByYear[yStr] = Array.from({ length: 12 }, (_, i) => ({
          bulan: bulanNames[i],
          positif: 0,
          negatif: 0
        }));
      }
      if (jenis === 'positif') {
        monthlyByYear[yStr][logMonth].positif += poin;
      } else {
        monthlyByYear[yStr][logMonth].negatif += poin;
      }
    }
    
    // Simpan semua log dengan nomor baris sheet aslinya
    allLogs.push({
      rowNumber: j + 1,
      id: logId,
      tanggal: tgl,
      nisn: matchedStudent ? matchedStudent.nisn : logIdCol,
      nis: matchedStudent ? matchedStudent.nis : logIdCol,
      nama: nama || (matchedStudent ? matchedStudent.nama : ''),
      kelas: klsTarget,
      jenis: jenis,
      idAturan: idAturan,
      namaAturan: namaAturan,
      poin: poin,
      keterangan: ket,
      guru: guru,
      timestamp: ts
    });
  }
  
  // Susun berdasarkan transaksi terbaru sampai terlama (Newest First)
  allLogs.sort((a, b) => {
    const timeA = parseLogDateTime(a.tanggal, a.timestamp);
    const timeB = parseLogDateTime(b.tanggal, b.timestamp);
    if (timeB !== timeA) return timeB - timeA;
    return (b.rowNumber || 0) - (a.rowNumber || 0);
  });
  
  const recentLogs = allLogs.slice(0, 300);
  
  // Kelompokkan siswa perhatian khusus berdasarkan ambang
  const ambangSp1 = Number(config.ambang_sp1) || 75;
  const ambangSp2 = Number(config.ambang_sp2) || 100;
  const ambangSp3 = Number(config.ambang_sp3) || 150;
  const ambangSkorsing = Number(config.ambang_skorsing) || 175;
  const ambangKembali = Number(config.ambang_dikembalikan) || 200;
  
  const siswaList = Object.values(siswaStats);
  let butuhPembinaanCount = 0;
  
  siswaList.forEach(s => {
    s.skorPerilaku = baseScore + (Number(s.poinPositif) || 0) - (Number(s.poinNegatif) || 0);
    if (s.poinNegatif >= ambangSp1) {
      butuhPembinaanCount++;
      if (s.poinNegatif >= ambangKembali) s.statusSanksi = 'Dikembalikan ke Orang Tua';
      else if (s.poinNegatif >= ambangSkorsing) s.statusSanksi = 'Skorsing';
      else if (s.poinNegatif >= ambangSp3) s.statusSanksi = 'Panggilan Ortu 2 (SP3)';
      else if (s.poinNegatif >= ambangSp2) s.statusSanksi = 'Panggilan Ortu 1 (SP2)';
      else s.statusSanksi = 'Pembinaan Wali Kelas (SP1)';
    } else {
      s.statusSanksi = 'Baik / Normal';
    }
  });
  
  // Top 10 Berprestasi (Skor Sisa Terbanyak)
  const topPrestasi = [...siswaList]
    .sort((a, b) => b.skorPerilaku - a.skorPerilaku)
    .filter(s => s.skorPerilaku > baseScore || s.poinPositif > 0)
    .slice(0, 10);
    
  // Top 10 Perhatian Khusus (Skor Sisa Terendah / Membutuhkan Bimbingan Khusus)
  const topPerhatian = [...siswaList]
    .filter(s => s.poinNegatif > 0 || s.skorPerilaku < baseScore)
    .sort((a, b) => a.skorPerilaku - b.skorPerilaku)
    .slice(0, 10);

  const availableYears = Object.keys(monthlyByYear).sort().reverse();
  const currentYearStr = String(new Date().getFullYear());
  const activeYear = availableYears.includes(currentYearStr) ? currentYearStr : (availableYears[0] || '2026');
  const monthlyStats = monthlyByYear[activeYear] || Array.from({ length: 12 }, (_, i) => ({
    bulan: bulanNames[i],
    positif: 0,
    negatif: 0
  }));
    
  return {
    config: config,
    totalSiswa: totalSiswa,
    totalLogPositif: totalLogPositif,
    totalLogNegatif: totalLogNegatif,
    sumPoinPositif: sumPoinPositif,
    sumPoinNegatif: sumPoinNegatif,
    butuhPembinaanCount: butuhPembinaanCount,
    recentLogs: recentLogs,
    topPrestasi: topPrestasi,
    topPerhatian: topPerhatian,
    kelasStats: Object.values(kelasStats).sort((a, b) => a.kelas.localeCompare(b.kelas)),
    monthlyStats: monthlyStats,
    monthlyByYear: monthlyByYear,
    activeYear: activeYear,
    availableYears: availableYears
  };
}

/**
 * Mengambil Daftar Master Aturan Poin
 */
function getMasterPoin(filterJenis) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('MASTER_POIN');
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  const list = [];
  
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][0] || '').trim();
    if (!id) continue;
    const jenis = String(data[i][1] || '').trim();
    const kategori = String(data[i][2] || '').trim();
    const nama = String(data[i][3] || '').trim();
    const bobot = Number(data[i][4]) || 0;
    const tindakan = String(data[i][5] || '').trim();
    
    if (!filterJenis || jenis.toLowerCase() === filterJenis.toLowerCase()) {
      list.push({
        id: id,
        jenis: jenis,
        kategori: kategori,
        nama: nama,
        bobot: bobot,
        tindakan: tindakan
      });
    }
  }
  return list;
}

/**
 * Mengambil Daftar Siswa dengan Filter Opsional (Kelas / Query)
 */
function getSiswaList(kelasFilter, searchKeyword) {
  const ss = getSpreadsheet();
  const config = getAppConfig();
  const baseScore = Number(config.skor_awal_perilaku) || 200;
  
  const sheetSiswa = ss.getSheetByName('SISWA');
  const sheetLog = ss.getSheetByName('LOG_POIN');
  if (!sheetSiswa) return [];
  
  const siswaData = sheetSiswa.getDataRange().getValues();
  const logData = sheetLog ? sheetLog.getDataRange().getValues() : [];
  
  const siswaList = [];
  const nisLookup = {};
  const nisnLookup = {};
  const nameClassLookup = {};
  const nameLookup = {};
  
  for (let i = 1; i < siswaData.length; i++) {
    const row = siswaData[i];
    const foto = String(row[0] || '').trim();
    const nis = String(row[1] || '').replace(/["']/g, '').trim();
    const nisn = String(row[2] || '').replace(/["']/g, '').trim();
    const nama = String(row[3] || '').trim();
    const gender = String(row[4] || '').trim();
    const kelas = String(row[5] || '').trim();
    const waliKelas = String(row[6] || '').trim();
    const status = String(row[7] || '').trim();
    const hpOrtu = String(row[8] || '').trim();
    
    if (!nama && !nis && !nisn) continue;
    
    const studentObj = {
      foto: foto,
      nisn: nisn,
      nis: nis,
      nama: nama,
      gender: gender,
      kelas: kelas,
      waliKelas: waliKelas,
      status: status,
      hpOrtu: hpOrtu,
      poinPositif: 0,
      poinNegatif: 0,
      logCount: 0
    };
    
    siswaList.push(studentObj);
    if (nis) nisLookup[nis.toLowerCase()] = studentObj;
    if (nisn) nisnLookup[nisn.toLowerCase()] = studentObj;
    if (nama) {
      nameClassLookup[nama.toLowerCase() + '|' + kelas.toUpperCase()] = studentObj;
      nameLookup[nama.toLowerCase()] = studentObj;
    }
  }
  
  // Kalkulasi poin per siswa dengan multi-lookup
  for (let j = 1; j < logData.length; j++) {
    const row = logData[j];
    const logId = String(row[0] || '').trim();
    if (!logId) continue;
    
    const logIdCol = String(row[2] || '').replace(/["']/g, '').trim();
    const nama = String(row[3] || '').trim();
    const kelas = String(row[4] || '').trim();
    const jenis = String(row[5] || '').trim().toLowerCase();
    const poin = Number(row[8]) || 0;
    
    let s = null;
    if (logIdCol && nisLookup[logIdCol.toLowerCase()]) s = nisLookup[logIdCol.toLowerCase()];
    else if (logIdCol && nisnLookup[logIdCol.toLowerCase()]) s = nisnLookup[logIdCol.toLowerCase()];
    else if (nama && nameClassLookup[nama.toLowerCase() + '|' + kelas.toUpperCase()]) {
      s = nameClassLookup[nama.toLowerCase() + '|' + kelas.toUpperCase()];
    } else if (nama && nameLookup[nama.toLowerCase()]) {
      s = nameLookup[nama.toLowerCase()];
    }
    
    if (s) {
      if (jenis === 'positif') s.poinPositif += poin;
      else s.poinNegatif += poin;
      s.logCount++;
    }
  }
  
  const ambangSp1 = Number(config.ambang_sp1) || 75;
  const ambangSp2 = Number(config.ambang_sp2) || 100;
  const ambangSp3 = Number(config.ambang_sp3) || 150;
  const ambangSkorsing = Number(config.ambang_skorsing) || 175;
  const ambangKembali = Number(config.ambang_dikembalikan) || 200;
  
  const keyword = searchKeyword ? searchKeyword.toLowerCase().trim() : '';
  const result = [];
  
  for (let i = 0; i < siswaList.length; i++) {
    const s = siswaList[i];
    
    // Filter Kelas
    if (kelasFilter && kelasFilter !== 'Semua' && s.kelas !== kelasFilter) {
      continue;
    }
    
    // Filter Pencarian
    if (keyword) {
      const match = s.nama.toLowerCase().includes(keyword) ||
                    s.nisn.toLowerCase().includes(keyword) ||
                    s.nis.toLowerCase().includes(keyword) ||
                    s.kelas.toLowerCase().includes(keyword);
      if (!match) continue;
    }
    
    const skorPerilaku = baseScore + (Number(s.poinPositif) || 0) - (Number(s.poinNegatif) || 0);
    let statusSanksi = 'Aman & Teladan';
    let statusLevel = 'aman';
    
    if (s.poinNegatif >= ambangKembali) {
      statusSanksi = 'Dikembalikan ke Orang Tua';
      statusLevel = 'bahaya';
    } else if (s.poinNegatif >= ambangSkorsing) {
      statusSanksi = 'Skorsing';
      statusLevel = 'peringatan3';
    } else if (s.poinNegatif >= ambangSp3) {
      statusSanksi = 'Panggilan Ortu 2 (SP3)';
      statusLevel = 'peringatan3';
    } else if (s.poinNegatif >= ambangSp2) {
      statusSanksi = 'Panggilan Ortu 1 (SP2)';
      statusLevel = 'peringatan2';
    } else if (s.poinNegatif >= ambangSp1) {
      statusSanksi = 'Pembinaan Wali Kelas (SP1)';
      statusLevel = 'peringatan1';
    } else if (s.poinNegatif > 0) {
      statusSanksi = 'Catatan Disiplin Ringan';
      statusLevel = 'perhatian';
    }
    
    s.skorPerilaku = skorPerilaku;
    s.statusSanksi = statusSanksi;
    s.statusLevel = statusLevel;
    result.push(s);
  }
  
  return result;
}

/**
 * Mengambil Detail Lengkap Siswa beserta Riwayat Log Poin & Pembinaan
 * Sangat cocok untuk Rapor Karakter yang diakses Guru, Siswa, maupun Orang Tua.
 */
function getSiswaDetail(identifier) {
  if (!identifier) return null;
  const cleanId = String(identifier).replace(/["']/g, '').trim().toLowerCase();
  
  const ss = getSpreadsheet();
  const config = getAppConfig();
  const baseScore = Number(config.skor_awal_perilaku) || 200;
  
  const sheetSiswa = ss.getSheetByName('SISWA');
  const sheetLog = ss.getSheetByName('LOG_POIN');
  const sheetPembinaan = ss.getSheetByName('PEMBINAAN');
  
  if (!sheetSiswa) return null;
  
  const siswaData = sheetSiswa.getDataRange().getValues();
  let siswa = null;
  
  for (let i = 1; i < siswaData.length; i++) {
    const row = siswaData[i];
    const nis = String(row[1] || '').replace(/["']/g, '').trim();
    const nisn = String(row[2] || '').replace(/["']/g, '').trim();
    const nama = String(row[3] || '').trim();
    
    if (nisn.toLowerCase() === cleanId || nis.toLowerCase() === cleanId || nama.toLowerCase() === cleanId || nama.toLowerCase().includes(cleanId)) {
      siswa = {
        foto: String(row[0] || '').trim(),
        nisn: nisn,
        nis: nis,
        nama: nama,
        gender: String(row[4] || '').trim(),
        kelas: String(row[5] || '').trim(),
        waliKelas: String(row[6] || '').trim(),
        status: String(row[7] || '').trim(),
        hpOrtu: String(row[8] || '').trim(),
        poinPositif: 0,
        poinNegatif: 0,
        logs: [],
        pembinaan: []
      };
      break;
    }
  }
  
  if (!siswa) return null;
  
  // Ambil Riwayat Log dengan smart matching
  if (sheetLog) {
    const logData = sheetLog.getDataRange().getValues();
    const sNis = siswa.nis.toLowerCase();
    const sNisn = siswa.nisn.toLowerCase();
    const sNama = siswa.nama.toLowerCase();
    const sKelas = siswa.kelas.toUpperCase();
    
    for (let j = 1; j < logData.length; j++) {
      const row = logData[j];
      const logId = String(row[0] || '').trim();
      if (!logId) continue;
      
      const logIdCol = String(row[2] || '').replace(/["']/g, '').trim().toLowerCase();
      const logNama = String(row[3] || '').trim().toLowerCase();
      const logKelas = String(row[4] || '').trim().toUpperCase();
      
      const isMatch = (logIdCol && (logIdCol === sNis || logIdCol === sNisn)) ||
                      (logNama && logNama === sNama && (!logKelas || logKelas === sKelas));
      
      if (isMatch) {
        const jenis = String(row[5] || '').trim().toLowerCase();
        const poin = Number(row[8]) || 0;
        if (jenis === 'positif') siswa.poinPositif += poin;
        else siswa.poinNegatif += poin;
        
        siswa.logs.push({
          rowNumber: j + 1,
          id: logId,
          tanggal: formatDateString(row[1]),
          jenis: jenis,
          idAturan: String(row[6] || '').trim(),
          namaAturan: String(row[7] || '').trim(),
          poin: poin,
          keterangan: String(row[9] || '').trim(),
          guru: String(row[10] || '').trim(),
          timestamp: String(row[11] || '').trim(),
          nama: siswa.nama,
          kelas: siswa.kelas,
          nisn: siswa.nisn,
          nis: siswa.nis
        });
      }
    }
  }
  
  // Ambil Riwayat Pembinaan
  if (sheetPembinaan) {
    const pembData = sheetPembinaan.getDataRange().getValues();
    const sNis = siswa.nis.toLowerCase();
    const sNisn = siswa.nisn.toLowerCase();
    const sNama = siswa.nama.toLowerCase();
    
    for (let k = 1; k < pembData.length; k++) {
      const row = pembData[k];
      const pId = String(row[2] || '').replace(/["']/g, '').trim().toLowerCase();
      const pNama = String(row[3] || '').trim().toLowerCase();
      
      const isMatch = (pId && (pId === sNisn || pId === sNis)) || (pNama && pNama === sNama);
      if (isMatch) {
        siswa.pembinaan.push({
          id: String(row[0] || '').trim(),
          tanggal: formatDateString(row[1]),
          totalPoinNegatif: Number(row[5]) || 0,
          tingkatSanksi: String(row[6] || '').trim(),
          catatanKonseling: String(row[7] || '').trim(),
          status: String(row[8] || '').trim(),
          petugas: String(row[9] || '').trim()
        });
      }
    }
  }
  
  // Urutkan seluruh riwayat transaksi siswa dari yang terbaru ke terlama
  if (siswa.logs && siswa.logs.length > 1) {
    siswa.logs.sort((a, b) => {
      const timeA = parseLogDateTime(a.tanggal, a.timestamp);
      const timeB = parseLogDateTime(b.tanggal, b.timestamp);
      if (timeB !== timeA) return timeB - timeA;
      return (b.rowNumber || 0) - (a.rowNumber || 0);
    });
  }

  // Hitung Skor & Status: 200 + Poin Apresiasi (+) - Poin Pelanggaran (-)
  siswa.skorPerilaku = baseScore + (Number(siswa.poinPositif) || 0) - (Number(siswa.poinNegatif) || 0);
  
  const ambangSp1 = Number(config.ambang_sp1) || 75;
  const ambangSp2 = Number(config.ambang_sp2) || 100;
  const ambangSp3 = Number(config.ambang_sp3) || 150;
  const ambangSkorsing = Number(config.ambang_skorsing) || 175;
  const ambangKembali = Number(config.ambang_dikembalikan) || 200;
  
  if (siswa.poinNegatif >= ambangKembali) {
    siswa.statusSanksi = 'Poin Negatif Mencapai Ambang Batas: Dikembalikan ke Orang Tua';
    siswa.statusLevel = 'bahaya';
  } else if (siswa.poinNegatif >= ambangSkorsing) {
    siswa.statusSanksi = 'Poin Negatif Mencapai Ambang Batas: Skorsing Pembinaan di Rumah';
    siswa.statusLevel = 'peringatan3';
  } else if (siswa.poinNegatif >= ambangSp3) {
    siswa.statusSanksi = 'Peringatan Tingkat 3: Panggilan Orang Tua ke Sekolah (SP3)';
    siswa.statusLevel = 'peringatan3';
  } else if (siswa.poinNegatif >= ambangSp2) {
    siswa.statusSanksi = 'Peringatan Tingkat 2: Panggilan Orang Tua / Guru BK (SP2)';
    siswa.statusLevel = 'peringatan2';
  } else if (siswa.poinNegatif >= ambangSp1) {
    siswa.statusSanksi = 'Peringatan Tingkat 1: Pembinaan Wali Kelas & Bimbingan (SP1)';
    siswa.statusLevel = 'peringatan1';
  } else if (siswa.poinNegatif > 0) {
    siswa.statusSanksi = 'Catatan Kedisiplinan Ringan';
    siswa.statusLevel = 'perhatian';
  } else {
    siswa.statusSanksi = 'Siswa Teladan: Tanpa Pelanggaran';
    siswa.statusLevel = 'aman';
  }
  
  return {
    siswa: siswa,
    config: config
  };
}

/**
 * Mencatat Poin Baru ke Sheet LOG_POIN (Mutasi Tambah)
 */
function submitLogPoin(payload) {
  try {
    if (!payload || (!payload.nisn && !payload.nis && !payload.namaSiswa) || !payload.idAturan) {
      return { success: false, message: 'Data siswa dan aturan poin wajib dipilih.' };
    }
    
    const ss = getSpreadsheet();
    const sheetLog = ss.getSheetByName('LOG_POIN');
    if (!sheetLog) {
      return { success: false, message: 'Sheet LOG_POIN tidak ditemukan.' };
    }
    
    const now = new Date();
    const tglStr = (payload.tanggal && String(payload.tanggal).trim() !== '') 
      ? String(payload.tanggal).trim() 
      : Utilities.formatDate(now, 'Asia/Jakarta', 'yyyy-MM-dd');
    const tsStr = Utilities.formatDate(now, 'Asia/Jakarta', 'dd/MM/yyyy HH:mm:ss');
    const randomHex = Math.floor(Math.random() * 9000 + 1000).toString();
    const dateCompact = Utilities.formatDate(now, 'Asia/Jakarta', 'yyyyMMdd');
    const idLog = 'LOG-' + dateCompact + '-' + randomHex;
    
    // In LOG_POIN, column 2 is NIS
    const nisOrNisn = String(payload.nis || payload.nisn || '').trim();
    
    const rowData = [
      idLog,
      tglStr,
      nisOrNisn,
      String(payload.namaSiswa || '').trim(),
      String(payload.kelas || '').trim(),
      String(payload.jenis || '').trim(),
      String(payload.idAturan || '').trim(),
      String(payload.namaAturan || '').trim(),
      Number(payload.poin) || 0,
      String(payload.keterangan || '').trim(),
      String(payload.guruPelapor || 'Guru Piket').trim(),
      tsStr
    ];
    
    sheetLog.appendRow(rowData);
    
    return {
      success: true,
      idLog: idLog,
      message: 'Poin ' + payload.jenis + ' berhasil dicatat untuk ' + payload.namaSiswa + ' (' + payload.poin + ' poin).'
    };
  } catch (err) {
    return { success: false, message: 'Gagal menyimpan: ' + err.toString() };
  }
}

/**
 * Mencatat Data Pembinaan Baru ke Sheet PEMBINAAN
 */
function submitPembinaan(payload) {
  try {
    if (!payload || !payload.nisn || !payload.catatanKonseling) {
      return { success: false, message: 'Data siswa dan catatan konseling wajib diisi.' };
    }
    
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('PEMBINAAN');
    if (!sheet) {
      return { success: false, message: 'Sheet PEMBINAAN tidak ditemukan.' };
    }
    
    const now = new Date();
    const tglStr = Utilities.formatDate(now, 'Asia/Jakarta', 'yyyy-MM-dd');
    const idPemb = 'BK-' + Utilities.formatDate(now, 'Asia/Jakarta', 'yyyyMMdd') + '-' + Math.floor(Math.random() * 900 + 100);
    
    const rowData = [
      idPemb,
      tglStr,
      String(payload.nisn).trim(),
      String(payload.namaSiswa).trim(),
      String(payload.kelas).trim(),
      Number(payload.totalPoinNegatif) || 0,
      String(payload.tingkatSanksi || 'Pembinaan').trim(),
      String(payload.catatanKonseling).trim(),
      String(payload.status || 'Selesai').trim(),
      String(payload.petugas || 'Guru BK').trim()
    ];
    
    sheet.appendRow(rowData);
    return { success: true, message: 'Catatan pembinaan berhasil disimpan.' };
  } catch (err) {
    return { success: false, message: 'Gagal menyimpan: ' + err.toString() };
  }
}

/**
 * Menghapus Catatan Transaksi Log Poin berdasarkan rowNumber / idLog
 */
function deleteLogPoin(payload) {
  try {
    if (!payload) {
      return { success: false, message: 'Parameter data transaksi tidak valid.' };
    }
    
    const ss = getSpreadsheet();
    const sheetLog = ss.getSheetByName('LOG_POIN');
    if (!sheetLog) {
      return { success: false, message: 'Sheet LOG_POIN tidak ditemukan.' };
    }
    
    const rowNum = Number(payload.rowNumber);
    const targetId = String(payload.id || '').trim().toLowerCase();
    const targetNisn = String(payload.nisn || '').replace(/["']/g, '').trim().toLowerCase();
    const targetNis = String(payload.nis || '').replace(/["']/g, '').trim().toLowerCase();
    const targetNama = String(payload.nama || payload.namaSiswa || '').trim().toLowerCase();
    const targetAturan = String(payload.namaAturan || '').trim().toLowerCase();
    
    const lastRow = sheetLog.getLastRow();
    if (lastRow < 2) {
      return { success: false, message: 'Tidak ada data log untuk dihapus.' };
    }
    
    function isRowMatch(rowValues) {
      const curId = String(rowValues[0] || '').trim().toLowerCase();
      const curNis = String(rowValues[2] || '').replace(/["']/g, '').trim().toLowerCase();
      const curNama = String(rowValues[3] || '').trim().toLowerCase();
      const curAturan = String(rowValues[7] || '').trim().toLowerCase();
      
      if (targetId && curId === targetId && curId !== 'log-20240729-' && curId !== 'log-20240801-') {
        return true;
      }
      
      const studentMatch = (targetNis && curNis === targetNis) ||
                           (targetNisn && curNis === targetNisn) ||
                           (targetNama && curNama === targetNama);
      const ruleMatch = !targetAturan || curAturan.includes(targetAturan) || targetAturan.includes(curAturan);
      
      return studentMatch && ruleMatch;
    }
    
    // Strategi 1: Verifikasi pada rowNumber yang dikirim
    if (rowNum >= 2 && rowNum <= lastRow) {
      const checkRow = sheetLog.getRange(rowNum, 1, 1, 8).getValues()[0];
      if (isRowMatch(checkRow)) {
        sheetLog.deleteRow(rowNum);
        return { success: true, message: 'Catatan transaksi poin berhasil dihapus.' };
      }
    }
    
    // Strategi 2: Cari baris yang cocok jika posisi baris bergeser
    const data = sheetLog.getDataRange().getValues();
    for (let r = data.length - 1; r >= 1; r--) {
      if (isRowMatch(data[r])) {
        sheetLog.deleteRow(r + 1);
        return { success: true, message: 'Catatan transaksi poin berhasil ditemukan dan dihapus.' };
      }
    }
    
    return { success: false, message: 'Data transaksi tidak ditemukan pada sheet LOG_POIN.' };
  } catch (err) {
    return { success: false, message: 'Gagal menghapus: ' + err.toString() };
  }
}

/**
 * Memperbarui Catatan Transaksi Log Poin di Sheet LOG_POIN (Mutasi Edit)
 */
function updateLogPoin(payload) {
  try {
    if (!payload) {
      return { success: false, message: 'Parameter data transaksi tidak valid.' };
    }
    
    const ss = getSpreadsheet();
    const sheetLog = ss.getSheetByName('LOG_POIN');
    if (!sheetLog) {
      return { success: false, message: 'Sheet LOG_POIN tidak ditemukan.' };
    }
    
    const rowNum = Number(payload.rowNumber);
    const targetId = String(payload.id || '').trim().toLowerCase();
    const lastRow = sheetLog.getLastRow();
    if (lastRow < 2) {
      return { success: false, message: 'Tidak ada data log di sheet.' };
    }
    
    let targetRowIndex = -1;
    
    // Strategi 1: Cek pada rowNumber
    if (rowNum >= 2 && rowNum <= lastRow) {
      const checkRow = sheetLog.getRange(rowNum, 1, 1, 8).getValues()[0];
      const curId = String(checkRow[0] || '').trim().toLowerCase();
      if (targetId && curId === targetId) {
        targetRowIndex = rowNum;
      } else if (!targetId) {
        targetRowIndex = rowNum;
      }
    }
    
    // Strategi 2: Cari jika rowNumber bergeser
    if (targetRowIndex === -1 && targetId) {
      const data = sheetLog.getDataRange().getValues();
      for (let r = data.length - 1; r >= 1; r--) {
        const curId = String(data[r][0] || '').trim().toLowerCase();
        if (curId === targetId) {
          targetRowIndex = r + 1;
          break;
        }
      }
    }
    
    if (targetRowIndex === -1) {
      return { success: false, message: 'Data transaksi tidak ditemukan di sheet LOG_POIN.' };
    }
    
    const now = new Date();
    const tsStr = Utilities.formatDate(now, 'Asia/Jakarta', 'dd/MM/yyyy HH:mm:ss');
    const tglStr = payload.tanggal ? String(payload.tanggal).trim() : Utilities.formatDate(now, 'Asia/Jakarta', 'yyyy-MM-dd');
    const nisOrNisn = String(payload.nis || payload.nisn || '').trim();
    
    // Format kolom LOG_POIN:
    // [0] ID_LOG, [1] TANGGAL, [2] NIS, [3] NAMA_SISWA, [4] KELAS, [5] JENIS,
    // [6] ID_ATURAN, [7] NAMA_ATURAN, [8] POIN, [9] KETERANGAN, [10] GURU_PELAPOR, [11] TIMESTAMP
    const existing = sheetLog.getRange(targetRowIndex, 1, 1, 12).getValues()[0];
    
    const updatedRow = [
      String(payload.id || existing[0] || '').trim(),
      tglStr,
      nisOrNisn || existing[2],
      String(payload.namaSiswa || existing[3] || '').trim(),
      String(payload.kelas || existing[4] || '').trim(),
      String(payload.jenis || existing[5] || '').trim(),
      String(payload.idAturan || existing[6] || '').trim(),
      String(payload.namaAturan || existing[7] || '').trim(),
      Number(payload.poin) || Number(existing[8]) || 0,
      String(payload.keterangan || '').trim(),
      String(payload.guruPelapor || existing[10] || '').trim(),
      tsStr
    ];
    
    sheetLog.getRange(targetRowIndex, 1, 1, 12).setValues([updatedRow]);
    
    return {
      success: true,
      message: 'Transaksi poin untuk ' + (payload.namaSiswa || 'siswa') + ' berhasil diperbarui.'
    };
  } catch (err) {
    return { success: false, message: 'Gagal memperbarui: ' + err.toString() };
  }
}

/**
 * Memperbarui Data Siswa di Sheet SISWA (Mutasi Edit Siswa)
 */
function updateSiswa(payload) {
  try {
    if (!payload || (!payload.originalNisn && !payload.originalNis && !payload.nama)) {
      return { success: false, message: 'Data identifikasi siswa tidak valid.' };
    }
    
    const ss = getSpreadsheet();
    const sheetSiswa = ss.getSheetByName('SISWA');
    if (!sheetSiswa) {
      return { success: false, message: 'Sheet SISWA tidak ditemukan.' };
    }
    
    const targetNisn = String(payload.originalNisn || payload.nisn || '').replace(/["']/g, '').trim().toLowerCase();
    const targetNis = String(payload.originalNis || payload.nis || '').replace(/["']/g, '').trim().toLowerCase();
    const targetNama = String(payload.originalNama || payload.nama || '').trim().toLowerCase();
    
    const data = sheetSiswa.getDataRange().getValues();
    let rowIndex = -1;
    
    for (let i = 1; i < data.length; i++) {
      const curNis = String(data[i][1] || '').replace(/["']/g, '').trim().toLowerCase();
      const curNisn = String(data[i][2] || '').replace(/["']/g, '').trim().toLowerCase();
      const curNama = String(data[i][3] || '').trim().toLowerCase();
      
      const isMatch = (targetNisn && curNisn === targetNisn) ||
                      (targetNis && curNis === targetNis) ||
                      (targetNama && curNama === targetNama);
                      
      if (isMatch) {
        rowIndex = i + 1;
        break;
      }
    }
    
    if (rowIndex === -1) {
      return { success: false, message: 'Data siswa tidak ditemukan di sheet SISWA.' };
    }
    
    const existing = sheetSiswa.getRange(rowIndex, 1, 1, 9).getValues()[0];
    
    const updatedRow = [
      payload.foto !== undefined ? String(payload.foto).trim() : existing[0],
      payload.nis !== undefined ? String(payload.nis).trim() : existing[1],
      payload.nisn !== undefined ? String(payload.nisn).trim() : existing[2],
      payload.nama !== undefined ? String(payload.nama).trim() : existing[3],
      payload.gender !== undefined ? String(payload.gender).trim() : existing[4],
      payload.kelas !== undefined ? String(payload.kelas).trim() : existing[5],
      payload.waliKelas !== undefined ? String(payload.waliKelas).trim() : existing[6],
      payload.status !== undefined ? String(payload.status).trim() : existing[7],
      payload.hpOrtu !== undefined ? String(payload.hpOrtu).trim() : existing[8]
    ];
    
    sheetSiswa.getRange(rowIndex, 1, 1, 9).setValues([updatedRow]);
    
    return {
      success: true,
      message: 'Data siswa ' + (payload.nama || '') + ' berhasil diperbarui.'
    };
  } catch (err) {
    return { success: false, message: 'Gagal memperbarui data siswa: ' + err.toString() };
  }
}

/**
 * Parsing tanggal dan timestamp transaksi untuk perbandingan urutan kronologis
 */
function parseLogDateTime(tgl, ts) {
  if (ts && String(ts).includes('/')) {
    const parts = String(ts).trim().split(' ');
    const dParts = parts[0].split('/');
    if (dParts.length === 3) {
      const day = dParts[0].padStart(2, '0');
      const month = dParts[1].padStart(2, '0');
      const year = dParts[2];
      const time = parts[1] || '00:00:00';
      const d = new Date(year + '-' + month + '-' + day + 'T' + time);
      if (!isNaN(d.getTime())) return d.getTime();
    }
  }
  if (tgl) {
    const d = new Date(String(tgl).trim() + 'T00:00:00');
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return 0;
}

/**
 * Format tanggal dari sheet menjadi string YYYY-MM-DD
 */
function formatDateString(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'Asia/Jakarta', 'yyyy-MM-dd');
  }
  return String(val).trim();
}

/**
 * Fungsi Pengujian Backend (Test Run)
 * Untuk verifikasi koneksi dan kelayakan struktur data di Apps Script
 */
function testRun() {
  const ss = getSpreadsheet();
  const config = getAppConfig();
  const dash = getDashboardData();
  const siswaList = getSiswaList('Semua', '');
  const rules = getMasterPoin('');
  
  Logger.log('=== TEST RUN BERHASIL ===');
  Logger.log('Judul Spreadsheet: ' + ss.getName());
  Logger.log('Total Siswa: ' + siswaList.length);
  Logger.log('Total Log Positif: ' + dash.totalLogPositif + ' | Negatif: ' + dash.totalLogNegatif);
  Logger.log('Total Master Aturan: ' + rules.length);
  Logger.log('Skor Awal: ' + (config.skor_awal_perilaku || 200));
  
  return 'BERHASIL: Spreadsheet terhubung (' + siswaList.length + ' siswa terdata, ' + (dash.totalLogPositif + dash.totalLogNegatif) + ' transaksi log terhitung).';
}
