import { assert } from './utils.mjs';

export function hasPublishedForecastLedger(ledger) {
  // A malformed published ledger must fail lineage, never become results-only.
  return Boolean(ledger && (['locked_original', 'locked_late', 'graded'].includes(ledger.state) || ledger.lockedAt || ledger.gradedAt || ledger.recapRecordedAt));
}

export function assertResultsOnlyRecap({ articleType, publishedSnapshot, ledger, hasPublishedForecast = false, label = 'Article' }) {
  assert(articleType === 'week_recap', `${label} results-only mode is available only for a recap.`);
  assert(publishedSnapshot?.id && publishedSnapshot?.kind === 'final' && publishedSnapshot?.phase?.key === 'final' && publishedSnapshot?.immutable === true, `${label} results-only recap requires an immutable final snapshot.`);
  assert(!hasPublishedForecast && !hasPublishedForecastLedger(ledger), `${label} results-only recap cannot discard a published forecast.`);
  return publishedSnapshot.id;
}

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

export function assertPredictionLineage({ articleType, publishedSnapshot, originalSnapshot, lateSnapshot = null, ledger, resultsOnly = false, hasPublishedForecast = false, label = 'Article' }) {
  if (resultsOnly) return assertResultsOnlyRecap({ articleType, publishedSnapshot, ledger, hasPublishedForecast, label });
  const expected = expectedPredictionSnapshot(articleType, publishedSnapshot, originalSnapshot, lateSnapshot, ledger);
  assert(expected?.id, `${label} is missing the prediction source snapshot.`);
  assert(ledger?.sourceSnapshotId === expected.id, `${label} prediction snapshot mismatch.`);
  return expected.id;
}
