const { Router } = require('express');
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { registerSchema, loginSchema, googleAuthSchema } = require('../validators/authValidators');

const router = Router();

// POST /api/auth/register
router.post('/register', validate(registerSchema), authController.register);

// POST /api/auth/login
router.post('/login', validate(loginSchema), authController.login);

// POST /api/auth/google
router.post('/google', validate(googleAuthSchema), authController.googleSignIn);

// GET /api/auth/me
router.get('/me', requireAuth, authController.me);

module.exports = router;
