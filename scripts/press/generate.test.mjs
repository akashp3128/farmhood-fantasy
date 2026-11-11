import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PRESS_CONFIG } from './config.mjs';
import {
  compactSnapshot,
  editionBudget,
  generatePress,
  mergeArticle,
  promptInstructions,
  removeCopyRecoveryCheckpoint,
  validateArticleCopyRecoverably
} from './generate.mjs';
import { validatePress } from './validate.mjs';
import { writeJsonAtomic } from './utils.mjs';

const copy = {
  title: 'Weekend Outlook after Thursday',
  dek: 'Known points meet the remaining slate.',
  lead: ['Thursday is known.', 'Sunday remains projected.'],
  pullQuote: 'No time machine required.',
  keyStat: { label: 'Locked', value: '1', note: 'Captured live.' },
  matchups: [{ matchupId: 1, headline: 'Live', analysis: 'A current-state outlook.', upsetPath: '', historyNote: '', factIds: ['late:1'] }],
  storylines: [],
  awards: []
};

const latePrediction = {
  predictionSetId: 'farmhood-2026-week-03-late',
  predictionKind: 'late_forecast',
  receiptEligible: false,
  state: 'locked_late',
  factsAsOf: '2026-09-25T18:00:00.000Z',
  sourceSnapshotId: 'week-03-live',
  predictions: [{
    predictionId: '2026-w3-m1-late',
    predictionKind: 'late_forecast',
    receiptEligible: false,
    matchupId: 1,
    managerA: 'Blumbo',
    managerB: 'maco71',
    currentScoreA: 18,
    currentScoreB: 0,
    remainingProjectionA: 92,
    remainingProjectionB: 105,
    forecastScoreA: 110,
    forecastScoreB: 105,
    forecastWinner: 'Blumbo',
    forecastProbability: 0.569,
    startedAtCapture: true,
    lockedStarterCount: 1,
    forecastStatus: 'complete',
    missingProjectionPlayers: [],
    factIds: ['late:1']
  }]
};

function snapshot({ final = false } = {}) {
  return {
    id: final ? 'week-03-final' : 'week-03-live',
    kind: final ? 'final' : 'live',
    phase: { key: final ? 'final' : 'live' },
    immutable: true,
    season: 2026,
    week: 3,
    generatedAt: final ? '2026-09-29T09:00:00.000Z' : '2026-09-25T18:00:00.000Z',
    factsAsOf: final ? '2026-09-29T09:00:00.000Z' : '2026-09-25T18:00:00.000Z',
    validation: { projectionCoverage: 1 },
    powerBoard: [],
    matchups: [{
      matchupId: 1,
      managerA: 'Blumbo',
      managerB: 'maco71',
      currentScoreA: final ? 120 : 18,
      currentScoreB: final ? 108 : 0,
      remainingProjectionA: 92,
      remainingProjectionB: 105,
      forecastScoreA: 110,
      forecastScoreB: 105,
      forecastWinner: 'Blumbo',
      forecastProbability: 0.569,
      startedAtCapture: true,
      lockedStarterCount: 1,
      forecastStatus: 'complete',
      missingProjectionPlayers: [],
      receiptEligible: false,
      injuries: [],
      suggestedSwaps: [],
      factIds: ['late:1']
    }],
    teams: [
      { rosterId: 1, manager: 'Blumbo', projectedScore: 110, currentScore: 18, remainingProjection: 92, forecastScore: 110, startedAtCapture: true, lockedStarterCount: 1, forecastStatus: 'complete', missingProjectionPlayers: [], lineupHash: 'a', starters: [{ id: '1', name: 'Player A', projection: 12, points: final ? 20 : 18 }] },
      { rosterId: 2, manager: 'maco71', projectedScore: 105, currentScore: 0, remainingProjection: 105, forecastScore: 105, startedAtCapture: false, lockedStarterCount: 0, forecastStatus: 'complete', missingProjectionPlayers: [], lineupHash: 'b', starters: [{ id: '2', name: 'Player B', projection: 15, points: final ? 12 : null }] }
    ]
  };
}

