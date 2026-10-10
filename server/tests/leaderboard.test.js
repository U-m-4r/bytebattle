'use strict';

process.env.JUDGE_PROVIDER = 'mock';
process.env.NODE_ENV = 'test';

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { createApp } = require('../index');
const User = require('../models/User');
const Duel = require('../models/Duel');
const Problem = require('../models/Problem');
const Submission = require('../models/Submission');
const RatingHistory = require('../models/RatingHistory');
const { finalizeDuel } = require('../services/duelFinalizationService');

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
  await Promise.all([
    User.deleteMany({}),
    Duel.deleteMany({}),
    Problem.deleteMany({}),
    Submission.deleteMany({}),
    RatingHistory.deleteMany({}),
  ]);
});

const { app } = createApp();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a user directly via mongoose with given elo/wins/losses. */
async function createUser(suffix, { elo = 1200, wins = 0, losses = 0 } = {}) {
  const hash = await bcrypt.hash('password123', 10);
  return User.create({
    username: `user${suffix}`,
    email: `user${suffix}@example.com`,
    passwordHash: hash,
    elo,
    wins,
    losses,
  });
}

/** Register a user via HTTP and return { token, userId }. */
async function registerUser(suffix) {
  const res = await request(app).post('/api/auth/register').send({
    username: `lb${suffix}`,
    email: `lb${suffix}@example.com`,
    password: 'password123',
  });
  return { token: res.body.token, userId: res.body.user?._id };
}

/** Seed the two-sum problem with 5 test cases (matches mock fixture). */
async function seedProblem() {
  return Problem.create({
    title: 'Two Sum',
    slug: 'two-sum',
    description: 'Return indices of the two numbers that add up to target.',
    difficulty: 'easy',
    examples: [{ input: 'nums = [2,7,11,15], target = 9', output: '[0,1]', explanation: '' }],
    testCases: [
      { input: '[2,7,11,15]\n9', expectedOutput: '[0,1]' },
      { input: '[3,2,4]\n6', expectedOutput: '[1,2]' },
      { input: '[3,3]\n6', expectedOutput: '[0,1]' },
      { input: '[1,2,3,4]\n7', expectedOutput: '[2,3]' },
      { input: '[0,4,3,0]\n0', expectedOutput: '[0,3]' },
    ],
    functionSignature: 'function twoSum(nums, target) {}',
    isActive: true,
  });
}

