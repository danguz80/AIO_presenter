/**
 * routes/admin.js — Panel de administración (solo owner)
 *
 * Todas las rutas requieren JWT válido + email == ADMIN_EMAIL (requireOwner)
 *
 * GET  /admin/orgs            — lista todas las orgs con plan, licencia y miembros
 * GET  /admin/orgs/:id        — detalle de una org
 * POST /admin/licenses        — crear licencia para una org
 * DELETE /admin/licenses/:id  — revocar licencia
 * GET  /admin/subscriptions   — todas las orgs con plan=pro (activas en PayPal)
 * PATCH /admin/orgs/:id/plan  — cambiar plan manualmente (ej: forzar 'pro' o 'trial')
 */

const express = require('express');
const pool    = require('../config/database');
const { requireAuth, requireOwner } = require('../middleware/auth');

const router = express.Router();

// Todas las rutas de este router requieren auth + owner
router.use(requireAuth, requireOwner);

// ─── GET /admin/orgs — todas las orgs ────────────────────────────────────────
router.get('/orgs', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        o.id, o.name, o.band_name, o.plan, o.trial_ends, o.created_at,
        o.paypal_subscription_id, o.paypal_plan_type, o.subscription_status,
        o.updated_at,
        COUNT(DISTINCT u.id)::int AS member_count,
        -- Licencia activa más reciente
        (SELECT json_build_object(
            'id', l.id, 'type', l.type, 'expires_at', l.expires_at,
            'note', l.note, 'created_at', l.created_at
          )
          FROM org_licenses l
          WHERE l.org_id = o.id AND l.revoked_at IS NULL
            AND (l.expires_at IS NULL OR l.expires_at > NOW())
          ORDER BY l.created_at DESC LIMIT 1
        ) AS active_license
      FROM organizations o
      LEFT JOIN sync_users u ON u.organization_id = o.id
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /admin/orgs/:id — detalle de org con miembros y licencias ────────────
router.get('/orgs/:id', async (req, res) => {
  try {
    const orgId = parseInt(req.params.id);
    const [orgRes, membersRes, licensesRes] = await Promise.all([
      pool.query('SELECT * FROM organizations WHERE id = $1', [orgId]),
      pool.query(
        `SELECT id, email, display_name, avatar_url, is_admin, created_at
           FROM sync_users WHERE organization_id = $1 ORDER BY created_at`,
        [orgId]
      ),
      pool.query(
        `SELECT * FROM org_licenses WHERE org_id = $1 ORDER BY created_at DESC`,
        [orgId]
      ),
    ]);
    if (!orgRes.rows.length) return res.status(404).json({ error: 'Org no encontrada' });
    res.json({
      org     : orgRes.rows[0],
      members : membersRes.rows,
      licenses: licensesRes.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /admin/licenses — crear licencia ────────────────────────────────────
router.post('/licenses', async (req, res) => {
  const { org_id, type = 'permanent', expires_at = null, note = '' } = req.body;
  if (!org_id) return res.status(400).json({ error: 'org_id requerido' });
  if (!['permanent', 'timed'].includes(type)) {
    return res.status(400).json({ error: 'type debe ser permanent o timed' });
  }
  if (type === 'timed' && !expires_at) {
    return res.status(400).json({ error: 'expires_at requerido para tipo timed' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO org_licenses (org_id, type, expires_at, note, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [org_id, type, expires_at || null, note, req.user.email]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /admin/licenses/:id — revocar licencia ───────────────────────────
router.delete('/licenses/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'UPDATE org_licenses SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL',
      [parseInt(req.params.id)]
    );
    if (!rowCount) return res.status(404).json({ error: 'Licencia no encontrada o ya revocada' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /admin/subscriptions — orgs con plan pro activo ─────────────────────
router.get('/subscriptions', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT o.id, o.name, o.band_name, o.plan, o.paypal_subscription_id,
             o.paypal_plan_type, o.subscription_status, o.updated_at,
             COUNT(u.id)::int AS member_count
        FROM organizations o
        LEFT JOIN sync_users u ON u.organization_id = o.id
       WHERE o.plan = 'pro' OR o.subscription_status = 'active'
       GROUP BY o.id
       ORDER BY o.updated_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /admin/orgs/:id/plan — cambiar plan manualmente ───────────────────
router.patch('/orgs/:id/plan', async (req, res) => {
  const { plan, trial_ends } = req.body;
  const validPlans = ['trial', 'pro', 'cancelled', 'suspended'];
  if (!validPlans.includes(plan)) {
    return res.status(400).json({ error: `Plan inválido. Opciones: ${validPlans.join(', ')}` });
  }
  try {
    const updates = ['plan = $1', 'updated_at = NOW()'];
    const values  = [plan];
    if (trial_ends !== undefined) {
      values.push(trial_ends);
      updates.push(`trial_ends = $${values.length}`);
    }
    values.push(parseInt(req.params.id));
    await pool.query(
      `UPDATE organizations SET ${updates.join(', ')} WHERE id = $${values.length}`,
      values
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
