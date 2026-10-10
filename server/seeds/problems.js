// Load env: root .env first, then server/.env for any remaining keys.
// path.resolve(__dirname, ...) makes this work regardless of cwd.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const Problem = require('../models/Problem');

const problems = [
  {
    slug: 'two-sum',
    title: 'Two Sum',
    difficulty: 'easy',
    description:
      "Given an array of integers `nums` and an integer `target`, return the **indices** of the two numbers that add up to `target`. Exactly one solution exists. You may not use the same element twice.",
    examples: [
      { input: 'nums = [2,7,11,15], target = 9', output: '[0,1]', explanation: 'nums[0] + nums[1] = 9' },
      { input: 'nums = [3,2,4], target = 6', output: '[1,2]', explanation: '' },
    ],
    testCases: [
      { input: '2,7,11,15\n9', expectedOutput: '0,1' },
      { input: '3,2,4\n6', expectedOutput: '1,2' },
      { input: '3,3\n6', expectedOutput: '0,1' },
      { input: '-1,-2,-3,-4,-5\n-8', expectedOutput: '2,4' },
      { input: '1,2,3,4,5\n9', expectedOutput: '3,4' },
    ],
    functionSignature: 'function twoSum(nums, target) {\n  // your code here\n}',
  },
  {
    slug: 'valid-parentheses',
    title: 'Valid Parentheses',
    difficulty: 'easy',
    description:
      "Given a string `s` containing only `(`, `)`, `{`, `}`, `[`, `]`, determine if the input string is valid. Brackets must close in the correct order.",
    examples: [
      { input: '()', output: 'true', explanation: '' },
      { input: '()[]{} ', output: 'true', explanation: '' },
      { input: '(]', output: 'false', explanation: '' },
    ],
    testCases: [
      { input: '()', expectedOutput: 'true' },
      { input: '()[]{} ', expectedOutput: 'true' },
      { input: '(]', expectedOutput: 'false' },
      { input: '([)]', expectedOutput: 'false' },
      { input: '{[]}', expectedOutput: 'true' },
      { input: '', expectedOutput: 'true' },
    ],
    functionSignature: 'function isValid(s) {\n  // your code here\n}',
  },
  {
    slug: 'reverse-array',
    title: 'Reverse Array',
    difficulty: 'medium',
    description:
      'Given an array of integers, return the array reversed. Input is a comma-separated list of integers. Output is a comma-separated list.',
    examples: [
      { input: '1,2,3,4,5', output: '5,4,3,2,1', explanation: '' },
      { input: '1,2', output: '2,1', explanation: '' },
    ],
    testCases: [
      { input: '1,2,3,4,5', expectedOutput: '5,4,3,2,1' },
      { input: '1,2', expectedOutput: '2,1' },
      { input: '42', expectedOutput: '42' },
      { input: '-1,-2,-3', expectedOutput: '-3,-2,-1' },
    ],
    functionSignature:
      'function reverseArray(arr) {\n  // arr is an array of numbers\n  // return the reversed array\n}',
  },
];

async function seed() {
  // db.js throws immediately if MONGODB_URI is not set — no silent localhost fallback.
  try {
    await connectDB();
  } catch (err) {
    // connectDB already logged the reason; don't print the URI or credentials.
    console.error('Seed aborted: could not connect to database.');
    process.exit(1);
  }

  try {
    let count = 0;
    for (const problemData of problems) {
      const { slug, ...data } = problemData;
      await Problem.findOneAndUpdate({ slug }, { slug, ...data }, { upsert: true, new: true });
      count++;
    }

    console.log(`Seeded ${count} problems.`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

seed();
