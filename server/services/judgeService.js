/**
 * judgeService.js — provider-agnostic judge adapter
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROVIDERS
 * ─────────────────────────────────────────────────────────────────────────────
 * Set JUDGE_PROVIDER in your .env:
 *   JUDGE_PROVIDER=mock    → MockJudgeProvider (safe, no code execution)
 *   JUDGE_PROVIDER=judge0  → Judge0 provider (requires JUDGE0_API_URL + JUDGE0_API_KEY)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MOCK TRIGGER KEYWORDS
 * ─────────────────────────────────────────────────────────────────────────────
 * The mock provider uses ONLY string matching on submitted code — it never
 * executes user code (no eval, vm, Function(), or child_process).
 *
 * Include one of these string literals anywhere in your code to force a result:
 *   FORCE_TLE   → Time Limit Exceeded on the first test case
 *   FORCE_ERROR → Runtime Error on the first test case
 *   FORCE_WRONG → Wrong Answer on the first test case
 *
 * Without any trigger keyword, all test cases pass (Accepted).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ADDING FIXTURES FOR NEW PROBLEMS
 * ─────────────────────────────────────────────────────────────────────────────
 * Add a new key to MOCK_FIXTURES keyed by the problem's slug:
 *
 *   'my-new-problem': {
 *     triggers: {
 *       FORCE_WRONG: { passed: false, status: 'Wrong Answer', actualOutput: '-1', stderr: null },
 *       FORCE_ERROR: { passed: false, status: 'Runtime Error', actualOutput: '', stderr: 'Some error' },
 *       FORCE_TLE:   { passed: false, status: 'Time Limit Exceeded', actualOutput: '', stderr: null },
 *     },
 *     defaultPassed: { status: 'Accepted', actualOutput: 'MOCK_ACCEPTED', stderr: null },
 *     testCaseCount: <number of test cases in the Problem document>,
 *   }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONFIGURING THE REAL JUDGE0 PROVIDER
 * ─────────────────────────────────────────────────────────────────────────────
 * Set the following environment variables:
 *   JUDGE_PROVIDER=judge0
 *   JUDGE0_API_URL=https://judge0-ce.p.rapidapi.com
 *   JUDGE0_API_KEY=<your RapidAPI key>
 *
 * Then implement judgeWithJudge0() below to replace the stub.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

// ---------------------------------------------------------------------------
// Validate provider at module load — fail fast with a clear message
// ---------------------------------------------------------------------------
const PROVIDER = process.env.JUDGE_PROVIDER || 'mock';
if (PROVIDER !== 'mock' && PROVIDER !== 'judge0') {
  throw new Error(
    `Unknown JUDGE_PROVIDER: "${PROVIDER}". Valid values: mock, judge0`
  );
}

// ---------------------------------------------------------------------------
// Mock fixtures
// Keyed by problem slug. testCaseCount must match the seed data.
// Results do NOT include `input` or `expectedOutput` — those stay server-side.
// ---------------------------------------------------------------------------
const MOCK_FIXTURES = {
  'two-sum': {
    triggers: {
      FORCE_WRONG: { passed: false, status: 'Wrong Answer', actualOutput: '-1', stderr: null },
      FORCE_ERROR: { passed: false, status: 'Runtime Error', actualOutput: '', stderr: 'TypeError: Cannot read property' },
      FORCE_TLE:   { passed: false, status: 'Time Limit Exceeded', actualOutput: '', stderr: null },
    },
    defaultPassed: { status: 'Accepted', actualOutput: 'MOCK_ACCEPTED', stderr: null },
    testCaseCount: 5,
  },
  'valid-parentheses': {
    triggers: {
      FORCE_WRONG: { passed: false, status: 'Wrong Answer', actualOutput: 'false', stderr: null },
      FORCE_ERROR: { passed: false, status: 'Runtime Error', actualOutput: '', stderr: 'ReferenceError: stack is not defined' },
      FORCE_TLE:   { passed: false, status: 'Time Limit Exceeded', actualOutput: '', stderr: null },
    },
    defaultPassed: { status: 'Accepted', actualOutput: 'MOCK_ACCEPTED', stderr: null },
    testCaseCount: 6,
  },
  'reverse-array': {
    triggers: {
      FORCE_WRONG: { passed: false, status: 'Wrong Answer', actualOutput: '1,2,3,4,5', stderr: null },
      FORCE_ERROR: { passed: false, status: 'Runtime Error', actualOutput: '', stderr: 'TypeError: arr.reverse is not a function' },
      FORCE_TLE:   { passed: false, status: 'Time Limit Exceeded', actualOutput: '', stderr: null },
    },
    defaultPassed: { status: 'Accepted', actualOutput: 'MOCK_ACCEPTED', stderr: null },
    testCaseCount: 4,
  },
};

// ---------------------------------------------------------------------------
// Mock provider — safe string-match-only logic, zero code execution
// ---------------------------------------------------------------------------

/** @typedef {{ passed: boolean, status: string, actualOutput: string, stderr: string|null }} TestResult */

