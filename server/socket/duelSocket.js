'use strict';

const jwt = require('jsonwebtoken');
const duelService = require('../services/duelService');

/**
 * Populate a raw Duel document with problem and user data.
 * Mirrors buildPopulatedDuel in duelController.js but scoped to the fields
 * needed for socket state updates. Never exposes testCases or passwordHash.
 *
 * @param {import('mongoose').Document} duel
 * @returns {Promise<object>}
 */
async function populateDuelForSocket(duel) {
  const Problem = require('../models/Problem');
  const User = require('../models/User');

  const userIds = [duel.creatorId, duel.opponentId, duel.winnerId].filter(Boolean);
  const users = await User.find({ _id: { $in: userIds } }).select('username elo');
  const userMap = {};
  for (const u of users) userMap[u._id.toString()] = { id: u._id.toString(), username: u.username, elo: u.elo };

  const problem = await Problem.findById(duel.problemId).select(
    'title slug description difficulty examples functionSignature timeoutMs'
  );

  const duelObj = duel.toObject ? duel.toObject() : { ...duel };
  duelObj.problem  = problem ? problem.toObject() : null;
  duelObj.creator  = userMap[duelObj.creatorId?.toString()] ?? null;
  duelObj.opponent = duelObj.opponentId ? (userMap[duelObj.opponentId?.toString()] ?? null) : null;
  duelObj.winner   = duelObj.winnerId   ? (userMap[duelObj.winnerId?.toString()]   ?? null) : null;
  return duelObj;
}

/**
 * Attach duel socket handlers to the Socket.IO server instance.
 *
 * Authentication: every socket connection must supply a valid JWT in
 * socket.handshake.auth.token. The decoded payload is attached to socket.user.
 *
 * Events handled:
 *   duel:join    — validate participant, join room, broadcast state
 *   duel:leave   — leave duel room
 *   duel:typing  — broadcast typing indicator to room (opponent only sees it)
 *
 * @param {import('socket.io').Server} io
 */
module.exports = function attachDuelSocket(io) {
  // -------------------------------------------------------------------------
  // Connection-level JWT authentication middleware
  // -------------------------------------------------------------------------
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error('UNAUTHORIZED'));
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = { id: payload.sub, username: payload.username };
      next();
    } catch (err) {
      next(new Error('UNAUTHORIZED'));
    }
  });

  // -------------------------------------------------------------------------
  // Per-connection event handlers
  // -------------------------------------------------------------------------
  io.on('connection', (socket) => {
    /**
     * duel:join — client wants to join a duel room.
     * Validates that the socket user is an actual participant before admitting
     * them to the room, preventing arbitrary room snooping.
     *
     * Payload: { duelId: string }
     */
    socket.on('duel:join', async ({ duelId } = {}) => {
      if (!duelId) {
        socket.emit('duel:error', { message: 'duelId is required', code: 'INVALID_PAYLOAD' });
        return;
      }

      try {
        const duel = await duelService.getDuelState({
          duelId,
          userId: socket.user.id,
        });

        const roomName = `duel:${duelId}`;
        socket.join(roomName);

        // Always populate before emitting — never send bare ObjectIds to the client.
        const duelObj = await populateDuelForSocket(duel);

        if (duel.status === 'active' && duel.startsAt && new Date() < new Date(duel.startsAt)) {
          // Countdown still live: send countdown event with full populated data.
          // Do NOT also emit duel:state — it would overwrite the populated fields
          // with bare ObjectIds because Socket.IO delivers events in order.
          socket.emit('duel:countdown', {
            duelId,
            startsAt: duelObj.startsAt,
            countdownStartedAt: duelObj.countdownStartedAt,
            opponent: duelObj.opponent,
            creator: duelObj.creator,
            problem: duelObj.problem,
            duel: duelObj,
          });
        } else {
          // Match active (post-countdown), completed, waiting, or cancelled:
          // send populated state so the client always has usernames and problem data.
          socket.emit('duel:state', { duel: duelObj });
        }

        // Notify other participants that this user connected/reconnected
        socket.to(roomName).emit('duel:opponent_joined', {
          userId: socket.user.id,
          username: socket.user.username,
        });
      } catch (err) {
        socket.emit('duel:error', {
          message: err.message,
          code: err.code || 'ERROR',
        });
      }
    });

    /**
     * duel:leave — client explicitly leaves a duel room.
     * Payload: { duelId: string }
     */
    socket.on('duel:leave', ({ duelId } = {}) => {
      if (duelId) {
        socket.leave(`duel:${duelId}`);
      }
    });

    /**
     * duel:typing — broadcast a typing indicator to the rest of the room.
     * Payload: { duelId: string }
     */
    socket.on('duel:typing', ({ duelId } = {}) => {
      if (duelId) {
        socket.to(`duel:${duelId}`).emit('duel:opponent_typing', {
          userId: socket.user.id,
        });
      }
    });
  });
};
