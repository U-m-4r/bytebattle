'use strict';

const express = require('express');
const router = express.Router();
const { getLeaderboardHandler } = require('../controllers/leaderboardController');

// GET /api/leaderboard — PUBLIC
router.get('/', getLeaderboardHandler);

module.exports = router;
