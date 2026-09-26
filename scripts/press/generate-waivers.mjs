import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PRESS_CONFIG, PRESS_SCHEMA_VERSION } from './config.mjs';
import { buildWaiverArticle, buildWaiverSnapshot, validateWaiverArticle, waiverArticleMetadata } from './waivers.mjs';
import { fetchJson, isoNow, parseCli, parseSeasonWeek, readJsonIfExists, repoRoot, safeText, weekSlug, writeJsonAtomic } from './utils.mjs';

async function appendWorkflowValue(filePath, name, value) {
  if (filePath) await appendFile(filePath, `${name}=${safeText(value, 500)}\n`, 'utf8');
}

async function report({ changed, articleId, message }) {
  await appendWorkflowValue(process.env.GITHUB_OUTPUT, 'changed', String(changed));
  await appendWorkflowValue(process.env.GITHUB_OUTPUT, 'article_id', articleId);
  await appendWorkflowValue(process.env.GITHUB_OUTPUT, 'message', message);
  await appendWorkflowValue(process.env.GITHUB_OUTPUT, 'estimated_cost_usd', '0');
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `### Farmhood Waiver Wire\n- ${message}\n- OpenAI requests: 0\n- Estimated API cost: $0.0000\n`, 'utf8');
  }
}

export async function generateWaiverRecap({ season = PRESS_CONFIG.season, week, now, root: rootOverride, fetchJsonImpl = fetchJson } = {}) {
  const root = rootOverride || repoRoot(import.meta.url), generatedAt = isoNow(now), slug = weekSlug(week);
  const snapshotPath = path.join(root, 'content', 'transactions', String(season), `${slug}.json`);
  const articlePath = path.join(root, 'content', 'articles', String(season), `${slug}-waiver-recap.json`);
  const [existingSnapshot, existingArticle, index] = await Promise.all([
    readJsonIfExists(snapshotPath),
    readJsonIfExists(articlePath),
    readJsonIfExists(path.join(root, 'content', 'articles', 'index.json'))
  ]);
  if (existingSnapshot || existingArticle) {
    if (!existingSnapshot || !existingArticle) throw new Error(`Week ${week} Waiver Wire is partially published; repair the missing snapshot or article instead of regenerating it.`);
    const metadata = (index?.articles || []).find((row) => row.articleId === existingArticle.articleId);
    if (!metadata) throw new Error(`Week ${week} Waiver Wire is partially published; repair its missing article-index entry instead of regenerating it.`);
    if (metadata.type !== existingArticle.type || metadata.edition !== existingArticle.edition) throw new Error(`Week ${week} Waiver Wire article-index metadata is inconsistent; repair it instead of regenerating the frozen report.`);
    validateWaiverArticle(existingArticle, existingSnapshot);
    const message = `Week ${week} Waiver Wire is already frozen. No Sleeper or OpenAI request was sent.`;
    await report({ changed: false, articleId: existingArticle.articleId, message });
    return { changed: false, snapshot: existingSnapshot, article: existingArticle, message };
  }
  const transactionsUrl = `${PRESS_CONFIG.sleeperV1Root}/league/${PRESS_CONFIG.leagueId}/transactions/${week}`;
  const playersUrl = `${PRESS_CONFIG.sleeperV1Root}/players/nfl`;
  const rawTransactions = await fetchJsonImpl(transactionsUrl, { label: `Sleeper Week ${week} transactions` });
  const needsPlayerMap = Array.isArray(rawTransactions) && rawTransactions.some((row) => row?.status === 'complete' && ['waiver', 'free_agent'].includes(row.type) && Number(row.leg) === week && (Object.keys(row.adds || {}).length || Object.keys(row.drops || {}).length));
  const players = needsPlayerMap ? await fetchJsonImpl(playersUrl, { timeoutMs: 60_000, label: 'Sleeper NFL player map' }) : {};
  const snapshot = buildWaiverSnapshot({ rawTransactions, players, season, week, generatedAt });
  const article = buildWaiverArticle(snapshot, { publishedAt: generatedAt });
  await writeJsonAtomic(snapshotPath, snapshot);
  await writeJsonAtomic(articlePath, article);
  const relativeArticlePath = path.relative(root, articlePath).split(path.sep).join('/');
  const metadata = waiverArticleMetadata(article, relativeArticlePath);
  const articles = [metadata, ...((index?.articles || []).filter((item) => item.articleId !== metadata.articleId))];
  await writeJsonAtomic(path.join(root, 'content', 'articles', 'index.json'), {
    schemaVersion: PRESS_SCHEMA_VERSION,
    featuredArticleId: article.articleId,
    updatedAt: article.updatedAt,
    articles
  });
  const message = `Created the deterministic Week ${week} Waiver Wire from ${snapshot.summary.completedTransactions} completed Sleeper transactions.`;
  await report({ changed: true, articleId: article.articleId, message });
  return { changed: true, snapshot, article, message };
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  const { season, week } = parseSeasonWeek(options, { season: PRESS_CONFIG.season, week: 1 });
  const result = await generateWaiverRecap({ season, week, now: options.now });
  console.log(JSON.stringify({
    status: result.changed ? 'created' : 'unchanged',
    articleId: result.article.articleId,
    snapshotId: result.snapshot.id,
    completedTransactions: result.snapshot.summary.completedTransactions,
    openaiRequests: 0,
    estimatedCostUsd: 0,
    message: result.message
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Farmhood Waiver Wire generation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
