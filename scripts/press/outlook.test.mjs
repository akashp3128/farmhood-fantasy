import assert from 'node:assert/strict';
import test from 'node:test';
import { PRESS_CONFIG } from './config.mjs';
import { buildLateMatchupOutlook, buildLateTeamOutlook, effectiveStarterProjection } from './outlook.mjs';

const player = (id, projection, overrides = {}) => ({
  id: String(id),
  name: `Player ${id}`,
  slot: 'FLEX',
  projection,
  locked: false,
  ...overrides
});

test('adds only unlocked projections to the official score', () => {
  const outlook = buildLateTeamOutlook({
    currentScore: 18.25,
    starters: [
      player(1, 24, { locked: true, points: 18.25 }),
      player(2, 15.5),
      player(3, 10)
    ]
  });

  assert.deepEqual(outlook, {
    currentScore: 18.25,
    remainingProjection: 25.5,
    forecastScore: 43.75,
    pregameProjection: 49.5,
    startedAtCapture: true,
    lockedStarterCount: 1,
    forecastStatus: 'complete',
    missingProjectionPlayers: [],
    pregameMissingProjectionPlayers: [],
    receiptEligible: false
  });
});

test('a locked zero-point starter is started and is never double-counted', () => {
  const outlook = buildLateTeamOutlook({
    officialCurrentScore: 0,
    starters: [
      player(1, 19.4, { locked: true, points: 0 }),
      player(2, 11.6)
    ]
  });

  assert.equal(outlook.lockedStarterCount, 1);
  assert.equal(outlook.startedAtCapture, true);
  assert.equal(outlook.remainingProjection, 11.6);
  assert.equal(outlook.forecastScore, 11.6);
  assert.equal(outlook.pregameProjection, 31);
});

test('unlocked unavailable starters contribute zero, including a null projection', () => {
  const statuses = ['Out', 'IR', 'pup', 'Suspended', ' inactive '];
  statuses.forEach((status, index) => {
    assert.equal(effectiveStarterProjection(player(index + 1, null, { injuryStatus: status })), 0);
  });

  const outlook = buildLateTeamOutlook({
    currentScore: 6,
    starters: statuses.map((status, index) => player(index + 1, null, { injuryStatus: status }))
  });
  assert.equal(outlook.remainingProjection, 0);
  assert.equal(outlook.forecastScore, 6);
  assert.equal(outlook.forecastStatus, 'complete');
  assert.deepEqual(outlook.missingProjectionPlayers, []);
});

test('an unlocked occupied starter without a projection makes the forecast incomplete', () => {
  const outlook = buildLateTeamOutlook({
    currentScore: 12,
    starters: [
      player(1, 8),
      player(2, null, { name: 'Missing Receiver', slot: 'WR' }),
      player(0, null, { name: 'Empty slot', slot: 'FLEX' })
    ]
  });

  assert.equal(outlook.remainingProjection, null);
  assert.equal(outlook.forecastScore, null);
  assert.equal(outlook.pregameProjection, null);
  assert.equal(outlook.forecastStatus, 'incomplete');
  assert.deepEqual(outlook.missingProjectionPlayers, [{
    id: '2',
    name: 'Missing Receiver',
    slot: 'WR',
    position: '',
    injuryStatus: null
  }]);
});

test('a missing locked projection cannot be reconstructed pregame but does not invalidate the live forecast', () => {
  const outlook = buildLateTeamOutlook({
    currentScore: 9,
    starters: [
      player(1, null, { locked: true }),
      player(2, 14)
    ]
  });

  assert.equal(outlook.forecastStatus, 'complete');
  assert.equal(outlook.remainingProjection, 14);
  assert.equal(outlook.forecastScore, 23);
  assert.equal(outlook.pregameProjection, null);
  assert.deepEqual(outlook.missingProjectionPlayers, []);
  assert.equal(outlook.pregameMissingProjectionPlayers[0].id, '1');
});

test('computes a bounded matchup probability from complete late forecasts', () => {
  const outlook = buildLateMatchupOutlook({
    matchupId: 3,
    managerA: 'Alpha',
    managerB: 'Bravo',
    teamA: { currentScore: 40, starters: [player(1, 20, { locked: true }), player(2, 15)] },
    teamB: { currentScore: 22, starters: [player(3, 10, { locked: true }), player(4, 12)] }
  });
  const expectedProbabilityA = Math.min(0.85, Math.max(0.15, 1 / (1 + Math.exp(-(55 - 34) / PRESS_CONFIG.projectionLogisticScale))));

  assert.equal(outlook.currentScoreA, 40);
  assert.equal(outlook.remainingProjectionA, 15);
  assert.equal(outlook.forecastScoreA, 55);
  assert.equal(outlook.forecastScoreB, 34);
  assert.equal(outlook.forecastWinner, 'Alpha');
  assert.equal(outlook.predictedWinner, 'Alpha');
  assert.equal(outlook.probabilityA, Math.round(expectedProbabilityA * 10_000) / 10_000);
  assert.equal(outlook.forecastProbability, outlook.winProbability);
  assert.equal(outlook.receiptEligible, false);
});

test('withholds the winner and probability when either side is incomplete', () => {
  const outlook = buildLateMatchupOutlook({
    managerA: 'Alpha',
    managerB: 'Bravo',
    teamA: { currentScore: 20, starters: [player(1, null, { name: 'Unknown Alpha' })] },
    teamB: { currentScore: 30, starters: [player(2, 10)] }
  });

  assert.equal(outlook.forecastStatus, 'incomplete');
  assert.equal(outlook.forecastWinner, null);
  assert.equal(outlook.forecastProbability, null);
  assert.equal(outlook.predictedWinner, null);
  assert.equal(outlook.winProbability, null);
  assert.equal(outlook.probabilityA, null);
  assert.deepEqual(outlook.missingProjectionPlayers.map(({ manager, side, name }) => ({ manager, side, name })), [
    { manager: 'Alpha', side: 'A', name: 'Unknown Alpha' }
  ]);
});

test('does not mutate team, starter, or precomputed outlook inputs', () => {
  const rawTeam = {
    currentScore: 7,
    starters: [player(1, 5, { injury: 'Questionable' })]
  };
  const rawBefore = structuredClone(rawTeam);
  const teamA = buildLateTeamOutlook(rawTeam);
  teamA.receiptEligible = true;
  const teamABefore = structuredClone(teamA);

  const matchup = buildLateMatchupOutlook({
    managerA: 'Alpha',
    managerB: 'Bravo',
    teamA,
    teamB: { currentScore: 0, starters: [] }
  });

  assert.deepEqual(rawTeam, rawBefore);
  assert.deepEqual(teamA, teamABefore);
  assert.equal(matchup.teamA.receiptEligible, false);
});

test('rejects a non-finite official score instead of publishing a misleading forecast', () => {
  assert.throws(
    () => buildLateTeamOutlook({ currentScore: 'not-a-score', starters: [] }),
    /finite official current score/
  );
});
