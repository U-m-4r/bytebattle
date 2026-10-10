'use strict';

const Duel = require('../models/Duel');
const Problem = require('../models/Problem');
const { createSubmission } = require('./submissionService');
const { finalizeDuel } = require('./duelFinalizationService');

// Configurable timeouts (ms)
const WAITING_TIMEOUT_MS = parseInt(process.env.DUEL_WAITING_TIMEOUT_MS, 10) || 5 * 60 * 1000; // 5 min
const ACTIVE_TIMEOUT_MS = parseInt(process.env.DUEL_ACTIVE_TIMEOUT_MS, 10) || 30 * 60 * 1000; // 30 min
const COUNTDOWN_MS = parseInt(process.env.DUEL_COUNTDOWN_MS, 10) || 5000; // 5 s countdown before match starts

/**
 * Helper: create a service error with .status and .code properties.
 */
function serviceError(message, status, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

/**
 * Create a new duel for the given creator with a randomly selected problem.
 *
 * @param {{ creatorId: string }} opts
 * @returns {Promise<Duel>}
 */
async function createDuel({ creatorId }) {
  // Randomly select an active problem
  const count = await Problem.countDocuments({ isActive: true });
  if (count === 0) {
    throw serviceError('No problems available for duels', 503, 'NO_PROBLEMS_AVAILABLE');
  }
  const skip = Math.floor(Math.random() * count);
  const problem = await Problem.findOne({ isActive: true }).skip(skip);
  if (!problem) {
    throw serviceError('Failed to select a problem', 503, 'NO_PROBLEMS_AVAILABLE');
  }

  // Prevent creator from having multiple active/waiting duels simultaneously.
  // Auto-cancel any expired waiting duel so the creator can start fresh.
  const existingDuel = await Duel.findOne({
    creatorId,
    status: { $in: ['waiting', 'active'] },
  });
  if (existingDuel) {
    // If the existing waiting duel has expired, cancel it and proceed with creation.
    if (
      existingDuel.status === 'waiting' &&
      existingDuel.expiresAt &&
      existingDuel.expiresAt < new Date()
    ) {
      await Duel.findByIdAndUpdate(existingDuel._id, { $set: { status: 'cancelled' } });
    } else {
      const err = serviceError(
        'You already have an active or waiting duel',
        409,
        'DUEL_ALREADY_ACTIVE'
      );
      err.existingDuelId = existingDuel._id.toString();
      throw err;
    }
  }

  const duel = await Duel.create({
    creatorId,
    problemId: problem._id,
    expiresAt: new Date(Date.now() + WAITING_TIMEOUT_MS),
  });

  return duel;
}

/**
 * Join an existing waiting duel as opponent.
 *
 * @param {{ duelId: string, opponentId: string }} opts
 * @returns {Promise<Duel>}
 */
async function joinDuel({ duelId, opponentId }) {
  const duel = await Duel.findById(duelId);
  if (!duel) {
    throw serviceError('Duel not found', 404, 'DUEL_NOT_FOUND');
  }

  if (duel.status !== 'waiting') {
    throw serviceError('Duel is not in waiting state', 400, 'DUEL_NOT_WAITING');
  }

  // Check if the waiting room has expired
  if (duel.expiresAt && duel.expiresAt < new Date()) {
    duel.status = 'cancelled';
    await duel.save();
    throw serviceError('Duel waiting room has expired', 400, 'DUEL_EXPIRED');
  }

  // Prevent self-joining
  if (duel.creatorId.toString() === opponentId.toString()) {
    throw serviceError('You cannot join your own duel', 403, 'CANNOT_JOIN_OWN_DUEL');
  }

  // Prevent joining a duel that already has an opponent
  if (duel.opponentId !== null) {
    throw serviceError('Duel is already full', 400, 'DUEL_FULL');
  }

  // Atomic join — guards against two simultaneous join attempts
  const now = new Date();
  const startsAt = new Date(now.getTime() + COUNTDOWN_MS);
  const updatedDuel = await Duel.findOneAndUpdate(
    { _id: duelId, status: 'waiting', opponentId: null },
    {
      $set: {
        opponentId,
        status: 'active',
        countdownStartedAt: now,
        startsAt,
        startedAt: startsAt,
        expiresAt: new Date(startsAt.getTime() + ACTIVE_TIMEOUT_MS),
      },
    },
    { new: true }
  );

  if (!updatedDuel) {
    throw serviceError('Failed to join duel — it may have just been filled', 400, 'DUEL_JOIN_CONFLICT');
  }

  return updatedDuel;
}

/**
 * Fetch a duel by ID.
 *
 * @param {string} duelId
 * @returns {Promise<Duel>}
 */
async function getDuelById(duelId) {
  const duel = await Duel.findById(duelId);
  if (!duel) {
    throw serviceError('Duel not found', 404, 'DUEL_NOT_FOUND');
  }
  return duel;
}

/**
 * Fetch duel state, verifying the requesting user is a participant.
 *
 * @param {{ duelId: string, userId: string }} opts
 * @returns {Promise<Duel>}
 */
async function getDuelState({ duelId, userId }) {
  const duel = await getDuelById(duelId);

  const isParticipant =
    duel.creatorId.toString() === userId.toString() ||
    (duel.opponentId && duel.opponentId.toString() === userId.toString());

  if (!isParticipant) {
    throw serviceError('You are not a participant in this duel', 403, 'NOT_PARTICIPANT');
  }

  return duel;
}

/**
 * Cancel a waiting duel. Only the creator may cancel.
 *
 * @param {{ duelId: string, userId: string }} opts
 * @returns {Promise<Duel>}
 */
async function cancelDuel({ duelId, userId }) {
  const duel = await getDuelById(duelId);

  if (duel.creatorId.toString() !== userId.toString()) {
    throw serviceError('Only the duel creator can cancel this duel', 403, 'NOT_CREATOR');
  }

  if (duel.status !== 'waiting') {
    throw serviceError('Only waiting duels can be cancelled', 400, 'DUEL_NOT_WAITING');
  }

  duel.status = 'cancelled';
  await duel.save();

  return duel;
}

/**
 * Submit code for an active duel. Derives problemSlug from the DB, never from
 * the HTTP request body, ensuring hidden test cases remain server-side.
 *
 * @param {{ duelId: string, userId: string, code: string, language: string }} opts
 * @returns {Promise<{ submission: object, finalizationResult: object|null }>}
 */
async function handleDuelSubmission({ duelId, userId, code, language }) {
  const duel = await getDuelById(duelId);

  if (duel.status !== 'active') {
    throw serviceError('Duel is not active', 400, 'DUEL_NOT_ACTIVE');
  }

  // Verify the submitter is a participant before any other checks
  const isParticipant =
    duel.creatorId.toString() === userId.toString() ||
    (duel.opponentId && duel.opponentId.toString() === userId.toString());

  if (!isParticipant) {
    throw serviceError('You are not a participant in this duel', 403, 'NOT_PARTICIPANT');
  }

  // Check if the countdown is still running (match has not started yet)
  if (duel.startsAt && new Date() < duel.startsAt) {
    throw serviceError('Match has not started yet', 400, 'MATCH_NOT_STARTED');
  }

  // Mark match as started (first submission past startsAt sets this once)
  if (!duel.matchStarted) {
    await Duel.findByIdAndUpdate(duel._id, { $set: { matchStarted: true } });
  }

  // Check if the active match has expired
  if (duel.expiresAt && duel.expiresAt < new Date()) {
    duel.status = 'cancelled';
    await duel.save();
    throw serviceError('Duel match time has expired', 400, 'DUEL_EXPIRED');
  }

  // Derive problemSlug from DB — never trust the request body for this
  const problem = await Problem.findById(duel.problemId);
  if (!problem) {
    throw serviceError('Duel problem not found', 404, 'PROBLEM_NOT_FOUND');
  }

  // Run the submission through the judge pipeline
  const submission = await createSubmission({
    userId,
    problemSlug: problem.slug,
    code,
    language,
    duelId,
  });

  // If accepted, finalize the duel (first accepted submission wins)
  let finalizationResult = null;
  if (submission.status === 'accepted') {
    finalizationResult = await finalizeDuel({
      duelId,
      winnerId: userId,
      winnerSubmissionId: submission._id,
    });
  }

  return { submission, finalizationResult };
}

module.exports = {
  createDuel,
  joinDuel,
  getDuelById,
  getDuelState,
  cancelDuel,
  handleDuelSubmission,
};
