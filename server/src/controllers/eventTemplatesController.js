const pool = require('../config/database');

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
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// DELETE /api/event-templates/:id
async function deleteTemplate(req, res) {
  const { id } = req.params;
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM event_templates WHERE id = $1',
      [id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Plantilla no encontrada' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getTemplates, createTemplate, deleteTemplate };