/**
 * @param {{ code: string, problemSlug: string, testCases: Array }} opts
 * @returns {{ passed: boolean, results: TestResult[], isMock: true, provider: 'mock', error: null }}
 */
function judgeWithMock({ code, problemSlug, testCases }) {
  const fixture = MOCK_FIXTURES[problemSlug];

  // Unknown problem — generic all-passed result using actual testCases length
  if (!fixture) {
    const count = Array.isArray(testCases) ? testCases.length : 0;
    return {
      passed: true,
      results: Array.from({ length: count }, () => ({
        passed: true,
        status: 'Accepted',
        actualOutput: 'MOCK_ACCEPTED',
        stderr: null,
      })),
      isMock: true,
      provider: 'mock',
      error: null,
    };
  }

  const count = fixture.testCaseCount;
  const passedResult = { passed: true, status: 'Accepted', actualOutput: 'MOCK_ACCEPTED', stderr: null };

  // Check triggers in precedence order: TLE > ERROR > WRONG
  const triggerOrder = ['FORCE_TLE', 'FORCE_ERROR', 'FORCE_WRONG'];
  let matchedTrigger = null;
  for (const key of triggerOrder) {
    if (code.includes(key)) {
      matchedTrigger = key;
      break;
    }
  }

  if (matchedTrigger) {
    const failResult = fixture.triggers[matchedTrigger];
    // First test case fails, the rest pass
    const results = [
      { ...failResult },
      ...Array.from({ length: count - 1 }, () => ({ ...passedResult })),
    ];
    return {
      passed: false,
      results,
      isMock: true,
      provider: 'mock',
      error: null,
    };
  }

  // No trigger — all pass
  return {
    passed: true,
    results: Array.from({ length: count }, () => ({ ...passedResult })),
    isMock: true,
    provider: 'mock',
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Judge0 provider stub — replace with real implementation when credentials
// are available. See CONFIGURING THE REAL JUDGE0 PROVIDER above.
// ---------------------------------------------------------------------------
async function judgeWithJudge0(opts) { // eslint-disable-line no-unused-vars
  throw Object.assign(
    new Error(
      'Judge0 provider is not configured. Set JUDGE_PROVIDER=mock for local development, ' +
      'or set JUDGE_PROVIDER=judge0 and JUDGE0_API_KEY to use the real judge.'
    ),
    { status: 503, code: 'JUDGE_PROVIDER_NOT_CONFIGURED' }
  );
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/**
 * Run code against test cases using the configured provider.
 *
 * @param {{
 *   code:        string,
 *   language:    string,
 *   problemSlug: string,
 *   testCases:   Array<{ input: string, expectedOutput: string }>,
 *   timeoutMs:   number,
 * }} opts
 * @returns {Promise<{
 *   passed:   boolean,
 *   results:  TestResult[],
 *   isMock:   boolean,
 *   provider: string,
 *   error:    string|null,
 * }>}
 */
async function judge(opts) {
  if (PROVIDER === 'judge0') {
    return judgeWithJudge0(opts);
  }
  // Default: mock
  return judgeWithMock(opts);
}

module.exports = { judge };
