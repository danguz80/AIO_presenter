const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getAllSongs,
  getSongById,
  createSong,
  updateSong,
  deleteSong,
  getAllTags,
  bulkTag,
} = require('../controllers/songsController');

router.use(requireAuth);   // todas las rutas requieren JWT con orgId

router.get('/tags',       getAllTags);
router.patch('/bulk-tag', bulkTag);
router.get('/',           getAllSongs);
router.get('/:id',        getSongById);
router.post('/',          createSong);
router.put('/:id',        updateSong);
router.delete('/:id',     deleteSong);

module.exports = router;
