const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getPlays, upsertPlay, deletePlay, getHistory } = require('../controllers/playsController');

router.use(requireAuth);

// Por evento
router.get('/:id/plays',             getPlays);
router.post('/:id/plays',            upsertPlay);
router.delete('/:id/plays/:song_id', deletePlay);

module.exports = router;
