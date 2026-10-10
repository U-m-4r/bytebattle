'use strict';

const mongoose = require('mongoose');

const ratingHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'userId is required'],
    index: true,
  },
  duelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Duel',
    required: [true, 'duelId is required'],
  },
  oldRating: {
    type: Number,
    required: [true, 'oldRating is required'],
  },
  newRating: {
    type: Number,
    required: [true, 'newRating is required'],
  },
  delta: {
    type: Number,
    required: [true, 'delta is required'],
  },
  outcome: {
    type: String,
    enum: ['win', 'loss', 'draw'],
    required: [true, 'outcome is required'],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Index for chronological user rating history lookups
ratingHistorySchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('RatingHistory', ratingHistorySchema);
