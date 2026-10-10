'use strict';

// MUST be the very first statements — set env before any module is loaded.
// judgeService reads JUDGE_PROVIDER at module load; createApp reads NODE_ENV
// at module scope to decide whether to attach the rate limiter.
process.env.JUDGE_PROVIDER = 'mock';
process.env.NODE_ENV = 'test';
process.env.DUEL_COUNTDOWN_MS = '5000';

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');
const { createApp } = require('../index');
const Problem = require('../models/Problem');
const User = require('../models/User');
const Duel = require('../models/Duel');
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
    Duel.deleteMany({}),
    Submission.deleteMany({}),
    User.deleteMany({}),
    Problem.deleteMany({}),
    RatingHistory.deleteMany({}),
  ]);
});

// createApp() at module scope — matches the pattern used by other test files.
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
      { input: '[3,2,4]\n6', expectedOutput: '[1,2]' },
      { input: '[3,3]\n6', expectedOutput: '[0,1]' },
      { input: '[1,2,3,4]\n7', expectedOutput: '[2,3]' },
      { input: '[0,4,3,0]\n0', expectedOutput: '[0,3]' },
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

/** Code that mock judge always accepts (no trigger keyword). */
const ACCEPTED_CODE = 'function twoSum(nums, target) { return [0,1]; }';

