'use strict';

const Problem = require('../models/Problem');

/**
 * Return a single active problem by slug (public fields only).
 * Throws a 404 error if no matching problem is found.
 *
 * @param {string} slug
 * @returns {Promise<object>}
 */
async function getProblemBySlug(slug) {
  const [problem] = await Problem.findPublic({ slug, isActive: true });
  if (!problem) {
    const err = new Error('Problem not found');
    err.status = 404;
    err.code = 'PROBLEM_NOT_FOUND';
    throw err;
  }
  return problem;
}

/**
 * Return all active problems (public fields only).
 *
 * @returns {Promise<Array>}
 */
async function getProblems() {
  return Problem.findPublic({ isActive: true });
}

module.exports = { getProblemBySlug, getProblems };
