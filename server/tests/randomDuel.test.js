'use strict';

process.env.JUDGE_PROVIDER = 'mock';
process.env.NODE_ENV = 'test';

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');
const { createApp } = require('../index');
const Problem = require('../models/Problem');
const User = require('../models/User');
const Duel = require('../models/Duel');

let mongoServer;
let authToken;

// createApp at module scope — matches the pattern used by other test files
const { app } = createApp();

const sampleProblems = [
  {
    title: 'Two Sum',
    slug: 'two-sum',
    difficulty: 'easy',
    description: 'Add two numbers',
    isActive: true,
    testCases: [{ input: '1 2', expectedOutput: '3' }],
  },
  {
    title: 'Reverse String',
    slug: 'reverse-string',
    difficulty: 'easy',
    description: 'Reverse a string',
    isActive: true,
    testCases: [{ input: 'hello', expectedOutput: 'olleh' }],
  },
  {
    title: 'FizzBuzz',
    slug: 'fizzbuzz',
    difficulty: 'easy',
    description: 'FizzBuzz',
    isActive: true,
    testCases: [{ input: '15', expectedOutput: 'FizzBuzz' }],
  },
];

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongoServer.getUri();
  process.env.JWT_SECRET = 'test-secret';
  process.env.JWT_EXPIRES_IN = '1h';
  await mongoose.connect(process.env.MONGODB_URI);
}, 30000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
}, 30000);

beforeEach(async () => {
  await Problem.insertMany(sampleProblems);
  // Register and login a user
  await request(app)
    .post('/api/auth/register')
    .send({ username: 'dueltester', email: 'dueltester@example.com', password: 'Password1!' });
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'dueltester@example.com', password: 'Password1!' });
  authToken = loginRes.body.token;
});

afterEach(async () => {
  await Promise.all([
    Duel.deleteMany({}),
    User.deleteMany({}),
    Problem.deleteMany({}),
  ]);
});

describe('POST /api/duels - random problem selection', () => {
  it('creates a duel with a valid problemId when no body is sent', async () => {
    const res = await request(app)
      .post('/api/duels')
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.duel).toBeDefined();
    // problem may be populated object or ObjectId string — either is valid
    const problemRef = res.body.duel.problem ?? res.body.duel.problemId;
    expect(problemRef).toBeTruthy();
  });

  it('assigned problemId references one of the seeded problems', async () => {
    const res = await request(app)
      .post('/api/duels')
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    const problemIds = (await Problem.find({})).map(p => p._id.toString());
    // Extract problem id whether it's a populated object or a bare id
    const assignedId =
      res.body.duel.problem?._id?.toString() ||
      (typeof res.body.duel.problemId === 'string' ? res.body.duel.problemId : null);
    expect(problemIds).toContain(assignedId);
  });

  it('returns 503 when no active problems exist', async () => {
    await Problem.deleteMany({});
    const res = await request(app)
      .post('/api/duels')
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(res.status).toBe(503);
  });

  it('ignores problemSlug sent in request body and still succeeds', async () => {
    const res = await request(app)
      .post('/api/duels')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ problemSlug: 'two-sum' });
    expect(res.status).toBe(201);
    // The duel is created; the server selects the problem randomly regardless
    expect(res.body.duel).toBeDefined();
  });

  it('assigned problem persists — GET duel returns same problemId', async () => {
    const createRes = await request(app)
      .post('/api/duels')
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    const duelId = createRes.body.duel._id;

    const getRes = await request(app)
      .get(`/api/duels/${duelId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(getRes.status).toBe(200);

    // Extract the problem id from either a populated object or a bare ObjectId string
    const createdProblemId =
      createRes.body.duel.problem?._id?.toString() ||
      createRes.body.duel.problem?.toString() ||
      createRes.body.duel.problemId?.toString();
    const fetchedProblemId =
      getRes.body.duel?.problem?._id?.toString() ||
      getRes.body.duel?.problem?.toString() ||
      getRes.body.duel?.problemId?.toString();

    expect(createdProblemId).toBeTruthy();
    expect(fetchedProblemId).toBeTruthy();
    expect(fetchedProblemId).toBe(createdProblemId);
  });
});
