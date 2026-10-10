'use strict';

// Pure Elo math — zero mongoose/DB imports.
// This module must remain dependency-free so it can be tested in isolation.

/**
 * Calculate the expected score for player A given both ratings.
 * Uses the standard Elo expected-score formula.
 *
 * @param {number} ratingA
 * @param {number} ratingB
 * @returns {number} expected score for A in [0, 1]
 */
function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Calculate new Elo ratings after a match.
 *
 * @param {number} ratingA       - Current rating of player A
 * @param {number} ratingB       - Current rating of player B
 * @param {'win'|'loss'|'draw'} outcomeForA - Outcome from A's perspective
 * @param {number} [k=32]        - K-factor (default 32)
 * @returns {{ newRatingA: number, newRatingB: number, deltaA: number, deltaB: number }}
 */
function calculateNewRatings(ratingA, ratingB, outcomeForA, k = 32) {
  const scoreMap = { win: 1, draw: 0.5, loss: 0 };
  const scoreA = scoreMap[outcomeForA];

  if (scoreA === undefined) {
    throw new Error(`Invalid outcome: ${outcomeForA}. Must be 'win', 'loss', or 'draw'.`);
  }

  const scoreB = 1 - scoreA;

  const expectedA = expectedScore(ratingA, ratingB);
  const expectedB = expectedScore(ratingB, ratingA);

  const newRatingA = Math.max(100, Math.round(ratingA + k * (scoreA - expectedA)));
  const newRatingB = Math.max(100, Math.round(ratingB + k * (scoreB - expectedB)));

  const deltaA = newRatingA - ratingA;
  const deltaB = newRatingB - ratingB;

  return { newRatingA, newRatingB, deltaA, deltaB };
}

module.exports = { expectedScore, calculateNewRatings };
