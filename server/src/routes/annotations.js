const express = require('express');
const router = express.Router({ mergeParams: true }); // para acceder a :id de songs
const { requireAuth } = require('../middleware/auth');
const { getAnnotations, upsertAnnotations } = require('../controllers/annotationsController');

router.get('/:id/annotations',  requireAuth, getAnnotations);
router.put('/:id/annotations',  requireAuth, upsertAnnotations);

module.exports = router;
