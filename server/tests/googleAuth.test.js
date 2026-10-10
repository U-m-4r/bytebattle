'use strict';

// Mock google-auth-library BEFORE any other requires
jest.mock('google-auth-library');
const { OAuth2Client } = require('google-auth-library');

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');
const { createApp } = require('../index');
const User = require('../models/User');

let mongoServer;

// createApp at module scope — matches the pattern used by other test files
const { app } = createApp();

function mockGooglePayload(overrides = {}) {
  return {
    sub: 'google-id-123',
    email: 'googleuser@example.com',
    name: 'Google User',
    email_verified: true,
    ...overrides,
  };
}

function setupValidGoogleMock(payloadOverrides = {}) {
  OAuth2Client.prototype.verifyIdToken = jest.fn().mockResolvedValue({
    getPayload: () => mockGooglePayload(payloadOverrides),
  });
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongoServer.getUri();
  process.env.JWT_SECRET = 'test-secret';
  process.env.JWT_EXPIRES_IN = '1h';
  process.env.NODE_ENV = 'test';
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  await mongoose.connect(process.env.MONGODB_URI);
}, 30000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
}, 30000);

afterEach(async () => {
  await User.deleteMany({});
  jest.clearAllMocks();
});

describe('POST /api/auth/google', () => {
  it('creates a new user with valid Google credential and returns 201', async () => {
    setupValidGoogleMock();
    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'valid-token' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('user');
    expect(res.body).toHaveProperty('token');
  });

  it('new Google user has correct authProvider and googleId', async () => {
    setupValidGoogleMock();
    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'valid-token' });
    expect(res.body.user.authProvider).toBe('google');
    expect(res.body.user.googleId).toBe('google-id-123');
  });

  it('does not expose passwordHash in response', async () => {
    setupValidGoogleMock();
    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'valid-token' });
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('returns 200 and same user on repeat Google login', async () => {
    setupValidGoogleMock();
    const first = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'valid-token' });
    expect(first.status).toBe(201);
    const firstId = first.body.user._id;

    setupValidGoogleMock();
    const second = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'valid-token' });
    expect(second.status).toBe(200);
    expect(second.body.user._id).toBe(firstId);
  });

  it('returns 503 when GOOGLE_CLIENT_ID is not set', async () => {
    const saved = process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_ID;
    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'some-token' });
    expect(res.status).toBe(503);
    process.env.GOOGLE_CLIENT_ID = saved;
  });

  it('returns 401 for invalid Google credential', async () => {
    OAuth2Client.prototype.verifyIdToken = jest.fn().mockRejectedValue(new Error('invalid token'));
    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'bad-token' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for unverified email', async () => {
    setupValidGoogleMock({ email_verified: false });
    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'valid-token' });
    expect(res.status).toBe(401);
  });

  it('links googleId to existing local account when emails match', async () => {
    // Create a local user first
    await request(app)
      .post('/api/auth/register')
      .send({ username: 'localuser', email: 'googleuser@example.com', password: 'Password1!' });

    setupValidGoogleMock();
    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'valid-token' });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('googleuser@example.com');
    expect(res.body.user.googleId).toBe('google-id-123');
  });

  it('returns 400 when credential field is missing', async () => {
    const res = await request(app)
      .post('/api/auth/google')
      .send({});
    expect(res.status).toBe(400);
  });

  it('GET /api/auth/me works after Google sign-in', async () => {
    setupValidGoogleMock();
    const signIn = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'valid-token' });
    const token = signIn.body.token;
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('googleuser@example.com');
  });
});
