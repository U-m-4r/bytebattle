'use strict';

const Problem = require('../models/Problem');
const Submission = require('../models/Submission');
const { judge } = require('./judgeService');

/**
 * Create and evaluate a new submission.
 *
 * IMPORTANT: This function fetches the problem WITH its test cases (not via
 * findPublic) so the judge has access to the hidden expected outputs.
 * Test case data is never returned to the caller — only aggregated results.
 *
 * @param {{
 *   userId:      string,
 *   problemSlug: string,
 *   code:        string,
 *   language:    string,
 *   duelId?:     string|null,
 * }} opts
 * @returns {Promise<import('../models/Submission')>}
 */
async function createSubmission({ userId, problemSlug, code, language, duelId = null }) {
  // 1. Fetch problem WITH test cases (findPublic excludes them)
  const problem = await Problem.findOne({ slug: problemSlug, isActive: true });
  if (!problem) {
    const err = new Error('Problem not found');
    err.status = 404;
    err.code = 'PROBLEM_NOT_FOUND';
    throw err;
  }

  // 2. Create pending submission
  const submission = new Submission({
    userId,
    problemId: problem._id,
    code,
    language,
    duelId,
    status: 'pending',
  });
  await submission.save();

  try {
    // 3. Run through judge adapter
    const judgeResult = await judge({
      code,
      language,
      problemSlug,
      testCases: problem.testCases,
      timeoutMs: problem.timeoutMs,
    });

    // 4. Belt-and-suspenders: strip any sensitive fields from individual results
    if (Array.isArray(judgeResult.results)) {
      for (const r of judgeResult.results) {
        delete r.input;
        delete r.expectedOutput;
      }
    }

    // 5. Aggregate counts
    const results = judgeResult.results || [];
    const passedCount = results.filter((r) => r.passed).length;
    const totalCount = results.length;

    // 6. Determine final status
    let status;
    if (judgeResult.passed) {
      status = 'accepted';
    } else if (judgeResult.error) {
      status = 'error';
    } else {
      status = 'rejected';
    }

    // 7. Persist result (do NOT store testCase inputs/expectedOutputs)
    submission.judgeResult = judgeResult;
    submission.passedCount = passedCount;
    submission.totalCount = totalCount;
    submission.status = status;
    submission.isMock = judgeResult.isMock === true;
    await submission.save();

    return submission;
  } catch (err) {
    // Judge failure — mark submission as errored and re-throw
    submission.status = 'error';
    await submission.save();
    throw err;
  }
}

/**
 * Retrieve paginated submission history for a user.
 *
 * @param {{ userId: string, page?: number, limit?: number }} opts
 * @returns {Promise<{ submissions: Array, total: number, page: number, pages: number }>}
 */
async function getMySubmissions({ userId, page = 1, limit = 20 }) {
  const skip = (page - 1) * limit;
  const [submissions, total] = await Promise.all([
    Submission.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-judgeResult.results'), // keep summary but trim large result arrays for list view
    Submission.countDocuments({ userId }),
  ]);

  return {
    submissions,
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

module.exports = { createSubmission, getMySubmissions };
