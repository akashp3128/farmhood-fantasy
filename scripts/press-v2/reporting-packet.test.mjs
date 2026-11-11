import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReportingPacket, registryFromPacket } from './reporting-packet.mjs';
import { rankStoryAngles } from './story-angles.mjs';
import { sampleWeekInput } from './fixtures/sample-week.mjs';

function one(packet, kind, subjectId = null) {
  const rows = packet.facts.filter((fact) => fact.kind === kind && (subjectId === null || fact.subject.id === subjectId));
  assert.equal(rows.length, 1, `Expected one ${kind}${subjectId ? ` for ${subjectId}` : ''}, found ${rows.length}.`);
  return rows[0];
}

test('reporting packet emits typed current-week facts with canonical identities', () => {
  const packet = buildReportingPacket(sampleWeekInput(), { maximumCurrentSourceAgeMinutes: 5 });
  assert.equal(packet.summary.managerCount, 4);
  assert.equal(packet.summary.playerCount, 9);
  assert.equal(packet.summary.matchupCount, 2);
  assert.equal(packet.freshness.sources[0].ageMinutes, 2);
  assert.equal(one(packet, 'weekly_high_score').subject.label, 'Gamma');
  assert.equal(one(packet, 'weekly_high_score').value, 160);
  assert.equal(one(packet, 'weekly_closest_game').value, 2);
  assert.equal(one(packet, 'weekly_largest_margin').value, 80);
  assert.equal(one(packet, 'projection_upset').subject.label, 'Alpha_One');
  assert.equal(one(packet, 'projection_upset').value, 15);
  assert.deepEqual(one(packet, 'projection_upset').derivedFrom.map((factId) => packet.facts.find((fact) => fact.factId === factId).kind).sort(), ['matchup_result', 'team_week_projection', 'team_week_projection']);
  assert.ok(packet.facts.filter((fact) => fact.kind === 'team_week_projection').every((fact) => fact.sourceIds.includes('sleeper-w3-pre') && fact.context.projectionKind === 'pregame'));
  assert.equal(one(packet, 'bench_regret_counterfactual', 'alpha').value, 13);
  assert.match(one(packet, 'bench_regret_counterfactual', 'alpha').claim, /counterfactual, not proof/);
  assert.equal(one(packet, 'team_top_starter', 'g-wr').subject.label, 'Gamma Star');
});

test('reporting packet derives season form, standings, all-play, and historical context', () => {
  const packet = buildReportingPacket(sampleWeekInput());
  assert.deepEqual(one(packet, 'season_record', 'gamma').value, { losses: 0, ties: 0, wins: 3 });
  assert.equal(one(packet, 'season_standing_rank', 'gamma').value, 1);
  assert.equal(one(packet, 'season_scoring_rank', 'gamma').value, 1);
  assert.deepEqual(one(packet, 'season_current_streak', 'gamma').value, { length: 3, result: 'W' });
  assert.deepEqual(one(packet, 'season_current_streak', 'delta').value, { length: 3, result: 'L' });
  assert.deepEqual(one(packet, 'head_to_head_record', 'alpha').value, { games: 10, ties: 0, winsA: 6, winsB: 4 });
  assert.equal(one(packet, 'manager_championship_count', 'gamma').value, 2);
  assert.equal(one(packet, 'historical_week_score_percentile', 'gamma').value, 1);
});

test('every derived fact has resolvable lineage and every direct fact has source provenance', () => {
  const packet = buildReportingPacket(sampleWeekInput());
  const factIds = new Set(packet.facts.map((fact) => fact.factId));
  const sourceIds = new Set(packet.sources.map((source) => source.sourceId));
  packet.facts.forEach((fact) => {
    assert.ok(fact.sourceIds.length || fact.derivedFrom.length, fact.semanticKey);
    fact.sourceIds.forEach((sourceId) => assert.ok(sourceIds.has(sourceId), `${fact.semanticKey} -> ${sourceId}`));
    fact.derivedFrom.forEach((factId) => assert.ok(factIds.has(factId), `${fact.semanticKey} -> ${factId}`));
    assert.ok(fact.claim.length > 10);
  });
  assert.equal(one(packet, 'weekly_high_score').derivedFrom.length, 4);
  assert.equal(one(packet, 'weekly_closest_game').derivedFrom.length, 2);
  assert.equal(one(packet, 'weekly_largest_margin').derivedFrom.length, 2);
  assert.equal(one(packet, 'team_top_starter', 'g-wr').derivedFrom.length, 2);
  assert.ok(one(packet, 'season_scoring_rank', 'gamma').derivedFrom.some((factId) => packet.facts.find((fact) => fact.factId === factId)?.kind === 'season_comparison_set'));
});

