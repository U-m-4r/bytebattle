const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');
const { createApp } = require('../index');
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
  await User.deleteMany({});
});

const { app } = createApp();

const validUser = {
  username: 'testuser',
  email: 'test@example.com',
  password: 'password123',
};

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------
describe('POST /api/auth/register', () => {
  it('returns 201 on valid data', async () => {
    const res = await request(app).post('/api/auth/register').send(validUser);
    expect(res.status).toBe(201);
  });

  it('returns { user: { username, email, elo }, token }', async () => {
    const res = await request(app).post('/api/auth/register').send(validUser);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toMatchObject({
      username: validUser.username,
      email: validUser.email,
      elo: 1200,
    });
  });

  it('user object does NOT contain passwordHash', async () => {
    const res = await request(app).post('/api/auth/register').send(validUser);
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('returns 409 on duplicate email', async () => {
    await request(app).post('/api/auth/register').send(validUser);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, username: 'otheruser' });
    expect(res.status).toBe(409);
  });

  it('returns 409 on duplicate username', async () => {
    await request(app).post('/api/auth/register').send(validUser);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, email: 'other@example.com' });
    expect(res.status).toBe(409);
  });

  it('returns 400 on missing username', async () => {
    const { username, ...body } = validUser;
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(400);
  });

  it('returns 400 on missing email', async () => {
    const { email, ...body } = validUser;
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(400);
  });

  it('returns 400 on missing password', async () => {
    const { password, ...body } = validUser;
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(400);
  });

  it('returns 400 on password shorter than 8 chars', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, password: 'short' });
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, email: 'not-an-email' });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(validUser);
  });

  it('returns 200 on valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: validUser.password });
    expect(res.status).toBe(200);
  });

  it('returns { user, token }', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: validUser.password });
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('user');
  });

  it('returns 401 on wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('returns 401 on unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: validUser.password });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------
describe('GET /api/auth/me', () => {
  let token;

  beforeEach(async () => {
    const res = await request(app).post('/api/auth/register').send(validUser);
    token = res.body.token;
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 with malformed token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer this.is.not.valid');
    expect(res.status).toBe(401);
  });

  it('returns 200 with valid token and user without passwordHash', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body.user).toHaveProperty('username', validUser.username);
  });
});