// ---------------------------------------------------------------------------
// Leaderboard API tests
// ---------------------------------------------------------------------------
describe('GET /api/leaderboard', () => {
  // Test 1 — basic 200 response shape
  it('returns 200 with { players, total, page, pages }', async () => {
    await createUser('A', { elo: 1300 });
    await createUser('B', { elo: 1200 });

    const res = await request(app).get('/api/leaderboard');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.players)).toBe(true);
    expect(typeof res.body.total).toBe('number');
    expect(typeof res.body.page).toBe('number');
    expect(typeof res.body.pages).toBe('number');
  });

  // Test 2 — ordering by elo descending
  it('orders players by elo descending', async () => {
    await createUser('Low', { elo: 1000 });
    await createUser('High', { elo: 1500 });
    await createUser('Mid', { elo: 1200 });

    const res = await request(app).get('/api/leaderboard');
    expect(res.status).toBe(200);
    const elos = res.body.players.map((p) => p.elo);
    for (let i = 0; i < elos.length - 1; i++) {
      expect(elos[i]).toBeGreaterThanOrEqual(elos[i + 1]);
    }
  });

  // Test 3 — tie-breaking: same elo sorted by wins desc then username asc
  it('breaks ties by wins desc, then username asc', async () => {
    // All three have elo=1200; winner by wins, then alpha for equal wins
    await createUser('Charlie', { elo: 1200, wins: 5 });
    await createUser('Alice', { elo: 1200, wins: 3 });
    await createUser('Bob', { elo: 1200, wins: 3 });

    const res = await request(app).get('/api/leaderboard');
    expect(res.status).toBe(200);
    const names = res.body.players.map((p) => p.username);
    // Charlie (5 wins) first; Alice (3 wins, 'A' < 'B') before Bob
    expect(names[0]).toBe('userCharlie');
    expect(names[1]).toBe('userAlice');
    expect(names[2]).toBe('userBob');
  });

  // Test 4 — pagination: 25 users, limit=20 → page 1 has 20, page 2 has 5
  it('paginates: page 1 returns 20 players, page 2 returns 5 (from 25 total)', async () => {
    for (let i = 0; i < 25; i++) {
      await createUser(`Pg${i}`, { elo: 1200 - i });
    }

    const res1 = await request(app).get('/api/leaderboard?page=1&limit=20');
    expect(res1.status).toBe(200);
    expect(res1.body.players).toHaveLength(20);
    expect(res1.body.total).toBe(25);
    expect(res1.body.pages).toBe(2);

    const res2 = await request(app).get('/api/leaderboard?page=2&limit=20');
    expect(res2.status).toBe(200);
    expect(res2.body.players).toHaveLength(5);
  });

  // Test 5 — rank field is absolute across pages
  it('rank field is absolute: first player page 1 = rank 1, first player page 2 = rank 21', async () => {
    for (let i = 0; i < 25; i++) {
      await createUser(`Rank${i}`, { elo: 1500 - i });
    }

    const res1 = await request(app).get('/api/leaderboard?page=1&limit=20');
    expect(res1.body.players[0].rank).toBe(1);
    expect(res1.body.players[19].rank).toBe(20);

    const res2 = await request(app).get('/api/leaderboard?page=2&limit=20');
    expect(res2.body.players[0].rank).toBe(21);
  });

  // Test 6 — no sensitive fields in leaderboard response
  it('does NOT expose email, passwordHash, or createdAt in player objects', async () => {
    await createUser('Secret', { elo: 1300 });

    const res = await request(app).get('/api/leaderboard');
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body.includes('password')).toBe(false);
    expect(body.includes('email')).toBe(false);
    // createdAt should not be on player entries
    res.body.players.forEach((p) => {
      expect(p.createdAt).toBeUndefined();
    });
  });

  // Test — empty leaderboard returns empty players array
  it('returns empty players array when no users exist', async () => {
    const res = await request(app).get('/api/leaderboard');
    expect(res.status).toBe(200);
    expect(res.body.players).toHaveLength(0);
    expect(res.body.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// User profile API tests
// ---------------------------------------------------------------------------
describe('GET /api/users/:username', () => {
  // Test 7 — returns public profile
  it('returns 200 with public profile fields', async () => {
    await createUser('ProfileA', { elo: 1350, wins: 5, losses: 2 });

    const res = await request(app).get('/api/users/userProfileA');
    expect(res.status).toBe(200);
    const { user } = res.body;
    expect(user.username).toBe('userProfileA');
    expect(user.elo).toBe(1350);
    expect(user.wins).toBe(5);
    expect(user.losses).toBe(2);
    expect(typeof user.winRate).toBe('number');
    expect(typeof user.rank).toBe('number');
    expect(user.createdAt).toBeDefined();
    expect(user.id).toBeDefined();
  });

  // Test 8 — 404 for nonexistent user
  it('returns 404 for nonexistent username', async () => {
    const res = await request(app).get('/api/users/nonexistent');
    expect(res.status).toBe(404);
  });

  // Test 9 — no sensitive fields in profile response
  it('does NOT expose email or passwordHash in profile', async () => {
    await createUser('SafeProfile', { elo: 1200 });

    const res = await request(app).get('/api/users/userSafeProfile');
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body.includes('password')).toBe(false);
    expect(body.includes('email')).toBe(false);
  });

  // Test — winRate is null when no games played
  it('winRate is null when wins and losses are both 0', async () => {
    await createUser('NoGames', { elo: 1200, wins: 0, losses: 0 });
    const res = await request(app).get('/api/users/userNoGames');
    expect(res.status).toBe(200);
    expect(res.body.user.winRate).toBeNull();
  });

  // Test — rank is computed correctly
  it('rank reflects position among all users by elo', async () => {
    await createUser('Top', { elo: 1500 });
    await createUser('Mid', { elo: 1300 });
    await createUser('Bot', { elo: 1100 });

    const resTop = await request(app).get('/api/users/userTop');
    expect(resTop.body.user.rank).toBe(1);

    const resMid = await request(app).get('/api/users/userMid');
    expect(resMid.body.user.rank).toBe(2);

    const resBot = await request(app).get('/api/users/userBot');
    expect(resBot.body.user.rank).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// wins/losses after finalization tests
// ---------------------------------------------------------------------------
describe('wins/losses after duel finalization', () => {
  // Test 10 — wins/losses correct after rated duel finalization
  it('wins/losses updated correctly after rated duel finalization', async () => {
    const problem = await seedProblem();
    const userA = await createUser('WinA', { elo: 1200 });
    const userB = await createUser('WinB', { elo: 1200 });

    const duel = await Duel.create({
      creatorId: userA._id,
      opponentId: userB._id,
      problemId: problem._id,
      status: 'active',
      isRated: true,
      ratingApplied: false,
      startedAt: new Date(),
    });

    const sub = await Submission.create({
      userId: userA._id,
      problemId: problem._id,
      code: 'function twoSum() {}',
      language: 'javascript',
      status: 'accepted',
      isMock: false,
      duelId: duel._id,
    });

    await finalizeDuel({
      duelId: duel._id.toString(),
      winnerId: userA._id.toString(),
      winnerSubmissionId: sub._id.toString(),
    });

    const resWinner = await request(app).get(`/api/users/userWinA`);
    expect(resWinner.status).toBe(200);
    expect(resWinner.body.user.wins).toBe(1);
    expect(resWinner.body.user.losses).toBe(0);

    const resLoser = await request(app).get(`/api/users/userWinB`);
    expect(resLoser.status).toBe(200);
    expect(resLoser.body.user.wins).toBe(0);
    expect(resLoser.body.user.losses).toBe(1);
  });

  // Test 11 — wins/losses unchanged after unrated (mock) duel
  it('wins/losses unchanged after unrated (mock) duel finalization', async () => {
    const problem = await seedProblem();
    const userA = await createUser('MockA', { elo: 1200 });
    const userB = await createUser('MockB', { elo: 1200 });

    const duel = await Duel.create({
      creatorId: userA._id,
      opponentId: userB._id,
      problemId: problem._id,
      status: 'active',
      isRated: false,
      ratingApplied: false,
      startedAt: new Date(),
    });

    const sub = await Submission.create({
      userId: userA._id,
      problemId: problem._id,
      code: 'function twoSum() {}',
      language: 'javascript',
      status: 'accepted',
      isMock: true,
      duelId: duel._id,
    });

    await finalizeDuel({
      duelId: duel._id.toString(),
      winnerId: userA._id.toString(),
      winnerSubmissionId: sub._id.toString(),
    });

    const resA = await request(app).get('/api/users/userMockA');
    expect(resA.status).toBe(200);
    expect(resA.body.user.wins).toBe(0);
    expect(resA.body.user.losses).toBe(0);

    const resB = await request(app).get('/api/users/userMockB');
    expect(resB.status).toBe(200);
    expect(resB.body.user.wins).toBe(0);
    expect(resB.body.user.losses).toBe(0);
  });
});
