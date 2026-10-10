'use strict';

const mongoose = require('mongoose');

const duelSchema = new mongoose.Schema(
  {
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'creatorId is required'],
    },
    opponentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    problemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Problem',
      required: [true, 'problemId is required'],
    },
    status: {
      type: String,
      enum: ['waiting', 'active', 'completed', 'cancelled'],
      default: 'waiting',
      index: true,
    },
    isRated: {
      type: Boolean,
      default: true,
    },
    winnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    isDraw: {
      type: Boolean,
      default: false,
    },
    ratingApplied: {
      type: Boolean,
      default: false,
    },
    creatorSubmissionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Submission',
      default: null,
    },
    opponentSubmissionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Submission',
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    countdownStartedAt: {
      type: Date,
      default: null,
    },
    startsAt: {
      type: Date,
      default: null,
    },
    /**
     * True only after startsAt has elapsed and the match is actually playable.
     * status:'active' covers both countdown and live-match windows; this field
     * disambiguates for any consumer that cannot check startsAt directly.
     */
    matchStarted: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Compound indexes for efficient participant queries
duelSchema.index({ creatorId: 1, status: 1 });
duelSchema.index({ opponentId: 1, status: 1 });

module.exports = mongoose.model('Duel', duelSchema);