function merge(type, currentSnapshot) {
  return mergeArticle({
    copy,
    snapshot: currentSnapshot,
    prediction: latePrediction,
    type,
    tone: 'spicy',
    model: 'test-model',
    responseId: 'test-response',
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 }
  });
}

test('builds an immutable-semantics Weekend Outlook without original-prediction fields', () => {
  const article = merge('late-preview', snapshot());
  assert.equal(article.articleId, '2026-week-03-late-preview');
  assert.equal(article.type, 'week_late_preview');
  assert.equal(article.edition, 'Weekend Outlook');
  assert.equal(article.forecastContext.mode, 'late_outlook');
  assert.equal(article.receipts, null);
  assert.equal(article.matchups[0].receiptEligible, false);
  assert.equal(Object.hasOwn(article.matchups[0], 'predictedWinner'), false);
  assert.equal(Object.hasOwn(article.matchups[0], 'predictionCorrect'), false);
});

test('a recap sourced from a late outlook stays ungraded', () => {
  const article = merge('recap', snapshot({ final: true }));
  assert.equal(article.type, 'week_recap');
  assert.equal(article.forecastContext.mode, 'late_outlook_baseline');
  assert.equal(article.receipts, null);
  assert.equal(article.matchups[0].winner, 'Blumbo');
  assert.equal(article.matchups[0].forecastWinner, 'Blumbo');
  assert.equal(Object.hasOwn(article.matchups[0], 'predictionCorrect'), false);
});

test('results-only merge has final results and no synthetic predictions, projections or grade', () => {
  const article = mergeArticle({ copy, snapshot: snapshot({ final: true }), prediction: null, type: 'recap', resultsOnly: true, tone: 'spicy', model: 'test-model' });
  assert.equal(article.forecastContext.mode, 'results_only');
  assert.equal(article.forecastContext.receiptEligible, false);
  assert.equal(article.source.predictionId, null);
  assert.equal(article.source.predictionKind, 'results_only');
  assert.equal(article.receipts, null);
  assert.equal(article.matchups[0].winner, 'Blumbo');
  assert.equal(article.matchups[0].finalScoreA, 120);
  for (const key of ['predictedWinner', 'predictionCorrect', 'projectedScoreA', 'projectedScoreB', 'forecastWinner', 'forecastScoreA', 'winProbability']) {
    assert.equal(Object.hasOwn(article.matchups[0], key), false, key);
  }
  assert.equal(Object.hasOwn(article.lineupSnapshot.teams[0], 'projection'), false);
  assert.throws(() => mergeArticle({ copy, snapshot: snapshot({ final: true }), prediction: latePrediction, type: 'recap', resultsOnly: true }), /cannot discard a published forecast/);
});

test('results-only prompt omits projection inputs and requests no forecast comparisons', () => {
  const compact = compactSnapshot(snapshot({ final: true }), 'recap', { resultsOnly: true });
  assert.equal(Object.hasOwn(compact.matchups[0], 'projectedScoreA'), false);
  assert.equal(Object.hasOwn(compact.matchups[0], 'predictedWinner'), false);
  assert.equal(Object.hasOwn(compact.teams[0], 'projectedScore'), false);
  assert.equal(Object.hasOwn(compact.teams[0].featuredStarters[0], 'projection'), false);
  assert.equal(Object.hasOwn(compact, 'powerBoard'), false);
  assert.equal(Object.hasOwn(compact.teams[0].featuredStarters[0], 'injuryStatus'), false);
  const instructions = promptInstructions('recap', 'spicy', { resultsOnly: true });
  assert.match(instructions, /results-only recap/);
  assert.match(instructions, /Do not invent predictions, projected-score comparisons/);
  assert.doesNotMatch(instructions, /original prediction is permanent/);
});

