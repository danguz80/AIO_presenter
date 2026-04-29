const express = require('express');
const router  = express.Router();
const { previewImport } = require('../controllers/importController');

// POST /api/import/preview
// Body: multipart/form-data  → campo "file"
// Response: { title, author, copyright, ccli, slides[], filename, format }
router.post('/preview', previewImport);

module.exports = router;
