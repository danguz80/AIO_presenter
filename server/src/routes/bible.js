const express = require('express');
const router = express.Router();
const {
  getVersions,
  getBooks,
  getChapters,
  getVerses,
  searchVerses,
} = require('../controllers/bibleController');

router.get('/versions',                                    getVersions);
router.get('/search',                                      searchVerses);
router.get('/:versionId/books',                            getBooks);
router.get('/:versionId/books/:bookId/chapters',           getChapters);
router.get('/:versionId/books/:bookId/chapters/:chapter',  getVerses);

module.exports = router;
