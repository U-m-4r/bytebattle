'use strict';

const duelService = require('../services/duelService');

/**
 * Shared helper: populate a raw Duel document with problem, participants and winner.
 * Returns a plain object safe to send as JSON. Never includes testCases.
 */
async function buildPopulatedDuel(duel) {
  const Problem = require('../models/Problem');
  const User = require('../models/User');

  // Collect all user IDs we need in one round-trip
  const userIds = [duel.creatorId, duel.opponentId, duel.winnerId].filter(Boolean);
  const users = await User.find({ _id: { $in: userIds } }).select('username elo');
  const userMap = {};
  for (const u of users) userMap[u._id.toString()] = { id: u._id.toString(), username: u.username, elo: u.elo };

  const problem = await Problem.findById(duel.problemId).select(
    'title slug description difficulty examples functionSignature timeoutMs'
  );

  const duelObj = duel.toObject ? duel.toObject() : { ...duel };

  duelObj.problem   = problem ? problem.toObject() : null;
  duelObj.creator   = userMap[duelObj.creatorId?.toString()] ?? null;
  duelObj.opponent  = duelObj.opponentId ? (userMap[duelObj.opponentId?.toString()] ?? null) : null;
  // winner is always resolved from the DB — never left as a bare ObjectId
  duelObj.winner    = duelObj.winnerId ? (userMap[duelObj.winnerId?.toString()] ?? null) : null;

  return duelObj;
}


async function createDuel(req, res, next) {
  try {
    const duel = await duelService.createDuel({ creatorId: req.user.id });
    const duelObj = await buildPopulatedDuel(duel);
    return res.status(201).json({ duel: duelObj });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/duels/:duelId/join
 * Join an existing waiting duel.
 */
async function joinDuel(req, res, next) {
  try {
    const { duelId } = req.params;
    const duel = await duelService.joinDuel({ duelId, opponentId: req.user.id });
    const duelObj = await buildPopulatedDuel(duel);

    // Emit full populated duel so the creator's client can refresh immediately
    const io = req.app.get('io');
    if (io) {
      io.to(`duel:${duelId}`).emit('duel:countdown', {
        duelId,
        startsAt: duelObj.startsAt,
        countdownStartedAt: duelObj.countdownStartedAt,
        opponent: duelObj.opponent,
        creator: duelObj.creator,
        problem: duelObj.problem,
      });
      io.to(`duel:${duelId}`).emit('duel:opponent_joined', {
        username: req.user.username,
        duel: duelObj,
      });
    }

    return res.status(200).json({ duel: duelObj });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/duels/:duelId/invite
 * Public invite info — returns safe duel metadata without requiring participation.
 * Used by non-participants to see the join screen before accepting.
 * Only returns data for waiting duels; 404 for anything else.
 */
async function getInviteInfo(req, res, next) {
  try {
    const { duelId } = req.params;
    const duel = await duelService.getDuelById(duelId);

    // Only expose invite info for waiting duels — don't leak active/completed game state
    if (duel.status !== 'waiting') {
      return res.status(404).json({
        error: { message: 'This invite link is no longer valid.', code: 'INVITE_EXPIRED' },
      });
    }

    // Fetch problem title for display — public info only
    const Problem = require('../models/Problem');
    const problem = await Problem.findById(duel.problemId).select('title difficulty slug');

    return res.status(200).json({
      invite: {
        duelId: duel._id,
        status: duel.status,
        problem: problem
          ? { title: problem.title, difficulty: problem.difficulty, slug: problem.slug }
          : null,
      },
    });
  } catch (err) {
    next(err);
  }
}


/**
 * GET /api/duels/:duelId
 * Get duel state (participants only).
 * Populates problem (no testCases), creator, opponent, and winner usernames.
 */
async function getDuel(req, res, next) {
  try {
    const { duelId } = req.params;
    const duel = await duelService.getDuelState({ duelId, userId: req.user.id });
    const duelObj = await buildPopulatedDuel(duel);
    return res.status(200).json({ duel: duelObj });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/duels/:duelId
 * Cancel a waiting duel (creator only).
 */
async function cancelDuel(req, res, next) {
  try {
    const { duelId } = req.params;
    const duel = await duelService.cancelDuel({ duelId, userId: req.user.id });
    return res.status(200).json({ duel });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/duels/:duelId/submit
 * Submit code for an active duel.
 */
async function submitToDuel(req, res, next) {
  try {
    const { duelId } = req.params;
    const { code, language } = req.body;

    const { submission, finalizationResult } = await duelService.handleDuelSubmission({
      duelId,
      userId: req.user.id,
      code,
      language,
    });

    // Broadcast submission event to all duel room participants
    const io = req.app.get('io');
    if (io) {
      io.to(`duel:${duelId}`).emit('duel:submission', {
        userId: req.user.id,
        submissionId: submission._id,
        status: submission.status,
        isMock: submission.isMock,
      });

      // Broadcast completion event if the duel was finalized
      if (finalizationResult) {
        // Populate winner/participants before broadcasting so both clients get clean data
        const populatedDuel = await buildPopulatedDuel(finalizationResult.duel);
        io.to(`duel:${duelId}`).emit('duel:completed', {
          winnerId: populatedDuel.winnerId,
          winner: populatedDuel.winner,        // { id, username, elo }
          ratingChanges: finalizationResult.ratingChanges,
          duel: populatedDuel,
        });
      }
    }

    // Populate the duel in the HTTP response too (for the submitter's client)
    const responseDuel = finalizationResult
      ? await buildPopulatedDuel(finalizationResult.duel)
      : null;

    return res.status(201).json({
      submission,
      duel: responseDuel,
      ratingChanges: finalizationResult?.ratingChanges ?? null,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { createDuel, joinDuel, getInviteInfo, getDuel, cancelDuel, submitToDuel };
