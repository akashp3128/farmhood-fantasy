import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildDryRunDossier,
  generateShadowEdition,
  loadProductionReportingInput,
  prepareShadowEdition
} from './generate-shadow.mjs';

test('prepares the real Week 3 recap as an isolated evidence-gated assignment', async () => {
  const rawInput = await loadProductionReportingInput({ season: 2026, week: 3, editorialEdition: 'recap' });
  const storyMemory = JSON.parse(await readFile(new URL('../../content/press-v2/story-memory.json', import.meta.url), 'utf8'));
  const prepared = prepareShadowEdition({ rawInput, editorialEdition: 'recap', storyMemory });
  assert.equal(prepared.packet.summary.managerCount, 12);
  assert.equal(prepared.packet.summary.matchupCount, 6);
  assert.equal(prepared.facts.length, 118);
  assert.ok(prepared.facts.some((fact) => fact.kind === 'manager_championship_count' && fact.subject.label === 'martinch94' && fact.value === 3));
  assert.ok(prepared.facts.some((fact) => fact.kind === 'manager_canonical_lore' && fact.subject.label === 'maco71'));
  assert.ok(prepared.researchSubjects.length > 0 && prepared.researchSubjects.length <= 18);
  assert.ok(prepared.researchSubjects.every((subject) => subject.type === 'player'));
  assert.equal(prepared.researchRequest.tools[0].external_web_access, true);
  assert.equal(prepared.researchRequest.max_tool_calls, 3);
  assert.equal(prepared.researchRequest.store, false);
});

test('free dry run writes only a shadow dossier and buys no model call', async () => {
  const rawInput = await loadProductionReportingInput({ season: 2026, week: 3, editorialEdition: 'recap' });
  const root = await mkdtemp(path.join(os.tmpdir(), 'farmhood-press-v2-'));
  const { dossier, dossierPath } = await buildDryRunDossier({
    rawInput,
    editorialEdition: 'recap',
    root,
    now: new Date('2026-10-04T15:00:00.000Z')
  });
  assert.equal(dossier.kind, 'farmhood_press_v2_dry_run_dossier');
  assert.equal(dossier.productionMutationAllowed, false);
  assert.equal(dossier.writerPolicy.receivesTools, false);
  assert.equal(dossier.hardTotalCostUsd, 0.09);
  assert.deepEqual(JSON.parse(await readFile(dossierPath, 'utf8')), dossier);
  await assert.rejects(access(path.join(root, 'content', 'articles', 'index.json')));
});

test('loads a retrospective post-Thursday outlook without leaking the later final', async () => {
  const rawInput = await loadProductionReportingInput({ season: 2026, week: 3, editorialEdition: 'weekend_outlook' });
  assert.deepEqual(rawInput.seasonWeeks.map((row) => row.week), [1, 2]);
  assert.ok(rawInput.currentWeek.matchups.some((row) => row.startedAtCapture));
  assert.ok(rawInput.currentWeek.matchups.some((row) => !row.startedAtCapture));
  const prepared = prepareShadowEdition({ rawInput, editorialEdition: 'weekend_outlook' });
  assert.equal(prepared.researchEdition, 'late-preview');
  assert.ok(prepared.packet.facts.some((fact) => fact.kind === 'team_week_score' && fact.state === 'live'));
  assert.equal(prepared.packet.facts.some((fact) => fact.kind === 'matchup_result' && fact.context.matchupId === 3), false);
});

test('blocks an existing shadow edition before either paid request', async () => {
  const rawInput = await loadProductionReportingInput({ season: 2026, week: 3, editorialEdition: 'recap' });
  const root = await mkdtemp(path.join(os.tmpdir(), 'farmhood-press-v2-existing-'));
  const indexDir = path.join(root, 'content', 'press-v2');
  await mkdir(indexDir, { recursive: true });
  await writeFile(path.join(indexDir, 'index.json'), JSON.stringify({ schemaVersion: 1, articles: [{ articleId: '2026-week-03-recap-v2-shadow' }] }));
  let requested = false;
  await assert.rejects(generateShadowEdition({
    rawInput,
    editorialEdition: 'recap',
    apiKey: 'test-only',
    root,
    recoveryDir: path.join(root, 'recovery'),
    now: new Date('2026-10-04T12:00:00Z'),
    fetchImpl: async () => { requested = true; throw new Error('should not run'); }
  }), /already exists.*No OpenAI request was sent/);
  assert.equal(requested, false);
});

test('records a paid stage even when the provider returns a malformed null payload', async () => {
  const rawInput = await loadProductionReportingInput({ season: 2026, week: 3, editorialEdition: 'recap' });
  const root = await mkdtemp(path.join(os.tmpdir(), 'farmhood-press-v2-null-'));
  const recoveryDir = path.join(root, 'recovery');
  let call = 0;
  const fetchImpl = async () => {
    call += 1;
    return call === 1
      ? { ok: true, status: 200, json: async () => ({ input_tokens: 1_000 }) }
      : { ok: true, status: 200, json: async () => null };
  };
  await assert.rejects(generateShadowEdition({ rawInput, editorialEdition: 'recap', apiKey: 'test-only', root, recoveryDir, fetchImpl, now: new Date('2026-10-04T12:00:00Z') }));
  const recovery = JSON.parse(await readFile(path.join(recoveryDir, '2026-week-03-recap-v2-shadow.json'), 'utf8'));
  assert.deepEqual(recovery.paidStages, ['research']);
  assert.equal(recovery.usageReceiptStatus, 'research_usage_missing');
});
