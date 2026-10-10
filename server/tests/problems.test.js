'use strict';

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');
const { createApp } = require('../index');
const Problem = require('../models/Problem');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongoServer.getUri();
  process.env.JWT_SECRET = 'test-secret';
  process.env.NODE_ENV = 'test';
  await mongoose.connect(process.env.MONGODB_URI);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await Problem.deleteMany({});
});

const { app } = createApp();

// ---------------------------------------------------------------------------
// Shared seed helper
// ---------------------------------------------------------------------------
const seedProblem = () =>
  Problem.create({
    title: 'Two Sum',
    slug: 'two-sum',
    description: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.',
    difficulty: 'easy',
    examples: [
      { input: 'nums = [2,7,11,15], target = 9', output: '[0,1]', explanation: 'nums[0] + nums[1] = 9' },
    ],
    testCases: [
      { input: '[2,7,11,15]\n9', expectedOutput: '[0,1]' },
      { input: '[3,2,4]\n6',     expectedOutput: '[1,2]' },
      { input: '[3,3]\n6',       expectedOutput: '[0,1]' },
      { input: '[1,2,3,4]\n7',   expectedOutput: '[2,3]' },
      { input: '[0,4,3,0]\n0',   expectedOutput: '[0,3]' },
    ],
    functionSignature: 'function twoSum(nums, target) {\n  // your code here\n}',
    isActive: true,
  });

// ---------------------------------------------------------------------------
// GET /api/problems
// ---------------------------------------------------------------------------
describe('GET /api/problems', () => {
  beforeEach(async () => {
    await seedProblem();
  });

  it('returns 200 and array of problems', async () => {
    const res = await request(app).get('/api/problems');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.problems)).toBe(true);
    expect(res.body.problems.length).toBe(1);
  });

  it('response items do NOT have testCases field', async () => {
    const res = await request(app).get('/api/problems');
    expect(res.status).toBe(200);
    for (const problem of res.body.problems) {
      expect(problem).not.toHaveProperty('testCases');
    }
  });

  it('response body stringified does NOT contain "expectedOutput" anywhere', async () => {
    const res = await request(app).get('/api/problems');
    expect(JSON.stringify(res.body)).not.toContain('expectedOutput');
  });
});

// ---------------------------------------------------------------------------
// GET /api/problems/:slug
// ---------------------------------------------------------------------------
describe('GET /api/problems/:slug', () => {
  beforeEach(async () => {
    await seedProblem();
  });

  it('returns 200 and the problem', async () => {
    const res = await request(app).get('/api/problems/two-sum');
    expect(res.status).toBe(200);
    expect(res.body.problem).toMatchObject({ slug: 'two-sum', title: 'Two Sum' });
  });

  it('response does NOT have testCases field', async () => {
    const res = await request(app).get('/api/problems/two-sum');
    expect(res.status).toBe(200);
    expect(res.body.problem).not.toHaveProperty('testCases');
  });

  it('response stringified does NOT contain "expectedOutput"', async () => {
    const res = await request(app).get('/api/problems/two-sum');
    expect(JSON.stringify(res.body)).not.toContain('expectedOutput');
  });

  it('returns 404 for nonexistent-slug', async () => {
    const res = await request(app).get('/api/problems/nonexistent-slug');
    expect(res.status).toBe(404);
  });
});