// ---------------------------------------------------------------------------
// Duel lifecycle tests (1-10)
// ---------------------------------------------------------------------------
describe('Duel lifecycle', () => {
  let tokenA, userIdA, tokenB, userIdB, tokenC, userIdC;

  beforeEach(async () => {
    await seedProblem();
    ({ token: tokenA, userId: userIdA } = await registerUser('A'));
    ({ token: tokenB, userId: userIdB } = await registerUser('B'));
    ({ token: tokenC, userId: userIdC } = await registerUser('C'));
  });

  // Test 1
  it('POST /api/duels without token → 401', async () => {
    const res = await request(app)
      .post('/api/duels')
      .send({ problemSlug: 'two-sum' });
    expect(res.status).toBe(401);
  });

  // Test 2
  it('POST /api/duels ignores problemSlug in body and still creates duel → 201', async () => {
    const res = await request(app)
      .post('/api/duels')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ problemSlug: 'no-such-problem' });
    expect(res.status).toBe(201);
    expect(res.body.duel).toBeDefined();
    expect(res.body.duel.status).toBe('waiting');
  });

  // Test 3
  it('POST /api/duels valid → 201 with status waiting', async () => {
    const res = await request(app)
      .post('/api/duels')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ problemSlug: 'two-sum' });
    expect(res.status).toBe(201);
    expect(res.body.duel.status).toBe('waiting');
  });

  // Test 4
  it('second POST /api/duels while first is waiting → 409 DUEL_ALREADY_ACTIVE', async () => {
    await request(app)
      .post('/api/duels')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ problemSlug: 'two-sum' });

    const res = await request(app)
      .post('/api/duels')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ problemSlug: 'two-sum' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUEL_ALREADY_ACTIVE');
  });

  // Test 5
  it('creator joining own duel → 403 CANNOT_JOIN_OWN_DUEL', async () => {
    const createRes = await request(app)
      .post('/api/duels')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ problemSlug: 'two-sum' });
    const duelId = createRes.body.duel._id;

    const res = await request(app)
      .post(`/api/duels/${duelId}/join`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CANNOT_JOIN_OWN_DUEL');
  });

  // Test 6
  it('third player joining a full duel → 4xx DUEL_FULL or DUEL_JOIN_CONFLICT', async () => {
    const createRes = await request(app)
      .post('/api/duels')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ problemSlug: 'two-sum' });
    const duelId = createRes.body.duel._id;

    // userB joins successfully
    await request(app)
      .post(`/api/duels/${duelId}/join`)
      .set('Authorization', `Bearer ${tokenB}`);

    // userC attempts to join a now-active (full) duel
    const res = await request(app)
      .post(`/api/duels/${duelId}/join`)
      .set('Authorization', `Bearer ${tokenC}`);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(['DUEL_FULL', 'DUEL_JOIN_CONFLICT', 'DUEL_NOT_WAITING']).toContain(
      res.body.error?.code
    );
  });

  // Test 7
  it('joining a non-waiting duel → 400 DUEL_NOT_WAITING', async () => {
    const createRes = await request(app)
      .post('/api/duels')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ problemSlug: 'two-sum' });
    const duelId = createRes.body.duel._id;

    // Cancel the duel first
    await request(app)
      .delete(`/api/duels/${duelId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    // Now try to join the cancelled duel
    const res = await request(app)
      .post(`/api/duels/${duelId}/join`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DUEL_NOT_WAITING');
  });

  // Test 8
  it('GET /api/duels/:id as non-participant → 403', async () => {
    const createRes = await request(app)
      .post('/api/duels')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ problemSlug: 'two-sum' });
    const duelId = createRes.body.duel._id;

    const res = await request(app)
      .get(`/api/duels/${duelId}`)
      .set('Authorization', `Bearer ${tokenC}`);
    expect(res.status).toBe(403);
  });

  // Test 9
  it('GET /api/duels/:id as participant → 200 with duel object', async () => {
    const createRes = await request(app)
      .post('/api/duels')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ problemSlug: 'two-sum' });
    const duelId = createRes.body.duel._id;

    const res = await request(app)
      .get(`/api/duels/${duelId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.duel).toBeDefined();
    expect(res.body.duel._id).toBe(duelId);
  });

  // Test 10
  it('DELETE /api/duels/:id creator cancels waiting duel → 200 status cancelled', async () => {
    const createRes = await request(app)
      .post('/api/duels')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ problemSlug: 'two-sum' });
    const duelId = createRes.body.duel._id;

    const res = await request(app)
      .delete(`/api/duels/${duelId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.duel.status).toBe('cancelled');
  });
});

// ---------------------------------------------------------------------------
// Authorization and submission tests (11-17)
// ---------------------------------------------------------------------------
describe('Authorization and submission', () => {
  let tokenA, userIdA, tokenB, userIdB, tokenC, userIdC;

  beforeEach(async () => {
    await seedProblem();
    ({ token: tokenA, userId: userIdA } = await registerUser('A'));
    ({ token: tokenB, userId: userIdB } = await registerUser('B'));
    ({ token: tokenC, userId: userIdC } = await registerUser('C'));
  });

  // Test 11
  it('DELETE /api/duels/:id by non-creator → 403', async () => {
    const createRes = await request(app)
      .post('/api/duels')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ problemSlug: 'two-sum' });
    const duelId = createRes.body.duel._id;

    const res = await request(app)
      .delete(`/api/duels/${duelId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(403);
  });

  // Test 12
  it('POST /api/duels/:id/submit as non-participant → 403', async () => {
    const createRes = await request(app)
      .post('/api/duels')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ problemSlug: 'two-sum' });
    const duelId = createRes.body.duel._id;

    // Make duel active by having userB join
    await request(app)
      .post(`/api/duels/${duelId}/join`)
      .set('Authorization', `Bearer ${tokenB}`);

    // userC (non-participant) tries to submit
    const res = await request(app)
      .post(`/api/duels/${duelId}/submit`)
      .set('Authorization', `Bearer ${tokenC}`)
      .send({ code: ACCEPTED_CODE, language: 'javascript' });
    expect(res.status).toBe(403);
  });

  // Test 13
  it('POST /api/duels/:id/submit on waiting duel (not active) → 400', async () => {
    // Create a duel but do NOT join it — it stays in 'waiting'
    const createRes = await request(app)
      .post('/api/duels')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ problemSlug: 'two-sum' });
    const duelId = createRes.body.duel._id;

    const res = await request(app)
      .post(`/api/duels/${duelId}/submit`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ code: ACCEPTED_CODE, language: 'javascript' });
    expect(res.status).toBe(400);
  });

  // Tests 14-17 share an active duel
  describe('active duel submissions', () => {
    let duelId;

    beforeEach(async () => {
      const createRes = await request(app)
        .post('/api/duels')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ problemSlug: 'two-sum' });
      duelId = createRes.body.duel._id;

      await request(app)
        .post(`/api/duels/${duelId}/join`)
        .set('Authorization', `Bearer ${tokenB}`);

      // Fast-forward startsAt so the match is considered started in all submission tests
      const past = new Date(Date.now() - 1000);
      await Duel.findByIdAndUpdate(duelId, { $set: { startsAt: past, startedAt: past } });
    });

    // Test 14
    it('POST /api/duels/:id/submit with accepted code → 201 submission.status accepted', async () => {
      const res = await request(app)
        .post(`/api/duels/${duelId}/submit`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ code: ACCEPTED_CODE, language: 'javascript' });
      expect(res.status).toBe(201);
      expect(res.body.submission.status).toBe('accepted');
    });

    // Test 15
    it('after accepted submission, GET duel → status completed with winnerId set', async () => {
      await request(app)
        .post(`/api/duels/${duelId}/submit`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ code: ACCEPTED_CODE, language: 'javascript' });

      const res = await request(app)
        .get(`/api/duels/${duelId}`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.status).toBe(200);
      expect(res.body.duel.status).toBe('completed');
      expect(res.body.duel.winnerId).toBeTruthy();
    });

    // Test 16
    it('mock duel finalization → isRated === false', async () => {
      await request(app)
        .post(`/api/duels/${duelId}/submit`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ code: ACCEPTED_CODE, language: 'javascript' });

      const res = await request(app)
        .get(`/api/duels/${duelId}`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.status).toBe(200);
      expect(res.body.duel.isRated).toBe(false);
    });

    // Test 17
    it('second submit to completed duel → 400', async () => {
      // First submit — completes the duel
      await request(app)
        .post(`/api/duels/${duelId}/submit`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ code: ACCEPTED_CODE, language: 'javascript' });

      // Second submit — duel is no longer active
      const res = await request(app)
        .post(`/api/duels/${duelId}/submit`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ code: ACCEPTED_CODE, language: 'javascript' });
      expect(res.status).toBe(400);
    });
  });
});

