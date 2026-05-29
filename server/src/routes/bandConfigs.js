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

// GET /api/band-configs
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM band_configs WHERE organization_id = $1 ORDER BY position ASC, created_at ASC',
      [req.user.orgId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/band-configs
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, subtitle, slots } = req.body;
    const { rows: countRows } = await pool.query(
      'SELECT COUNT(*) FROM band_configs WHERE organization_id = $1',
      [req.user.orgId]
    );
    const position = parseInt(countRows[0].count, 10);
    const { rows } = await pool.query(
      `INSERT INTO band_configs (organization_id, name, subtitle, slots, position)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.orgId, name, subtitle || null, JSON.stringify(slots || []), position]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/band-configs/:id
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { name, subtitle, slots } = req.body;
    const { rows } = await pool.query(
      `UPDATE band_configs SET name = $1, subtitle = $2, slots = $3, updated_at = NOW()
       WHERE id = $4 AND organization_id = $5 RETURNING *`,
      [name, subtitle ?? null, JSON.stringify(slots || []), req.params.id, req.user.orgId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Config no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/band-configs/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM band_configs WHERE id = $1 AND organization_id = $2',
      [req.params.id, req.user.orgId]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
