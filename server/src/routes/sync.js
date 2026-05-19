const express    = require('express');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const pool       = require('../config/database');
const { requireAuth } = require('./auth');

// ─── Mailer ───────────────────────────────────────────────────────────────────
let _transporter = null;
function getTransporter() {
  if (_transporter) return _transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  _transporter = nodemailer.createTransport({
    host   : SMTP_HOST,
    port   : parseInt(SMTP_PORT || '465', 10),
    secure : SMTP_SECURE !== 'false',
    auth   : { user: SMTP_USER, pass: SMTP_PASS },
  });
  return _transporter;
}

async function sendInviteEmail({ to, label, link, expiresAt, canPush, canPushAll }) {
  const transport = getTransporter();
  if (!transport) return; // SMTP no configurado → silencioso
  const from    = process.env.SMTP_FROM || process.env.SMTP_USER;
  const expiry  = expiresAt ? `Expira el ${new Date(expiresAt).toLocaleDateString('es')}.` : 'Sin fecha de expiración.';
  const perms   = [canPush && 'subir canciones', canPushAll && 'reemplazar toda la biblioteca'].filter(Boolean).join(', ') || 'solo lectura';
  await transport.sendMail({
    from,
    to,
    subject : 'Invitación a AIO Presenter',
    html    : `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="margin-bottom:8px">Te han invitado a AIO Presenter</h2>
        ${label ? `<p style="color:#666">${label}</p>` : ''}
        <p>Haz clic en el botón para unirte. ${expiry}</p>
        <p style="font-size:12px;color:#888">Permisos: ${perms}</p>
        <a href="${link}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Unirse a AIO Presenter</a>
        <p style="margin-top:24px;font-size:11px;color:#aaa">O copia este enlace: ${link}</p>
      </div>`,
    text    : `Te han invitado a AIO Presenter.\n${label || ''}\nEnlace: ${link}\n${expiry}\nPermisos: ${perms}`,
  });
}

const router = express.Router();

// Todos los endpoints de sync requieren auth
router.use(requireAuth);

// ─── Helper: obtener OAuth2Client con tokens del usuario ─────────────────────
async function getAuthenticatedClient(userId) {
  const { rows } = await pool.query(
    'SELECT access_token, refresh_token, token_expiry FROM sync_users WHERE id = $1',
    [userId]
  );
  if (!rows.length) throw new Error('Usuario no encontrado');
  const { access_token, refresh_token, token_expiry } = rows[0];

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.SERVER_URL || 'http://localhost:3001'}/auth/google/callback`
  );
  oauth2Client.setCredentials({
    access_token,
    refresh_token,
    expiry_date: token_expiry ? Number(token_expiry) : undefined,
  });

  // Refrescar token si expira en menos de 5 min
  if (token_expiry && Date.now() > Number(token_expiry) - 5 * 60 * 1000) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);
      await pool.query(
        'UPDATE sync_users SET access_token=$1, token_expiry=$2 WHERE id=$3',
        [credentials.access_token, credentials.expiry_date, userId]
      );
    } catch (e) {
      console.warn('[Sync] No se pudo refrescar token:', e.message);
    }
  }
  return oauth2Client;
}

// ─── Helper: listar / crear archivos en Drive ────────────────────────────────
async function getDriveFiles(drive, folderId) {
  const files = [];
  let pageToken = null;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and name contains 'song_' and mimeType='application/json' and trashed=false`,
      fields: 'nextPageToken, files(id, name, modifiedTime)',
      pageSize: 1000,
      pageToken: pageToken || undefined,
    });
    files.push(...res.data.files);
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return files;
}

async function uploadSongToDrive(drive, song, folderId, existingFileId = null) {
  const content = JSON.stringify({
    aio_version: 1,
    drive_id:    null, // se rellena luego si se quiere
    title:       song.title,
    author:      song.author,
    copyright:   song.copyright,
    ccli:        song.ccli,
    song_key:    song.song_key,
    tags:        song.tags,
    updated_at:  song.updated_at,
    slides: (song.slides || []).filter(Boolean).map(s => ({
      label:    s.label,
      content:  s.content,
      position: s.position,
    })),
  }, null, 2);

  const media = { mimeType: 'application/json', body: content };
  const name  = `song_${song.id}.json`;

  if (existingFileId) {
    const res = await drive.files.update({
      fileId: existingFileId,
      media,
      fields: 'id, modifiedTime',
    });
    return res.data;
  } else {
    const res = await drive.files.create({
      requestBody: { name, parents: [folderId], mimeType: 'application/json' },
      media,
      fields: 'id, modifiedTime',
    });
    return res.data;
  }
}

