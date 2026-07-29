const pool = require('../config/database');
const { writeAuditLog } = require('../utils/auditLog');

// GET /api/event-templates
async function getTemplates(req, res) {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM event_templates ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/event-templates
async function createTemplate(req, res) {
  const { name, items } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name es requerido' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO event_templates (name, items) VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET items = EXCLUDED.items
       RETURNING *`,
      [name.trim(), JSON.stringify(items || [])]
    );

    await writeAuditLog(pool, {
      organizationId: req.user?.orgId,
      userId: req.user?.userId,
      actionType: 'create',
      entityType: 'event_template',
      entityId: String(rows[0].id),
      message: `Plantilla guardada: ${rows[0].name || '(sin nombre)'}`,
      metadata: {
        items_count: Array.isArray(items) ? items.length : 0,
      },
    });

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// DELETE /api/event-templates/:id
async function deleteTemplate(req, res) {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      'DELETE FROM event_templates WHERE id = $1 RETURNING id, name',
      [id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Plantilla no encontrada' });

    await writeAuditLog(pool, {
      organizationId: req.user?.orgId,
      userId: req.user?.userId,
      actionType: 'delete',
      entityType: 'event_template',
      entityId: String(rows[0].id),
      message: `Plantilla eliminada: ${rows[0].name || '(sin nombre)'}`,
      metadata: null,
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getTemplates, createTemplate, deleteTemplate };
