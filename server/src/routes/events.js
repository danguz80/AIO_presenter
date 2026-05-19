const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
} = require('../controllers/eventsController');

router.use(requireAuth);   // todas las rutas requieren JWT con orgId

router.get('/',       getEvents);
router.get('/:id',    getEventById);
router.post('/',      createEvent);
router.put('/:id',    updateEvent);
router.delete('/:id', deleteEvent);

module.exports = router;
