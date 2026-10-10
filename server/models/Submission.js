const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      index: true,
    },
    problemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Problem',
      required: [true, 'problemId is required'],
    },
    code: {
      type: String,
      required: [true, 'code is required'],
      maxlength: [50000, 'Code must not exceed 50 000 characters'],
    },
    language: {
      type: String,
      enum: ['javascript'],
      default: 'javascript',
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'error'],
      default: 'pending',
    },
    /** Raw JudgeResult object — stored as-is */
    judgeResult: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    passedCount: {
      type: Number,
      default: 0,
    },
    totalCount: {
      type: Number,
      default: 0,
    },
    /** True when the result came from the mock judge provider */
    isMock: {
      type: Boolean,
      default: false,
    },
    /** Optional link to a duel */
    duelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Duel',
      default: null,
    },
  },
  { timestamps: true }
);

// Compound index for per-user problem history queries
submissionSchema.index({ userId: 1, problemId: 1, createdAt: -1 });

const Submission = mongoose.model('Submission', submissionSchema);

module.exports = Submission;
