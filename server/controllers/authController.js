const authService = require('../services/authService');
const User = require('../models/User');

/**
 * POST /api/auth/register
 */
async function register(req, res, next) {
  try {
    const { user, token } = await authService.register(req.body);
    return res.status(201).json({ user, token });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/login
 */
async function login(req, res, next) {
  try {
    const { user, token } = await authService.login(req.body);
    return res.status(200).json({ user, token });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/me
 * Requires requireAuth middleware to run first.
 */
async function me(req, res, next) {
  try {
    const user = await User.findById(req.user.id).select('-passwordHash');
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found', code: 'NOT_FOUND' } });
    }
    return res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/google
 */
async function googleSignIn(req, res, next) {
  try {
    const { user, token, isNewUser } = await authService.googleAuth(req.body);
    return res.status(isNewUser ? 201 : 200).json({ user, token });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, me, googleSignIn };
