'use strict';

const { z } = require('zod');

const createDuelSchema = z.object({});

const joinDuelSchema = z.object({
  duelId: z.string().length(24, 'Invalid duel ID'),
});

const duelSubmissionSchema = z.object({
  code: z.string().min(1, 'code is required').max(50000, 'Code must not exceed 50 000 characters'),
  language: z.enum(['javascript'], { errorMap: () => ({ message: "language must be 'javascript'" }) }),
});

module.exports = { createDuelSchema, joinDuelSchema, duelSubmissionSchema };
