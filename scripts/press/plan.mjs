import path from 'node:path';
import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { PRESS_CONFIG } from './config.mjs';
import { assert, fetchJson, parseCli, readJsonIfExists, repoRoot, safeText, weekSlug } from './utils.mjs';

export const AUTOMATIC_EDITIONS = Object.freeze(['recap', 'waiver', 'late-preview']);

export function automaticArticleId(edition, season, week) {
  const suffix = edition === 'waiver' ? 'waiver-recap' : edition;
  return `${season}-${weekSlug(week)}-${suffix}`;
}

export function completedThroughWeek(rosters, maximum = PRESS_CONFIG.regularSeasonWeeks) {
  assert(Array.isArray(rosters) && rosters.length === PRESS_CONFIG.teamCount, `Expected ${PRESS_CONFIG.teamCount} Sleeper rosters.`);
  const games = rosters.map((roster) => {
    const settings = roster?.settings || {};
    const total = Number(settings.wins || 0) + Number(settings.losses || 0) + Number(settings.ties || 0);
    assert(Number.isInteger(total) && total >= 0, 'Sleeper returned an invalid completed-game count.');
    return total;
  });
  return Math.min(maximum, ...games);
}

function currentWeek(league) {
  assert(String(league?.league_id || '') === PRESS_CONFIG.leagueId, 'Sleeper returned the wrong league.');
  assert(Number(league?.season) === PRESS_CONFIG.season, `Sleeper is not reporting the ${PRESS_CONFIG.season} season.`);
  const week = Number(league?.settings?.leg);
  assert(Number.isInteger(week) && week >= 1 && week <= 18, 'Sleeper returned an invalid current week.');
  return week;
}

function hasPublished(publishedIds, edition, season, week) {
  return publishedIds.has(automaticArticleId(edition, season, week));
}

function recapLineageReady(prediction) {
  return Boolean(prediction && ['locked_original', 'locked_late'].includes(prediction.state));
}

export function planAutomaticEdition({
  edition,
  league,
  rosters,
  publishedIds = new Set(),
  predictionsByWeek = new Map(),
  requestedWeek = null,
  startWeek = 1
}) {
  assert(AUTOMATIC_EDITIONS.includes(edition), `Unsupported automatic Press edition: ${edition}.`);
  const season = PRESS_CONFIG.season;
  const liveWeek = currentWeek(league);
  assert(Number.isInteger(startWeek) && startWeek >= 1 && startWeek <= PRESS_CONFIG.regularSeasonWeeks, 'Automatic Press start week is invalid.');
  const manualWeek = requestedWeek == null || requestedWeek === '' ? null : Number(requestedWeek);
  if (manualWeek !== null) assert(Number.isInteger(manualWeek) && manualWeek >= 1 && manualWeek <= 18, 'Requested week must be an integer from 1 through 18.');

  if (edition === 'recap') {
    const completed = completedThroughWeek(rosters);
    const candidates = manualWeek === null
      ? Array.from({ length: Math.max(0, completed - startWeek + 1) }, (_, index) => startWeek + index)
      : [manualWeek];
    const missing = candidates.filter((week) => week <= completed && !hasPublished(publishedIds, edition, season, week));
    const week = missing.find((candidate) => recapLineageReady(predictionsByWeek.get(candidate)));
    if (!week) {
      const reason = missing.length
        ? `No unpublished finalized week has a locked Preview or Weekend Outlook ledger; skipped before any AI request.`
        : `Every finalized week through Week ${completed} already has a Recap.`;
      return { shouldRun: false, edition, season, week: null, completedThroughWeek: completed, reason };
    }
    return { shouldRun: true, edition, season, week, articleId: automaticArticleId(edition, season, week), completedThroughWeek: completed, reason: `Week ${week} is final and ready for its Recap.` };
  }

  const week = manualWeek ?? liveWeek;
  if (week > PRESS_CONFIG.regularSeasonWeeks) {
    return { shouldRun: false, edition, season, week, reason: `Week ${week} is outside the configured ${PRESS_CONFIG.regularSeasonWeeks}-week regular season.` };
  }
  if (edition === 'waiver') {
    if (hasPublished(publishedIds, edition, season, week)) return { shouldRun: false, edition, season, week, reason: `Week ${week} already has a Waiver Wire report.` };
    return { shouldRun: true, edition, season, week, articleId: automaticArticleId(edition, season, week), reason: `Week ${week} is ready for its deterministic Waiver Wire report.` };
  }

  const originalId = `${season}-${weekSlug(week)}-preview`;
  if (publishedIds.has(originalId)) return { shouldRun: false, edition, season, week, reason: `Week ${week} already has an original pregame Preview.` };
  if (hasPublished(publishedIds, edition, season, week)) return { shouldRun: false, edition, season, week, reason: `Week ${week} already has a Weekend Outlook.` };
  if (predictionsByWeek.has(week)) return { shouldRun: false, edition, season, week, reason: `Week ${week} already has a prediction ledger, so a late outlook cannot replace it.` };
  return { shouldRun: true, edition, season, week, articleId: automaticArticleId(edition, season, week), reason: `Week ${week} is eligible for a post-Thursday Weekend Outlook timing check.` };
}

