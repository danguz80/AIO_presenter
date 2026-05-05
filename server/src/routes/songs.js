const express = require('express');
const router = express.Router();
const {
  getAllSongs,
  getSongById,
  createSong,
  updateSong,
  deleteSong,
  getAllTags,
  bulkTag,
} = require('../controllers/songsController');

router.get('/tags',      getAllTags);   // must be before /:id
router.patch('/bulk-tag', bulkTag);
router.get('/',          getAllSongs);
router.get('/:id',       getSongById);
router.post('/',         createSong);
router.put('/:id',       updateSong);
router.delete('/:id',    deleteSong);

module.exports = router;
