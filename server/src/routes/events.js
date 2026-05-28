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
} = require('../controllers/eventsController');

// Lectura: auth opcional (fallback a primera org si no hay token)
// Escritura: requiere JWT
router.get('/',            optionalAuth, getEvents);
router.get('/:id',         optionalAuth, getEventById);
router.post('/',           requireAuth,  createEvent);
router.put('/:id',         requireAuth,  updateEvent);
router.delete('/:id',      requireAuth,  deleteEvent);
router.post('/:id/publish',requireAuth,  publishEvent);

module.exports = router;
