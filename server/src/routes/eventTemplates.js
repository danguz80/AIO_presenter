const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getTemplates, createTemplate, deleteTemplate } = require('../controllers/eventTemplatesController');

router.use(requireAuth);

router.get('/',       getTemplates);
router.post('/',      createTemplate);
router.delete('/:id', deleteTemplate);

module.exports = router;
