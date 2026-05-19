const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { previewImport, batchImport } = require('../controllers/importController');

router.use(requireAuth);

// POST /api/import/preview  — un archivo, devuelve preview editable
router.post('/preview', previewImport);

// POST /api/import/batch    — múltiples archivos, guarda directo en DB
router.post('/batch', batchImport);

module.exports = router;
