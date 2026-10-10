'use strict';

const submissionService = require('../services/submissionService');

/**
 * POST /api/submissions
 * Authenticated. Validates body via submissionValidators before reaching here.
 */
async function createSubmission(req, res, next) {
  try {
    const { code, language, problemSlug } = req.body;
    const userId = req.user.id;

    const submission = await submissionService.createSubmission({
      userId,
      problemSlug,
      code,
      language,
    });

    return res.status(201).json({ submission });
  } catch (err) {
    // Propagate judge-specific errors as 503
    if (
      err.code === 'JUDGE_UNAVAILABLE' ||
      err.code === 'JUDGE_PROVIDER_NOT_CONFIGURED'
    ) {
      return res.status(503).json({
        error: {
          message: err.message,
          code: err.code,
        },
      });
    }
    next(err);
  }
}

/**
 * GET /api/submissions/mine
 * Authenticated. Returns paginated submission history for the requesting user.
 */
async function getMySubmissions(req, res, next) {
  try {
    const userId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const result = await submissionService.getMySubmissions({ userId, page, limit });
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { createSubmission, getMySubmissions };
