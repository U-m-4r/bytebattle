const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');

/**
 * Generate a signed JWT for a user.
 *
 * @param {object} user - Mongoose User document
 * @returns {string} signed JWT
 */
function generateToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      username: user.username,
      email: user.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

/**
 * Register a new user.
 *
 * @param {{ username: string, email: string, password: string }} data
 * @returns {Promise<{ user: object, token: string }>}
 * @throws {Error} 409 DUPLICATE_USER if email or username is taken
 */
async function register({ username, email, password }) {
  const existing = await User.findOne({
    $or: [{ email: email.toLowerCase() }, { username }],
  });

  if (existing) {
    const err = new Error(
      existing.email === email.toLowerCase()
        ? 'An account with that email already exists'
        : 'An account with that username already exists'
    );
    err.status = 409;
    err.code = 'DUPLICATE_USER';
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ username, email, passwordHash });
  const token = generateToken(user);

  return { user, token };
}

/**
 * Log in an existing user.
 *
 * @param {{ email: string, password: string }} data
 * @returns {Promise<{ user: object, token: string }>}
 * @throws {Error} 401 INVALID_CREDENTIALS if email not found or password wrong
 */
async function login({ email, password }) {
  const user = await User.findOne({ email: email.toLowerCase() });

  if (!user) {
    const err = new Error('Invalid email or password');
    err.status = 401;
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  const passwordMatch = await user.comparePassword(password);
  if (!passwordMatch) {
    const err = new Error('Invalid email or password');
    err.status = 401;
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  const token = generateToken(user);
  return { user, token };
}

/**
 * Authenticate a user via Google OAuth credential.
 * Verifies the credential server-side using google-auth-library.
 * Creates a new account when needed, links to existing local account if emails match.
 *
 * @param {{ credential: string }} data
 * @returns {Promise<{ user: object, token: string, isNewUser: boolean }>}
 */
async function googleAuth({ credential }) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    const err = new Error('Google authentication is not configured');
    err.status = 503;
    err.code = 'GOOGLE_AUTH_NOT_CONFIGURED';
    throw err;
  }

  const client = new OAuth2Client(clientId);
  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    payload = ticket.getPayload();
  } catch {
    const err = new Error('Invalid or expired Google credential');
    err.status = 401;
    err.code = 'INVALID_GOOGLE_CREDENTIAL';
    throw err;
  }

  const { sub: googleId, email, name, email_verified } = payload;

  if (!email_verified) {
    const err = new Error('Google account email is not verified');
    err.status = 401;
    err.code = 'GOOGLE_EMAIL_NOT_VERIFIED';
    throw err;
  }

  // Return existing Google-linked user
  let user = await User.findOne({ googleId });
  if (user) {
    const token = generateToken(user);
    return { user, token, isNewUser: false };
  }

  // Link Google ID to existing local account if emails match
  const existingByEmail = await User.findOne({ email: email.toLowerCase() });
  if (existingByEmail) {
    if (existingByEmail.authProvider === 'local') {
      existingByEmail.googleId = googleId;
      await existingByEmail.save();
      const token = generateToken(existingByEmail);
      return { user: existingByEmail, token, isNewUser: false };
    }
    const err = new Error('An account with this email already exists');
    err.status = 409;
    err.code = 'DUPLICATE_USER';
    throw err;
  }

  // Create new Google account with a derived username
  const baseUsername = (name || email.split('@')[0])
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 16) || 'user';
  let username = baseUsername;
  let attempts = 0;
  while ((await User.findOne({ username })) && attempts < 10) {
    username = baseUsername + Math.floor(1000 + Math.random() * 9000);
    attempts++;
  }

  user = await User.create({
    username,
    email: email.toLowerCase(),
    googleId,
    authProvider: 'google',
  });

  const token = generateToken(user);
  return { user, token, isNewUser: true };
}

module.exports = { register, login, generateToken, googleAuth };
