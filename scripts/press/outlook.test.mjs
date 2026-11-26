import assert from 'node:assert/strict';
import test from 'node:test';
import { PRESS_CONFIG } from './config.mjs';
import { buildLateMatchupOutlook, buildLateTeamOutlook, effectiveStarterProjection, hasKnownGameStatus } from './outlook.mjs';

const player = (id, projection, overrides = {}) => ({
  id: String(id),
  name: `Player ${id}`,
  slot: 'FLEX',
  projection,
  locked: false,
  gameStatus: 'pre_game',
  ...overrides
});

test('adds only unlocked projections to the official score', () => {
  const outlook = buildLateTeamOutlook({
    currentScore: 18.25,
    starters: [
      player(1, 24, { locked: true, gameStatus: 'live', points: 18.25 }),
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
    missingGameStatusPlayers: [],
    pregameMissingProjectionPlayers: [],
    receiptEligible: false
  });
});

test('a locked zero-point starter is started and is never double-counted', () => {
  const outlook = buildLateTeamOutlook({
    officialCurrentScore: 0,
    starters: [
      player(1, 19.4, { locked: true, gameStatus: 'final', points: 0 }),
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
      player(1, null, { locked: true, gameStatus: 'live' }),
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
    teamA: { currentScore: 40, starters: [player(1, 20, { locked: true, gameStatus: 'final' }), player(2, 15)] },
    teamB: { currentScore: 22, starters: [player(3, 10, { locked: true, gameStatus: 'final' }), player(4, 12)] }
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

test('recognizes only explicit runtime game statuses without inferring a bye or kickoff', () => {
  for (const gameStatus of ['pre_game', 'scheduled', 'live', 'in_game', 'final', 'complete', 'post_game', ' LIVE ', ' Pre_Game ']) {
    assert.equal(hasKnownGameStatus({ gameStatus }), true, gameStatus);
  }
  for (const gameStatus of [undefined, null, '', ' ', 'unknown', 'bye', 'postponed', 'canceled', 'not_started', 0]) {
    assert.equal(hasKnownGameStatus({ gameStatus, team: 'DAL', locked: false, points: 0, projection: 12 }), false, String(gameStatus));
  }
  assert.equal(hasKnownGameStatus(), false);
});

test('unknown kickoff status withholds the forecast despite positive or zero projections and official scores', () => {
  for (const gameStatus of [undefined, null, '', ' ', 'unknown', 'bye', 'postponed']) {
    for (const projection of [0, 12]) {
      for (const officialCurrentScore of [0, 17]) {
        for (const locked of [false, true]) {
          const outlook = buildLateTeamOutlook({
            officialCurrentScore,
            starters: [player(1, projection, { gameStatus, locked, name: 'Uncertain Starter', slot: 'WR', position: 'WR' }), player(2, 10)]
          });
          assert.equal(outlook.currentScore, officialCurrentScore);
          assert.equal(outlook.remainingProjection, null);
          assert.equal(outlook.forecastScore, null);
          assert.equal(outlook.forecastStatus, 'incomplete');
          assert.equal(outlook.pregameProjection, projection + 10, 'separate pregame reconstruction is unaffected');
          assert.deepEqual(outlook.missingProjectionPlayers, []);
          assert.deepEqual(outlook.missingGameStatusPlayers, [{ id: '1', name: 'Uncertain Starter', slot: 'WR', position: 'WR', injuryStatus: null }]);
        }
      }
    }
  }
});

test('an unknown-status hard-out starter still withholds the outlook instead of proving no game started', () => {
  const outlook = buildLateTeamOutlook({
    currentScore: 9,
    starters: [player(1, null, { gameStatus: '', injuryStatus: 'Out', locked: true }), player(2, 14)]
  });
  assert.equal(outlook.currentScore, 9);
  assert.equal(outlook.remainingProjection, null);
  assert.equal(outlook.forecastScore, null);
  assert.equal(outlook.forecastStatus, 'incomplete');
  assert.equal(outlook.pregameProjection, 14);
  assert.deepEqual(outlook.missingProjectionPlayers, []);
  assert.deepEqual(outlook.missingGameStatusPlayers, [{ id: '1', name: 'Player 1', slot: 'FLEX', position: '', injuryStatus: 'Out' }]);
});

test('an unknown-status player with no projection records both independent missing facts', () => {
  const outlook = buildLateTeamOutlook({ currentScore: 0, starters: [player(1, null, { gameStatus: null })] });
  assert.equal(outlook.forecastStatus, 'incomplete');
  assert.equal(outlook.pregameProjection, null);
  assert.deepEqual(outlook.missingProjectionPlayers.map(({ id }) => id), ['1']);
  assert.deepEqual(outlook.missingGameStatusPlayers.map(({ id }) => id), ['1']);
});

test('unknown status on either side withholds both winner aliases and every probability', () => {
  for (const side of ['A', 'B']) {
    const unknown = { currentScore: 0, starters: [player(1, 100, { gameStatus: '', name: 'Unknown Kickoff' })] };
    const known = { currentScore: 7, starters: [player(2, 1)] };
    const outlook = buildLateMatchupOutlook({
      managerA: 'Alpha', managerB: 'Bravo',
      teamA: side === 'A' ? unknown : known,
      teamB: side === 'B' ? unknown : known
    });
    assert.equal(outlook.forecastStatus, 'incomplete');
    for (const field of ['forecastWinner', 'predictedWinner', 'forecastProbability', 'winProbability', 'probabilityA']) assert.equal(outlook[field], null, field);
    assert.equal(outlook[`forecastScore${side}`], null);
    assert.equal(outlook[`remainingProjection${side}`], null);
    assert.equal(outlook[`currentScore${side}`], 0);
    assert.deepEqual(outlook.missingGameStatusPlayers, [{
      id: '1', name: 'Unknown Kickoff', slot: 'FLEX', position: '', injuryStatus: null,
      manager: side === 'A' ? 'Alpha' : 'Bravo', side
    }]);
  }
});

test('empty and unoccupied slots do not require a game status', () => {
  const outlook = buildLateTeamOutlook({
    currentScore: 0,
    starters: [player(0, null, { gameStatus: '' }), player(1, null, { gameStatus: '', empty: true }), player(2, null, { gameStatus: '', occupied: false })]
  });
  assert.equal(outlook.forecastStatus, 'complete');
  assert.equal(outlook.forecastScore, 0);
  assert.deepEqual(outlook.missingGameStatusPlayers, []);
});

test('precomputed team outlooks preserve and independently clone missing-status and projection details', () => {
  const teamA = buildLateTeamOutlook({ currentScore: 12, starters: [player(1, null, { gameStatus: null })] });
  const teamB = buildLateTeamOutlook({ currentScore: 0, starters: [player(2, 8, { gameStatus: '' })] });
  const before = structuredClone({ teamA, teamB });
  const outlook = buildLateMatchupOutlook({ managerA: 'Alpha', managerB: 'Bravo', teamA, teamB });

  assert.deepEqual({ teamA, teamB }, before);
  assert.deepEqual(outlook.missingGameStatusPlayers.map(({ manager, side, id }) => ({ manager, side, id })), [
    { manager: 'Alpha', side: 'A', id: '1' }, { manager: 'Bravo', side: 'B', id: '2' }
  ]);
  assert.notStrictEqual(outlook.teamA.missingGameStatusPlayers, teamA.missingGameStatusPlayers);
  assert.notStrictEqual(outlook.teamA.missingGameStatusPlayers[0], teamA.missingGameStatusPlayers[0]);
  assert.notStrictEqual(outlook.teamB.missingGameStatusPlayers[0], teamB.missingGameStatusPlayers[0]);
  assert.notStrictEqual(outlook.teamA.missingProjectionPlayers[0], teamA.missingProjectionPlayers[0]);
  outlook.teamA.missingGameStatusPlayers[0].name = 'Changed output detail';
  outlook.teamA.missingProjectionPlayers[0].name = 'Changed output detail';
  outlook.teamB.missingGameStatusPlayers.push({ id: '3' });
  assert.deepEqual({ teamA, teamB }, before, 'mutating output details must not mutate supplied outlooks');
});
