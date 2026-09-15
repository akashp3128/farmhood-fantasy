import assert from 'node:assert/strict';
import test from 'node:test';
import { gradePredictions } from './grading.mjs';

test('grades a completed recap without relying on generator globals', () => {
  assert.deepEqual(gradePredictions([{
    winner: 'Blumbo',
    predictionCorrect: true,
    finalScoreA: 110,
    finalScoreB: 100,
    projectedScoreA: 100,
    projectedScoreB: 100
  }]), {
    graded: 1,
    correctWinners: '1/1',
    winnerAccuracy: '100%',
    scoreError: 5,
    marginError: 10,
    deskGrade: '93/100'
  });
});

test('returns no grade before a matchup is complete', () => {
  assert.equal(gradePredictions([{ winner: null }]), null);
});