function finalFixture() {
  const teams = Object.entries(PRESS_CONFIG.rosterNames).map(([id, manager]) => ({
    rosterId: Number(id), manager, projectedScore: 999, lineupHash: `lineup-${id}`,
    starters: [{ id: `player-${id}`, slot: 'QB', name: `Player ${id}`, projection: 999, points: 100 + Number(id) }],
    injuries: [], emptySlots: [], suggestedSwaps: []
  }));
  const matchups = Array.from({ length: 6 }, (_, index) => ({
    matchupId: index + 1, status: 'final', managerA: teams[index * 2].manager, managerB: teams[index * 2 + 1].manager,
    currentScoreA: 101 + index * 2, currentScoreB: 102 + index * 2, injuries: [], suggestedSwaps: [],
    factIds: [`2026:w5:m${index + 1}:final-score`, `2026:w5:m${index + 1}:starter-scoring`]
  }));
  const final = { ...snapshot({ final: true }), id: 'week-05-final', week: 5, teams, matchups };
  const written = {
    title: 'The final scores settle Week Five', dek: 'Six completed matchups and the players behind them.',
    lead: ['Blumbo scored 101 points.', 'All six matchups are final.'], pullQuote: 'The final scores tell the story.',
    keyStat: { label: 'Completed matchups', value: '6', note: 'Official final scores.' },
    matchups: matchups.map((row) => ({ matchupId: row.matchupId, headline: `${row.managerB} wins`, analysis: `${row.managerB} scored ${row.currentScoreB}.`, upsetPath: '', historyNote: '', factIds: row.factIds })),
    storylines: teams.slice(0, 3).map((team) => ({ title: `${team.manager} scores`, body: `${team.manager} finished the week.`, subjects: [team.manager], factIds: matchups[0].factIds })),
    awards: teams.slice(0, 3).map((team) => ({ title: 'On the board', recipient: team.manager, body: 'A completed week.', factIds: matchups[0].factIds }))
  };
  return { final, written };
}

async function generationFixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'farmhood-press-end-to-end-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { final, written } = finalFixture();
  await Promise.all([
    writeJsonAtomic(path.join(root, 'content/canon/managers.json'), { managers: final.teams.map((team) => ({ displayName: team.manager })) }),
    ...['league', 'editorial-policy'].map((name) => writeJsonAtomic(path.join(root, `content/canon/${name}.json`), {})),
    writeJsonAtomic(path.join(root, 'content/corrections.json'), {}),
    writeJsonAtomic(path.join(root, 'content/articles/index.json'), { schemaVersion: 1, articles: [] })
  ]);
  const previous = Object.fromEntries(['OPENAI_API_KEY', 'OPENAI_MODEL', 'GITHUB_OUTPUT', 'GITHUB_STEP_SUMMARY', 'PRESS_MAX_ESTIMATED_COST_USD'].map((name) => [name, process.env[name]]));
  process.env.OPENAI_API_KEY = 'test-api-key';
  process.env.OPENAI_MODEL = 'gpt-5.6-terra';
  process.env.GITHUB_OUTPUT = path.join(root, 'workflow-output.txt');
  delete process.env.GITHUB_STEP_SUMMARY;
  delete process.env.PRESS_MAX_ESTIMATED_COST_USD;
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  return { root, final, written, options: { type: 'recap', season: 2026, week: 5 }, buildFacts: async () => ({ snapshot: structuredClone(final), prediction: { predictionSetId: 'must-not-be-published', predictions: [] } }) };
}

