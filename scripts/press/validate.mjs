import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PRESS_CONFIG } from './config.mjs';
import { assert, readJsonIfExists, repoRoot } from './utils.mjs';

const root = repoRoot(import.meta.url);
const indexPath = path.join(root, 'content', 'articles', 'index.json');

function closeEnough(a, b) {
  return Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Math.abs(Number(a) - Number(b)) <= 0.02;
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
  const index = await readJsonIfExists(indexPath);
  assert(index?.schemaVersion === 1, 'Article index schemaVersion must be 1.');
  assert(Array.isArray(index.articles) && index.articles.length > 0, 'Article index must contain at least one published article.');
  const canon = await readJsonIfExists(path.join(root, 'content', 'canon', 'managers.json'));
  const managers = new Set((canon?.managers || []).map((manager) => manager.displayName));
  assert(managers.size === PRESS_CONFIG.teamCount, `Expected ${PRESS_CONFIG.teamCount} canonical managers.`);
  const ids = new Set();

  for (const meta of index.articles) {
    assert(meta && typeof meta === 'object', 'Invalid article metadata row.');
    assert(!ids.has(meta.articleId), `Duplicate article ID: ${meta.articleId}`);ids.add(meta.articleId);
    assert(/^content\/articles\/[A-Za-z0-9_./-]+\.json$/.test(meta.path), `Unsafe article path: ${meta.path}`);
    const articlePath = path.resolve(root, meta.path);
    assert(articlePath.startsWith(path.resolve(root, 'content', 'articles') + path.sep), `Article escaped the content directory: ${meta.path}`);
    const article = JSON.parse(await readFile(articlePath, 'utf8'));
    assert(article.articleId === meta.articleId, `Article/index ID mismatch for ${meta.articleId}.`);
    assert(article.status === 'published', `${meta.articleId} is not published.`);
    assert(article.season === meta.season && article.week === meta.week, `${meta.articleId} season/week mismatch.`);
    assert(Array.isArray(article.matchups) && article.matchups.length === 6, `${meta.articleId} must contain six matchup capsules.`);
    assert(article.lineupSnapshot?.teams?.length === 12, `${meta.articleId} must contain a 12-team lineup baseline.`);
    assert(new Set(article.lineupSnapshot.teams.map((team) => team.name)).size === 12, `${meta.articleId} lineup baseline has duplicate managers.`);
    article.lineupSnapshot.teams.forEach((team) => assert(managers.has(team.name), `Unknown lineup manager: ${team.name}`));

    const snapshotKind = String(article.type).includes('recap') ? 'final' : 'pre';
    const snapshotPath = path.join(root, 'content', 'snapshots', String(article.season), `week-${String(article.week).padStart(2, '0')}`, `${snapshotKind}.json`);
    const snapshot = await readJsonIfExists(snapshotPath);
    assert(snapshot?.id === article.source?.snapshotId, `Source snapshot mismatch for ${meta.articleId}.`);
    const allowedFactIds = new Set(snapshot.factIds || snapshot.matchups.flatMap((matchup) => matchup.factIds || []));

    const predictionPath = path.join(root, 'content', 'predictions', `${article.season}-week-${String(article.week).padStart(2, '0')}.json`);
    const ledger = await readJsonIfExists(predictionPath);
    assert(ledger?.predictions?.length === 6, `Prediction ledger missing for ${meta.articleId}.`);
    assert(article.source?.predictionId === ledger.predictionSetId, `Prediction source mismatch for ${meta.articleId}.`);
    assert(ledger.sourceSnapshotId === snapshot.id, `Prediction snapshot mismatch for ${meta.articleId}.`);
    const predictions = new Map(ledger.predictions.map((prediction) => [Number(prediction.matchupId), prediction]));
    const seenMatchups = new Set();
    article.matchups.forEach((matchup) => {
      const id = Number(matchup.matchupId);assert(!seenMatchups.has(id), `Duplicate matchup ${id} in ${meta.articleId}.`);seenMatchups.add(id);
      const prediction = predictions.get(id);assert(prediction, `Missing prediction for matchup ${id}.`);
      assert(matchup.managerA === prediction.managerA && matchup.managerB === prediction.managerB, `Manager mismatch in matchup ${id}.`);
      assert(matchup.predictedWinner === prediction.predictedWinner, `Prediction winner mismatch in matchup ${id}.`);
      assert(closeEnough(matchup.projectedScoreA, prediction.projectedScoreA) && closeEnough(matchup.projectedScoreB, prediction.projectedScoreB), `Projection mismatch in matchup ${id}.`);
      assert(closeEnough(matchup.winProbability, prediction.winProbability), `Probability mismatch in matchup ${id}.`);
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
