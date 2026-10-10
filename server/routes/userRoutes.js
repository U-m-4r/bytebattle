'use strict';

const express = require('express');
const router = express.Router();
const { getUserProfile, getMatchHistory } = require('../controllers/userController');

// GET /api/users/:username/history — PUBLIC (must come before /:username)
router.get('/:username/history', getMatchHistory);

// GET /api/users/:username — PUBLIC
router.get('/:username', getUserProfile);

module.exports = router;
