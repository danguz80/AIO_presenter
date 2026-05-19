require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../src/config/database');
const { google } = require('googleapis');

(async () => {
  const { rows } = await pool.query(
    'SELECT access_token, refresh_token, token_expiry FROM sync_users WHERE id=1'
  );
  const u = rows[0];
  const exp = u.token_expiry;
  console.log('Token expiry:', exp ? new Date(Number(exp)).toISOString() : 'null');
  console.log('Expirado:', exp ? Number(exp) < Date.now() : 'sin dato');

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.SERVER_URL || 'http://localhost:3001'}/auth/google/callback`
  );
  auth.setCredentials({
    access_token: u.access_token,
    refresh_token: u.refresh_token,
    expiry_date: u.token_expiry,
  });

  console.log('Probando Drive API - listando carpeta...');
  const drive = google.drive({ version: 'v3', auth });
  const res = await drive.files.list({
    q: `'1i8iahbECPRisNqTb3UG72z7wsCYYUTNY' in parents and mimeType='application/json' and trashed=false`,
    fields: 'files(id,name)',
    pageSize: 3,
  });
  const files = res.data.files || [];
  console.log('Archivos en carpeta:', files.map(f => f.name));
  if (files.length > 0) {
    console.log('Descargando primer archivo:', files[0].name, files[0].id);
    const dlRes = await drive.files.get({ fileId: files[0].id, alt: 'media' });
    console.log('Tipo de respuesta:', typeof dlRes.data);
    const str = typeof dlRes.data === 'string' ? dlRes.data : JSON.stringify(dlRes.data);
    console.log('Primeros 200 chars:', str.slice(0, 200));
  }
  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
