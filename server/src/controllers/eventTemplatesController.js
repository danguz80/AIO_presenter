const pool = require('../config/database');
const { writeAuditLog } = require('../utils/auditLog');

async function hasOrganizationIdColumn() {
  const { rows } = await pool.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_name = 'event_templates'
        AND column_name = 'organization_id'
      LIMIT 1`
  );
  return rows.length > 0;
}

// GET /api/event-templates
async function getTemplates(req, res) {
  try {
    const orgId = req.user?.orgId ?? null;
    const hasOrgCol = await hasOrganizationIdColumn();
    let rows;
    if (hasOrgCol && orgId) {
      ({ rows } = await pool.query(
        'SELECT * FROM event_templates WHERE organization_id = $1 ORDER BY created_at DESC',
        [orgId]
      ));
    } else {
      ({ rows } = await pool.query('SELECT * FROM event_templates ORDER BY created_at DESC'));
    }
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
    const templateName = name.trim();
    const templateItems = JSON.stringify(items || []);
    const orgId = req.user?.orgId ?? null;
    const hasOrgCol = await hasOrganizationIdColumn();

    let rows;
    if (hasOrgCol && orgId) {
      const existing = await pool.query(
        'SELECT id FROM event_templates WHERE organization_id = $1 AND name = $2 LIMIT 1',
        [orgId, templateName]
      );
      if (existing.rows.length > 0) {
        ({ rows } = await pool.query(
          'UPDATE event_templates SET items = $1 WHERE id = $2 RETURNING *',
          [templateItems, existing.rows[0].id]
        ));
      } else {
        ({ rows } = await pool.query(
          'INSERT INTO event_templates (name, items, organization_id) VALUES ($1, $2, $3) RETURNING *',
          [templateName, templateItems, orgId]
        ));
      }
    } else {
      const existing = await pool.query(
        'SELECT id FROM event_templates WHERE name = $1 LIMIT 1',
        [templateName]
      );
      if (existing.rows.length > 0) {
        ({ rows } = await pool.query(
          'UPDATE event_templates SET items = $1 WHERE id = $2 RETURNING *',
          [templateItems, existing.rows[0].id]
        ));
      } else {
        ({ rows } = await pool.query(
          'INSERT INTO event_templates (name, items) VALUES ($1, $2) RETURNING *',
          [templateName, templateItems]
        ));
      }
    }

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
    const orgId = req.user?.orgId ?? null;
    const hasOrgCol = await hasOrganizationIdColumn();
    let rows;
    if (hasOrgCol && orgId) {
      ({ rows } = await pool.query(
        'DELETE FROM event_templates WHERE id = $1 AND organization_id = $2 RETURNING id, name',
        [id, orgId]
      ));
    } else {
      ({ rows } = await pool.query(
        'DELETE FROM event_templates WHERE id = $1 RETURNING id, name',
        [id]
      ));
    }

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
