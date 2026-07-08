const express = require('express');
const router = express.Router();
const { requireAuth, optionalAuth, requireAdmin } = require('../middleware/auth');
const {
  getAllSongs,
  getSongById,
  createSong,
  updateSong,
  deleteSong,
  getAllTags,
  bulkTag,
  updateStructure,
  importDemo,
} = require('../controllers/songsController');

// Lectura: auth opcional — escritura: requiere JWT
router.get('/tags',         optionalAuth, getAllTags);
router.patch('/bulk-tag',   requireAuth,  requireAdmin, bulkTag);
router.post('/import-demo', requireAuth,  requireAdmin, importDemo);
router.get('/',             optionalAuth, getAllSongs);
router.get('/:id',          optionalAuth, getSongById);
router.post('/',            requireAuth,  requireAdmin, createSong);
router.put('/:id',          requireAuth,  requireAdmin, updateSong);
router.patch('/:id/structure', requireAuth, requireAdmin, updateStructure);
router.delete('/:id',       requireAuth,  requireAdmin, deleteSong);

module.exports = router;