test('generates and validates a results-only recap end to end, with zero-call duplicate retries and a frozen final', async (t) => {
  const fixture = await generationFixture(t);
  const requests = [];
  globalThis.fetch = async (url, request) => {
    requests.push(String(url));
    const body = JSON.parse(request.body);
    if (String(url).endsWith('/responses/input_tokens')) return Response.json({ input_tokens: 1000 });
    assert.equal(String(url), `${PRESS_CONFIG.openaiApiRoot}/responses`);
    assert.match(await readFile(process.env.GITHUB_OUTPUT, 'utf8'), /request_started=true/);
    const input = JSON.parse(body.input);
    assert.equal(input.forecastContext.mode, 'results_only');
    assert.equal(Object.hasOwn(input, 'originalPrediction'), false);
    assert.deepEqual(input.activeStorylines, { storylines: [] });
    assert.deepEqual(input.recentPublishedArticles, []);
    assert.doesNotMatch(JSON.stringify(input.snapshot), /999|projectedScore|predictedWinner|winProbability/);
    return Response.json({ id: 'test-response-results-only', status: 'completed', model: 'gpt-5.6-terra', usage: { input_tokens: 1000, output_tokens: 1000, total_tokens: 2000 }, output_text: JSON.stringify(fixture.written) });
  };
  await generatePress(fixture);
  assert.equal(requests.length, 2);
  const articlePath = path.join(fixture.root, 'content/articles/2026/week-05-recap.json');
  const article = JSON.parse(await readFile(articlePath, 'utf8'));
  assert.equal(article.forecastContext.mode, 'results_only');
  assert.equal(article.receipts, null);
  await assert.rejects(access(path.join(fixture.root, 'content/predictions/2026-week-05.json')), { code: 'ENOENT' });
  assert.equal((await validatePress({ root: fixture.root })).articles, 1);

  const finalPath = path.join(fixture.root, 'content/snapshots/2026/week-05/final.json');
  const frozen = await readFile(finalPath, 'utf8');
  globalThis.fetch = async () => assert.fail('A duplicate must not contact any API.');
  const noFacts = async () => assert.fail('A duplicate/frozen final must not fetch fresh facts.');
  await generatePress({ ...fixture, buildFacts: noFacts });
  await generatePress({ ...fixture, options: { ...fixture.options, 'snapshot-only': true }, buildFacts: noFacts });
  assert.equal(await readFile(finalPath, 'utf8'), frozen);

  const mutated = structuredClone(article);
  mutated.matchups[0].projectedScoreA = 999;
  await writeJsonAtomic(articlePath, mutated);
  await assert.rejects(validatePress({ root: fixture.root }), /must omit projectedScoreA/);
  await writeJsonAtomic(articlePath, article);
  const indexPath = path.join(fixture.root, 'content/articles/index.json');
  const index = JSON.parse(await readFile(indexPath, 'utf8'));
  delete index.articles[0].forecastContext;
  await writeJsonAtomic(indexPath, index);
  await assert.rejects(validatePress({ root: fixture.root }), /archive disclosure must match/);
});

test('preflight reserves explicit-cache-write cost and never starts an over-budget paid request', async (t) => {
  const fixture = await generationFixture(t);
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls += 1;
    assert.ok(String(url).endsWith('/responses/input_tokens'));
    // Normal input costs $0.032, but a full cache write costs $0.040.
    // With the $0.0312 output ceiling, only the cache-write-aware guard rejects.
    return Response.json({ input_tokens: 16000 });
  };
  await assert.rejects(generatePress(fixture), /worst-case.*above the \$0.07/);
  assert.equal(calls, 1);
  await assert.rejects(access(path.join(fixture.root, 'workflow-output.txt')), { code: 'ENOENT' });
});

test('ambiguous paid transport failure keeps request_started set for the workflow guard', async (t) => {
  const fixture = await generationFixture(t);
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls += 1;
    if (String(url).endsWith('/responses/input_tokens')) return Response.json({ input_tokens: 1000 });
    throw new Error('Connection closed after the request was sent.');
  };
  await assert.rejects(generatePress(fixture), /Connection closed/);
  assert.equal(calls, 2);
  const output = await readFile(path.join(fixture.root, 'workflow-output.txt'), 'utf8');
  assert.match(output, /request_started=true/);
  assert.doesNotMatch(output, /paid_request=true/);
  await assert.rejects(access(path.join(fixture.root, 'content/articles/2026/week-05-recap.json')), { code: 'ENOENT' });
});

