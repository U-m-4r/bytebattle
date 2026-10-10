'use strict';

const { getLeaderboard } = require('../services/leaderboardService');

async function getLeaderboardHandler(req, res, next) {
  try {
    let page = parseInt(req.query.page, 10) || 1;
    let limit = parseInt(req.query.limit, 10) || 20;
    if (page < 1) page = 1;
    if (limit < 1) limit = 1;
    if (limit > 100) limit = 100;

    const result = await getLeaderboard({ page, limit });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { getLeaderboardHandler };
