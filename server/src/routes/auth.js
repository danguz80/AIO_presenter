const express = require('express');
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const router = express.Router();

const CLIENT_URL     = process.env.CLIENT_URL     || 'http://localhost:5173';
const JWT_SECRET     = process.env.JWT_SECRET     || 'aio-presenter-secret-change-me';
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL     || null;

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.SERVER_URL || 'http://localhost:3001'}/auth/google/callback`
  );
}

/** GET /auth/google/url — devuelve la URL de autorización de Google */
router.get('/google/url', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(503).json({ error: 'Google OAuth no configurado. Agrega GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET al .env' });
  }
  const { invite } = req.query; // código de invitación opcional
  const oauth2Client = getOAuth2Client();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      // Solo el primer usuario (admin) necesita acceso a Drive
      ...(invite ? [] : ['https://www.googleapis.com/auth/drive.file']),
    ],
    prompt: 'consent',
    state: invite ? `invite:${invite}` : undefined,
  });
  res.json({ url });
});

/** GET /auth/google/callback — maneja el redirect de Google tras auth */
router.get('/google/callback', async (req, res) => {
  const { code, error, state } = req.query;
  if (error) return res.redirect(`${CLIENT_URL}/?sync_error=${encodeURIComponent(error)}`);
  if (!code)  return res.redirect(`${CLIENT_URL}/?sync_error=no_code`);

  // Extraer código de invitación del state
  const inviteCode = state?.startsWith('invite:') ? state.slice(7) : null;

  try {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Obtener info del usuario
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    // Verificar si es el primer usuario (→ admin)
    const { rows: countRows } = await pool.query('SELECT COUNT(*) FROM sync_users');
    const isFirst = parseInt(countRows[0].count, 10) === 0;
    const isAdmin = isFirst || (ADMIN_EMAIL && ADMIN_EMAIL === userInfo.email);

    // Validar invitación (si viene con código)
    let invitePerms = { can_push: false, can_push_all: false };
    let inviteId    = null;
    if (inviteCode && !isFirst) {
      const { rows: invRows } = await pool.query(
        `SELECT id, email, can_push, can_push_all, expires_at, used_by
         FROM sync_invitations WHERE code = $1`, [inviteCode]
      );
      if (!invRows.length) {
        return res.redirect(`${CLIENT_URL}/?sync_error=${encodeURIComponent('Código de invitación inválido')}`);
      }
      const inv = invRows[0];
      if (inv.used_by) {
        return res.redirect(`${CLIENT_URL}/?sync_error=${encodeURIComponent('Esta invitación ya fue utilizada')}`);
      }
      if (inv.expires_at && new Date(inv.expires_at) < new Date()) {
        return res.redirect(`${CLIENT_URL}/?sync_error=${encodeURIComponent('La invitación ha expirado')}`);
      }
      if (inv.email && inv.email.toLowerCase() !== userInfo.email.toLowerCase()) {
        return res.redirect(`${CLIENT_URL}/?sync_error=${encodeURIComponent(`Esta invitación es solo para ${inv.email}`)}`);
      }
      invitePerms = { can_push: inv.can_push, can_push_all: inv.can_push_all };
      inviteId    = inv.id;
    } else if (!inviteCode && !isFirst) {
      // No es admin ni tiene invitación → verificar si ya existe
      const { rows: existingUser } = await pool.query(
        'SELECT id FROM sync_users WHERE google_id = $1', [userInfo.id]
      );
      if (!existingUser.length) {
        return res.redirect(`${CLIENT_URL}/?sync_error=${encodeURIComponent('Necesitas un código de invitación para unirte')}`);
      }
    }

    // Upsert usuario
    const { rows } = await pool.query(`
      INSERT INTO sync_users (google_id, email, display_name, avatar_url, is_admin, can_push, can_push_all, access_token, refresh_token, token_expiry)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (google_id) DO UPDATE SET
        email         = EXCLUDED.email,
        display_name  = EXCLUDED.display_name,
        avatar_url    = EXCLUDED.avatar_url,
        is_admin      = sync_users.is_admin OR EXCLUDED.is_admin,
        can_push      = sync_users.can_push OR EXCLUDED.can_push,
        can_push_all  = sync_users.can_push_all OR EXCLUDED.can_push_all,
        access_token  = EXCLUDED.access_token,
        refresh_token = COALESCE(EXCLUDED.refresh_token, sync_users.refresh_token),
        token_expiry  = EXCLUDED.token_expiry,
        updated_at    = NOW()
      RETURNING *
    `, [
      userInfo.id,
      userInfo.email,
      userInfo.name,
      userInfo.picture,
      isAdmin,
      isAdmin || invitePerms.can_push,
      isAdmin || invitePerms.can_push_all,
      tokens.access_token,
      tokens.refresh_token || null,
      tokens.expiry_date || null,
    ]);

    // Marcar invitación como usada
    if (inviteId) {
      await pool.query(
        'UPDATE sync_invitations SET used_by=$1, used_at=NOW() WHERE id=$2',
        [rows[0].id, inviteId]
      );
    }

    const user = rows[0];
    const jwtToken = jwt.sign(
      { userId: user.id, email: user.email, isAdmin: user.is_admin, canPush: user.can_push },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.redirect(`${CLIENT_URL}/?sync_token=${jwtToken}`);
  } catch (err) {
    console.error('[Auth] Error en callback OAuth:', err.message);
    res.redirect(`${CLIENT_URL}/?sync_error=${encodeURIComponent(err.message)}`);
  }
});

/** GET /auth/me — info del usuario actual */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, email, display_name, avatar_url, is_admin, can_push, can_push_all, sync_direction, drive_folder_id FROM sync_users WHERE id = $1',
      [req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /auth/logout — instrucción al cliente para borrar token */
router.post('/logout', (req, res) => {
  res.json({ ok: true });
});

// ─── Middleware de autenticación JWT ────────────────────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

module.exports = router;
module.exports.requireAuth = requireAuth;
