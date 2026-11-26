import assert from 'node:assert/strict';
import test from 'node:test';
import { lateFactsFixture, buildLateFactsFixture } from '../../tests/helpers/press-outlook.mjs';
import { assertLateOutlookCoverage, lateOutlookCoverage } from './facts.mjs';

test('one unknown starter publishes five safe matchups without changing official positive or zero scores', async () => {
  const { snapshot, prediction } = await buildLateFactsFixture();
  assert.equal(snapshot.phase.key, 'live');
  assert.equal(snapshot.kind, 'live');
  assert.equal(snapshot.immutable, true);
  assert.equal(snapshot.teams.length, 12);
  assert.equal(snapshot.matchups.length, 6);
  assert.equal(snapshot.validation.occupiedStarterSlots, 120);
  assert.equal(snapshot.validation.gameStatusOccupiedStarters, 119);
  assert.equal(snapshot.validation.gameStatusCoverage, 0.9917);
  assert.equal(snapshot.validation.completeForecastMatchups, 5);
  assert.equal(snapshot.validation.forecastMatchupCoverage, 0.8333);
  assert.equal(snapshot.validation.projectionCoverage, 1);
  assert.doesNotThrow(() => assertLateOutlookCoverage(snapshot.validation));

  const affected = snapshot.teams.find(({ rosterId }) => rosterId === 1);
  assert.equal(affected.currentScore, 17.5);
  assert.equal(affected.projectedScore, null, 'legacy projection must not leak an unsafe forecast');
  assert.equal(affected.remainingProjection, null);
  assert.equal(affected.forecastScore, null);
  assert.equal(affected.forecastStatus, 'incomplete');
  assert.equal(affected.pregameProjection, 100, 'pregame reconstruction stays separate from late forecast');
  assert.deepEqual(affected.missingProjectionPlayers, []);
  assert.deepEqual(affected.missingGameStatusPlayers.map(({ id }) => id), ['s1-2']);

  const firstMatchup = snapshot.matchups[0];
  assert.equal(firstMatchup.currentScoreA, 17.5);
  assert.equal(firstMatchup.currentScoreB, 0, 'an official zero is not missing data');
  assert.equal(firstMatchup.forecastScoreA, null);
  assert.equal(firstMatchup.forecastScoreB, 80, 'the locked zero is not added a second time');
  assert.equal(firstMatchup.remainingProjectionA, null);
  assert.equal(firstMatchup.remainingProjectionB, 80);
  for (const field of ['forecastWinner', 'forecastProbability', 'probabilityA']) assert.equal(firstMatchup[field], null, field);
  assert.equal(firstMatchup.forecastStatus, 'incomplete');
  assert.equal(firstMatchup.receiptEligible, false);

  for (const matchup of snapshot.matchups.slice(1)) {
    assert.equal(matchup.forecastStatus, 'complete');
    assert.equal(matchup.remainingProjectionA, 80);
    assert.equal(matchup.remainingProjectionB, 80);
    assert.equal(matchup.forecastScoreA, matchup.currentScoreA + 80);
    assert.equal(matchup.forecastScoreB, matchup.currentScoreB + 80);
    assert.equal(matchup.forecastWinner, matchup.managerB);
    assert.ok(matchup.forecastProbability > 0.5 && matchup.forecastProbability <= 0.85);
    assert.deepEqual(matchup.missingGameStatusPlayers, []);
  }

  assert.equal(prediction.state, 'locked_late');
  assert.equal(prediction.predictionKind, 'late_forecast');
  assert.equal(prediction.receiptEligible, false);
  assert.equal(prediction.immutableAfterKickoff, true);
  assert.equal(prediction.sourceSnapshotId, snapshot.id);
  assert.equal(prediction.grading, null);
  assert.equal(prediction.predictions[0].forecastScoreA, null);
  assert.equal(prediction.predictions[0].forecastWinner, null);
  assert.equal(prediction.predictions[0].forecastProbability, null);
  assert.deepEqual(prediction.predictions[0].missingGameStatusPlayers, firstMatchup.missingGameStatusPlayers);
  assert.equal(firstMatchup.missingGameStatusPlayers[0].manager, affected.manager);
  assert.equal(firstMatchup.missingGameStatusPlayers[0].side, 'A');
});

