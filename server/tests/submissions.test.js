'use strict';

// Set JUDGE_PROVIDER before any module is loaded so judgeService.js picks it up
// at module-load time (it reads process.env.JUDGE_PROVIDER top-level).
process.env.JUDGE_PROVIDER = 'mock';

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');
const { createApp } = require('../index');
const Problem = require('../models/Problem');
const User = require('../models/User');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongoServer.getUri();
  process.env.JWT_SECRET = 'test-secret';
  process.env.JWT_EXPIRES_IN = '1h';
  process.env.NODE_ENV = 'test';
  await mongoose.connect(process.env.MONGODB_URI);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await Problem.deleteMany({});
  await User.deleteMany({});
});

const { app } = createApp();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seed the two-sum problem with exactly 5 test cases (matches mock fixture). */
const seedProblem = () =>
  Problem.create({
    title: 'Two Sum',
    slug: 'two-sum',
    description: 'Return indices of the two numbers that add up to target.',
    difficulty: 'easy',
    examples: [
      { input: 'nums = [2,7,11,15], target = 9', output: '[0,1]', explanation: '' },
    ],
    testCases: [
      { input: '[2,7,11,15]\n9', expectedOutput: '[0,1]' },
      { input: '[3,2,4]\n6',     expectedOutput: '[1,2]' },
      { input: '[3,3]\n6',       expectedOutput: '[0,1]' },
      { input: '[1,2,3,4]\n7',   expectedOutput: '[2,3]' },
      { input: '[0,4,3,0]\n0',   expectedOutput: '[0,3]' },
    ],
    functionSignature: 'function twoSum(nums, target) {}',
    isActive: true,
  });

/** Register a user and return { token, userId }. */
const registerUser = async (suffix = '') => {
  const body = {
    username: `user${suffix}`,
    email: `user${suffix}@example.com`,
    password: 'password123',
  };
  const res = await request(app).post('/api/auth/register').send(body);
  return { token: res.body.token, userId: res.body.user?._id };
};

/** Build a minimal valid submission body. */
const validSubmission = (code = 'function twoSum() {}') => ({
  code,
  language: 'javascript',
  problemSlug: 'two-sum',
});

// ---------------------------------------------------------------------------
// POST /api/submissions
// ---------------------------------------------------------------------------
describe('POST /api/submissions', () => {
  let token;

  beforeEach(async () => {
    await seedProblem();
    ({ token } = await registerUser());
  });

  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/submissions')
      .send(validSubmission());
    expect(res.status).toBe(401);
  });

  it('returns 400 with missing code field', async () => {
    const { code, ...body } = validSubmission();
    const res = await request(app)
      .post('/api/submissions')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
    expect(res.status).toBe(400);
  });

  it('returns 400 with missing problemSlug field', async () => {
    const { problemSlug, ...body } = validSubmission();
    const res = await request(app)
      .post('/api/submissions')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
    expect(res.status).toBe(400);
  });

  it('returns accepted and isMock: true when code has no trigger keyword', async () => {
    const res = await request(app)
      .post('/api/submissions')
      .set('Authorization', `Bearer ${token}`)
      .send(validSubmission('function twoSum(nums, target) { return [0,1]; }'));
    expect(res.status).toBe(201);
    expect(res.body.submission.status).toBe('accepted');
    expect(res.body.submission.isMock).toBe(true);
  });

  it('returns rejected when code contains FORCE_WRONG', async () => {
    const res = await request(app)
      .post('/api/submissions')
      .set('Authorization', `Bearer ${token}`)
      .send(validSubmission('// FORCE_WRONG\nfunction twoSum() {}'));
    expect(res.status).toBe(201);
    expect(res.body.submission.status).toBe('rejected');
  });

  it('returns rejected when code contains FORCE_ERROR (runtime error counts as rejected)', async () => {
    const res = await request(app)
      .post('/api/submissions')
      .set('Authorization', `Bearer ${token}`)
      .send(validSubmission('// FORCE_ERROR\nfunction twoSum() {}'));
    expect(res.status).toBe(201);
    expect(res.body.submission.status).toBe('rejected');
  });

  it('submission response does NOT contain "expectedOutput" anywhere', async () => {
    const res = await request(app)
      .post('/api/submissions')
      .set('Authorization', `Bearer ${token}`)
      .send(validSubmission());
    expect(res.status).toBe(201);
    expect(JSON.stringify(res.body)).not.toContain('expectedOutput');
  });
});

// ---------------------------------------------------------------------------
// GET /api/submissions/mine
// ---------------------------------------------------------------------------
describe('GET /api/submissions/mine', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/submissions/mine');
    expect(res.status).toBe(401);
  });

  it('returns 200 and submissions array for the authenticated user', async () => {
    await seedProblem();
    const { token } = await registerUser('a');

    // Create a submission so the list is non-empty
    await request(app)
      .post('/api/submissions')
      .set('Authorization', `Bearer ${token}`)
      .send(validSubmission());

    const res = await request(app)
      .get('/api/submissions/mine')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.submissions)).toBe(true);
    expect(res.body.submissions.length).toBe(1);
  });

  it('does not return another user\'s submissions', async () => {
    await seedProblem();
    const { token: tokenA } = await registerUser('x');
    const { token: tokenB } = await registerUser('y');

    // User A submits
    await request(app)
      .post('/api/submissions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(validSubmission());

    // User B submits
    await request(app)
      .post('/api/submissions')
      .set('Authorization', `Bearer ${tokenB}`)
      .send(validSubmission());

    // User B's mine should only contain user B's submission
    const res = await request(app)
      .get('/api/submissions/mine')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body.submissions).toHaveLength(1);

    // Verify user A's submission is not present by checking user B's token
    // can only see 1 submission (theirs), not 2 total
    const resA = await request(app)
      .get('/api/submissions/mine')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(resA.body.submissions).toHaveLength(1);
    // The two submission IDs must differ — each user sees only their own
    expect(res.body.submissions[0]._id).not.toBe(resA.body.submissions[0]._id);
  });
});
