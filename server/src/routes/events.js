const express = require('express');
const router = express.Router();
const { requireAuth, optionalAuth } = require('../middleware/auth');
const {
  getEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  publishEvent,
  unpublishEvent,
} = require('../controllers/eventsController');

// Lectura: auth opcional (fallback a primera org si no hay token)
// Escritura: requiere JWT
router.get('/',                optionalAuth, getEvents);
router.get('/:id',             optionalAuth, getEventById);
router.post('/',               requireAuth,  createEvent);
router.put('/:id',             requireAuth,  updateEvent);
router.delete('/:id',          requireAuth,  deleteEvent);
router.post('/:id/publish',    requireAuth,  publishEvent);
router.post('/:id/unpublish',  requireAuth,  unpublishEvent);

// PATCH /api/events/:id/band-config — asignar configuración de banda (admin)
router.patch('/:id/band-config', requireAuth, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Solo admins' });
  const pool = require('../config/database');
  const { band_config_id } = req.body; // null para quitar
  try {
    const { rows } = await pool.query(
      `UPDATE events SET band_config_id = $1
        WHERE id = $2 AND organization_id = $3
        RETURNING id, band_config_id`,
      [band_config_id ?? null, req.params.id, req.user.orgId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Evento no encontrado' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
