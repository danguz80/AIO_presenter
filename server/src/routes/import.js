const express = require('express');
const router  = express.Router();
const { previewImport, batchImport } = require('../controllers/importController');

// POST /api/import/preview  — un archivo, devuelve preview editable
router.post('/preview', previewImport);

// POST /api/import/batch    — múltiples archivos, guarda directo en DB
router.post('/batch', batchImport);

module.exports = router;