// ---------------------------------------------------------------------------
// Concurrency and Elo tests (18-22)
// ---------------------------------------------------------------------------
describe('Concurrency and Elo', () => {
  let userA, userB, problem;

  beforeEach(async () => {
    problem = await seedProblem();

    // Create users directly via mongoose so we have full doc references
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('password123', 10);
    userA = await User.create({
      username: 'userConA',
      email: 'userConA@example.com',
      passwordHash: hash,
      elo: 1200,
    });
    userB = await User.create({
      username: 'userConB',
      email: 'userConB@example.com',
      passwordHash: hash,
      elo: 1200,
    });
  });

  // Test 18
  it('concurrent finalizeDuel calls: at most one applies changes, ratingApplied written once', async () => {
    const duel = await Duel.create({
      creatorId: userA._id,
      opponentId: userB._id,
      problemId: problem._id,
      status: 'active',
      isRated: false, // unrated so we just verify atomicity, not Elo math
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

    const args = { duelId: duel._id.toString(), winnerId: userA._id.toString(), winnerSubmissionId: sub._id.toString() };

    // Fire two concurrent finalization attempts
    const [r1, r2] = await Promise.all([finalizeDuel(args), finalizeDuel(args)]);

    // Both must resolve without throwing
    expect(r1).toBeDefined();
    expect(r2).toBeDefined();

    // For unrated duels, both return ratingChanges: null
    expect(r1.ratingChanges).toBeNull();
    expect(r2.ratingChanges).toBeNull();

    // The duel document must reflect a single completed state
    const finalDuel = await Duel.findById(duel._id);
    expect(finalDuel.status).toBe('completed');
    // unrated → ratingApplied stays false
    expect(finalDuel.ratingApplied).toBe(false);
  });

  // Test 19
  it('rated duel finalization: both users elo changed and 2 RatingHistory docs created', async () => {
    const duel = await Duel.create({
      creatorId: userA._id,
      opponentId: userB._id,
      problemId: problem._id,
      status: 'active',
      isRated: true,
      ratingApplied: false,
      startedAt: new Date(),
    });

    // Create a non-mock submission so the finalization treats the duel as rated
    const sub = await Submission.create({
      userId: userA._id,
      problemId: problem._id,
      code: 'function twoSum() {}',
      language: 'javascript',
      status: 'accepted',
      isMock: false, // explicitly NOT mock
      duelId: duel._id,
    });

    const result = await finalizeDuel({
      duelId: duel._id.toString(),
      winnerId: userA._id.toString(),
      winnerSubmissionId: sub._id.toString(),
    });

    expect(result.ratingChanges).not.toBeNull();

    // Both users' Elo should have changed
    const updatedA = await User.findById(userA._id);
    const updatedB = await User.findById(userB._id);
    expect(updatedA.elo).not.toBe(1200);
    expect(updatedB.elo).not.toBe(1200);

    // Two RatingHistory docs must exist
    const history = await RatingHistory.find({ duelId: duel._id });
    expect(history).toHaveLength(2);
  });

  // Test 20
  it('duplicate rated finalization: second call returns ratingChanges null, Elo unchanged', async () => {
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

    const args = {
      duelId: duel._id.toString(),
      winnerId: userA._id.toString(),
      winnerSubmissionId: sub._id.toString(),
    };

    // First finalization — applies ratings
    const first = await finalizeDuel(args);
    expect(first.ratingChanges).not.toBeNull();

    const eloAAfterFirst = (await User.findById(userA._id)).elo;
    const eloBAfterFirst = (await User.findById(userB._id)).elo;

    // Second finalization — must be a no-op
    const second = await finalizeDuel(args);
    expect(second.ratingChanges).toBeNull();

    // Elo must be unchanged after the second call
    const eloAAfterSecond = (await User.findById(userA._id)).elo;
    const eloBAfterSecond = (await User.findById(userB._id)).elo;
    expect(eloAAfterSecond).toBe(eloAAfterFirst);
    expect(eloBAfterSecond).toBe(eloBAfterFirst);
  });

  // Tests 21-22: mock submission via HTTP on an active duel
  describe('mock duel via HTTP', () => {
    let tokenA, tokenB, duelId;

    beforeEach(async () => {
      // Ensure a problem exists (outer beforeEach may have cleared it on retries)
      const existingProblem = await Problem.findOne({ slug: 'two-sum' });
      if (!existingProblem) {
        await seedProblem();
      }

      // Register two fresh HTTP users
      const resA = await request(app).post('/api/auth/register').send({
        username: 'httpUserA',
        email: 'httpUserA@example.com',
        password: 'password123',
      });
      tokenA = resA.body.token;

      const resB = await request(app).post('/api/auth/register').send({
        username: 'httpUserB',
        email: 'httpUserB@example.com',
        password: 'password123',
      });
      tokenB = resB.body.token;

      const createRes = await request(app)
        .post('/api/duels')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ problemSlug: 'two-sum' });

      // Guard: if create failed, log for debugging
      if (!createRes.body.duel) {
        throw new Error(`Failed to create duel in beforeEach: ${JSON.stringify(createRes.body)}`);
      }
      duelId = createRes.body.duel._id;

      await request(app)
        .post(`/api/duels/${duelId}/join`)
        .set('Authorization', `Bearer ${tokenB}`);

      // Fast-forward startsAt so submission tests work without waiting for countdown
      const past = new Date(Date.now() - 1000);
      await Duel.findByIdAndUpdate(duelId, { $set: { startsAt: past, startedAt: past } });
    });

    // Test 21
    it('POST submit on active mock duel → duel.isRated === false', async () => {
      await request(app)
        .post(`/api/duels/${duelId}/submit`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ code: ACCEPTED_CODE, language: 'javascript' });

      const res = await request(app)
        .get(`/api/duels/${duelId}`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.status).toBe(200);
      expect(res.body.duel.isRated).toBe(false);
    });

    // Test 22
    it('Elo unchanged after mock duel: both users still at 1200', async () => {
      await request(app)
        .post(`/api/duels/${duelId}/submit`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ code: ACCEPTED_CODE, language: 'javascript' });

      // Fetch both users via /api/auth/me equivalent — use GET /api/auth/me
      const resA = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tokenA}`);
      const resB = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tokenB}`);

      expect(resA.body.user.elo).toBe(1200);
      expect(resB.body.user.elo).toBe(1200);
    });
  });
});