async function downloadDriveFile(drive, fileId) {
  const res = await drive.files.get({ fileId, alt: 'media' });
  return res.data;
}

// ─── Helper: cliente Drive del admin (todos los usuarios usan su carpeta) ─────
async function getAdminDriveClient() {
  const { rows: [admin] } = await pool.query(
    'SELECT id, access_token, refresh_token, token_expiry, drive_folder_id FROM sync_users WHERE is_admin=true LIMIT 1'
  );
  if (!admin) throw new Error('No hay ningún admin configurado');
  if (!admin.drive_folder_id) throw new Error('El admin no ha configurado la carpeta de Drive en Configuración → Sincronización');
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.SERVER_URL || 'http://localhost:3001'}/auth/google/callback`
  );
  oauth2Client.setCredentials({
    access_token:  admin.access_token,
    refresh_token: admin.refresh_token,
    expiry_date:   admin.token_expiry ? Number(admin.token_expiry) : undefined,
  });
  if (admin.token_expiry && Date.now() > Number(admin.token_expiry) - 5 * 60 * 1000) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);
      await pool.query(
        'UPDATE sync_users SET access_token=$1, token_expiry=$2 WHERE id=$3',
        [credentials.access_token, credentials.expiry_date, admin.id]
      );
    } catch (e) {
      console.warn('[Sync] No se pudo refrescar token admin:', e.message);
    }
  }
  return { auth: oauth2Client, folderId: admin.drive_folder_id };
}

// ─── Helper: importar/actualizar canción desde datos de Drive ────────────────
async function importSongFromData(songData, driveFileId) {
  if (!songData?.title || !Array.isArray(songData.slides)) return null;
  const { rows: existing } = await pool.query(
    'SELECT id FROM songs WHERE drive_file_id=$1', [driveFileId]
  );
  if (existing.length) {
    const songId = existing[0].id;
    await pool.query(
      `UPDATE songs SET title=$1, author=$2, copyright=$3, ccli=$4, song_key=$5, tags=$6,
       drive_file_id=$7, drive_synced_at=NOW(), updated_at=NOW() WHERE id=$8`,
      [songData.title, songData.author || null, songData.copyright || null,
       songData.ccli || null, songData.song_key || null, songData.tags || [], driveFileId, songId]
    );
    await pool.query('DELETE FROM song_slides WHERE song_id=$1', [songId]);
    for (const [idx, slide] of songData.slides.entries()) {
      await pool.query('INSERT INTO song_slides (song_id,label,content,position) VALUES ($1,$2,$3,$4)',
        [songId, slide.label || '', slide.content || '', slide.position ?? idx]);
    }
    return { action: 'updated', id: songId };
  } else {
    const { rows: [newSong] } = await pool.query(
      `INSERT INTO songs (title,author,copyright,ccli,song_key,tags,drive_file_id,drive_synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING id`,
      [songData.title, songData.author || null, songData.copyright || null,
       songData.ccli || null, songData.song_key || null, songData.tags || [], driveFileId]
    );
    for (const [idx, slide] of songData.slides.entries()) {
      await pool.query('INSERT INTO song_slides (song_id,label,content,position) VALUES ($1,$2,$3,$4)',
        [newSong.id, slide.label || '', slide.content || '', slide.position ?? idx]);
    }
    return { action: 'created', id: newSong.id };
  }
}

// ─── GET /sync/status ────────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const { rows: [user] } = await pool.query(
      'SELECT id, is_admin, can_push, can_push_all, drive_folder_id, last_sync_at FROM sync_users WHERE id=$1',
      [req.user.userId]
    );
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const { rows: [pending] } = await pool.query(`
      SELECT COUNT(*) FROM songs
      WHERE organization_id = $1
        AND (drive_file_id IS NULL
         OR updated_at > COALESCE(drive_synced_at, '1970-01-01'))
    `, [req.user.orgId]);

    const { rows: [adminRow] } = await pool.query(
      'SELECT drive_folder_id FROM sync_users WHERE is_admin=true LIMIT 1'
    );
    res.json({
      user,
      pendingCount: parseInt(pending.count, 10),
      configured: !!(adminRow?.drive_folder_id),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /sync/config — guardar carpeta de Drive ──────────────────────────
router.patch('/config', async (req, res) => {
  const { drive_folder_id } = req.body;
  try {
    if (drive_folder_id !== undefined) {
      if (!req.user.isAdmin) return res.status(403).json({ error: 'Solo el admin puede cambiar la carpeta de Drive' });
      await pool.query('UPDATE sync_users SET drive_folder_id=$1, updated_at=NOW() WHERE id=$2',
        [drive_folder_id, req.user.userId]);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /sync/smart — sincronización bidireccional (gana el más reciente) ──
router.post('/smart', async (req, res) => {
  if (!req.user.canPush && !req.user.isAdmin) {
    return res.status(403).json({ error: 'Sin permiso para sincronizar. Solicita acceso al admin.' });
  }
  try {
    const { auth, folderId } = await getAdminDriveClient();
    const drive = google.drive({ version: 'v3', auth });

    // Obtener todas las canciones locales con slides
    const { rows: localSongs } = await pool.query(`
      SELECT s.id, s.title, s.author, s.copyright, s.ccli, s.song_key, s.tags,
             s.updated_at, s.drive_file_id, s.drive_synced_at,
             COALESCE(json_agg(ss ORDER BY ss.position) FILTER (WHERE ss.id IS NOT NULL), '[]'::json) AS slides
      FROM songs s LEFT JOIN song_slides ss ON ss.song_id=s.id
      WHERE s.organization_id = $1
      GROUP BY s.id
    `, [req.user.orgId]);;

    // Obtener archivos de Drive
    const driveFiles = await getDriveFiles(drive, folderId);
    const driveByFileId = {};
    const driveByName   = {};
    for (const f of driveFiles) {
      driveByFileId[f.id]   = f;
      driveByName[f.name]   = f;
    }

    let uploadedCount = 0, downloadedCount = 0, skippedCount = 0;
    const processedDriveIds = new Set();

    for (const song of localSongs) {
      const localTime = song.updated_at ? new Date(song.updated_at) : new Date(0);
      const fileName  = `song_${song.id}.json`;
      const driveFile = song.drive_file_id ? driveByFileId[song.drive_file_id] : driveByName[fileName];

      if (!driveFile) {
        // No existe en Drive → subir
        const uploaded = await uploadSongToDrive(drive, song, folderId, null);
        await pool.query('UPDATE songs SET drive_file_id=$1, drive_synced_at=NOW() WHERE id=$2',
          [uploaded.id, song.id]);
        uploadedCount++;
        processedDriveIds.add(uploaded.id);
        continue;
      }

      processedDriveIds.add(driveFile.id);
      const driveTime = new Date(driveFile.modifiedTime);
      const syncedAt  = song.drive_synced_at ? new Date(song.drive_synced_at) : new Date(0);

      // Sin cambios en ningún lado desde el último sync
      if (localTime <= syncedAt && driveTime <= syncedAt) { skippedCount++; continue; }

      if (driveTime > localTime) {
        // Drive es más reciente → descargar y actualizar local
        let songData;
        try {
          songData = await downloadDriveFile(drive, driveFile.id);
          if (typeof songData === 'string') songData = JSON.parse(songData);
        } catch { skippedCount++; continue; }

        await pool.query(
          `UPDATE songs SET title=$1, author=$2, copyright=$3, ccli=$4, song_key=$5, tags=$6,
           drive_file_id=$7, drive_synced_at=NOW(), updated_at=NOW() WHERE id=$8`,
          [songData.title, songData.author || null, songData.copyright || null,
           songData.ccli || null, songData.song_key || null, songData.tags || [],
           driveFile.id, song.id]
        );
        await pool.query('DELETE FROM song_slides WHERE song_id=$1', [song.id]);
        for (const [idx, slide] of (songData.slides || []).entries()) {
          await pool.query('INSERT INTO song_slides (song_id,label,content,position) VALUES ($1,$2,$3,$4)',
            [song.id, slide.label || '', slide.content || '', slide.position ?? idx]);
        }
        downloadedCount++;
      } else {
        // Local es más reciente → subir a Drive
        await uploadSongToDrive(drive, song, folderId, driveFile.id);
        await pool.query('UPDATE songs SET drive_file_id=$1, drive_synced_at=NOW() WHERE id=$2',
          [driveFile.id, song.id]);
        uploadedCount++;
      }
    }

    // Canciones en Drive que no existen localmente → descargar
    for (const driveFile of driveFiles) {
      if (processedDriveIds.has(driveFile.id)) continue;
      let songData;
      try {
        songData = await downloadDriveFile(drive, driveFile.id);
        if (typeof songData === 'string') songData = JSON.parse(songData);
      } catch { continue; }
      const result = await importSongFromData(songData, driveFile.id);
      if (result) downloadedCount++;
    }

    await pool.query('UPDATE sync_users SET last_sync_at=NOW() WHERE id=$1', [req.user.userId]);
    res.json({ ok: true, uploaded: uploadedCount, downloaded: downloadedCount, skipped: skippedCount });
  } catch (err) {
    console.error('[Sync] Error en smart sync:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /sync/pull — descargar canciones nuevas/actualizadas desde Drive ───
// (mantenido por compatibilidad; preferir /smart)
router.post('/pull', async (req, res) => {
  try {
    const { auth, folderId } = await getAdminDriveClient();
    const drive = google.drive({ version: 'v3', auth });

    const driveFiles = await getDriveFiles(drive, folderId);

    let created = 0, updated = 0, skipped = 0;

    for (const file of driveFiles) {
      // Verificar si existe localmente por drive_file_id
      const { rows: existing } = await pool.query(
        'SELECT id, updated_at, drive_synced_at FROM songs WHERE drive_file_id=$1 AND organization_id=$2',
        [file.id, req.user.orgId]
      );

      const driveModified = new Date(file.modifiedTime);
      const localSynced   = existing[0]?.drive_synced_at ? new Date(existing[0].drive_synced_at) : null;

      if (existing.length && localSynced && driveModified <= localSynced) {
        skipped++;
        continue; // no hay cambios
      }

      // Descargar y parsear
      let songData;
      try {
        songData = await downloadDriveFile(drive, file.id);
        if (typeof songData === 'string') songData = JSON.parse(songData);
      } catch { skipped++; continue; }

      if (!songData?.title || !songData?.slides) { skipped++; continue; }

      if (existing.length) {
        // Actualizar canción existente
        const songId = existing[0].id;
        await pool.query(
          `UPDATE songs SET title=$1, author=$2, copyright=$3, ccli=$4, song_key=$5, tags=$6,
           drive_synced_at=NOW(), updated_at=NOW() WHERE id=$7`,
          [songData.title, songData.author || null, songData.copyright || null,
           songData.ccli || null, songData.song_key || null,
           songData.tags || [], songId]
        );
        // Reemplazar slides
        await pool.query('DELETE FROM song_slides WHERE song_id=$1', [songId]);
        for (const [idx, slide] of (songData.slides || []).entries()) {
          await pool.query(
            'INSERT INTO song_slides (song_id, label, content, position) VALUES ($1,$2,$3,$4)',
            [songId, slide.label || '', slide.content || '', slide.position ?? idx]
          );
        }
        updated++;
      } else {
        // Crear nueva canción
        const { rows: [newSong] } = await pool.query(
          `INSERT INTO songs (title, author, copyright, ccli, song_key, tags, drive_file_id, drive_synced_at, organization_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),$8) RETURNING id`,
          [songData.title, songData.author || null, songData.copyright || null,
           songData.ccli || null, songData.song_key || null,
           songData.tags || [], file.id, req.user.orgId]
        );
        for (const [idx, slide] of (songData.slides || []).entries()) {
          await pool.query(
            'INSERT INTO song_slides (song_id, label, content, position) VALUES ($1,$2,$3,$4)',
            [newSong.id, slide.label || '', slide.content || '', slide.position ?? idx]
          );
        }
        created++;
      }
    }

    // Actualizar last_sync_at del usuario
    await pool.query('UPDATE sync_users SET last_sync_at=NOW() WHERE id=$1', [req.user.userId]);

    res.json({ ok: true, created, updated, skipped });
  } catch (err) {
    console.error('[Sync] Error en pull:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /sync/push — subir canciones modificadas desde último sync ─────────
router.post('/push', async (req, res) => {
  if (!req.user.canPush && !req.user.isAdmin) {
    return res.status(403).json({ error: 'Sin permiso para subir canciones. Solicita acceso al admin.' });
  }
  try {
    // Canciones sin subir o modificadas desde último sync
    const { rows: songsToSync } = await pool.query(`
      SELECT s.id, s.title, s.author, s.copyright, s.ccli, s.song_key, s.tags, s.updated_at, s.drive_file_id,
             COALESCE(json_agg(ss ORDER BY ss.position) FILTER (WHERE ss.id IS NOT NULL), '[]'::json) AS slides
      FROM songs s
      LEFT JOIN song_slides ss ON ss.song_id = s.id
      WHERE s.drive_file_id IS NULL
         OR s.updated_at > COALESCE(s.drive_synced_at, '1970-01-01')
      GROUP BY s.id
    `);

    if (!songsToSync.length) return res.json({ ok: true, pushed: 0, message: 'No hay cambios que sincronizar' });

    const { auth, folderId } = await getAdminDriveClient();
    const drive = google.drive({ version: 'v3', auth });

    let pushed = 0;
    for (const song of songsToSync) {
      const driveFile = await uploadSongToDrive(drive, song, folderId, song.drive_file_id || null);
      await pool.query(
        'UPDATE songs SET drive_file_id=$1, drive_synced_at=NOW() WHERE id=$2',
        [driveFile.id, song.id]
      );
      pushed++;
    }

    await pool.query('UPDATE sync_users SET last_sync_at=NOW() WHERE id=$1', [req.user.userId]);
    res.json({ ok: true, pushed });
  } catch (err) {
    console.error('[Sync] Error en push:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /sync/replace-all — reemplazar toda la biblioteca en Drive ────────
// Requiere can_push_all (solo admin puede otorgarlo)
router.post('/replace-all', async (req, res) => {
  const { rows: [user] } = await pool.query(
    'SELECT is_admin, can_push_all FROM sync_users WHERE id=$1',
    [req.user.userId]
  );
  if (!user?.is_admin && !user?.can_push_all) {
    return res.status(403).json({ error: 'Operación no autorizada. Solo el admin puede reemplazar toda la biblioteca en la nube.' });
  }
  try {
    const { auth, folderId } = await getAdminDriveClient();
    const drive = google.drive({ version: 'v3', auth });

    // Obtener todas las canciones locales con sus slides
    const { rows: allSongs } = await pool.query(`
      SELECT s.id, s.title, s.author, s.copyright, s.ccli, s.song_key, s.tags, s.updated_at, s.drive_file_id,
             COALESCE(json_agg(ss ORDER BY ss.position) FILTER (WHERE ss.id IS NOT NULL), '[]'::json) AS slides
      FROM songs s
      LEFT JOIN song_slides ss ON ss.song_id = s.id
      GROUP BY s.id
    `);

    // Listar archivos actuales en Drive para saber cuáles reemplazar vs crear
    const existingDriveFiles = await getDriveFiles(drive, folderId);
    const driveFileMap = {};
    for (const f of existingDriveFiles) driveFileMap[f.name] = f.id;

    let pushed = 0;
    for (const song of allSongs) {
      const fileName = `song_${song.id}.json`;
      const existingId = song.drive_file_id || driveFileMap[fileName] || null;
      const driveFile = await uploadSongToDrive(drive, song, folderId, existingId);
      await pool.query(
        'UPDATE songs SET drive_file_id=$1, drive_synced_at=NOW() WHERE id=$2',
        [driveFile.id, song.id]
      );
      pushed++;
    }

    await pool.query('UPDATE sync_users SET last_sync_at=NOW() WHERE id=$1', [req.user.userId]);
    res.json({ ok: true, pushed, total: allSongs.length });
  } catch (err) {
    console.error('[Sync] Error en push-all:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /sync/backup/drive — backup timestamped en Drive (con progreso SSE) ─
router.post('/backup/drive', async (req, res) => {
  if (!req.user.canPush && !req.user.isAdmin) {
    return res.status(403).json({ error: 'Sin permiso para crear backups en Drive.' });
  }
  try {
    const { auth, folderId } = await getAdminDriveClient();
    const drive = google.drive({ version: 'v3', auth });

    const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const name = `backup_${ts}`;

    // SSE: stream de progreso al cliente
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // desactiva buffering en nginx
    res.flushHeaders();
    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    const { data: folder } = await drive.files.create({
      requestBody: { name, parents: [folderId], mimeType: 'application/vnd.google-apps.folder' },
      fields: 'id',
    });

    const { rows: allSongs } = await pool.query(`
      SELECT s.id, s.title, s.author, s.copyright, s.ccli, s.song_key, s.tags, s.updated_at,
             COALESCE(json_agg(ss ORDER BY ss.position) FILTER (WHERE ss.id IS NOT NULL), '[]'::json) AS slides
      FROM songs s LEFT JOIN song_slides ss ON ss.song_id=s.id GROUP BY s.id
    `);

    send({ status: 'start', total: allSongs.length });

    // Subir en paralelo con concurrencia máxima de 5
    const CONCURRENCY = 5;
    let completed = 0;
    for (let i = 0; i < allSongs.length; i += CONCURRENCY) {
      const batch = allSongs.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (song) => {
        await uploadSongToDrive(drive, song, folder.id, null);
        completed++;
        send({ status: 'progress', current: completed, total: allSongs.length, title: song.title });
      }));
    }

    send({ status: 'done', backupFolder: name, total: allSongs.length });
    res.end();
  } catch (err) {
    console.error('[Sync] Error en backup/drive:', err.message);
    // Si los headers SSE ya se enviaron, informar por stream; si no, con JSON normal
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ status: 'error', error: err.message })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// ─── POST /sync/backup/local — exportar todas las canciones como JSON ────────
router.post('/backup/local', async (req, res) => {
  try {
    const { rows: allSongs } = await pool.query(`
      SELECT s.id, s.title, s.author, s.copyright, s.ccli, s.song_key, s.tags, s.updated_at,
             COALESCE(json_agg(ss ORDER BY ss.position) FILTER (WHERE ss.id IS NOT NULL), '[]'::json) AS slides
      FROM songs s LEFT JOIN song_slides ss ON ss.song_id=s.id
      GROUP BY s.id ORDER BY s.title
    `);

    const backup = {
      aio_backup_version: 1,
      created_at: new Date().toISOString(),
      total: allSongs.length,
      songs: allSongs.map(s => ({
        id:         s.id,
        title:      s.title,
        author:     s.author,
        copyright:  s.copyright,
        ccli:       s.ccli,
        song_key:   s.song_key,
        tags:       s.tags,
        updated_at: s.updated_at,
        slides: (s.slides || []).filter(Boolean).map(sl => ({
          label: sl.label, content: sl.content, position: sl.position,
        })),
      })),
    };

    const filename = `aio_backup_${new Date().toISOString().slice(0, 10)}.json`;
    // Pretty-print y escapar U+2028/U+2029 para evitar advertencias de terminadores inusuales
    const json = JSON.stringify(backup, null, 2)
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', Buffer.byteLength(json, 'utf8'));
    res.send(json);
  } catch (err) {
    console.error('[Sync] Error en backup/local:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /sync/backup/restore — restaurar biblioteca desde un archivo backup ─
// El cliente envía el JSON del backup en el body. Se hace upsert por título.
router.post('/backup/restore', async (req, res) => {
  const backup = req.body;
  if (!backup?.aio_backup_version || !Array.isArray(backup.songs)) {
    return res.status(400).json({ error: 'Archivo de backup inválido o incompatible' });
  }
  let created = 0, updated = 0, skipped = 0;
  try {
    for (const song of backup.songs) {
      if (!song?.title || !Array.isArray(song.slides)) { skipped++; continue; }

      // Buscar por título (case-insensitive) para funcionar incluso en otra instancia
      const { rows: existing } = await pool.query(
        'SELECT id FROM songs WHERE lower(title) = lower($1) LIMIT 1', [song.title]
      );

      if (existing.length) {
        const songId = existing[0].id;
        await pool.query(
          `UPDATE songs SET author=$1, copyright=$2, ccli=$3, song_key=$4, tags=$5, updated_at=NOW()
           WHERE id=$6`,
          [song.author || null, song.copyright || null, song.ccli || null,
           song.song_key || null, song.tags || [], songId]
        );
        await pool.query('DELETE FROM song_slides WHERE song_id=$1', [songId]);
        for (const [idx, slide] of song.slides.entries()) {
          await pool.query(
            'INSERT INTO song_slides (song_id, label, content, position) VALUES ($1,$2,$3,$4)',
            [songId, slide.label || '', slide.content || '', slide.position ?? idx]
          );
        }
        updated++;
      } else {
        const { rows: [newSong] } = await pool.query(
          `INSERT INTO songs (title, author, copyright, ccli, song_key, tags)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [song.title, song.author || null, song.copyright || null,
           song.ccli || null, song.song_key || null, song.tags || []]
        );
        for (const [idx, slide] of song.slides.entries()) {
          await pool.query(
            'INSERT INTO song_slides (song_id, label, content, position) VALUES ($1,$2,$3,$4)',
            [newSong.id, slide.label || '', slide.content || '', slide.position ?? idx]
          );
        }
        created++;
      }
    }
    res.json({ ok: true, created, updated, skipped, total: backup.songs.length });
  } catch (err) {
    console.error('[Sync] Error en restore:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /sync/users — listar usuarios (solo admin) ──────────────────────────
router.get('/users', async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Solo el admin puede ver usuarios' });
  const { rows } = await pool.query(
    `SELECT id, email, display_name, avatar_url, is_admin, can_push, can_push_all,
            last_sync_at, created_at FROM sync_users ORDER BY created_at`
  );
  res.json(rows);
});

// ─── PATCH /sync/users/:id — actualizar permisos (solo admin) ────────────────
router.patch('/users/:id', async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Solo el admin puede cambiar permisos' });
  const { can_push, can_push_all, is_admin } = req.body;
  try {
    const fields = [], vals = [];
    let i = 1;
    if (can_push     !== undefined) { fields.push(`can_push=$${i++}`);     vals.push(can_push); }
    if (can_push_all !== undefined) { fields.push(`can_push_all=$${i++}`); vals.push(can_push_all); }
    if (is_admin     !== undefined) { fields.push(`is_admin=$${i++}`);     vals.push(is_admin); }
    if (!fields.length) return res.json({ ok: true });
    vals.push(req.params.id);
    await pool.query(`UPDATE sync_users SET ${fields.join(', ')}, updated_at=NOW() WHERE id=$${i}`, vals);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /sync/folder — buscar carpeta de Drive por nombre ──────────────────
router.get('/folder', async (req, res) => {
  const { name } = req.query;
  try {
    const auth  = await getAuthenticatedClient(req.user.userId);
    const drive = google.drive({ version: 'v3', auth });
    const resp  = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and trashed=false${name ? ` and name contains '${name.replace(/'/g, "\\'")}'` : ''}`,
      fields: 'files(id, name)',
      pageSize: 20,
    });
    res.json(resp.data.files || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /sync/invitations — listar invitaciones (solo admin) ─────────────────
router.get('/invitations', async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Solo el admin puede ver invitaciones' });
  try {
    const { rows } = await pool.query(`
      SELECT i.id, i.code, i.label, i.email, i.can_push, i.can_push_all,
             i.expires_at, i.used_at, i.created_at,
             u.display_name AS used_by_name, u.email AS used_by_email
      FROM sync_invitations i
      LEFT JOIN sync_users u ON u.id = i.used_by
      ORDER BY i.created_at DESC
    `);
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    res.json(rows.map(r => ({ ...r, link: `${clientUrl}/?invite=${r.code}` })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /sync/invitations — crear invitación (solo admin) ──────────────────
router.post('/invitations', async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Solo el admin puede crear invitaciones' });
  const { label, email, can_push = false, can_push_all = false, expires_in_days } = req.body;
  try {
    // Generar código único de 10 chars alfanuméricos
    const code = Array.from({ length: 10 }, () =>
      'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]
    ).join('');
    const expiresAt = expires_in_days
      ? new Date(Date.now() + expires_in_days * 86400000)
      : null;
    const { rows: [inv] } = await pool.query(
      `INSERT INTO sync_invitations (code, label, email, can_push, can_push_all, created_by, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, code, label, email, can_push, can_push_all, expires_at, created_at`,
      [code, label || null, email || null, can_push, can_push_all, req.user.userId, expiresAt]
    );
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const link = `${clientUrl}/?invite=${inv.code}`;
    // Enviar email si hay dirección y SMTP configurado
    if (inv.email) {
      sendInviteEmail({
        to         : inv.email,
        label      : inv.label,
        link,
        expiresAt  : inv.expires_at,
        canPush    : inv.can_push,
        canPushAll : inv.can_push_all,
      }).catch(e => console.warn('[mailer] No se pudo enviar invitación:', e.message));
    }
    res.json({ ...inv, link });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── DELETE /sync/invitations/:id — revocar invitación (solo admin) ──────────
router.delete('/invitations/:id', async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Solo el admin puede revocar invitaciones' });
  try {
    await pool.query('DELETE FROM sync_invitations WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
