const mongoose = require('mongoose');

/**
 * Connect to MongoDB with retry logic.
 * Attempts up to 3 times with exponential backoff: 1s, 2s, 4s.
 */
async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not set');
  }

  const delays = [1000, 2000, 4000];

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await mongoose.connect(uri);
      console.log(`MongoDB connected (attempt ${attempt})`);
      return;
    } catch (err) {
      if (attempt === 3) {
        console.error('MongoDB connection failed after 3 attempts:', err.message);
        throw err;
      }
      const delay = delays[attempt - 1];
      console.warn(`MongoDB connection attempt ${attempt} failed. Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

module.exports = { connectDB };
