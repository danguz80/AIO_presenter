const express = require('express');
const pool = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/audit-logs?limit=200&action=delete&entity=event
router.get('/', requireAuth, async (req, res) => {
  const orgId = req.user.orgId;
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
  const action = String(req.query.action || '').trim().toLowerCase();
  const entity = String(req.query.entity || '').trim().toLowerCase();
  const userId = Number(req.query.user_id);
  const fromDate = String(req.query.from || '').trim();
  const toDate = String(req.query.to || '').trim();

  const params = [orgId];
  const where = ['al.organization_id = $1'];

  if (action) {
    params.push(action);
    where.push(`al.action_type = $${params.length}`);
  }
  if (entity) {
    params.push(entity);
    where.push(`al.entity_type = $${params.length}`);
  }
  if (Number.isFinite(userId) && userId > 0) {
    params.push(userId);
    where.push(`al.user_id = $${params.length}`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
    params.push(fromDate);
    where.push(`al.created_at >= $${params.length}::date`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    params.push(toDate);
    where.push(`al.created_at < ($${params.length}::date + INTERVAL '1 day')`);
  }

  params.push(limit);

  try {
    const { rows } = await pool.query(
      `SELECT
         al.id,
         al.organization_id,
         al.user_id,
         al.action_type,
         al.entity_type,
         al.entity_id,
         al.message,
         al.metadata,
         al.created_at,
         COALESCE(u.display_name, u.email, 'Usuario') AS user_name,
         u.email AS user_email
       FROM audit_logs al
       LEFT JOIN sync_users u ON u.id = al.user_id
       WHERE ${where.join(' AND ')}
       ORDER BY al.created_at DESC
       LIMIT $${params.length}`,
      params
    );
    const { rows: users } = await pool.query(
      `SELECT DISTINCT
         al.user_id,
         COALESCE(u.display_name, u.email, 'Usuario') AS user_name,
         u.email AS user_email
       FROM audit_logs al
       LEFT JOIN sync_users u ON u.id = al.user_id
       WHERE al.organization_id = $1
       ORDER BY user_name ASC`,
      [orgId]
    );

    res.json({ logs: rows, users });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error al cargar auditoría' });
  }
});

module.exports = router;