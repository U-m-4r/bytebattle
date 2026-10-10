const { z } = require('zod');

/**
 * Schema for POST /api/auth/register
 */
const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username may only contain letters, numbers, and underscores'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

/**
 * Schema for POST /api/auth/login
 */
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * Schema for POST /api/auth/google
 */
const googleAuthSchema = z.object({
  credential: z.string().min(1, 'Google credential token is required'),
});

module.exports = { registerSchema, loginSchema, googleAuthSchema };
