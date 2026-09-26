import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPredictionLineage, expectedPredictionSnapshot, isLateForecastLedger } from './lineage.mjs';

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
