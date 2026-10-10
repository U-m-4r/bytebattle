// Load from root .env first, fall back to server/.env for any missing keys
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
require('dotenv').config(); // server/.env fills in anything not in root

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/authRoutes');
const problemRoutes = require('./routes/problemRoutes');
const submissionRoutes = require('./routes/submissionRoutes');
const duelRoutes = require('./routes/duelRoutes');
const leaderboardRoutes = require('./routes/leaderboardRoutes');
const userRoutes = require('./routes/userRoutes');
const attachDuelSocket = require('./socket/duelSocket');
const { globalErrorHandler } = require('./middleware/errorHandler');

/**
 * Create and configure the Express application, HTTP server, and Socket.IO.
 * Does NOT connect to the database or bind a port.
 *
 * @returns {{ app: import('express').Application, httpServer: import('http').Server, io: import('socket.io').Server }}
 */
function createApp() {
  const app = express();

  // Security headers
  app.use(helmet());

  // CORS
  const corsOrigin = process.env.NODE_ENV === 'production' ? false : 'http://localhost:5173';
  app.use(
    cors({
      origin: corsOrigin,
      credentials: true,
    })
  );

  // Body parsing
  app.use(express.json());

  // HTTP request logging (skip in test environment)
  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }

  // Rate limiting on all /api routes (disabled in test environment to prevent spurious 429s)
  if (process.env.NODE_ENV !== 'test') {
    const apiLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: { message: 'Too many requests, please try again later.', code: 'RATE_LIMITED' } },
    });
    app.use('/api', apiLimiter);
  }

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/problems', problemRoutes);
  app.use('/api/submissions', submissionRoutes);
  app.use('/api/duels', duelRoutes);
  app.use('/api/leaderboard', leaderboardRoutes);
  app.use('/api/users', userRoutes);

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Global error handler — must be last
  app.use(globalErrorHandler);

  // Create HTTP server wrapping Express
  const httpServer = http.createServer(app);

  // Attach Socket.IO to the HTTP server
  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Make `io` accessible from route handlers via `req.app.get('io')`
  app.set('io', io);

  // Attach duel socket handlers
  attachDuelSocket(io);

  return { app, httpServer, io };
}

module.exports = { createApp };

// Only start the server when this file is the entry point
if (require.main === module) {
  const { connectDB } = require('./config/db');
  connectDB().then(() => {
    const { httpServer } = createApp();
    const PORT = process.env.PORT || 5000;
    httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  });
}
