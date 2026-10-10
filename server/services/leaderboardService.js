'use strict';

const User = require('../models/User');

/**
 * Get paginated leaderboard ordered by Elo descending.
 * Tie-breaking: users with equal Elo are sorted by wins desc, then username asc
 * (deterministic for stable pagination).
 *
 * @param {{page?: number, limit?: number}} opts
 * @returns {Promise<{ players: Array, total: number, page: number, pages: number }>}
 */
async function getLeaderboard({ page = 1, limit = 20 }) {
  const skip = (page - 1) * limit;
  const [players, total] = await Promise.all([
    User.find({})
      .sort({ elo: -1, wins: -1, username: 1 })
      .skip(skip)
      .limit(limit)
      .select('username elo wins losses'),
    User.countDocuments({}),
  ]);

  const formatted = players.map((u, i) => {
    const totalGames = u.wins + u.losses;
    return {
      rank: skip + i + 1,
      username: u.username,
      elo: u.elo,
      wins: u.wins,
      losses: u.losses,
      winRate: totalGames > 0 ? Math.round((u.wins / totalGames) * 100) / 100 : null,
    };
  });

  return {
    players: formatted,
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

module.exports = { getLeaderboard };
