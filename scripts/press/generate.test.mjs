import assert from 'node:assert/strict';
import test from 'node:test';
import { editionBudget, mergeArticle, promptInstructions } from './generate.mjs';

const copy = {
  title: 'Weekend Outlook after Thursday',
  dek: 'Known points meet the remaining slate.',
  lead: ['Thursday is known.', 'Sunday remains projected.'],
  pullQuote: 'No time machine required.',
  keyStat: { label: 'Locked', value: '1', note: 'Captured live.' },
  matchups: [{ matchupId: 1, headline: 'Live', analysis: 'A current-state outlook.', upsetPath: '', historyNote: '', factIds: ['late:1'] }],
  storylines: [],
  awards: []
};

const latePrediction = {
  predictionSetId: 'farmhood-2026-week-03-late',
  predictionKind: 'late_forecast',
  receiptEligible: false,
  state: 'locked_late',
  factsAsOf: '2026-09-25T18:00:00.000Z',
  sourceSnapshotId: 'week-03-live',
  predictions: [{
    predictionId: '2026-w3-m1-late',
    predictionKind: 'late_forecast',
    receiptEligible: false,
    matchupId: 1,
    managerA: 'Blumbo',
    managerB: 'maco71',
    currentScoreA: 18,
    currentScoreB: 0,
    remainingProjectionA: 92,
    remainingProjectionB: 105,
    forecastScoreA: 110,
    forecastScoreB: 105,
    forecastWinner: 'Blumbo',
    forecastProbability: 0.569,
    startedAtCapture: true,
    lockedStarterCount: 1,
    forecastStatus: 'complete',
    missingProjectionPlayers: [],
    factIds: ['late:1']
  }]
};

function snapshot({ final = false } = {}) {
  return {
    id: final ? 'week-03-final' : 'week-03-live',
    season: 2026,
    week: 3,
    generatedAt: final ? '2026-09-29T09:00:00.000Z' : '2026-09-25T18:00:00.000Z',
    factsAsOf: final ? '2026-09-29T09:00:00.000Z' : '2026-09-25T18:00:00.000Z',
    validation: { projectionCoverage: 1 },
    matchups: [{
      matchupId: 1,
      managerA: 'Blumbo',
      managerB: 'maco71',
      currentScoreA: final ? 120 : 18,
      currentScoreB: final ? 108 : 0,
      remainingProjectionA: 92,
      remainingProjectionB: 105,
      forecastScoreA: 110,
      forecastScoreB: 105,
      forecastWinner: 'Blumbo',
      forecastProbability: 0.569,
      startedAtCapture: true,
      lockedStarterCount: 1,
      forecastStatus: 'complete',
      missingProjectionPlayers: [],
      receiptEligible: false,
      injuries: [],
      suggestedSwaps: [],
      factIds: ['late:1']
    }],
    teams: [
      { rosterId: 1, manager: 'Blumbo', projectedScore: 110, currentScore: 18, remainingProjection: 92, forecastScore: 110, startedAtCapture: true, lockedStarterCount: 1, forecastStatus: 'complete', missingProjectionPlayers: [], lineupHash: 'a', starters: [{ id: '1', name: 'Player A', projection: 12, points: final ? 20 : 18 }] },
      { rosterId: 2, manager: 'maco71', projectedScore: 105, currentScore: 0, remainingProjection: 105, forecastScore: 105, startedAtCapture: false, lockedStarterCount: 0, forecastStatus: 'complete', missingProjectionPlayers: [], lineupHash: 'b', starters: [{ id: '2', name: 'Player B', projection: 15, points: final ? 12 : null }] }
    ]
  };
}

function merge(type, currentSnapshot) {
  return mergeArticle({
    copy,
    snapshot: currentSnapshot,
    prediction: latePrediction,
    type,
    tone: 'spicy',
    model: 'test-model',
    responseId: 'test-response',
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 }
  });
}

test('builds an immutable-semantics Weekend Outlook without original-prediction fields', () => {
  const article = merge('late-preview', snapshot());
  assert.equal(article.articleId, '2026-week-03-late-preview');
  assert.equal(article.type, 'week_late_preview');
  assert.equal(article.edition, 'Weekend Outlook');
  assert.equal(article.forecastContext.mode, 'late_outlook');
  assert.equal(article.receipts, null);
  assert.equal(article.matchups[0].receiptEligible, false);
  assert.equal(Object.hasOwn(article.matchups[0], 'predictedWinner'), false);
  assert.equal(Object.hasOwn(article.matchups[0], 'predictionCorrect'), false);
});

test('a recap sourced from a late outlook stays ungraded', () => {
  const article = merge('recap', snapshot({ final: true }));
  assert.equal(article.type, 'week_recap');
  assert.equal(article.forecastContext.mode, 'late_outlook_baseline');
  assert.equal(article.receipts, null);
  assert.equal(article.matchups[0].winner, 'Blumbo');
  assert.equal(article.matchups[0].forecastWinner, 'Blumbo');
  assert.equal(Object.hasOwn(article.matchups[0], 'predictionCorrect'), false);
});

test('late-outlook prompt acknowledges known Thursday facts and bans hindsight framing', () => {
  const instructions = promptInstructions('late-preview', 'spicy');
  assert.match(instructions, /Thursday scoring is already known/);
  assert.match(instructions, /not an original pregame preview/);
  assert.match(instructions, /never imply the edition existed before kickoff/);
});

test('per-edition cost policy can be lowered but never raised by a repository variable', () => {
  assert.deepEqual(editionBudget('late-preview', '0.05'), {
    maxOutputTokens: 2300,
    maxEstimatedCostUsd: 0.05,
    policyMaximumCostUsd: 0.065
  });
  assert.equal(editionBudget('recap', '0.50').maxEstimatedCostUsd, 0.07);
  assert.equal(editionBudget('preview').maxOutputTokens, 2600);
});
