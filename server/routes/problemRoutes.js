'use strict';

const { Router } = require('express');
const problemController = require('../controllers/problemController');

const router = Router();

// GET /api/problems — public
router.get('/', problemController.listProblems);

// GET /api/problems/:slug — public
router.get('/:slug', problemController.getProblem);

module.exports = router;