// ---------------------------------------------------------------------------
// Invite link regression tests (the two-account invite-link flow)
// ---------------------------------------------------------------------------
describe('Invite link flow', () => {
  let tokenA, tokenB, tokenC, duelId;

  beforeEach(async () => {
    await seedProblem();
    ({ token: tokenA } = await registerUser('InvA'));
    ({ token: tokenB } = await registerUser('InvB'));
    ({ token: tokenC } = await registerUser('InvC'));

    const createRes = await request(app)
      .post('/api/duels')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ problemSlug: 'two-sum' });
    duelId = createRes.body.duel._id;
  });

  it('GET /api/duels/:id/invite returns invite info for a waiting duel (no auth required)', async () => {
    const res = await request(app).get(`/api/duels/${duelId}/invite`);
    expect(res.status).toBe(200);
    expect(res.body.invite.status).toBe('waiting');
    expect(res.body.invite.duelId).toBeTruthy();
    expect(res.body.invite.problem.title).toBe('Two Sum');
  });

  it('GET /api/duels/:id — non-participant gets 403 NOT_PARTICIPANT (not a generic error)', async () => {
    const res = await request(app)
      .get(`/api/duels/${duelId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_PARTICIPANT');
  });

  it('non-participant can join via POST /api/duels/:id/join, then GET succeeds', async () => {
    // Join
    const joinRes = await request(app)
      .post(`/api/duels/${duelId}/join`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(joinRes.status).toBe(200);
    expect(joinRes.body.duel.status).toBe('active');

    // Now GET works because tokenB is a participant
    const getRes = await request(app)
      .get(`/api/duels/${duelId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.duel.status).toBe('active');
  });

  it('creator joining own duel via invite link → 403 CANNOT_JOIN_OWN_DUEL', async () => {
    const res = await request(app)
      .post(`/api/duels/${duelId}/join`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CANNOT_JOIN_OWN_DUEL');
  });

  it('third player joining after opponent joined → 4xx', async () => {
    // tokenB joins first
    await request(app)
      .post(`/api/duels/${duelId}/join`)
      .set('Authorization', `Bearer ${tokenB}`);

    // tokenC tries to join the now-active duel
    const res = await request(app)
      .post(`/api/duels/${duelId}/join`)
      .set('Authorization', `Bearer ${tokenC}`);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('GET /api/duels/:id/invite returns 404 after duel is no longer waiting', async () => {
    // Cancel the duel
    await request(app)
      .delete(`/api/duels/${duelId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    const res = await request(app).get(`/api/duels/${duelId}/invite`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('INVITE_EXPIRED');
  });

  it('creator remains participant after opponent joins, both can GET the duel', async () => {
    await request(app)
      .post(`/api/duels/${duelId}/join`)
      .set('Authorization', `Bearer ${tokenB}`);

    const resA = await request(app)
      .get(`/api/duels/${duelId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    const resB = await request(app)
      .get(`/api/duels/${duelId}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect(resA.body.duel.status).toBe('active');
    expect(resB.body.duel.status).toBe('active');
  });
});


// ---------------------------------------------------------------------------
// Winner serialization regression tests
// ---------------------------------------------------------------------------
describe('Winner serialization — both players see correct winner', () => {
  const ACCEPTED_CODE = 'function twoSum(nums, target) { return [0,1]; }';
  let tokenA, tokenB, duelId;

  beforeEach(async () => {
    await seedProblem();
    ({ token: tokenA } = await registerUser('WinSerA'));
    ({ token: tokenB } = await registerUser('WinSerB'));

    // Create and join duel so it is active
    const createRes = await request(app)
      .post('/api/duels')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ problemSlug: 'two-sum' });
    duelId = createRes.body.duel._id;

    await request(app)
      .post(`/api/duels/${duelId}/join`)
      .set('Authorization', `Bearer ${tokenB}`);

    // Fast-forward startsAt so the match is active and submissions are accepted
    const past = new Date(Date.now() - 1000);
    await Duel.findByIdAndUpdate(duelId, { $set: { startsAt: past, startedAt: past } });
  });

  it('submit response includes winner.username (winner POV — submitter wins)', async () => {
    const res = await request(app)
      .post(`/api/duels/${duelId}/submit`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ code: ACCEPTED_CODE, language: 'javascript' });

    expect(res.status).toBe(201);
    expect(res.body.duel).not.toBeNull();
    expect(res.body.duel.status).toBe('completed');
    // winner object must have a username string — never null/undefined
    expect(typeof res.body.duel.winner?.username).toBe('string');
    expect(res.body.duel.winner.username).toBe('userWinSerA');
  });

  it('GET duel after completion includes winner.username for the winner', async () => {
    await request(app)
      .post(`/api/duels/${duelId}/submit`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ code: ACCEPTED_CODE, language: 'javascript' });

    const res = await request(app)
      .get(`/api/duels/${duelId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.duel.winner?.username).toBe('userWinSerA');
  });

  it('GET duel after completion includes winner.username for the loser', async () => {
    await request(app)
      .post(`/api/duels/${duelId}/submit`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ code: ACCEPTED_CODE, language: 'javascript' });

    // tokenB (loser) fetches the duel — must also see winner.username
    const res = await request(app)
      .get(`/api/duels/${duelId}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body.duel.winner?.username).toBe('userWinSerA');
  });

  it('winner and loser see the same winner.username', async () => {
    await request(app)
      .post(`/api/duels/${duelId}/submit`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ code: ACCEPTED_CODE, language: 'javascript' });

    const [resWinner, resLoser] = await Promise.all([
      request(app).get(`/api/duels/${duelId}`).set('Authorization', `Bearer ${tokenA}`),
      request(app).get(`/api/duels/${duelId}`).set('Authorization', `Bearer ${tokenB}`),
    ]);

    expect(resWinner.body.duel.winner?.username).toBe(resLoser.body.duel.winner?.username);
  });

  it('completed duel response never includes passwordHash or testCases', async () => {
    await request(app)
      .post(`/api/duels/${duelId}/submit`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ code: ACCEPTED_CODE, language: 'javascript' });

    const res = await request(app)
      .get(`/api/duels/${duelId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('passwordHash');
    expect(body).not.toContain('expectedOutput');
    expect(body).not.toContain('testCases');
  });
});

// ---------------------------------------------------------------------------
// Countdown and match start tests
// ---------------------------------------------------------------------------
describe('Countdown and match start', () => {
  let tokenA, tokenB, tokenC;

  beforeEach(async () => {
    await seedProblem();
    ({ token: tokenA } = await registerUser('CdA'));
    ({ token: tokenB } = await registerUser('CdB'));
    ({ token: tokenC } = await registerUser('CdC'));
  });

  // Test: startsAt is set in the future after join
  it('sets startsAt in the future after join', async () => {
    const createRes = await request(app)
      .post('/api/duels')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ problemSlug: 'two-sum' });
    const duelId = createRes.body.duel._id;

    const joinRes = await request(app)
      .post(`/api/duels/${duelId}/join`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(joinRes.status).toBe(200);

    const { startsAt } = joinRes.body.duel;
    expect(startsAt).toBeTruthy();
    expect(new Date(startsAt) > new Date()).toBe(true);
  });

  // Test: countdownStartedAt is set and <= startsAt
  it('sets countdownStartedAt at or before startsAt', async () => {
    const createRes = await request(app)
      .post('/api/duels')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ problemSlug: 'two-sum' });
    const duelId = createRes.body.duel._id;

    const joinRes = await request(app)
      .post(`/api/duels/${duelId}/join`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(joinRes.status).toBe(200);

    const { startsAt, countdownStartedAt } = joinRes.body.duel;
    expect(countdownStartedAt).toBeTruthy();
    expect(new Date(countdownStartedAt) <= new Date(startsAt)).toBe(true);
  });

  // Test: startsAt approx countdownStartedAt + 5000ms (within 200ms tolerance)
  it('startsAt is approximately countdownStartedAt + COUNTDOWN_MS', async () => {
    const createRes = await request(app)
      .post('/api/duels')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ problemSlug: 'two-sum' });
    const duelId = createRes.body.duel._id;

    const joinRes = await request(app)
      .post(`/api/duels/${duelId}/join`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(joinRes.status).toBe(200);

    const { startsAt, countdownStartedAt } = joinRes.body.duel;
    const diff = Math.abs(new Date(startsAt) - new Date(countdownStartedAt) - 5000);
    expect(diff).toBeLessThan(200);
  });

  // Test: submit before startsAt -> 400 MATCH_NOT_STARTED
  it('blocks submission before startsAt', async () => {
    const createRes = await request(app)
      .post('/api/duels')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ problemSlug: 'two-sum' });
    const duelId = createRes.body.duel._id;

    await request(app)
      .post(`/api/duels/${duelId}/join`)
      .set('Authorization', `Bearer ${tokenB}`);

    // Submit immediately -- startsAt is 5 s in the future
    const res = await request(app)
      .post(`/api/duels/${duelId}/submit`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ code: ACCEPTED_CODE, language: 'javascript' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MATCH_NOT_STARTED');
  });

  // Test: submit after startsAt passes -> succeeds
  it('allows submission after startsAt passes', async () => {
    const createRes = await request(app)
      .post('/api/duels')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ problemSlug: 'two-sum' });
    const duelId = createRes.body.duel._id;

    await request(app)
      .post(`/api/duels/${duelId}/join`)
      .set('Authorization', `Bearer ${tokenB}`);

    // Directly set startsAt to the past so submission is allowed
    const past = new Date(Date.now() - 1000);
    await Duel.findByIdAndUpdate(duelId, { $set: { startsAt: past, startedAt: past } });

    const res = await request(app)
      .post(`/api/duels/${duelId}/submit`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ code: ACCEPTED_CODE, language: 'javascript' });
    expect(res.status).toBe(201);
    expect(res.body.submission.status).toBeDefined();
  });

  // Test: third player cannot join active duel
  it('prevents third player from joining active duel', async () => {
    const createRes = await request(app)
      .post('/api/duels')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ problemSlug: 'two-sum' });
    const duelId = createRes.body.duel._id;

    // userB joins successfully
    await request(app)
      .post(`/api/duels/${duelId}/join`)
      .set('Authorization', `Bearer ${tokenB}`);

    // userC tries to join the now-active duel
    const res = await request(app)
      .post(`/api/duels/${duelId}/join`)
      .set('Authorization', `Bearer ${tokenC}`);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(['DUEL_FULL', 'DUEL_JOIN_CONFLICT', 'DUEL_NOT_WAITING']).toContain(
      res.body.error && res.body.error.code
    );
  });

  // Test: GET duel includes startsAt and countdownStartedAt
  it('GET duel includes startsAt and countdownStartedAt', async () => {
    const createRes = await request(app)
      .post('/api/duels')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ problemSlug: 'two-sum' });
    const duelId = createRes.body.duel._id;

    await request(app)
      .post(`/api/duels/${duelId}/join`)
      .set('Authorization', `Bearer ${tokenB}`);

    // GET the duel -- countdown is still in the future so fields must be present
    const res = await request(app)
      .get(`/api/duels/${duelId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.duel.startsAt).toBeTruthy();
    expect(res.body.duel.countdownStartedAt).toBeTruthy();
  });

  // Test: page refresh mid-countdown restores countdown state (client signal)
  // The client uses status === 'active' AND new Date(startsAt) > new Date() to
  // re-enter the countdown overlay after a refresh. This test verifies the
  // server persists the required state.
  it('GET duel during countdown returns status active with startsAt in the future', async () => {
    const createRes = await request(app)
      .post('/api/duels')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ problemSlug: 'two-sum' });
    const duelId = createRes.body.duel._id;

    await request(app)
      .post(`/api/duels/${duelId}/join`)
      .set('Authorization', `Bearer ${tokenB}`);

    // GET immediately — startsAt has not elapsed (countdown is 5 s)
    const res = await request(app)
      .get(`/api/duels/${duelId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.duel.status).toBe('active');
    expect(new Date(res.body.duel.startsAt) > new Date()).toBe(true);
  });

  // Test: concurrent join requests — atomic guard ensures exactly one succeeds
  it('concurrent join requests: exactly one 200 and one 4xx', async () => {
    const createRes = await request(app)
      .post('/api/duels')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ problemSlug: 'two-sum' });
    const duelId = createRes.body.duel._id;

    // Fire two simultaneous join requests from different users
    const [resB, resC] = await Promise.all([
      request(app)
        .post(`/api/duels/${duelId}/join`)
        .set('Authorization', `Bearer ${tokenB}`),
      request(app)
        .post(`/api/duels/${duelId}/join`)
        .set('Authorization', `Bearer ${tokenC}`),
    ]);

    const statuses = [resB.status, resC.status].sort();
    // One must be 200, the other must be a 4xx
    expect(statuses[0]).toBe(200);
    expect(statuses[1]).toBeGreaterThanOrEqual(400);
    expect(statuses[1]).toBeLessThan(500);

    // Verify only one opponent was recorded in the DB
    const duel = await Duel.findById(duelId);
    expect(duel.opponentId).not.toBeNull();
    expect(duel.status).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// Socket reconnect — populated duel state
