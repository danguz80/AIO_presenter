const express    = require('express');
const jwt        = require('jsonwebtoken');
const pool       = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'aio-presenter-secret-change-me';
const router     = express.Router();

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'No autorizado' });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

// GET /api/blocked-dates?start=YYYY-MM-DD&end=YYYY-MM-DD
// Devuelve todas las fechas bloqueadas de la org (propio usuario + compañeros)
router.get('/', requireAuth, async (req, res) => {
  try {
    const { start, end } = req.query;
    let query = `
      SELECT bd.id, bd.user_id, bd.date, bd.reason,
             u.display_name, u.avatar_url
      FROM user_blocked_dates bd
      JOIN sync_users u ON u.id = bd.user_id
      WHERE bd.organization_id = $1
    `;
    const params = [req.user.orgId];
    if (start) { params.push(start); query += ` AND bd.date >= $${params.length}`; }
    if (end)   { params.push(end);   query += ` AND bd.date <= $${params.length}`; }
    query += ' ORDER BY bd.date ASC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/blocked-dates — bloquear una fecha
router.post('/', requireAuth, async (req, res) => {
  try {
    const { date, reason } = req.body;
    if (!date) return res.status(400).json({ error: 'Falta la fecha' });
    const { rows } = await pool.query(
      `INSERT INTO user_blocked_dates (user_id, organization_id, date, reason)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, date) DO UPDATE SET reason = EXCLUDED.reason
       RETURNING *`,
      [req.user.userId, req.user.orgId, date, reason || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/blocked-dates/:id — desbloquear (solo el propio usuario)
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM user_blocked_dates WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.userId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Fecha no encontrada o sin permiso' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
