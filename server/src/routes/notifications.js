const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const pool = require('../config/database');

/** GET /api/notifications — notificaciones del usuario actual */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, type, title, body, metadata, is_read, created_at
         FROM notifications
        WHERE user_id = $1 AND organization_id = $2
        ORDER BY created_at DESC
        LIMIT 50`,
      [req.user.userId, req.user.orgId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** PATCH /api/notifications/:id/read — marcar como leída */
router.patch('/:id/read', requireAuth, async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = true
        WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.userId]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** PATCH /api/notifications/read-all — marcar todas como leídas */
router.patch('/read-all', requireAuth, async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = true
        WHERE user_id = $1 AND organization_id = $2`,
      [req.user.userId, req.user.orgId]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** DELETE /api/notifications/:id — eliminar notificación */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.userId]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
