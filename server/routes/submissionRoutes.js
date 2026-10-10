'use strict';

const { Router } = require('express');
const submissionController = require('../controllers/submissionController');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { submitSchema } = require('../validators/submissionValidators');

const router = Router();

// POST /api/submissions — authenticated, validated
router.post('/', requireAuth, validate(submitSchema), submissionController.createSubmission);

// GET /api/submissions/mine — authenticated
router.get('/mine', requireAuth, submissionController.getMySubmissions);

module.exports = router;
