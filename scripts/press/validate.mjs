import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { PRESS_CONFIG } from './config.mjs';
import { assertPredictionLineage, isLateForecastLedger } from './lineage.mjs';
import { buildLateMatchupOutlook, buildLateTeamOutlook } from './outlook.mjs';
import { validateWaiverArticle, WAIVER_ARTICLE_TYPE } from './waivers.mjs';
import { assert, readJsonIfExists, repoRoot } from './utils.mjs';

const root = repoRoot(import.meta.url);
const indexPath = path.join(root, 'content', 'articles', 'index.json');

function closeEnough(a, b) {
  return Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Math.abs(Number(a) - Number(b)) <= 0.02;
}

function sameNullableNumber(a, b) {
  return (a == null && b == null) || closeEnough(a, b);
}

function assertFiniteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} must be a finite number.`);
}

function assertLateForecastShape(row, label) {
  assert(row?.receiptEligible === false, `${label} must be ineligible for prediction receipts.`);
  assert(typeof row.startedAtCapture === 'boolean', `${label} startedAtCapture must be boolean.`);
  assert(Number.isInteger(row.lockedStarterCount) && row.lockedStarterCount >= 0, `${label} lockedStarterCount must be a nonnegative integer.`);
  assert(['complete', 'incomplete'].includes(row.forecastStatus), `${label} has an invalid forecastStatus.`);
  assert(Array.isArray(row.missingProjectionPlayers), `${label} must list missing projection players.`);
  ['currentScoreA', 'currentScoreB'].forEach((field) => assertFiniteNumber(row[field], `${label} ${field}`));
  if (row.forecastStatus === 'complete') {
    ['remainingProjectionA', 'remainingProjectionB', 'forecastScoreA', 'forecastScoreB'].forEach((field) => assertFiniteNumber(row[field], `${label} ${field}`));
    assert(closeEnough(row.forecastScoreA, row.currentScoreA + row.remainingProjectionA), `${label} forecastScoreA formula mismatch.`);
    assert(closeEnough(row.forecastScoreB, row.currentScoreB + row.remainingProjectionB), `${label} forecastScoreB formula mismatch.`);
    assert([row.managerA, row.managerB].includes(row.forecastWinner), `${label} forecast winner is invalid.`);
    assert(Number.isFinite(row.forecastProbability) && row.forecastProbability >= 0.5 && row.forecastProbability <= 0.85, `${label} forecast probability is invalid.`);
  } else {
    assert(row.forecastScoreA == null || row.forecastScoreB == null, `${label} incomplete status requires a missing forecast score.`);
    assert(row.forecastWinner == null && row.forecastProbability == null, `${label} incomplete outlook must withhold winner and probability.`);
  }
}

function assertLateForecastMatches(actual, expected, label) {
  ['currentScoreA', 'currentScoreB', 'remainingProjectionA', 'remainingProjectionB', 'forecastScoreA', 'forecastScoreB', 'forecastProbability']
    .forEach((field) => assert(sameNullableNumber(actual[field], expected[field]), `${label} ${field} mismatch.`));
  ['managerA', 'managerB', 'forecastWinner', 'startedAtCapture', 'lockedStarterCount', 'forecastStatus', 'receiptEligible']
    .forEach((field) => assert(actual[field] === expected[field], `${label} ${field} mismatch.`));
  assert(JSON.stringify(actual.missingProjectionPlayers) === JSON.stringify(expected.missingProjectionPlayers), `${label} missing projection players mismatch.`);
}

function assertNonnegativeNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value) && value >= 0, `${label} must be a nonnegative number.`);
}

function assertPlainText(value, label) {
  if (typeof value !== 'string') return;
  assert(!/<\/?[a-z][^>]*>/i.test(value), `${label} contains raw HTML.`);
  assert(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), `${label} contains control characters.`);
}

function walkText(value, label) {
  if (typeof value === 'string') assertPlainText(value, label);
  else if (Array.isArray(value)) value.forEach((item, index) => walkText(item, `${label}[${index}]`));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => walkText(item, `${label}.${key}`));
}

async function main() {
  const recoveryDirectory = path.join(root, '.github', 'press-recovery');
  const recoveryFiles = await readdir(recoveryDirectory).catch((error) => {
    if (error?.code === 'ENOENT') return [];
    throw error;
  });
  assert(recoveryFiles.length === 0, `Unresolved paid-copy recovery checkpoint(s) cannot be published: ${recoveryFiles.join(', ')}. Repair and validate the article, then remove the checkpoint.`);
  const index = await readJsonIfExists(indexPath);
  assert(index?.schemaVersion === 1, 'Article index schemaVersion must be 1.');
  assert(Array.isArray(index.articles) && index.articles.length > 0, 'Article index must contain at least one published article.');
  const canon = await readJsonIfExists(path.join(root, 'content', 'canon', 'managers.json'));
  const managers = new Set((canon?.managers || []).map((manager) => manager.displayName));
  assert(managers.size === PRESS_CONFIG.teamCount, `Expected ${PRESS_CONFIG.teamCount} canonical managers.`);
  const ids = new Set();

  const usageLedger = await readJsonIfExists(path.join(root, 'content', 'usage', 'ledger.json'));
  assert(usageLedger?.schemaVersion === 1 && Array.isArray(usageLedger.entries), 'AI usage ledger is missing or invalid.');
  const usageIds = new Set();
  const calculatedUsage = { requests: 0, inputTokens: 0, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };
  usageLedger.entries.forEach((entry) => {
    assert(entry?.id && !usageIds.has(entry.id), `Duplicate AI usage entry: ${entry?.id || '(missing ID)'}`);
    usageIds.add(entry.id);
    assertNonnegativeNumber(entry.inputTokens, `${entry.id} inputTokens`);
    assertNonnegativeNumber(entry.cachedInputTokens, `${entry.id} cachedInputTokens`);
    assertNonnegativeNumber(entry.cacheWriteInputTokens, `${entry.id} cacheWriteInputTokens`);
    assertNonnegativeNumber(entry.outputTokens, `${entry.id} outputTokens`);
    assertNonnegativeNumber(entry.totalTokens, `${entry.id} totalTokens`);
    assertNonnegativeNumber(entry.estimatedCostUsd, `${entry.id} estimatedCostUsd`);
    assert(entry.cachedInputTokens + entry.cacheWriteInputTokens <= entry.inputTokens, `${entry.id} cached input exceeds total input.`);
    assert(['response_received', 'rejected', 'draft_created'].includes(entry.outcome), `Invalid usage outcome for ${entry.id}.`);
    calculatedUsage.requests += 1;
    ['inputTokens', 'cachedInputTokens', 'cacheWriteInputTokens', 'outputTokens', 'totalTokens'].forEach((field) => { calculatedUsage[field] += entry[field]; });
    calculatedUsage.estimatedCostUsd = Number((calculatedUsage.estimatedCostUsd + entry.estimatedCostUsd).toFixed(6));
  });
  Object.entries(calculatedUsage).forEach(([field, value]) => {
    assertNonnegativeNumber(usageLedger.totals?.[field], `usage totals.${field}`);
    const matches = field === 'estimatedCostUsd' ? Math.abs(usageLedger.totals[field] - value) < 0.000001 : usageLedger.totals[field] === value;
    assert(matches, `AI usage total mismatch for ${field}.`);
  });

  for (const meta of index.articles) {
    assert(meta && typeof meta === 'object', 'Invalid article metadata row.');
    assert(!ids.has(meta.articleId), `Duplicate article ID: ${meta.articleId}`);ids.add(meta.articleId);
    assert(/^content\/articles\/[A-Za-z0-9_./-]+\.json$/.test(meta.path), `Unsafe article path: ${meta.path}`);
    const articlePath = path.resolve(root, meta.path);
    assert(articlePath.startsWith(path.resolve(root, 'content', 'articles') + path.sep), `Article escaped the content directory: ${meta.path}`);
    const article = JSON.parse(await readFile(articlePath, 'utf8'));
    assert(article.articleId === meta.articleId, `Article/index ID mismatch for ${meta.articleId}.`);
    assert(article.title === meta.title && article.dek === meta.dek, `Article/index headline mismatch for ${meta.articleId}.`);
    assert(article.type === meta.type && article.edition === meta.edition, `Article/index edition mismatch for ${meta.articleId}.`);
    assert(article.publishedAt === meta.publishedAt && article.dataAsOf === meta.dataAsOf, `Article/index timestamp mismatch for ${meta.articleId}.`);
    assert(JSON.stringify((article.storylines || []).map((item) => item.title)) === JSON.stringify(meta.storylines || []), `Article/index storyline mismatch for ${meta.articleId}.`);
    assert(JSON.stringify(article.tags || []) === JSON.stringify(meta.tags || []), `Article/index tag mismatch for ${meta.articleId}.`);
    assert(article.status === 'published', `${meta.articleId} is not published.`);
    assert(article.season === meta.season && article.week === meta.week, `${meta.articleId} season/week mismatch.`);
    if (article.type === WAIVER_ARTICLE_TYPE) {
      const transactionPath = path.join(root, 'content', 'transactions', String(article.season), `week-${String(article.week).padStart(2, '0')}.json`);
      const transactionSnapshot = await readJsonIfExists(transactionPath);
      assert(transactionSnapshot?.kind === 'transactions' && transactionSnapshot.immutable === true, `${meta.articleId} is missing its immutable transaction snapshot.`);
      validateWaiverArticle(article, transactionSnapshot);
      article.managerSummaries.forEach((row) => assert(managers.has(row.manager), `Unknown waiver manager: ${row.manager}`));
      walkText(article, meta.articleId);
      continue;
    }
    assert(Array.isArray(article.matchups) && article.matchups.length === 6, `${meta.articleId} must contain six matchup capsules.`);
    assert(article.lineupSnapshot?.teams?.length === 12, `${meta.articleId} must contain a 12-team lineup baseline.`);
    assert(new Set(article.lineupSnapshot.teams.map((team) => team.name)).size === 12, `${meta.articleId} lineup baseline has duplicate managers.`);
    article.lineupSnapshot.teams.forEach((team) => assert(managers.has(team.name), `Unknown lineup manager: ${team.name}`));

    const isRecap = article.type === 'week_recap';
    const isLatePreview = article.type === 'week_late_preview';
    const snapshotKind = isRecap ? 'final' : isLatePreview ? 'live' : 'pre';
    const snapshotPath = path.join(root, 'content', 'snapshots', String(article.season), `week-${String(article.week).padStart(2, '0')}`, `${snapshotKind}.json`);
    const snapshot = await readJsonIfExists(snapshotPath);
    assert(snapshot?.id === article.source?.snapshotId, `Source snapshot mismatch for ${meta.articleId}.`);
    const allowedFactIds = new Set(snapshot.factIds || snapshot.matchups.flatMap((matchup) => matchup.factIds || []));

    const predictionPath = path.join(root, 'content', 'predictions', `${article.season}-week-${String(article.week).padStart(2, '0')}.json`);
    const ledger = await readJsonIfExists(predictionPath);
    assert(ledger?.predictions?.length === 6, `Prediction ledger missing for ${meta.articleId}.`);
    assert(article.source?.predictionId === ledger.predictionSetId, `Prediction source mismatch for ${meta.articleId}.`);
    const originalSnapshot = isRecap || isLatePreview
      ? await readJsonIfExists(path.join(root, 'content', 'snapshots', String(article.season), `week-${String(article.week).padStart(2, '0')}`, 'pre.json'))
      : snapshot;
    const lateSnapshot = isLatePreview
      ? snapshot
      : isRecap && !originalSnapshot
        ? await readJsonIfExists(path.join(root, 'content', 'snapshots', String(article.season), `week-${String(article.week).padStart(2, '0')}`, 'live.json'))
        : null;
    assertPredictionLineage({ articleType: article.type, publishedSnapshot: snapshot, originalSnapshot, lateSnapshot, ledger, label: meta.articleId });
    const lateForecast = isLateForecastLedger(ledger);
    if (isLatePreview || lateForecast) {
      assert(lateForecast, `${meta.articleId} must use a late-forecast ledger.`);
      assert(ledger.state === 'locked_late', `${meta.articleId} late-forecast ledger must remain locked_late.`);
      assert(ledger.predictionKind === 'late_forecast' && ledger.receiptEligible === false, `${meta.articleId} late-forecast ledger metadata is invalid.`);
      const expectedForecastMode = isLatePreview ? 'late_outlook' : 'late_outlook_baseline';
      assert(article.forecastContext?.mode === expectedForecastMode && article.forecastContext?.receiptEligible === false, `${meta.articleId} late-outlook context is invalid.`);
      assert(article.receipts === null, `${meta.articleId} late outlook cannot publish prediction receipts.`);
      assert(!originalSnapshot, `${meta.articleId} cannot combine a late outlook with an original pregame snapshot.`);
      const lineageSnapshot = isLatePreview ? snapshot : lateSnapshot;
      assert(lineageSnapshot?.kind === 'live' && lineageSnapshot.phase?.key === 'live' && lineageSnapshot.immutable === true, `${meta.articleId} must inherit an immutable live-phase snapshot.`);
      assert(lineageSnapshot.forecastContext?.mode === 'late_outlook' && lineageSnapshot.forecastContext?.receiptEligible === false, `${meta.articleId} live snapshot is missing late-outlook context.`);
      assert(lineageSnapshot.validation?.gameStatusCoverage === 1 && lineageSnapshot.validation?.gameStatusOccupiedStarters === lineageSnapshot.validation?.occupiedStarterSlots, `${meta.articleId} must have game-status coverage for every occupied starter.`);
      assert(Array.isArray(lineageSnapshot.validation?.missingGameStatusStarters) && lineageSnapshot.validation.missingGameStatusStarters.length === 0, `${meta.articleId} has occupied starters without a known NFL game status.`);
      lineageSnapshot.teams.flatMap((team) => team.starters || []).filter((player) => player.id !== '0')
        .forEach((player) => assert(Boolean(player.gameStatus), `${meta.articleId} starter ${player.name || player.id} is missing gameStatus.`));
      const originalArticle = await readJsonIfExists(path.join(root, 'content', 'articles', String(article.season), `week-${String(article.week).padStart(2, '0')}-preview.json`));
      assert(!originalArticle, `${meta.articleId} cannot coexist with an original pregame Preview.`);
      const teams = new Map(lineageSnapshot.teams.map((team) => [team.rosterId, team]));
      lineageSnapshot.matchups.forEach((matchup) => {
        assertLateForecastShape(matchup, `${meta.articleId} snapshot matchup ${matchup.matchupId}`);
        const expected = buildLateMatchupOutlook({
          matchupId: matchup.matchupId,
          managerA: matchup.managerA,
          managerB: matchup.managerB,
          teamA: buildLateTeamOutlook({ currentScore: teams.get(matchup.rosterIdA)?.currentScore, starters: teams.get(matchup.rosterIdA)?.starters }),
          teamB: buildLateTeamOutlook({ currentScore: teams.get(matchup.rosterIdB)?.currentScore, starters: teams.get(matchup.rosterIdB)?.starters })
        });
        assertLateForecastMatches(matchup, expected, `${meta.articleId} snapshot matchup ${matchup.matchupId}`);
      });
      if (isLatePreview) {
        assert(article.edition === 'Weekend Outlook', `${meta.articleId} must use the Weekend Outlook edition.`);
      }
    }
    const predictions = new Map(ledger.predictions.map((prediction) => [Number(prediction.matchupId), prediction]));
    const seenMatchups = new Set();
    article.matchups.forEach((matchup) => {
      const id = Number(matchup.matchupId);assert(!seenMatchups.has(id), `Duplicate matchup ${id} in ${meta.articleId}.`);seenMatchups.add(id);
      const prediction = predictions.get(id);assert(prediction, `Missing prediction for matchup ${id}.`);
      assert(matchup.managerA === prediction.managerA && matchup.managerB === prediction.managerB, `Manager mismatch in matchup ${id}.`);
      if (lateForecast) {
        assertLateForecastShape(prediction, `${meta.articleId} ledger matchup ${id}`);
        assert(matchup.receiptEligible === false, `${meta.articleId} matchup ${id} must be ineligible for receipts.`);
        assert(!Object.hasOwn(matchup, 'predictionCorrect'), `${meta.articleId} matchup ${id} must not grade a late forecast.`);
        assert(!Object.hasOwn(matchup, 'predictedWinner'), `${meta.articleId} matchup ${id} must not relabel a late outlook as an original prediction.`);
        const articleOutlook = { ...matchup, currentScoreA: matchup.outlookCurrentScoreA, currentScoreB: matchup.outlookCurrentScoreB };
        assertLateForecastMatches(articleOutlook, prediction, `${meta.articleId} article matchup ${id}`);
      } else {
        assert(matchup.predictedWinner === prediction.predictedWinner, `Prediction winner mismatch in matchup ${id}.`);
        assert(closeEnough(matchup.projectedScoreA, prediction.projectedScoreA) && closeEnough(matchup.projectedScoreB, prediction.projectedScoreB), `Projection mismatch in matchup ${id}.`);
        assert(closeEnough(matchup.winProbability, prediction.winProbability), `Probability mismatch in matchup ${id}.`);
      }
      assert(managers.has(matchup.managerA) && managers.has(matchup.managerB), `Unknown manager in matchup ${id}.`);
      (matchup.factIds || []).forEach((factId) => assert(allowedFactIds.has(factId), `Unknown fact ID ${factId} in matchup ${id}.`));
    });
    walkText(article, meta.articleId);
  }
  assert(ids.has(index.featuredArticleId), 'featuredArticleId does not resolve to a published article.');
  console.log(JSON.stringify({ status: 'passed', articles: ids.size, featuredArticleId: index.featuredArticleId, managers: managers.size }, null, 2));
}

main().catch((error) => {
  console.error(`Farmhood Press validation failed: ${error.message}`);
  process.exitCode = 1;
});