async function workflowOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${name}=${safeText(value, 500)}\n`, 'utf8');
}

async function reportPlan(plan) {
  await workflowOutput('should_run', String(plan.shouldRun));
  await workflowOutput('edition', plan.edition);
  await workflowOutput('season', plan.season);
  await workflowOutput('week', plan.week ?? '');
  await workflowOutput('article_id', plan.articleId || '');
  await workflowOutput('reason', plan.reason);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `### Farmhood Press automatic plan\n- Edition: ${plan.edition}\n- Week: ${plan.week ?? 'none'}\n- Run generator: ${plan.shouldRun ? 'yes' : 'no'}\n- ${plan.reason}\n`, 'utf8');
  }
}

export async function buildAutomaticPlan({ edition, requestedWeek = null } = {}) {
  const root = repoRoot(import.meta.url);
  const [league, rosters, index, editorial] = await Promise.all([
    fetchJson(`${PRESS_CONFIG.sleeperV1Root}/league/${PRESS_CONFIG.leagueId}`, { attempts: 3, label: 'Sleeper league' }),
    fetchJson(`${PRESS_CONFIG.sleeperV1Root}/league/${PRESS_CONFIG.leagueId}/rosters`, { attempts: 3, label: 'Sleeper rosters' }),
    readJsonIfExists(path.join(root, 'content', 'articles', 'index.json')),
    readJsonIfExists(path.join(root, 'content', 'canon', 'editorial-policy.json'))
  ]);
  const automation = editorial?.generationRules?.scheduledAutomation;
  assert(automation?.enabled === true && automation?.directMainPublicationAllowed === true, 'Editorial policy does not allow automatic direct publication.');
  assert(automation.timezone === PRESS_CONFIG.timezone, 'Press automation timezone does not match the canonical league timezone.');
  assert(Array.isArray(automation.allowedEditions) && automation.allowedEditions.includes(edition), `${edition} is not approved for scheduled publication.`);
  const publishedIds = new Set((index?.articles || []).map((article) => article.articleId));
  const predictionsByWeek = new Map();
  for (let week = 1; week <= 18; week += 1) {
    const prediction = await readJsonIfExists(path.join(root, 'content', 'predictions', `${PRESS_CONFIG.season}-week-${String(week).padStart(2, '0')}.json`));
    if (prediction) predictionsByWeek.set(week, prediction);
  }
  return planAutomaticEdition({ edition, league, rosters, publishedIds, predictionsByWeek, requestedWeek });
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  const edition = String(options.edition || '').toLowerCase();
  const plan = await buildAutomaticPlan({ edition, requestedWeek: options.week || null });
  await reportPlan(plan);
  console.log(JSON.stringify(plan, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Farmhood Press planning failed: ${error.message}`);
    process.exitCode = 1;
  });
}
