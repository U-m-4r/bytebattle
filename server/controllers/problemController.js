'use strict';

const problemService = require('../services/problemService');

/**
 * GET /api/problems
 * Returns all active problems — public fields only, no testCases.
 */
async function listProblems(req, res, next) {
  try {
    const problems = await problemService.getProblems();
    return res.status(200).json({ problems });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/problems/:slug
 * Returns a single problem by slug — public fields only, no testCases.
 */
async function getProblem(req, res, next) {
  try {
    const problem = await problemService.getProblemBySlug(req.params.slug);
    return res.status(200).json({ problem });
  } catch (err) {
    next(err);
  }
}

module.exports = { listProblems, getProblem };
