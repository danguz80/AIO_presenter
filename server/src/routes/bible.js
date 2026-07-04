const express = require('express');
const router = express.Router();
const {
  getVersions,
  getBooks,
  getChapters,
  getVerses,
  searchVerses,
} = require('../controllers/bibleController');
const { importBible, deleteVersion } = require('../controllers/bibleImportController');
const { requireAuth } = require('../middleware/auth');

// Middleware: solo admins de la org o el owner pueden importar/eliminar
const requireAdmin = (req, res, next) =>
  (req.user?.isAdmin || req.user?.isOwner)
    ? next()
    : res.status(403).json({ error: 'Se requieren privilegios de administrador' });

router.get('/versions',                                    getVersions);
router.get('/search',                                      searchVerses);
router.get('/:versionId/books',                            getBooks);
router.get('/:versionId/books/:bookId/chapters',           getChapters);
router.get('/:versionId/books/:bookId/chapters/:chapter',  getVerses);

// Importar nueva versión (admin de la org)
router.post('/import',           requireAuth, requireAdmin, importBible);
// Eliminar versión (admin de la org)
router.delete('/versions/:id',   requireAuth, requireAdmin, deleteVersion);

module.exports = router;