test('late-outlook prompt acknowledges known Thursday facts and bans hindsight framing', () => {
  const instructions = promptInstructions('late-preview', 'spicy');
  assert.match(instructions, /Thursday scoring is already known/);
  assert.match(instructions, /not an original pregame preview/);
  assert.match(instructions, /never imply the edition existed before kickoff/);
});

test('per-edition cost policy can be lowered but never raised by a repository variable', () => {
  assert.deepEqual(editionBudget('late-preview', '0.05'), {
    maxOutputTokens: 2300,
    maxEstimatedCostUsd: 0.05,
    policyMaximumCostUsd: 0.065
  });
  assert.equal(editionBudget('recap', '0.50').maxEstimatedCostUsd, 0.07);
  assert.equal(editionBudget('preview').maxOutputTokens, 2600);
});

test('checkpoints paid structured copy before semantic rejection without creating an article', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'farmhood-press-recovery-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const recoveryPath = path.join(directory, '.github', 'press-recovery', '2026-week-03-late-preview.json');
  const rejectedCopy = structuredClone(copy);
  rejectedCopy.matchups[0].factIds = ['invented:fact'];

  await assert.rejects(
    validateArticleCopyRecoverably({
      copy: rejectedCopy,
      snapshot: snapshot(),
      prediction: latePrediction,
      type: 'late-preview',
      lateForecast: true,
      recoveryPath,
      recoveryMetadata: {
        articleId: '2026-week-03-late-preview',
        responseId: 'resp_paid_test',
        model: 'test-model'
      }
    }),
    /Unknown fact ID/
  );

  const checkpoint = JSON.parse(await readFile(recoveryPath, 'utf8'));
  assert.equal(checkpoint.publicationStatus, 'not_published');
  assert.equal(checkpoint.semanticValidation.status, 'rejected');
  assert.match(checkpoint.semanticValidation.error, /Unknown fact ID/);
  assert.deepEqual(checkpoint.structuredCopy, rejectedCopy);
  await assert.rejects(access(path.join(directory, 'content', 'articles', '2026', 'week-03-late-preview.json')), { code: 'ENOENT' });
});

test('keeps validated copy recoverable until the caller finishes the draft, then removes it', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'farmhood-press-recovery-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const recoveryPath = path.join(directory, '.github', 'press-recovery', '2026-week-03-late-preview.json');

  const accepted = await validateArticleCopyRecoverably({
    copy: structuredClone(copy),
    snapshot: snapshot(),
    prediction: latePrediction,
    type: 'late-preview',
    lateForecast: true,
    recoveryPath,
    recoveryMetadata: { articleId: '2026-week-03-late-preview' }
  });
  assert.equal(accepted.title, copy.title);
  const checkpoint = JSON.parse(await readFile(recoveryPath, 'utf8'));
  assert.equal(checkpoint.publicationStatus, 'not_published');
  assert.equal(checkpoint.semanticValidation.status, 'passed');

  await removeCopyRecoveryCheckpoint(recoveryPath);
  await assert.rejects(access(recoveryPath), { code: 'ENOENT' });
  await removeCopyRecoveryCheckpoint(recoveryPath);
});

test('normalizes exact canonical handles before validation and records recoverable corrections', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'farmhood-press-normalized-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const recoveryPath = path.join(directory, 'copy.json');
  const original = { ...copy, title: 'BL UMBO has the current edge' };
  const accepted = await validateArticleCopyRecoverably({ copy: original, snapshot: snapshot(), prediction: latePrediction, type: 'late-preview', lateForecast: true, recoveryPath, recoveryMetadata: {} });
  assert.equal(accepted.title, 'Blumbo has the current edge');
  const checkpoint = JSON.parse(await readFile(recoveryPath, 'utf8'));
  assert.equal(checkpoint.originalStructuredCopy.title, original.title);
  assert.equal(checkpoint.structuredCopy.title, accepted.title);
  assert.equal(checkpoint.normalization.corrections[0].canonical, 'Blumbo');
  assert.equal(checkpoint.semanticValidation.status, 'passed');
});
