'use strict';

// Pure unit tests — no DB, no beforeAll. Only eloService is imported.
const { expectedScore, calculateNewRatings } = require('../services/eloService');

describe('expectedScore', () => {
  it('returns ~0.5 for equal ratings', () => {
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5, 3);
  });

  it('returns > 0.5 when ratingA > ratingB', () => {
    expect(expectedScore(1400, 1200)).toBeGreaterThan(0.5);
  });

  it('returns < 0.5 when ratingA < ratingB', () => {
    expect(expectedScore(1000, 1200)).toBeLessThan(0.5);
  });
});

describe('calculateNewRatings', () => {
  it('win: winner gains, loser loses (equal starting ratings)', () => {
    const { newRatingA, newRatingB } = calculateNewRatings(1200, 1200, 'win');
    expect(newRatingA).toBeGreaterThan(1200);
    expect(newRatingB).toBeLessThan(1200);
  });

  it('loss: player A loses, player B gains (equal starting ratings)', () => {
    const { newRatingA, newRatingB } = calculateNewRatings(1200, 1200, 'loss');
    expect(newRatingA).toBeLessThan(1200);
    expect(newRatingB).toBeGreaterThan(1200);
  });

  it('draw: ratings move toward each other (|delta| < 16 for equal ratings)', () => {
    const { deltaA, deltaB } = calculateNewRatings(1200, 1200, 'draw');
    expect(Math.abs(deltaA)).toBeLessThan(16);
    expect(Math.abs(deltaB)).toBeLessThan(16);
  });

  it('rating conservation: sum of new ratings ≈ sum of old ratings (±2 for rounding)', () => {
    const ratingA = 1350;
    const ratingB = 1150;
    const { newRatingA, newRatingB } = calculateNewRatings(ratingA, ratingB, 'win');
    expect(Math.abs((newRatingA + newRatingB) - (ratingA + ratingB))).toBeLessThanOrEqual(2);
  });

  it('equal ratings win: deltaA ≈ +16, deltaB ≈ -16 (K=32)', () => {
    const { deltaA, deltaB } = calculateNewRatings(1200, 1200, 'win');
    expect(deltaA).toBe(16);
    expect(deltaB).toBe(-16);
  });

  it('minimum clamp: very weak player cannot drop below 100', () => {
    const { newRatingA } = calculateNewRatings(100, 2000, 'loss', 32);
    expect(newRatingA).toBeGreaterThanOrEqual(100);
  });

  it('custom K-factor: K=64 doubles the delta compared to K=32 (equal ratings, win)', () => {
    const { deltaA: delta32 } = calculateNewRatings(1200, 1200, 'win', 32);
    const { deltaA: delta64 } = calculateNewRatings(1200, 1200, 'win', 64);
    expect(delta64).toBe(delta32 * 2);
  });

  it('throws on invalid outcome', () => {
    expect(() => calculateNewRatings(1200, 1200, 'invalid')).toThrow();
  });
});
