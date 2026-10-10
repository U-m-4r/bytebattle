const jwt = require('jsonwebtoken');

/**
 * Middleware that requires a valid JWT Bearer token.
 * Attaches req.user = { id, username, email } on success.
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: { message: 'Unauthorized', code: 'UNAUTHORIZED' },
    });
  }

  const token = authHeader.slice(7); // remove "Bearer "

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      id: payload.sub,
      username: payload.username,
      email: payload.email,
    };
    next();
  } catch (err) {
    return res.status(401).json({
      error: { message: 'Unauthorized', code: 'UNAUTHORIZED' },
    });
  }
}

module.exports = { requireAuth };
