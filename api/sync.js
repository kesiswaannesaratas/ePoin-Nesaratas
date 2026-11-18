// Vercel Serverless Function: Forward create/update/delete operations to Google Apps Script Web App
const DEFAULT_APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || '';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'Method Not Allowed' });
    return;
  }

  try {
    const appsScriptUrl = process.env.APPS_SCRIPT_URL || DEFAULT_APPS_SCRIPT_URL;
    if (!appsScriptUrl) {
      res.status(200).json({
        success: false,
        isConfigWarning: true,
        message: 'APPS_SCRIPT_URL belum diatur di Vercel Environment Variables. Data tersimpan di memory browser sementara.'
      });
      return;
    }

    const payload = req.body || {};
    const forwardResp = await fetch(appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });

    const result = await forwardResp.json();
    res.status(200).json(result);

  } catch (err) {
    console.error('Sync Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Gagal meneruskan request ke Google Apps Script'
    });
  }
};