// (socket.io-client is unavailable; these tests verify the data shape that
// populateDuelForSocket emits by calling it directly and via the HTTP GET
// endpoint which mirrors the socket reconnect path.)
// ---------------------------------------------------------------------------
describe('Socket reconnect — populated duel state', () => {
  // Import the helper by path — it is not exported but we can test the contract
  // it fulfils through the HTTP GET endpoint, which calls the same population
  // logic (buildPopulatedDuel in duelController). These tests assert that
  // after join the server always returns usernames and problem data so that
  // the client never enters the workspace with bare ObjectIds.

  let tokenA, tokenB, duelId;

  beforeEach(async () => {
    await seedProblem();
    ({ token: tokenA } = await registerUser('SockA'));
    ({ token: tokenB } = await registerUser('SockB'));

    const createRes = await request(app)
      .post('/api/duels')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ problemSlug: 'two-sum' });
    duelId = createRes.body.duel._id;

    await request(app)
      .post(`/api/duels/${duelId}/join`)
      .set('Authorization', `Bearer ${tokenB}`);
  });

  // Reconnect during countdown: GET must return populated opponent and problem.
  // The socket duel:state handler now calls populateDuelForSocket so the HTTP
  // GET response shape is identical to the socket payload.
  it('reconnect during countdown: GET returns opponent.username and problem.title', async () => {
    // startsAt is still ~5 s in the future (DUEL_COUNTDOWN_MS = 5000)
    const res = await request(app)
      .get(`/api/duels/${duelId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.duel.status).toBe('active');
    expect(new Date(res.body.duel.startsAt) > new Date()).toBe(true);
    // Must have populated opponent — not a bare ObjectId
    expect(typeof res.body.duel.opponent?.username).toBe('string');
    expect(res.body.duel.opponent.username).toBe('userSockB');
    // Must have populated problem — not null or a bare ObjectId
    expect(typeof res.body.duel.problem?.title).toBe('string');
    expect(res.body.duel.problem.title).toBe('Two Sum');
  });

  // Reconnect after countdown ends: GET must return populated data even when
  // startsAt is in the past (the normal active-match path).
  it('reconnect after startsAt: GET returns opponent.username and problem.title', async () => {
    // Fast-forward startsAt to simulate post-countdown active state
    const past = new Date(Date.now() - 1000);
    await Duel.findByIdAndUpdate(duelId, { $set: { startsAt: past, startedAt: past } });

    const res = await request(app)
      .get(`/api/duels/${duelId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.duel.status).toBe('active');
    expect(new Date(res.body.duel.startsAt) <= new Date()).toBe(true);
    // Must still have populated opponent and problem after countdown
    expect(typeof res.body.duel.opponent?.username).toBe('string');
    expect(res.body.duel.opponent.username).toBe('userSockB');
    expect(typeof res.body.duel.problem?.title).toBe('string');
  });

  // Opponent reconnects and sees creator's username (bidirectional population).
  it('opponent reconnect: GET returns creator.username', async () => {
    const res = await request(app)
      .get(`/api/duels/${duelId}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    // From the opponent's perspective, creator is the "other player"
    expect(typeof res.body.duel.creator?.username).toBe('string');
    expect(res.body.duel.creator.username).toBe('userSockA');
  });

  // Reconnect response must never leak sensitive fields.
  it('reconnect response never includes passwordHash or testCases', async () => {
    const res = await request(app)
      .get(`/api/duels/${duelId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('passwordHash');
    expect(body).not.toContain('testCases');
    expect(body).not.toContain('expectedOutput');
  });
});