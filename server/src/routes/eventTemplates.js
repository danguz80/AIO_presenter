const express = require('express');
const router  = express.Router();
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { getTemplates, createTemplate, deleteTemplate } = require('../controllers/eventTemplatesController');

router.get('/',       optionalAuth, getTemplates);
router.post('/',      requireAuth,  createTemplate);
router.delete('/:id', requireAuth,  deleteTemplate);

module.exports = router;
