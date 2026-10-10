const mongoose = require('mongoose');

const exampleSchema = new mongoose.Schema(
  {
    input: { type: String, default: '' },
    output: { type: String, default: '' },
    explanation: { type: String, default: '' },
  },
  { _id: false }
);

const testCaseSchema = new mongoose.Schema(
  {
    input: { type: String, required: true },
    expectedOutput: { type: String, required: true },
  },
  { _id: false }
);

const problemSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      unique: true,
      trim: true,
    },
    slug: {
      type: String,
      required: [true, 'Slug is required'],
      unique: true,
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
    },
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      required: [true, 'Difficulty is required'],
    },
    /** Public examples shown to the user */
    examples: [exampleSchema],
    /** Private — NEVER sent to the client */
    testCases: [testCaseSchema],
    /** Starter code shown in the editor */
    functionSignature: {
      type: String,
      default: '',
    },
    timeoutMs: {
      type: Number,
      default: 3000,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// ---------------------------------------------------------------------------
// Pre-save hook: auto-generate slug from title
// ---------------------------------------------------------------------------
problemSchema.pre('save', function (next) {
  if (this.isModified('title') || this.isNew) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
  next();
});

// ---------------------------------------------------------------------------
// Static method: returns only public fields, never exposes testCases
// ---------------------------------------------------------------------------
/**
 * Find problems with only public-safe fields.
 * @param {object} filter - Mongoose query filter; defaults to { isActive: true }
 * @returns {Promise<Array>}
 */
problemSchema.statics.findPublic = function (filter = { isActive: true }) {
  return this.find(filter).select('-testCases -__v');
};

// ---------------------------------------------------------------------------
// Instance method: plain public-safe object
// ---------------------------------------------------------------------------
/**
 * Returns a plain JS object with testCases removed.
 * @returns {object}
 */
problemSchema.methods.toPublicJSON = function () {
  const obj = this.toObject();
  delete obj.testCases;
  delete obj.__v;
  return obj;
};

const Problem = mongoose.model('Problem', problemSchema);

module.exports = Problem;
