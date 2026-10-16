import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildReportingPacket } from '../reporting-packet.mjs';
import { buildReportingInputFromSnapshots } from './production-snapshot.mjs';

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));

test('adapts real Farmhood snapshots into a reconciled six-matchup recap packet', async () => {
  const [currentSnapshot, referenceSnapshot, week1, week2, leagueCanon, managersCanon] = await Promise.all([
    readJson('../../../content/snapshots/2026/week-03/final.json'),
    readJson('../../../content/snapshots/2026/week-03/live.json'),
    readJson('../../../content/snapshots/2026/week-01/final.json'),
    readJson('../../../content/snapshots/2026/week-02/final.json'),
    readJson('../../../content/canon/league.json'),
    readJson('../../../content/canon/managers.json')
  ]);
  const raw = buildReportingInputFromSnapshots({
    currentSnapshot,
    referenceSnapshot,
    seasonSnapshots: [week1, week2, currentSnapshot],
    leagueCanon,
    managersCanon
  });
  const packet = buildReportingPacket(raw);
  assert.equal(packet.summary.managerCount, 12);
  assert.equal(packet.summary.matchupCount, 6);
  assert.equal(packet.summary.completedSeasonWeeks, 3);
  assert.equal(packet.identities.filter((row) => row.type === 'player').length, 120);
  assert.ok(packet.facts.some((fact) => fact.kind === 'weekly_high_score' && fact.subject.label === 'cuch' && fact.value === 154.48));
  assert.ok(packet.facts.some((fact) => fact.kind === 'team_week_projection' && fact.context.projectionKind === 'late-outlook'));
  assert.ok(packet.facts.some((fact) => fact.kind === 'player_projection_delta'));
  assert.equal(packet.facts.some((fact) => fact.kind === 'player_projection' && fact.subject.label === 'Denzel Boston'), false);
  assert.ok(packet.facts.some((fact) => fact.kind === 'manager_championship_count' && fact.subject.label === 'martinch94' && fact.value === 3));
  assert.ok(packet.facts.some((fact) => fact.kind === 'manager_canonical_lore' && fact.subject.label === 'maco71' && /single-season scoring record/.test(fact.claim)));
  assert.equal(packet.facts.some((fact) => fact.kind === 'bench_regret_counterfactual'), false);
});

test('fails closed when a final recap has no pre-kickoff or post-Thursday baseline', async () => {
  const [currentSnapshot, leagueCanon, managersCanon] = await Promise.all([
    readJson('../../../content/snapshots/2026/week-03/final.json'),
    readJson('../../../content/canon/league.json'),
    readJson('../../../content/canon/managers.json')
  ]);
  assert.throws(() => buildReportingInputFromSnapshots({
    currentSnapshot,
    referenceSnapshot: currentSnapshot,
    seasonSnapshots: [currentSnapshot],
    leagueCanon,
    managersCanon
  }), /requires the pregame or live outlook snapshot/);
});
