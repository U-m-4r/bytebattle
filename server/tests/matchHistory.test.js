'use strict';

process.env.JUDGE_PROVIDER = 'mock';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const { createApp } = require('../index');
const User = require('../models/User');
const Duel = require('../models/Duel');
const RatingHistory = require('../models/RatingHistory');
const Problem = require('../models/Problem');

let mongod;
let app;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  ({ app } = createApp());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await User.deleteMany({});
  await Duel.deleteMany({});
  await RatingHistory.deleteMany({});
  await Problem.deleteMany({});
});

// Helper to create a user
async function createUser(username, overrides = {}) {
  const user = await User.create({
    username,
    email: `${username}@test.com`,
    passwordHash: 'hashedpw',
    elo: 1200,
    wins: 0,
    losses: 0,
    ...overrides,
  });
  return user;
}

// Helper to create a problem (required for Duel)
async function createProblem() {
  return Problem.create({
    title: 'Test Problem',
    slug: 'test-problem',
    description: 'A test problem',
    difficulty: 'easy',
    testCases: [{ input: '1', expectedOutput: '1', isHidden: false }],
  });
}

// Helper to create a duel + rating history entry for a user
async function createDuelAndHistory(user, opponent, outcome, overrides = {}) {
  const problem = await createProblem();
  const duel = await Duel.create({
    creatorId: user._id,
    opponentId: opponent._id,
    problemId: problem._id,
    status: 'completed',
    isRated: true,
    completedAt: new Date(),
    ...overrides,
  });
  const oldRating = 1200;
  const delta = outcome === 'win' ? 16 : outcome === 'loss' ? -16 : 0;
  const history = await RatingHistory.create({
    userId: user._id,
    duelId: duel._id,
    oldRating,
    newRating: oldRating + delta,
    delta,
    outcome,
  });
  return { duel, history };
}

describe('GET /api/users/:username/history', () => {
  it('returns 200 with correct shape', async () => {
    const user = await createUser('alice');
    const opponent = await createUser('bob');
    await createDuelAndHistory(user, opponent, 'win');

    const res = await request(app).get('/api/users/alice/history');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('history');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('pages');
    expect(Array.isArray(res.body.history)).toBe(true);
  });

  it('history entries have correct shape', async () => {
    const user = await createUser('alice');
    const opponent = await createUser('bob');
    await createDuelAndHistory(user, opponent, 'win');

    const res = await request(app).get('/api/users/alice/history');
    expect(res.status).toBe(200);
    const entry = res.body.history[0];
    expect(entry).toHaveProperty('duelId');
    expect(entry).toHaveProperty('opponent', 'bob');
    expect(entry).toHaveProperty('outcome', 'win');
    expect(entry).toHaveProperty('oldRating');
    expect(entry).toHaveProperty('newRating');
    expect(entry).toHaveProperty('delta');
    expect(entry).toHaveProperty('isRated');
    expect(entry).toHaveProperty('completedAt');
  });

  it('history is ordered newest first', async () => {
    const user = await createUser('alice');
    const opponent = await createUser('bob');

    // Create entries at different times
    const problem = await createProblem();
    const d1 = await Duel.create({
      creatorId: user._id, opponentId: opponent._id, problemId: problem._id,
      status: 'completed', isRated: true, completedAt: new Date('2024-01-01'),
    });
    const d2 = await Duel.create({
      creatorId: user._id, opponentId: opponent._id, problemId: problem._id,
      status: 'completed', isRated: true, completedAt: new Date('2024-01-02'),
    });
    await RatingHistory.create({ userId: user._id, duelId: d1._id, oldRating: 1200, newRating: 1216, delta: 16, outcome: 'win', createdAt: new Date('2024-01-01') });
    await RatingHistory.create({ userId: user._id, duelId: d2._id, oldRating: 1216, newRating: 1232, delta: 16, outcome: 'win', createdAt: new Date('2024-01-02') });

    const res = await request(app).get('/api/users/alice/history');
    expect(res.status).toBe(200);
    const dates = res.body.history.map((e) => new Date(e.completedAt).getTime());
    // Newest first
    expect(dates[0]).toBeGreaterThan(dates[1]);
  });

  it('pagination: limit=2 over 3 entries returns correct pages', async () => {
    const user = await createUser('alice');
    const opponent = await createUser('bob');
    const problem = await createProblem();

    for (let i = 0; i < 3; i++) {
      const duel = await Duel.create({
        creatorId: user._id, opponentId: opponent._id, problemId: problem._id,
        status: 'completed', isRated: true, completedAt: new Date(),
      });
      await RatingHistory.create({
        userId: user._id, duelId: duel._id, oldRating: 1200, newRating: 1216, delta: 16, outcome: 'win',
      });
    }

    const page1 = await request(app).get('/api/users/alice/history?page=1&limit=2');
    expect(page1.status).toBe(200);
    expect(page1.body.history).toHaveLength(2);
    expect(page1.body.total).toBe(3);
    expect(page1.body.pages).toBe(2);

    const page2 = await request(app).get('/api/users/alice/history?page=2&limit=2');
    expect(page2.status).toBe(200);
    expect(page2.body.history).toHaveLength(1);
  });

  it('returns 404 for nonexistent user', async () => {
    const res = await request(app).get('/api/users/nonexistent/history');
    expect(res.status).toBe(404);
  });

  it('does NOT expose passwordHash, email, or testCases', async () => {
    const user = await createUser('alice');
    const opponent = await createUser('bob');
    await createDuelAndHistory(user, opponent, 'win');

    const res = await request(app).get('/api/users/alice/history');
    const body = JSON.stringify(res.body);
    expect(body.toLowerCase()).not.toMatch(/passwordhash/);
    expect(body.toLowerCase()).not.toMatch(/password/);
    expect(body.toLowerCase()).not.toMatch(/testcases/);
  });

  it('unrated match: isRated === false in history entry', async () => {
    const user = await createUser('alice');
    const opponent = await createUser('bob');
    const problem = await createProblem();
    const duel = await Duel.create({
      creatorId: user._id, opponentId: opponent._id, problemId: problem._id,
      status: 'completed', isRated: false, completedAt: new Date(),
    });
    await RatingHistory.create({
      userId: user._id, duelId: duel._id, oldRating: 1200, newRating: 1200, delta: 0, outcome: 'win',
    });

    const res = await request(app).get('/api/users/alice/history');
    expect(res.status).toBe(200);
    expect(res.body.history[0].isRated).toBe(false);
  });

  it('empty history: user with no matches returns empty array', async () => {
    await createUser('alice');
    const res = await request(app).get('/api/users/alice/history');
    expect(res.status).toBe(200);
    expect(res.body.history).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('opponent shows as Unknown when opponent user is deleted', async () => {
    const user = await createUser('alice');
    const opponent = await createUser('bob');
    const { duel } = await createDuelAndHistory(user, opponent, 'win');
    // Delete the opponent user to simulate deletion
    await User.deleteOne({ _id: opponent._id });

    const res = await request(app).get('/api/users/alice/history');
    expect(res.status).toBe(200);
    expect(res.body.history[0].opponent).toBe('Unknown');
  });
});
