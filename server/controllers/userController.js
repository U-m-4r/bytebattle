'use strict';

const User = require('../models/User');

async function getUserProfile(req, res, next) {
  try {
    const { username } = req.params;
    const user = await User.findOne({ username }).select('username elo wins losses createdAt');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const totalGames = user.wins + user.losses;
    const winRate = totalGames > 0 ? Math.round((user.wins / totalGames) * 100) / 100 : null;

    // Compute rank: number of users with a higher elo + 1
    const rank = (await User.countDocuments({ elo: { $gt: user.elo } })) + 1;

    res.json({
      user: {
        id: user._id,
        username: user.username,
        elo: user.elo,
        wins: user.wins,
        losses: user.losses,
        winRate,
        rank,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get paginated match history for a user.
 * Public endpoint — no auth required.
 *
 * NOTE(perf): This does N+1 User lookups per page (one per history entry).
 * For MVP with small data this is acceptable. In production, use:
 *   RatingHistory.aggregate([{ $lookup: { from: 'users', ... } }])
 * or populate() with a ref on duelId, to avoid the N+1.
 *
 * @route GET /api/users/:username/history
 * @query page (default 1), limit (default 10, max 50)
 */
async function getMatchHistory(req, res, next) {
  try {
    const { username } = req.params;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const user = await User.findOne({ username }).select('_id');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const RatingHistory = require('../models/RatingHistory');
    const Duel = require('../models/Duel');

    const total = await RatingHistory.countDocuments({ userId: user._id });
    const entries = await RatingHistory.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const history = await Promise.all(
      entries.map(async (entry) => {
        // Look up the duel to find the opponent and isRated/completedAt
        const duel = await Duel.findById(entry.duelId).select('creatorId opponentId isRated completedAt').lean();

        let opponent = 'Unknown';
        let isRated = false;
        let completedAt = null;

        if (duel) {
          isRated = duel.isRated;
          completedAt = duel.completedAt;

          // Opponent is whoever is NOT this user
          const opponentId = duel.creatorId.toString() === user._id.toString()
            ? duel.opponentId
            : duel.creatorId;

          if (opponentId) {
            const opponentUser = await User.findById(opponentId).select('username').lean();
            if (opponentUser) {
              opponent = opponentUser.username;
            }
          }
        }

        return {
          duelId: entry.duelId,
          opponent,
          outcome: entry.outcome,
          oldRating: entry.oldRating,
          newRating: entry.newRating,
          delta: entry.delta,
          isRated,
          completedAt,
        };
      })
    );

    res.json({
      history,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getUserProfile, getMatchHistory };
