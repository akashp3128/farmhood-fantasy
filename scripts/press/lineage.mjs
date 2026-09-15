import { assert } from './utils.mjs';

export function expectedPredictionSnapshot(articleType, publishedSnapshot, originalSnapshot) {
  return String(articleType).includes('recap') ? originalSnapshot : publishedSnapshot;
}

export function assertPredictionLineage({ articleType, publishedSnapshot, originalSnapshot, ledger, label = 'Article' }) {
  const expected = expectedPredictionSnapshot(articleType, publishedSnapshot, originalSnapshot);
  assert(expected?.id, `${label} is missing the prediction source snapshot.`);
  assert(ledger?.sourceSnapshotId === expected.id, `${label} prediction snapshot mismatch.`);
  return expected.id;
}
