import { assert } from './utils.mjs';

export function isLateForecastLedger(ledger) {
  return ledger?.predictionKind === 'late_forecast'
    || ledger?.state === 'locked_late'
    || (Array.isArray(ledger?.predictions) && ledger.predictions.length > 0 && ledger.predictions.every((item) => item?.predictionKind === 'late_forecast'));
}

export function expectedPredictionSnapshot(articleType, publishedSnapshot, originalSnapshot, lateSnapshot = null, ledger = null) {
  if (String(articleType).includes('recap')) {
    if (originalSnapshot) return originalSnapshot;
    if (isLateForecastLedger(ledger)) return lateSnapshot;
    return null;
  }
  return publishedSnapshot;
}

export function assertPredictionLineage({ articleType, publishedSnapshot, originalSnapshot, lateSnapshot = null, ledger, label = 'Article' }) {
  const expected = expectedPredictionSnapshot(articleType, publishedSnapshot, originalSnapshot, lateSnapshot, ledger);
  assert(expected?.id, `${label} is missing the prediction source snapshot.`);
  assert(ledger?.sourceSnapshotId === expected.id, `${label} prediction snapshot mismatch.`);
  return expected.id;
}