test('missing, blank, unsupported and explicit bye statuses never become a presumed unstarted game', async () => {
  for (const unknownStatus of [undefined, null, '', ' ', 'unknown', 'bye', 'postponed']) {
    const { snapshot } = await buildLateFactsFixture({ unknownStatus });
    const team = snapshot.teams[0], starter = team.starters[2];
    assert.equal(snapshot.validation.gameStatusOccupiedStarters, 119, String(unknownStatus));
    assert.equal(starter.projection, 10);
    assert.equal(team.forecastStatus, 'incomplete');
    assert.equal(team.forecastScore, null);
    assert.equal(team.remainingProjection, null);
    assert.equal(team.projectedScore, null);
    assert.deepEqual(team.missingGameStatusPlayers.map(({ id }) => id), [starter.id]);
    assert.ok(!Object.hasOwn(starter, 'bye'), 'absence of a schedule row does not establish a bye');
  }
});

test('broad game-status outages remain blocked before a publication can be requested', async () => {
  const unknown = Array.from({ length: 25 }, (_value, index) => `${Math.floor(index / 10) + 1}:${index % 10}`);
  const fixture = lateFactsFixture({ unknown });
  await assert.rejects(fixture.buildFacts(), /Game-status coverage 79% is below the 80% late-outlook gate/);
});

test('two incomplete matchups remain blocked even when more than 98 percent of starters have known statuses', async () => {
  const fixture = lateFactsFixture({ unknown: ['1:2', '3:2'] });
  await assert.rejects(fixture.buildFacts(), /Complete matchup coverage 67% is below the 80% late-outlook gate/);
});

test('the independent projection coverage gate still rejects an upstream projection outage', async () => {
  const missingProjections = Array.from({ length: 25 }, (_value, index) => `${Math.floor(index / 8) + 1}:${index % 8 + 2}`);
  const fixture = lateFactsFixture({ unknown: [], missingProjections });
  assert.equal(fixture.rawWatch.projectionCoverage, 95 / 120);
  await assert.rejects(fixture.buildFacts(), /Projection coverage 79% is below the newsroom gate/);
});

test('late suggestions exclude unknown starter and replacement kickoff states but retain a healthy known pivot', async () => {
  const fixture = lateFactsFixture();
  const rawByRoster = new Map(fixture.rawWatch.teams.map((team) => [team.rosterId, team]));
  assert.ok(rawByRoster.get(1).pivots.some(({ starterId, replacementId }) => starterId === 's1-2' && replacementId === 'b1'));
  assert.ok(rawByRoster.get(3).pivots.some(({ starterId, replacementId }) => starterId === 's3-2' && replacementId === 'b3'));
  const { snapshot } = await fixture.buildFacts();
  const teamByRoster = new Map(snapshot.teams.map((team) => [team.rosterId, team]));
  assert.deepEqual(teamByRoster.get(1).suggestedSwaps, []);
  assert.deepEqual(teamByRoster.get(3).suggestedSwaps, []);
  assert.ok(teamByRoster.get(2).suggestedSwaps.some(({ starterId, alternativeId }) => starterId === 's2-2' && alternativeId === 'b2'));
  const allSwaps = snapshot.matchups.flatMap(({ suggestedSwaps }) => suggestedSwaps);
  assert.ok(!allSwaps.some(({ starterId, alternativeId }) => starterId === 's1-2' || alternativeId === 'b3'));
  assert.ok(allSwaps.some(({ alternativeId }) => alternativeId === 'b2'));
});

test('coverage is recomputed from frozen starters rather than trusting claimed summary fields', async () => {
  const { snapshot } = await buildLateFactsFixture();
  const teams = structuredClone(snapshot.teams), matchups = structuredClone(snapshot.matchups);
  teams[0].forecastStatus = 'complete';
  teams[0].missingGameStatusPlayers = [];
  matchups[0].forecastStatus = 'complete';
  const coverage = lateOutlookCoverage(teams, matchups);
  assert.equal(coverage.gameStatusOccupiedStarters, 119);
  assert.equal(coverage.completeForecastMatchups, 5);
  assert.deepEqual(coverage.missingGameStatusStarters.map(({ id }) => id), ['s1-2']);
});

test('building partial late facts does not mutate injected source fixtures', async () => {
  const fixture = lateFactsFixture();
  const before = structuredClone({ base: fixture.base, playerFeed: fixture.playerFeed, league: fixture.league });
  const first = await fixture.buildFacts();
  const second = await fixture.buildFacts();
  assert.deepEqual({ base: fixture.base, playerFeed: fixture.playerFeed, league: fixture.league }, before);
  assert.deepEqual(first.snapshot, second.snapshot);
  assert.deepEqual(first.prediction, second.prediction);
});
