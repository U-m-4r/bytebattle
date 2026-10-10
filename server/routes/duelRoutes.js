'use strict';

const { Router } = require('express');
const duelController = require('../controllers/duelController');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { createDuelSchema, duelSubmissionSchema } = require('../validators/duelValidators');

const router = Router();

// POST /api/duels — create a new duel
router.post('/', requireAuth, validate(createDuelSchema), duelController.createDuel);

// POST /api/duels/:duelId/join — join a waiting duel
router.post('/:duelId/join', requireAuth, duelController.joinDuel);

// GET /api/duels/:duelId/invite — public invite info (no auth required)
router.get('/:duelId/invite', duelController.getInviteInfo);

// GET /api/duels/:duelId — get duel state (participants only)
router.get('/:duelId', requireAuth, duelController.getDuel);

// DELETE /api/duels/:duelId — cancel a waiting duel (creator only)
router.delete('/:duelId', requireAuth, duelController.cancelDuel);

// POST /api/duels/:duelId/submit — submit code for an active duel
router.post('/:duelId/submit', requireAuth, validate(duelSubmissionSchema), duelController.submitToDuel);

module.exports = router;
