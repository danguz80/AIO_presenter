require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../src/config/database');
const { google } = require('googleapis');

const ORG_ID  = 1;
const USER_ID = 1;

async function getDriveFiles(drive, folderId) {
  let files = [], pageToken = null;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType='application/json' and trashed=false`,
      fields: 'nextPageToken, files(id, name, modifiedTime)',
      pageSize: 1000,
      pageToken: pageToken || undefined,
    });
    files = files.concat(res.data.files || []);
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return files;
}

async function downloadDriveFile(drive, fileId) {
  const res = await drive.files.get({ fileId, alt: 'media' });
  return res.data;
}

(async () => {
  const { rows } = await pool.query(
    'SELECT access_token, refresh_token, token_expiry, drive_folder_id FROM sync_users WHERE id=$1', [USER_ID]
  );
  if (!rows.length) { console.error('Usuario no encontrado'); process.exit(1); }
  const u = rows[0];
  if (!u.drive_folder_id) { console.error('Sin carpeta de Drive configurada'); process.exit(1); }
  console.log('Carpeta Drive:', u.drive_folder_id);

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

  const drive = google.drive({ version: 'v3', auth });

  console.log('Listando archivos en Drive...');
  const files = await getDriveFiles(drive, u.drive_folder_id);
  console.log('Archivos encontrados en Drive:', files.length);

  let created = 0, updated = 0, skipped = 0, errors = 0;

  for (const [i, file] of files.entries()) {
    process.stdout.write(`\r[${i+1}/${files.length}] ${file.name.slice(0,40).padEnd(40)}`);
    try {
      const { rows: existing } = await pool.query(
        'SELECT id FROM songs WHERE drive_file_id=$1 AND organization_id=$2',
        [file.id, ORG_ID]
      );

      let songData;
      try {
        const raw = await downloadDriveFile(drive, file.id);
        songData = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch { skipped++; continue; }

      if (!songData || !songData.title || !songData.slides) { skipped++; continue; }

      if (existing.length > 0) {
        const songId = existing[0].id;
        await pool.query(
          `UPDATE songs SET title=$1, author=$2, copyright=$3, ccli=$4, song_key=$5, tags=$6,
           drive_synced_at=NOW(), updated_at=NOW() WHERE id=$7`,
          [songData.title, songData.author || null, songData.copyright || null,
           songData.ccli || null, songData.song_key || null,
           songData.tags || [], songId]
        );
        await pool.query('DELETE FROM song_slides WHERE song_id=$1', [songId]);
        for (const [idx, slide] of (songData.slides || []).entries()) {
          await pool.query(
            'INSERT INTO song_slides (song_id, label, content, position) VALUES ($1,$2,$3,$4)',
            [songId, slide.label || '', slide.content || '', slide.position != null ? slide.position : idx]
          );
        }
        updated++;
      } else {
        const { rows: [newSong] } = await pool.query(
          `INSERT INTO songs (title, author, copyright, ccli, song_key, tags, drive_file_id, drive_synced_at, organization_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),$8) RETURNING id`,
          [songData.title, songData.author || null, songData.copyright || null,
           songData.ccli || null, songData.song_key || null,
           songData.tags || [], file.id, ORG_ID]
        );
        for (const [idx, slide] of (songData.slides || []).entries()) {
          await pool.query(
            'INSERT INTO song_slides (song_id, label, content, position) VALUES ($1,$2,$3,$4)',
            [newSong.id, slide.label || '', slide.content || '', slide.position != null ? slide.position : idx]
          );
        }
        created++;
      }

      if ((created + updated) % 50 === 0 && (created + updated) > 0) {
        console.log(`  Progreso: ${created} creadas, ${updated} actualizadas, ${skipped} omitidas...`);
      }
    } catch (e) {
      console.error(`  Error en "${file.name}": ${e.message}`);
      errors++;
    }
  }

  await pool.query('UPDATE sync_users SET last_sync_at=NOW() WHERE id=$1', [USER_ID]);
  const total = await pool.query('SELECT COUNT(*) FROM songs WHERE organization_id=$1', [ORG_ID]);

  console.log('\n=== RESULTADO ===');
  console.log(`Creadas: ${created} | Actualizadas: ${updated} | Omitidas: ${skipped} | Errores: ${errors}`);
  console.log(`Total canciones en DB ahora: ${total.rows[0].count}`);
  process.exit(0);
})().catch(e => { console.error('Error fatal:', e.message); process.exit(1); });
