import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPredictionLineage, expectedPredictionSnapshot, hasPublishedForecastLedger, isLateForecastLedger } from './lineage.mjs';

test('recaps grade the immutable pregame prediction against the final snapshot', () => {
  const pregame = { id: 'week-01-pre' };
  const final = { id: 'week-01-final' };
  const ledger = { sourceSnapshotId: pregame.id };
  assert.equal(expectedPredictionSnapshot('week_recap', final, pregame), pregame);
  assert.equal(assertPredictionLineage({ articleType: 'week_recap', publishedSnapshot: final, originalSnapshot: pregame, ledger }), pregame.id);
});

test('previews and mismatched recap ledgers are validated correctly', () => {
  const pregame = { id: 'week-01-pre' };
  assert.equal(assertPredictionLineage({ articleType: 'week_preview', publishedSnapshot: pregame, originalSnapshot: null, ledger: { sourceSnapshotId: pregame.id } }), pregame.id);
  assert.throws(() => assertPredictionLineage({ articleType: 'week_recap', publishedSnapshot: { id: 'week-01-final' }, originalSnapshot: pregame, ledger: { sourceSnapshotId: 'wrong' } }), /prediction snapshot mismatch/);
});

test('a recap may inherit a locked late-outlook snapshot when no original preview exists', () => {
  const final = { id: 'week-03-final' };
  const live = { id: 'week-03-live' };
  const ledger = {
    predictionKind: 'late_forecast',
    state: 'locked_late',
    sourceSnapshotId: live.id,
    predictions: [{ predictionKind: 'late_forecast', receiptEligible: false }]
  };
  assert.equal(isLateForecastLedger(ledger), true);
  assert.equal(expectedPredictionSnapshot('week_recap', final, null, live, ledger), live);
  assert.equal(assertPredictionLineage({
    articleType: 'week_recap',
    publishedSnapshot: final,
    originalSnapshot: null,
    lateSnapshot: live,
    ledger
  }), live.id);
});

test('a recap cannot silently treat a final snapshot as a prediction source', () => {
  const final = { id: 'week-03-final' };
  assert.throws(() => assertPredictionLineage({
    articleType: 'week_recap',
    publishedSnapshot: final,
    originalSnapshot: null,
    lateSnapshot: null,
    ledger: { state: 'graded', sourceSnapshotId: final.id }
  }), /missing the prediction source snapshot/);
});

const resultOnlyLineage = () => ({
  articleType: 'week_recap',
  publishedSnapshot: { id: 'week-05-final', kind: 'final', phase: { key: 'final' }, immutable: true },
  ledger: null,
  resultsOnly: true
});

test('explicit results-only recap uses final facts without creating prediction lineage', () => {
  assert.equal(assertPredictionLineage(resultOnlyLineage()), 'week-05-final');
  assert.equal(assertPredictionLineage({ ...resultOnlyLineage(), ledger: { state: 'published_prelock', sourceSnapshotId: 'unpublished-snapshot' } }), 'week-05-final');
});

test('results-only mode cannot discard any published forecast ledger or article', () => {
  for (const state of ['locked_original', 'locked_late', 'graded']) {
    assert.equal(hasPublishedForecastLedger({ state }), true);
    assert.throws(() => assertPredictionLineage({ ...resultOnlyLineage(), ledger: { state } }), /cannot discard a published forecast/);
  }
  assert.throws(() => assertPredictionLineage({ ...resultOnlyLineage(), hasPublishedForecast: true }), /cannot discard a published forecast/);
});

test('results-only mode is never available for previews, live or mutable snapshots', () => {
  assert.throws(() => assertPredictionLineage({ ...resultOnlyLineage(), articleType: 'week_preview' }), /only for a recap/);
  for (const override of [{ kind: 'live' }, { phase: { key: 'live' } }, { immutable: false }, { id: null }]) {
    assert.throws(() => assertPredictionLineage({ ...resultOnlyLineage(), publishedSnapshot: { ...resultOnlyLineage().publishedSnapshot, ...override } }), /immutable final snapshot/);
  }
});
