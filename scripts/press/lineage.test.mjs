import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPredictionLineage, expectedPredictionSnapshot } from './lineage.mjs';

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
