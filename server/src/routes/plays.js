const express = require('express');
const router  = express.Router();
const { getPlays, upsertPlay, deletePlay, getHistory } = require('../controllers/playsController');

// Por evento
router.get('/:id/plays',            getPlays);
router.post('/:id/plays',           upsertPlay);
router.delete('/:id/plays/:song_id', deletePlay);

module.exports = router;