test('normalization rejects unknown players and stale current-week evidence', () => {
  const unknown = sampleWeekInput();
  unknown.currentWeek.matchups[0].teams[0].starters[0].playerId = 'unknown-player';
  assert.throws(() => buildReportingPacket(unknown), /Unknown player identity unknown-player/);

  const stale = sampleWeekInput();
  stale.sources.find((source) => source.sourceId === 'sleeper-w3').observedAt = '2026-09-29T12:00:00.000Z';
  assert.throws(() => buildReportingPacket(stale, { maximumCurrentSourceAgeMinutes: 30 }), /freshness gate/);
});

test('bench regret requires a lock-time-available, slot-eligible alternative', () => {
  const unavailable = sampleWeekInput();
  unavailable.currentWeek.matchups[0].teams[0].bench[0].availableAtLock = false;
  const packet = buildReportingPacket(unavailable);
  assert.equal(packet.facts.filter((fact) => fact.kind === 'bench_regret_counterfactual').length, 0);

  const ineligible = sampleWeekInput();
  ineligible.currentWeek.matchups[0].teams[0].bench[0].eligibleSlots = ['WR'];
  assert.equal(buildReportingPacket(ineligible).facts.filter((fact) => fact.kind === 'bench_regret_counterfactual').length, 0);

  const unknownAvailability = sampleWeekInput();
  delete unknownAvailability.currentWeek.matchups[0].teams[0].bench[0].availableAtLock;
  assert.equal(buildReportingPacket(unknownAvailability).facts.filter((fact) => fact.kind === 'bench_regret_counterfactual').length, 0);
});

