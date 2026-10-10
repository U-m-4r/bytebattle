const { ZodError } = require('zod');
const mongoose = require('mongoose');

/**
 * Global Express error handler (4-argument middleware).
 * Must be registered last with app.use().
 */
function globalErrorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const isDev = process.env.NODE_ENV === 'development';

  // Mongoose ValidationError
  if (err instanceof mongoose.Error.ValidationError) {
    const fields = {};
    for (const [key, val] of Object.entries(err.errors)) {
      fields[key] = val.message;
    }
    return res.status(400).json({
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        fields,
      },
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const duplicateField = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({
      error: {
        message: `An account with that ${duplicateField} already exists`,
        code: 'DUPLICATE_KEY',
      },
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: {
        message: 'Invalid or expired token',
        code: 'UNAUTHORIZED',
      },
    });
  }

  // Zod validation errors
  if (err instanceof ZodError) {
    const fields = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || 'value';
      fields[key] = issue.message;
    }
    return res.status(400).json({
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        fields,
      },
    });
  }

  // Errors thrown from services with a .status property
  if (err.status) {
    return res.status(err.status).json({
      error: {
        message: err.message,
        code: err.code || 'ERROR',
        ...(err.existingDuelId && { existingDuelId: err.existingDuelId }),
      },
    });
  }

  // Generic fallback
  const status = err.status || 500;
  return res.status(status).json({
    error: {
      message: isDev ? err.message : 'Internal server error',
      ...(isDev && { stack: err.stack }),
    },
  });
}

module.exports = { globalErrorHandler };
