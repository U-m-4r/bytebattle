'use strict';

const Duel = require('../models/Duel');
const User = require('../models/User');
const RatingHistory = require('../models/RatingHistory');
const Submission = require('../models/Submission');
const { calculateNewRatings } = require('./eloService');

// ---------------------------------------------------------------------------
// Concurrency design note
// ---------------------------------------------------------------------------
// This service runs on a standalone mongod instance that has no replica set,
// so MongoDB multi-document transactions (session.withTransaction) are NOT
// available. Instead, two sequential atomic findOneAndUpdate guards prevent
// duplicate finalization:
//
//   Guard 1 — status transition:
//     { _id: duelId, status: 'active' } → { $set: { status: 'completed', ... } }
//     If another request already transitioned the duel out of 'active', this
//     returns null and the caller exits early with { ratingChanges: null }.
//
//   Guard 2 — rating application:
//     { _id: duelId, ratingApplied: false } → { $set: { ratingApplied: true } }
//     If another request already set ratingApplied=true, this returns null and
//     the caller exits without writing rating history a second time.
//
// Together these two guards ensure that even with concurrent retries only one
// request completes the duel and only one request applies rating changes.
// ---------------------------------------------------------------------------

/**
 * Finalize a duel: mark it completed, apply Elo ratings (once), and persist
 * rating history. Safe to call concurrently — atomic guards prevent duplicate
 * finalization.
 *
 * @param {{ duelId: string, winnerId: string, winnerSubmissionId: string }} opts
 * @returns {Promise<{ duel: object, ratingChanges: object|null }>}
 */
async function finalizeDuel({ duelId, winnerId, winnerSubmissionId }) {
  // (a) Fetch current duel
  const existingDuel = await Duel.findById(duelId);
  if (!existingDuel) {
    const err = new Error('Duel not found');
    err.status = 404;
    err.code = 'DUEL_NOT_FOUND';
    throw err;
  }

  // If already completed/cancelled, return current state without changes
  if (existingDuel.status !== 'active') {
    return { duel: existingDuel, ratingChanges: null };
  }

  // (b) Determine which slot the winner occupies
  const creatorId = existingDuel.creatorId.toString();
  const winnerSlot = winnerId.toString() === creatorId ? 'creator' : 'opponent';

  // (c) Guard 1 — atomic status transition (only one concurrent caller wins this)
  const completedAt = new Date();
  const submissionField = `${winnerSlot}SubmissionId`;

  const updatedDuel = await Duel.findOneAndUpdate(
    { _id: duelId, status: 'active' },
    {
      $set: {
        status: 'completed',
        winnerId,
        completedAt,
        [submissionField]: winnerSubmissionId,
      },
    },
    { new: true }
  );

  // Another request already transitioned this duel — bail out
  if (!updatedDuel) {
    const currentDuel = await Duel.findById(duelId);
    return { duel: currentDuel, ratingChanges: null };
  }

  // (d) If the winning submission came from the mock judge, mark duel as unrated
  const winningSubmission = await Submission.findById(winnerSubmissionId);
  if (winningSubmission && winningSubmission.isMock === true) {
    updatedDuel.isRated = false;
    await updatedDuel.save();
  }

  // (e) Only apply ratings for rated duels where they haven't been applied yet
  if (updatedDuel.isRated && !updatedDuel.ratingApplied) {
    // Guard 2 — atomic rating-applied flag (only one concurrent caller wins this)
    const ratingGuardDuel = await Duel.findOneAndUpdate(
      { _id: duelId, ratingApplied: false },
      { $set: { ratingApplied: true } },
      { new: true }
    );

    // Another request already applied ratings — bail out
    if (!ratingGuardDuel) {
      return { duel: updatedDuel, ratingChanges: null };
    }

    // (f) Fetch both players, compute and persist new ratings
    const [creator, opponent] = await Promise.all([
      User.findById(updatedDuel.creatorId),
      User.findById(updatedDuel.opponentId),
    ]);

    const kFactor = parseInt(process.env.ELO_K_FACTOR, 10) || 32;
    const outcomeForCreator = winnerId.toString() === creatorId ? 'win' : 'loss';

    const { newRatingA, newRatingB, deltaA, deltaB } = calculateNewRatings(
      creator.elo,
      opponent.elo,
      outcomeForCreator,
      kFactor
    );

    // Update both users' Elo ratings and wins/losses (rated duels only — inside isRated guard)
    const creatorWon = winnerId.toString() === creatorId;
    await Promise.all([
      User.findByIdAndUpdate(updatedDuel.creatorId, {
        $set: { elo: newRatingA },
        $inc: { wins: creatorWon ? 1 : 0, losses: creatorWon ? 0 : 1 },
      }),
      User.findByIdAndUpdate(updatedDuel.opponentId, {
        $set: { elo: newRatingB },
        $inc: { wins: creatorWon ? 0 : 1, losses: creatorWon ? 1 : 0 },
      }),
    ]);

    // Persist rating history for both players (for auditing)
    await RatingHistory.create([
      {
        userId: updatedDuel.creatorId,
        duelId: updatedDuel._id,
        oldRating: creator.elo,
        newRating: newRatingA,
        delta: deltaA,
        outcome: outcomeForCreator,
      },
      {
        userId: updatedDuel.opponentId,
        duelId: updatedDuel._id,
        oldRating: opponent.elo,
        newRating: newRatingB,
        delta: deltaB,
        outcome: outcomeForCreator === 'win' ? 'loss' : 'win',
      },
    ]);

    return {
      duel: updatedDuel,
      ratingChanges: {
        creator: { oldRating: creator.elo, newRating: newRatingA, delta: deltaA },
        opponent: { oldRating: opponent.elo, newRating: newRatingB, delta: deltaB },
      },
    };
  }

  // (g) Duel is not rated — return without rating changes
  return { duel: updatedDuel, ratingChanges: null };
}

module.exports = { finalizeDuel };