test('reporting packet generation is byte-stable for identical input', () => {
  const first = buildReportingPacket(sampleWeekInput());
  const second = buildReportingPacket(sampleWeekInput());
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test('a serialized packet reconstructs its registry in dependency order', () => {
  const packet = buildReportingPacket(sampleWeekInput());
  const registry = registryFromPacket(JSON.parse(JSON.stringify(packet)));
  assert.equal(registry.list().length, packet.facts.length);
  assert.equal(registry.get(one(packet, 'weekly_closest_game').factId).kind, 'weekly_closest_game');

  const tampered = JSON.parse(JSON.stringify(packet));
  tampered.facts.find((fact) => fact.kind === 'team_week_score').value = 999;
  assert.throws(() => registryFromPacket(tampered), /content-derived ID integrity check/);
});

test('historical inputs fail closed without provenance', () => {
  const input = sampleWeekInput();
  input.history.sourceIds = [];
  assert.throws(() => buildReportingPacket(input), /Historical facts require history.sourceIds/);

  const ambiguous = sampleWeekInput();
  ambiguous.history.headToHead = ambiguous.history.headToHeadBeforeSeason;
  delete ambiguous.history.headToHeadBeforeSeason;
  assert.throws(() => buildReportingPacket(ambiguous), /headToHeadBeforeSeason/);

  const overlapping = sampleWeekInput();
  overlapping.history.teamWeekScores[0].season = 2026;
  assert.throws(() => buildReportingPacket(overlapping), /only seasons before the active season/);

  const duplicatePair = sampleWeekInput();
  duplicatePair.history.headToHeadBeforeSeason.push({ managerAId: 'beta', managerBId: 'alpha', winsA: 1, winsB: 2, ties: 0 });
  assert.throws(() => buildReportingPacket(duplicatePair), /duplicate manager pair/);
});

test('scheduled previews contain projections, season context, and availability but no invented result', () => {
  const input = sampleWeekInput();
  input.league.week = 4;
  input.league.phase = 'scheduled';
  input.league.capturedAt = '2026-10-02T14:00:00.000Z';
  input.sources.push({
    sourceId: 'sleeper-w4-pre', provider: 'Sleeper', dataset: 'league matchups week 4 preview',
    retrievedAt: '2026-10-02T13:59:00.000Z', observedAt: '2026-10-02T13:59:00.000Z', finality: 'provisional'
  });
  input.currentWeek.sourceIds = ['sleeper-w4-pre'];
  input.currentWeek.matchups.forEach((matchup) => matchup.teams.forEach((team) => {
    team.score = null;
    team.projection.asOf = '2026-10-02T13:59:00.000Z';
    team.projection.sourceIds = ['sleeper-w4-pre'];
    team.starters.forEach((player) => {
      player.points = null;
      player.projection.asOf = '2026-10-02T13:59:00.000Z';
      player.projection.sourceIds = ['sleeper-w4-pre'];
    });
    team.bench.forEach((player) => {
      player.points = null;
      player.projection.asOf = '2026-10-02T13:59:00.000Z';
      player.projection.sourceIds = ['sleeper-w4-pre'];
    });
  }));
  const packet = buildReportingPacket(input, { maximumCurrentSourceAgeMinutes: 5 });
  assert.equal(packet.facts.some((fact) => fact.kind === 'matchup_result'), false);
  assert.equal(packet.facts.some((fact) => fact.kind === 'team_week_projection'), true);
  assert.equal(packet.facts.filter((fact) => fact.kind === 'matchup_projection_edge').length, 2);
  assert.equal(packet.facts.some((fact) => fact.kind === 'season_record'), true);
  assert.match(one(packet, 'season_record', 'gamma').claim, /through Week 3/);
  assert.equal(packet.facts.filter((fact) => fact.kind === 'player_availability_status').length, 2);
  assert.ok(packet.facts.filter((fact) => fact.kind === 'player_availability_status').every((fact) => fact.eligibleEditions.includes('preview')));
  assert.ok(rankStoryAngles(packet, { edition: 'preview' }).some((angle) => angle.type === 'projected-main-event'));
});

test('current rosters, weekly history, and active scores fail closed on identity ambiguity', () => {
  const duplicatePlayer = sampleWeekInput();
  duplicatePlayer.currentWeek.matchups[1].teams[0].starters[0].playerId = 'a-qb';
  assert.throws(() => buildReportingPacket(duplicatePlayer), /player appears on more than one current roster/);

  const duplicateWeek = sampleWeekInput();
  duplicateWeek.seasonWeeks.push(structuredClone(duplicateWeek.seasonWeeks[0]));
  assert.throws(() => buildReportingPacket(duplicateWeek), /same week more than once/);

  const missingScore = sampleWeekInput();
  missingScore.currentWeek.matchups[0].teams[0].score = null;
  assert.throws(() => buildReportingPacket(missingScore), /requires a score/);

  const ambiguousProjection = sampleWeekInput();
  ambiguousProjection.currentWeek.matchups[0].teams[0].projection = 110;
  assert.throws(() => buildReportingPacket(ambiguousProjection), /must include value, kind, asOf, and sourceIds/);

  const unprovenInjury = sampleWeekInput();
  delete unprovenInjury.currentWeek.matchups[0].teams[1].starters[1].injurySourceIds;
  assert.throws(() => buildReportingPacket(unprovenInjury), /injury status requires injuryAsOf and injurySourceIds/);

  const nullPastScore = sampleWeekInput();
  nullPastScore.seasonWeeks[0].matchups[0].teams[0].score = null;
  assert.throws(() => buildReportingPacket(nullPastScore), /score must be a finite number/);

  const booleanProjection = sampleWeekInput();
  booleanProjection.currentWeek.matchups[0].teams[0].projection.value = true;
  assert.throws(() => buildReportingPacket(booleanProjection), /projection.value must be a finite number/);

  const nullWins = sampleWeekInput();
  nullWins.history.headToHeadBeforeSeason[0].winsA = null;
  assert.throws(() => buildReportingPacket(nullWins), /winsA must be a finite number/);

  const localTimestamp = sampleWeekInput();
  localTimestamp.league.capturedAt = '2026-09-29T14:00:00';
  assert.throws(() => buildReportingPacket(localTimestamp), /RFC 3339 timestamp/);
});

test('final current-week scores reconcile exactly with one finalized season row', () => {
  const missing = sampleWeekInput();
  missing.seasonWeeks = missing.seasonWeeks.filter((week) => week.week !== 3);
  assert.throws(() => buildReportingPacket(missing), /requires one matching finalized seasonWeeks row/);

  const disagreement = sampleWeekInput();
  disagreement.seasonWeeks.find((week) => week.week === 3).matchups[1].teams[0].score = 70;
  assert.throws(() => buildReportingPacket(disagreement), /score for Gamma differs/);

  const unrelatedSource = sampleWeekInput();
  unrelatedSource.sources.push({
    sourceId: 'other-final', provider: 'Other', dataset: 'final',
    retrievedAt: unrelatedSource.league.capturedAt, observedAt: unrelatedSource.league.capturedAt, finality: 'final'
  });
  unrelatedSource.seasonWeeks.find((week) => week.week === 3).sourceIds = ['other-final'];
  assert.throws(() => buildReportingPacket(unrelatedSource), /do not share source provenance/);
});

test('league-wide facts require complete active-manager slates', () => {
  const incomplete = sampleWeekInput();
  incomplete.currentWeek.matchups.pop();
  incomplete.seasonWeeks.find((week) => week.week === 3).matchups.pop();
  assert.throws(() => buildReportingPacket(incomplete), /currentWeek must include every active manager exactly once/);

  const incompleteHistory = sampleWeekInput();
  incompleteHistory.seasonWeeks[0].matchups.pop();
  assert.throws(() => buildReportingPacket(incompleteHistory), /Finalized season Week 1 must include every active manager exactly once/);

  const withInactive = sampleWeekInput();
  withInactive.managers.push({ managerId: 'retired', displayName: 'RetiredManager', active: false });
  assert.equal(buildReportingPacket(withInactive).summary.activeManagerCount, 4);
});

test('post-kickoff outlooks remain contextual and never become pregame upset receipts', () => {
  const input = sampleWeekInput();
  input.currentWeek.matchups.forEach((matchup) => matchup.teams.forEach((team) => {
    team.projection.kind = 'late-outlook';
    team.starters.forEach((player) => { player.projection.kind = 'late-outlook'; });
    team.bench.forEach((player) => { player.projection.kind = 'late-outlook'; });
  }));
  const packet = buildReportingPacket(input);
  assert.equal(packet.facts.some((fact) => fact.kind === 'projection_upset'), false);
  assert.equal(packet.facts.filter((fact) => fact.kind === 'matchup_outlook_edge').length, 2);
  assert.ok(packet.facts.filter((fact) => fact.kind === 'team_week_projection').every((fact) => !fact.eligibleEditions.includes('preview')));
  assert.ok(rankStoryAngles(packet, { edition: 'late-preview' }).some((angle) => angle.type === 'weekend-outlook-edge'));
});

test('final current projections cannot leak into recap variance facts', () => {
  const input = sampleWeekInput();
  input.currentWeek.matchups.forEach((matchup) => matchup.teams.forEach((team) => {
    team.projection.kind = 'current';
    team.starters.forEach((player) => { player.projection.kind = 'current'; });
    team.bench.forEach((player) => { player.projection.kind = 'current'; });
  }));
  const packet = buildReportingPacket(input);
  assert.equal(packet.facts.some((fact) => fact.kind === 'projection_upset'), false);
  assert.equal(packet.facts.some((fact) => fact.kind === 'player_projection_delta'), false);
  assert.ok(packet.facts.filter((fact) => fact.kind === 'player_projection').every((fact) => !fact.eligibleEditions.includes('recap')));
});

test('packet provenance rejects future retrievals, future facts, and non-final recap sources', () => {
  const liveFinal = sampleWeekInput();
  liveFinal.sources.find((source) => source.sourceId === 'sleeper-w3').finality = 'live';
  assert.throws(() => buildReportingPacket(liveFinal), /requires final currentWeek source provenance/);

  const futureRetrieval = sampleWeekInput();
  futureRetrieval.sources.find((source) => source.sourceId === 'sleeper-w3').retrievedAt = '2026-09-29T14:01:00.000Z';
  futureRetrieval.sources.find((source) => source.sourceId === 'sleeper-w3').observedAt = '2026-09-29T14:01:00.000Z';
  assert.throws(() => buildReportingPacket(futureRetrieval), /retrieved after the reporting packet capture/);

  const futureProjection = sampleWeekInput();
  futureProjection.currentWeek.matchups[0].teams[0].projection.asOf = '2027-01-01T00:00:00.000Z';
  assert.throws(() => buildReportingPacket(futureProjection), /Projection as-of .* after the reporting packet capture/);
});

test('scheduled zeroes cannot be mistaken for completed player performances', () => {
  const input = sampleWeekInput();
  input.league.week = 4;
  input.league.phase = 'scheduled';
  input.league.capturedAt = '2026-10-02T14:00:00.000Z';
  input.sources.push({
    sourceId: 'w4-zeroes', provider: 'Sleeper', dataset: 'week 4 scheduled',
    retrievedAt: '2026-10-02T14:00:00.000Z', observedAt: '2026-10-02T14:00:00.000Z', finality: 'provisional'
  });
  input.currentWeek.sourceIds = ['w4-zeroes'];
  input.currentWeek.matchups.forEach((matchup) => matchup.teams.forEach((team) => {
    team.score = 0;
    team.projection.sourceIds = ['w4-zeroes']; team.projection.asOf = input.league.capturedAt;
    team.starters.forEach((player) => {
      player.points = 0;
      player.projection.sourceIds = ['w4-zeroes']; player.projection.asOf = input.league.capturedAt;
    });
    team.bench.forEach((player) => {
      player.points = 0;
      player.projection.sourceIds = ['w4-zeroes']; player.projection.asOf = input.league.capturedAt;
    });
  }));
  const packet = buildReportingPacket(input);
  assert.equal(packet.facts.some((fact) => fact.kind === 'team_top_starter'), false);
  assert.equal(packet.facts.some((fact) => fact.kind === 'player_starter_points'), false);
});

test('live summaries and angles remain explicitly provisional', () => {
  const input = sampleWeekInput();
  input.league.phase = 'live';
  input.sources.find((source) => source.sourceId === 'sleeper-w3').finality = 'live';
  input.seasonWeeks.find((week) => week.week === 3).final = false;
  input.currentWeek.matchups[1].startedAtCapture = false;
  const packet = buildReportingPacket(input);
  assert.equal(packet.facts.some((fact) => fact.kind === 'projection_upset'), false);
  assert.equal(packet.facts.some((fact) => fact.kind === 'matchup_result' && fact.context.matchupId === 2), false);
  assert.equal(packet.facts.some((fact) => fact.kind === 'team_week_score' && ['gamma', 'delta'].includes(fact.subject.id)), false);
  assert.equal(packet.facts.some((fact) => fact.kind === 'player_starter_points' && fact.subject.id === 'g-wr'), false);
  assert.equal(one(packet, 'weekly_high_score').subject.id, 'alpha');
  assert.match(one(packet, 'weekly_closest_game').claim, /smallest live margin at capture time/);
  assert.match(one(packet, 'weekly_largest_margin').claim, /largest live margin at capture time/);
  const angles = rankStoryAngles(packet, { edition: 'late-preview' });
  assert.ok(angles.some((angle) => angle.type === 'closest-live-margin'));
  assert.ok(angles.every((angle) => !/finish|rout/i.test(angle.headlineHint)));
});

test('weekly scoring ties retain every co-leader instead of inventing a sole winner', () => {
  const input = sampleWeekInput();
  input.currentWeek.matchups[1].teams[1].score = 160;
  input.seasonWeeks.find((week) => week.week === 3).matchups[1].teams[1].score = 160;
  const packet = buildReportingPacket(input);
  const high = one(packet, 'weekly_high_score');
  assert.equal(high.subject.label, 'Delta');
  assert.deepEqual(high.related.map((entity) => entity.label), ['Gamma']);
  assert.match(high.claim, /Delta and Gamma tied for/);
  assert.equal(high.derivedFrom.length, 4);
  assert.match(rankStoryAngles(packet, { edition: 'recap' }).find((angle) => angle.type === 'weekly-scoring-leader').headlineHint, /Delta and Gamma share/);
});

test('season standings and scoring use competition ranks for exact ties', () => {
  const input = sampleWeekInput();
  input.seasonWeeks.forEach((week) => week.matchups.forEach((matchup) => matchup.teams.forEach((team) => { team.score = 100; })));
  input.currentWeek.matchups.forEach((matchup) => matchup.teams.forEach((team) => { team.score = 100; }));
  const packet = buildReportingPacket(input);
  assert.deepEqual(packet.facts.filter((fact) => fact.kind === 'season_standing_rank').map((fact) => fact.value), [1, 1, 1, 1]);
  assert.deepEqual(packet.facts.filter((fact) => fact.kind === 'season_scoring_rank').map((fact) => fact.value), [1, 1, 1, 1]);
  const leader = one(packet, 'season_scoring_leader');
  assert.equal(leader.related.length, 3);
  assert.match(leader.claim, /shared the season scoring lead/);
  assert.equal(rankStoryAngles(packet, { edition: 'recap' }).filter((angle) => angle.type === 'season-scoring-leader').length, 1);
});
