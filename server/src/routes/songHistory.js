const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getSongRecentHistory,
  deleteSongHistoryEntry,
  getSongHistoryReport,
} = require('../controllers/songHistoryController');

router.use(requireAuth);

router.get('/song/:songId', getSongRecentHistory);
router.delete('/:id', deleteSongHistoryEntry);
router.get('/report', getSongHistoryReport);

module.exports = router;
