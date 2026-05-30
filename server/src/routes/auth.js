const express    = require('express');
const { google } = require('googleapis');
const jwt        = require('jsonwebtoken');
const { Resend } = require('resend');
const pool       = require('../config/database');

const router = express.Router();

const CLIENT_URL     = process.env.CLIENT_URL     || 'http://localhost:5173';
const JWT_SECRET     = process.env.JWT_SECRET     || 'aio-presenter-secret-change-me';
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL     || null;

function getResend() {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

async function notifyAdminInviteAccepted({ orgId, newUserName, newUserEmail, newUserAvatar }) {
  const resend = getResend();
  if (!resend) return;
  try {
    const { rows } = await pool.query(
      'SELECT email, display_name FROM sync_users WHERE organization_id=$1 AND is_admin=true LIMIT 1',
      [orgId]
    );
    if (!rows.length) return;
    const admin = rows[0];
    const from = process.env.RESEND_FROM || `AIO Presenter <${process.env.ADMIN_EMAIL || 'no-reply@aiopresenter.com'}>`;
    await resend.emails.send({
      from,
      to     : admin.email,
      subject: `${newUserName || newUserEmail} aceptó tu invitación a AIO Presenter`,
      html   : `
        <div style="font-family:sans-serif;max-width:480px;margin:auto">
          ${newUserAvatar ? `<img src="${newUserAvatar}" alt="" style="width:48px;height:48px;border-radius:50%;margin-bottom:12px">` : ''}
          <h2 style="margin-bottom:8px">¡Nueva persona en tu equipo!</h2>
          <p><strong>${newUserName || newUserEmail}</strong> (${newUserEmail}) acaba de unirse a AIO Presenter usando tu invitación.</p>
          <p style="color:#888;font-size:13px">Puedes gestionar sus permisos desde Configuración → Sincronización → Gestionar usuarios.</p>
        </div>`,
      text: `${newUserName || newUserEmail} (${newUserEmail}) aceptó tu invitación a AIO Presenter.`,
    });
  } catch (e) {
    console.error('[Auth] Error notificando admin:', e.message);
  }
}

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
  console.log('[Auth] Callback recibido — redirect_uri:', `${process.env.SERVER_URL || 'http://localhost:3001'}/auth/google/callback`);
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

    // Verificar si es el primer usuario global (→ admin de nueva org)
    const { rows: countRows } = await pool.query('SELECT COUNT(*) FROM sync_users');
    const isFirstGlobal = parseInt(countRows[0].count, 10) === 0;
    const isAdmin = isFirstGlobal || (ADMIN_EMAIL && ADMIN_EMAIL === userInfo.email);

    // ─── Determinar organización ───────────────────────────────────────────
    let orgId = null;

    if (inviteCode) {
      // Validar invitación y obtener orgId
      const { rows: invRows } = await pool.query(
        `SELECT id, email, display_name, instruments, can_push, can_push_all, can_pull, expires_at, used_by, organization_id
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
      orgId = inv.organization_id;

      // Upsert usuario con permisos de la invitación
      const { rows } = await pool.query(`
        INSERT INTO sync_users (google_id, email, display_name, avatar_url, is_admin, can_push, can_push_all, can_pull, organization_id, access_token, refresh_token, token_expiry)
        VALUES ($1, $2, $3, $4, false, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (google_id) DO UPDATE SET
          email         = EXCLUDED.email,
          display_name  = EXCLUDED.display_name,
          avatar_url    = EXCLUDED.avatar_url,
          can_push      = sync_users.can_push OR EXCLUDED.can_push,
          can_push_all  = sync_users.can_push_all OR EXCLUDED.can_push_all,
          can_pull      = sync_users.can_pull OR EXCLUDED.can_pull,
          organization_id = COALESCE(sync_users.organization_id, EXCLUDED.organization_id),
          access_token  = EXCLUDED.access_token,
          refresh_token = COALESCE(EXCLUDED.refresh_token, sync_users.refresh_token),
          token_expiry  = EXCLUDED.token_expiry,
          updated_at    = NOW()
        RETURNING *
      `, [
        userInfo.id, userInfo.email, userInfo.name, userInfo.picture,
        inv.can_push, inv.can_push_all, inv.can_pull ?? true, orgId,
        tokens.access_token, tokens.refresh_token || null, tokens.expiry_date || null,
      ]);

      await pool.query(
        'UPDATE sync_invitations SET used_by=$1, used_at=NOW() WHERE id=$2',
        [rows[0].id, inv.id]
      );
      // Copiar instrumentos pre-configurados de la invitación al usuario
      if (inv.instruments?.length) {
        await pool.query(
          `UPDATE sync_users SET instruments = $1 WHERE id = $2 AND (instruments IS NULL OR instruments = '{}')`,
          [inv.instruments, rows[0].id]
        );
      }
      // Registrar membresía en user_organizations
      await pool.query(
        `INSERT INTO user_organizations (user_id, organization_id, role)
         VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
        [rows[0].id, orgId]
      );

      // Notificar al admin que la invitación fue aceptada
      notifyAdminInviteAccepted({
        orgId,
        newUserName  : userInfo.name,
        newUserEmail : userInfo.email,
        newUserAvatar: userInfo.picture,
      }).catch(() => {});

      const user = rows[0];
      const jwtToken = jwt.sign(
        { userId: user.id, orgId: user.organization_id, email: user.email, isAdmin: false, canPush: user.can_push, canPull: user.can_pull ?? true },
        JWT_SECRET, { expiresIn: '30d' }
      );
      return res.redirect(`${CLIENT_URL}/?sync_token=${jwtToken}`);
    }

    // Sin invitación: admin que crea o entra a su org
    // Buscar si el usuario ya existe
    const { rows: existingRows } = await pool.query(
      'SELECT * FROM sync_users WHERE google_id = $1', [userInfo.id]
    );

    if (existingRows.length > 0 && existingRows[0].organization_id) {
      // Usuario ya registrado con org — actualizar tokens y devolver JWT
      orgId = existingRows[0].organization_id;
      await pool.query(
        `UPDATE sync_users SET access_token=$1, refresh_token=COALESCE($2, refresh_token),
         token_expiry=$3, updated_at=NOW() WHERE id=$4`,
        [tokens.access_token, tokens.refresh_token || null, tokens.expiry_date || null, existingRows[0].id]
      );
      // Asegurar membresía en user_organizations
      await pool.query(
        `INSERT INTO user_organizations (user_id, organization_id, role)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [existingRows[0].id, orgId, existingRows[0].is_admin ? 'admin' : 'member']
      );
      const user = existingRows[0];
      const jwtToken = jwt.sign(
        { userId: user.id, orgId, email: user.email, isAdmin: user.is_admin, canPush: user.can_push, canPull: user.can_pull ?? true },
        JWT_SECRET, { expiresIn: '30d' }
      );
      return res.redirect(`${CLIENT_URL}/?sync_token=${jwtToken}`);
    }

    if (!isFirstGlobal && !isAdmin && existingRows.length === 0) {
      return res.redirect(`${CLIENT_URL}/?sync_error=${encodeURIComponent('Necesitas un código de invitación para unirte')}`);
    }

    // Primer usuario o admin: crear nueva organización
    const orgName = userInfo.name ? `Iglesia de ${userInfo.name}` : `Org ${userInfo.email}`;
    const { rows: orgRows } = await pool.query(
      `INSERT INTO organizations (name) VALUES ($1) RETURNING id`,
      [orgName]
    );
    orgId = orgRows[0].id;

    // Migrar todos los datos sin org a esta nueva org (primera vez o usuario existente sin org)
    await pool.query('UPDATE songs  SET organization_id=$1 WHERE organization_id IS NULL', [orgId]);
    await pool.query('UPDATE events SET organization_id=$1 WHERE organization_id IS NULL', [orgId]);

    // Insertar usuario admin de la nueva org
    const { rows: newUserRows } = await pool.query(`
      INSERT INTO sync_users (google_id, email, display_name, avatar_url, is_admin, can_push, can_push_all, organization_id, access_token, refresh_token, token_expiry)
      VALUES ($1, $2, $3, $4, true, true, true, $5, $6, $7, $8)
      ON CONFLICT (google_id) DO UPDATE SET
        email         = EXCLUDED.email,
        display_name  = EXCLUDED.display_name,
        avatar_url    = EXCLUDED.avatar_url,
        is_admin      = TRUE,
        can_push      = TRUE,
        can_push_all  = TRUE,
        organization_id = EXCLUDED.organization_id,
        access_token  = EXCLUDED.access_token,
        refresh_token = COALESCE(EXCLUDED.refresh_token, sync_users.refresh_token),
        token_expiry  = EXCLUDED.token_expiry,
        updated_at    = NOW()
      RETURNING *
    `, [
      userInfo.id, userInfo.email, userInfo.name, userInfo.picture,
      orgId, tokens.access_token, tokens.refresh_token || null, tokens.expiry_date || null,
    ]);

    const user = newUserRows[0];
    // Registrar membresía en user_organizations
    await pool.query(
      `INSERT INTO user_organizations (user_id, organization_id, role)
       VALUES ($1, $2, 'admin') ON CONFLICT DO NOTHING`,
      [user.id, orgId]
    );
    const jwtToken = jwt.sign(
        { userId: user.id, orgId, email: user.email, isAdmin: true, canPush: true, canPull: true },
      JWT_SECRET, { expiresIn: '30d' }
    );
    res.redirect(`${CLIENT_URL}/?sync_token=${jwtToken}`);
  } catch (err) {
    console.error('[Auth] Error en callback OAuth - tipo:', typeof err);
    console.error('[Auth] Error en callback OAuth - valor:', err);
    console.error('[Auth] Error en callback OAuth - mensaje:', err?.message);
    console.error('[Auth] Error en callback OAuth - stack:', err?.stack);
    const errMsg = err?.message || (typeof err === 'string' ? err : JSON.stringify(err)) || 'error_desconocido';
    res.redirect(`${CLIENT_URL}/?sync_error=${encodeURIComponent(errMsg)}`);
  }
});

/** GET /auth/me — info del usuario actual */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, email, display_name, avatar_url, is_admin, can_push, can_push_all, can_pull, sync_direction, drive_folder_id, organization_id, instruments FROM sync_users WHERE id = $1',
      [req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PATCH /auth/me — actualizar perfil del usuario (instrumentos, etc.) */
router.patch('/me', requireAuth, async (req, res) => {
  try {
    const { instruments } = req.body;
    const { rows } = await pool.query(
      `UPDATE sync_users
         SET instruments = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, email, display_name, avatar_url, is_admin, organization_id, instruments`,
      [instruments || [], req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /auth/org/members — todos los miembros de la org actual + invitados pendientes */
router.get('/org/members', requireAuth, async (req, res) => {
  try {
    const { rows: real } = await pool.query(
      `SELECT u.id, u.display_name, u.avatar_url, u.email, u.instruments, uo.role, false AS is_pending, NULL AS invitation_id
         FROM user_organizations uo
         JOIN sync_users u ON u.id = uo.user_id
        WHERE uo.organization_id = $1
        ORDER BY u.display_name ASC`,
      [req.user.orgId]
    );
    // Incluir invitados pendientes solo si el usuario es admin
    if (req.user.isAdmin) {
      // Solo invitaciones sin usar cuyo email NO pertenece ya a un miembro real de la org
      const { rows: pending } = await pool.query(
        `SELECT si.id, si.email, si.display_name, si.instruments, si.expires_at
           FROM sync_invitations si
          WHERE si.organization_id = $1
            AND si.used_at IS NULL
            AND si.expires_at > NOW()
            AND NOT EXISTS (
              SELECT 1 FROM user_organizations uo
              JOIN sync_users u ON u.id = uo.user_id
              WHERE uo.organization_id = si.organization_id
                AND LOWER(u.email) = LOWER(si.email)
            )
          ORDER BY si.created_at DESC`,
        [req.user.orgId]
      );
      const pendingMembers = pending
        .map(inv => ({
          id           : `inv:${inv.id}`,
          display_name : inv.display_name || inv.email,
          avatar_url   : null,
          email        : inv.email,
          instruments  : inv.instruments || [],
          role         : 'invited',
          is_pending   : true,
          invitation_id: inv.id,
        }));
      return res.json([...real, ...pendingMembers]);
    }
    res.json(real);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /auth/org — info de la organización actual */
router.get('/org', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, band_name, spotify_client_id, plan, trial_ends, created_at FROM organizations WHERE id = $1',
      [req.user.orgId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Organización no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PATCH /auth/org — actualizar nombre de banda y/o Spotify Client ID (solo admin) */
router.patch('/org', requireAuth, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Solo admins pueden editar la organización' });
  try {
    const { band_name, spotify_client_id } = req.body;
    const { rows } = await pool.query(
      `UPDATE organizations
          SET band_name = COALESCE($1, band_name),
              spotify_client_id = $2
        WHERE id = $3
       RETURNING id, name, band_name, spotify_client_id`,
      [band_name ?? null, spotify_client_id ?? null, req.user.orgId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Organización no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /auth/logout — instrucción al cliente para borrar token */
router.post('/logout', (req, res) => {
  res.json({ ok: true });
});

// ─── Endpoints multi-organización ───────────────────────────────────────────

/** GET /auth/my-orgs — lista todas las orgs a las que pertenece el usuario */
router.get('/my-orgs', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT o.id, o.name, o.plan, o.created_at, uo.role,
             (o.id = $2) AS is_active
      FROM user_organizations uo
      JOIN organizations o ON o.id = uo.organization_id
      WHERE uo.user_id = $1
      ORDER BY o.created_at ASC
    `, [req.user.userId, req.user.orgId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PATCH /auth/org — renombrar la organización activa (solo admin) */
router.patch('/org', requireAuth, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Solo el admin puede renombrar la organización' });
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Nombre requerido' });
  try {
    await pool.query(
      'UPDATE organizations SET name=$1, updated_at=NOW() WHERE id=$2',
      [name.trim(), req.user.orgId]
    );
    res.json({ ok: true, name: name.trim() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /auth/orgs — crear una nueva organización (solo admin) */
router.post('/orgs', requireAuth, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Solo el admin puede crear organizaciones' });
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Nombre requerido' });
  try {
    const { rows: orgRows } = await pool.query(
      'INSERT INTO organizations (name) VALUES ($1) RETURNING id, name, plan, created_at',
      [name.trim()]
    );
    const org = orgRows[0];
    // Registrar al usuario como admin de la nueva org
    await pool.query(
      'INSERT INTO user_organizations (user_id, organization_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [req.user.userId, org.id, 'admin']
    );
    // Cambiar org activa del usuario a la nueva
    await pool.query(
      'UPDATE sync_users SET organization_id=$1, is_admin=TRUE WHERE id=$2',
      [org.id, req.user.userId]
    );
    const newToken = jwt.sign(
      { userId: req.user.userId, orgId: org.id, email: req.user.email, isAdmin: true, canPush: true, canPull: true },
      JWT_SECRET, { expiresIn: '30d' }
    );
    res.json({ org, token: newToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /auth/switch-org/:orgId — cambiar a otra organización */
router.post('/switch-org/:orgId', requireAuth, async (req, res) => {
  const orgId = parseInt(req.params.orgId, 10);
  if (isNaN(orgId)) return res.status(400).json({ error: 'orgId inválido' });
  try {
    // Verificar que el usuario es miembro de esa org
    const { rows } = await pool.query(
      'SELECT role FROM user_organizations WHERE user_id=$1 AND organization_id=$2',
      [req.user.userId, orgId]
    );
    if (!rows.length) return res.status(403).json({ error: 'No tienes acceso a esa organización' });
    const role = rows[0].role;
    // Actualizar org activa
    await pool.query(
      'UPDATE sync_users SET organization_id=$1, is_admin=$2 WHERE id=$3',
      [orgId, role === 'admin', req.user.userId]
    );
    const newToken = jwt.sign(
      { userId: req.user.userId, orgId, email: req.user.email, isAdmin: role === 'admin', canPush: true, canPull: true },
      JWT_SECRET, { expiresIn: '30d' }
    );
    res.json({ token: newToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /auth/invitations — lista invitaciones pendientes de la org (solo admin) */
router.get('/invitations', requireAuth, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Solo admins' });
  try {
    const { rows } = await pool.query(
      `SELECT id, code, email, display_name, instruments, can_push, can_push_all, created_at, expires_at, used_at, used_by
         FROM sync_invitations
        WHERE organization_id = $1
        ORDER BY created_at DESC`,
      [req.user.orgId]
    );
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    res.json(rows.map(r => ({ ...r, inviteUrl: `${clientUrl}/?invite=${r.code}` })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /auth/invite — crear invitación y enviar email (solo admin) */
router.post('/invite', requireAuth, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Solo admins pueden invitar' });
  const { email, display_name, instruments } = req.body;
  if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: 'Email inválido' });
  }
  const targetEmail = email.trim().toLowerCase();
  const targetName  = display_name?.trim() || null;
  const targetInst  = Array.isArray(instruments) ? instruments : [];
  try {
    // Comprobar si ya es miembro
    const { rows: existing } = await pool.query(
      `SELECT u.id FROM sync_users u
         JOIN user_organizations uo ON uo.user_id = u.id
        WHERE u.email = $1 AND uo.organization_id = $2`,
      [targetEmail, req.user.orgId]
    );
    if (existing.length) return res.status(409).json({ error: 'Ese email ya es miembro de la banda' });

    // Generar código único
    const crypto = require('crypto');
    const code = crypto.randomBytes(20).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 días

    const { rows } = await pool.query(
      `INSERT INTO sync_invitations (code, email, display_name, instruments, organization_id, can_push, can_push_all, expires_at)
       VALUES ($1, $2, $3, $4, $5, true, false, $6)
       RETURNING id, code, email, display_name, instruments, expires_at`,
      [code, targetEmail, targetName, targetInst, req.user.orgId, expiresAt]
    );
    const invitation = rows[0];
    const inviteUrl = `${CLIENT_URL}/?invite=${code}`;

    // Enviar email si Resend está configurado
    const resend = getResend();
    if (resend) {
      const { rows: orgRows } = await pool.query(
        'SELECT name, band_name FROM organizations WHERE id=$1', [req.user.orgId]
      );
      const orgName = orgRows[0]?.band_name || orgRows[0]?.name || 'el equipo';
      const fromDomain = process.env.RESEND_FROM || 'no-reply@aiopresenter.com';
      const greeting = targetName ? `Hola ${targetName.split(' ')[0]},` : '¡Hola!';
      await resend.emails.send({
        from   : `AIO Presenter <${fromDomain}>`,
        to     : targetEmail,
        subject: `Te invitaron a unirte a ${orgName} en AIO Presenter`,
        html   : `
          <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
            <h2 style="margin-bottom:8px">${greeting}</h2>
            <p>Fuiste invitado/a a unirte a <strong>${orgName}</strong> en AIO Presenter, la plataforma de gestión para músicos de iglesia.</p>
            <a href="${inviteUrl}" style="display:inline-block;margin:20px 0;padding:12px 24px;background:#eab308;color:#000;font-weight:bold;border-radius:8px;text-decoration:none">
              Aceptar invitación
            </a>
            <p style="color:#888;font-size:12px">Este enlace expira en 7 días. Si no esperabas esta invitación, puedes ignorarlo.</p>
          </div>`,
        text: `Fuiste invitado/a a unirte a ${orgName} en AIO Presenter. Acepta la invitación en: ${inviteUrl}`,
      });
    }

    res.json({ ok: true, invitation, inviteUrl, emailSent: !!resend });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /auth/invitations/:id — revocar invitación pendiente (solo admin) */
router.delete('/invitations/:id', requireAuth, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Solo admins' });
  try {
    await pool.query(
      'DELETE FROM sync_invitations WHERE id=$1 AND organization_id=$2 AND used_at IS NULL',
      [req.params.id, req.user.orgId]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /auth/members/:id — eliminar miembro activo de la organización (solo admin) */
router.delete('/members/:id', requireAuth, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Solo admins' });
  if (String(req.params.id) === String(req.user.userId)) {
    return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
  }
  try {
    await pool.query(
      'DELETE FROM user_organizations WHERE user_id=$1 AND organization_id=$2',
      [req.params.id, req.user.orgId]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PATCH /auth/invitations/:id — actualizar nombre e instrumentos de invitación pendiente (solo admin) */
router.patch('/invitations/:id', requireAuth, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Solo admins' });
  const { display_name, instruments } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE sync_invitations
          SET display_name = COALESCE($1, display_name),
              instruments  = COALESCE($2, instruments)
        WHERE id = $3 AND organization_id = $4 AND used_at IS NULL
       RETURNING id, email, display_name, instruments, expires_at`,
      [display_name ?? null, instruments ?? null, req.params.id, req.user.orgId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Invitación no encontrada o ya usada' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PATCH /auth/members/:memberId/instruments — admin edita instrumentos de cualquier miembro */
router.patch('/members/:memberId/instruments', requireAuth, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Solo admins pueden editar instrumentos de otros' });
  const memberId = parseInt(req.params.memberId, 10);
  if (isNaN(memberId)) return res.status(400).json({ error: 'memberId inválido' });
  const { instruments } = req.body;
  if (!Array.isArray(instruments)) return res.status(400).json({ error: 'instruments debe ser array' });
  try {
    // Verificar que el miembro pertenece a la misma org
    const { rows: membership } = await pool.query(
      'SELECT 1 FROM user_organizations WHERE user_id=$1 AND organization_id=$2',
      [memberId, req.user.orgId]
    );
    if (!membership.length) return res.status(403).json({ error: 'Ese usuario no pertenece a tu organización' });

    const { rows } = await pool.query(
      `UPDATE sync_users SET instruments=$1, updated_at=NOW()
       WHERE id=$2 RETURNING id, display_name, instruments`,
      [instruments, memberId]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Middleware de autenticación JWT ────────────────────────────────────────
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'No autenticado' });
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    // Refrescar permisos desde BD (el JWT puede ser antiguo si el admin cambió permisos)
    const { rows } = await pool.query(
      'SELECT is_admin, can_push, can_push_all FROM sync_users WHERE id=$1',
      [payload.userId]
    );
    // Si el usuario fue eliminado, revocar acceso
    if (!rows.length) return res.status(401).json({ error: 'Usuario eliminado o no encontrado' });
    payload.isAdmin  = rows[0].is_admin;
    payload.canPush  = rows[0].can_push;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

module.exports = router;
module.exports.requireAuth = requireAuth;
