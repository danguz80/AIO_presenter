const express = require('express');
const router = express.Router();
const { requireAuth, optionalAuth } = require('../middleware/auth');
const {
  getAllSongs,
  getSongById,
  createSong,
  updateSong,
  deleteSong,
  getAllTags,
  bulkTag,
} = require('../controllers/songsController');

// Lectura: auth opcional — escritura: requiere JWT
router.get('/tags',       optionalAuth, getAllTags);
router.patch('/bulk-tag', requireAuth,  bulkTag);
router.get('/',           optionalAuth, getAllSongs);
router.get('/:id',        optionalAuth, getSongById);
router.post('/',          requireAuth,  createSong);
router.put('/:id',        requireAuth,  updateSong);
router.delete('/:id',     requireAuth,  deleteSong);

module.exports = router;
