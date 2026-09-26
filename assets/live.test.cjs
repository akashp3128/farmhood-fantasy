const assert = require('node:assert/strict');
const test = require('node:test');
const live = require('./live.js');

function starter(id, projection, overrides = {}) {
  return {
    id: String(id),
    name: `Player ${id}`,
    position: 'RB',
    team: `T${id}`,
    projection,
    points: null,
    status: 'pre_game',
    injury: '',
    ...overrides
  };
}

function fixture({ phase = 'scheduled', teamA, teamB }) {
  const sides = [teamA, teamB];
  const maximumStarters = Math.max(...sides.map((team) => team.starters.length));
  const players = {};
  const games = {};
  const matchups = sides.map((team, index) => {
    const playerPoints = {};
    team.starters.forEach((player) => {
      players[player.id] = {
        id: player.id,
        name: player.name,
        position: player.position,
        team: player.team,
        opponent: '',
        projection: player.projection,
        injury: player.injury
      };
      games[player.team] = { status: player.status };
      if (player.points != null) playerPoints[player.id] = player.points;
    });
    return {
      rosterId: index + 1,
      matchupId: 1,
      points: team.score,
      starters: team.starters.map((player) => player.id),
      players: team.starters.map((player) => player.id),
      starterPoints: team.starters.map((player) => player.points),
      playerPoints
    };
  });
  const completedGames = phase === 'final' ? 3 : 2;
  const snapshot = {
    season: 2026,
    status: 'in_season',
    currentWeek: 3,
    regularSeasonWeeks: 14,
    rosterPositions: Array.from({ length: maximumStarters }, () => 'FLEX'),
    rosters: [
      { rosterId: 1, name: 'Alpha', wins: completedGames, losses: 0, ties: 0 },
      { rosterId: 2, name: 'Bravo', wins: completedGames, losses: 0, ties: 0 }
    ],
    matchups
  };
  return live.lineupWatch(snapshot, { players, games, source: 'test' });
}

test('scheduled phase preserves full-lineup projections and existing matchup fields', () => {
  const watch = fixture({
    teamA: { score: 0, starters: [starter('1', 20), starter('2', 10)] },
    teamB: { score: 0, starters: [starter('3', 12), starter('4', 14)] }
  });

  assert.equal(watch.phase.key, 'scheduled');
  assert.equal(watch.teams[0].projection, 30);
  assert.equal(watch.teams[0].currentScore, 0);
  assert.equal(watch.teams[0].remainingProjection, 30);
  assert.equal(watch.teams[0].pregameProjection, 30);
  assert.equal(watch.teams[0].forecastStatus, 'complete');
  assert.equal(watch.matchups[0].projectionA, 30);
  assert.equal(watch.matchups[0].projectionB, 26);
  assert.equal(watch.matchups[0].predictedWinner, 'Alpha');
  assert.equal(typeof watch.matchups[0].winProbability, 'number');
});

for (const phase of ['live', 'final']) {
  test(`${phase} phase adds only unlocked projections to the official score, including a locked zero`, () => {
    const watch = fixture({
      phase,
      teamA: {
        score: 0,
        starters: [
          starter('1', 20, { status: phase === 'final' ? 'final' : 'live', points: 0 }),
          starter('2', 10)
        ]
      },
      teamB: {
        score: 5,
        starters: [
          starter('3', 12, { status: phase === 'final' ? 'final' : 'live', points: 5 }),
          starter('4', 11)
        ]
      }
    });

    const alpha = watch.teams[0];
    assert.equal(watch.phase.key, phase);
    assert.equal(alpha.currentScore, 0);
    assert.equal(alpha.remainingProjection, 10);
    assert.equal(alpha.projection, 10);
    assert.equal(alpha.pregameProjection, 30);
    assert.equal(alpha.startedAtCapture, true);
    assert.equal(alpha.lockedStarterCount, 1);
    assert.deepEqual(alpha.lockedSlots, ['FLEX']);
  });
}

test('an unlocked occupied player without a projection suppresses the team and matchup forecast', () => {
  const watch = fixture({
    phase: 'live',
    teamA: {
      score: 7,
      starters: [
        starter('1', 20, { status: 'live', points: 7 }),
        starter('2', null, { name: 'Missing Receiver', position: 'WR' })
      ]
    },
    teamB: {
      score: 3,
      starters: [starter('3', 12, { status: 'live', points: 3 }), starter('4', 8)]
    }
  });

  const alpha = watch.teams[0];
  const matchup = watch.matchups[0];
  assert.equal(alpha.projection, null);
  assert.equal(alpha.remainingProjection, null);
  assert.equal(alpha.forecastStatus, 'incomplete');
  assert.deepEqual(alpha.missingProjectionPlayers, [{
    id: '2',
    name: 'Missing Receiver',
    slot: 'FLEX',
    position: 'WR',
    injuryStatus: null
  }]);
  assert.equal(matchup.forecastStatus, 'incomplete');
  assert.equal(matchup.predictedWinner, null);
  assert.equal(matchup.winProbability, null);
});

test('an unlocked hard-out starter with no projection contributes zero without invalidating the forecast', () => {
  const watch = fixture({
    phase: 'live',
    teamA: {
      score: 4,
      starters: [
        starter('1', 18, { status: 'live', points: 4 }),
        starter('2', null, { injury: 'Out' }),
        starter('5', 10)
      ]
    },
    teamB: { score: 2, starters: [starter('3', 12, { status: 'live', points: 2 }), starter('4', 9)] }
  });

  const alpha = watch.teams[0];
  assert.equal(alpha.currentScore, 4);
  assert.equal(alpha.remainingProjection, 10);
  assert.equal(alpha.projection, 14);
  assert.equal(alpha.pregameProjection, 28);
  assert.equal(alpha.forecastStatus, 'complete');
  assert.deepEqual(alpha.missingProjectionPlayers, []);
  assert.equal(watch.projectionCoverage, 1);
});

test('a started NFL game with zero fantasy points still moves the outlook to live', () => {
  const watch = fixture({
    teamA: {
      score: 0,
      starters: [starter('1', 20, { status: 'live', points: 0 }), starter('2', 10)]
    },
    teamB: {
      score: 0,
      starters: [starter('3', 12), starter('4', 14)]
    }
  });

  assert.equal(watch.phase.key, 'live');
  assert.equal(watch.teams[0].lockedStarterCount, 1);
  assert.equal(watch.teams[0].projection, 10);
  assert.equal(watch.matchups[0].startedAtCapture, true);
});

test('live matchup keeps the official score leader separate from the projected winner', () => {
  const watch = fixture({
    phase: 'live',
    teamA: {
      score: 30,
      starters: [starter('1', 20, { status: 'final', points: 30 }), starter('2', 5)]
    },
    teamB: {
      score: 10,
      starters: [starter('3', 12, { status: 'final', points: 10 }), starter('4', 50)]
    }
  });

  const matchup = watch.matchups[0];
  assert.equal(watch.phase.key, 'live');
  assert.deepEqual([matchup.currentScoreA, matchup.currentScoreB], [30, 10]);
  assert.deepEqual([matchup.projectionA, matchup.projectionB], [35, 60]);
  assert.equal(matchup.managerA, 'Alpha');
  assert.equal(matchup.predictedWinner, 'Bravo');
});

test('a tied live score stays tied even when the forecasts are different', () => {
  const watch = fixture({
    phase: 'live',
    teamA: {
      score: 10,
      starters: [starter('1', 20, { status: 'final', points: 10 }), starter('2', 5)]
    },
    teamB: {
      score: 10,
      starters: [starter('3', 12, { status: 'final', points: 10 }), starter('4', 20)]
    }
  });

  const matchup = watch.matchups[0];
  assert.equal(matchup.currentScoreA, matchup.currentScoreB);
  assert.deepEqual([matchup.projectionA, matchup.projectionB], [15, 30]);
  assert.equal(matchup.predictedWinner, 'Bravo');
});

test('an incomplete forecast preserves both official scores while suppressing projected outcome fields', () => {
  const watch = fixture({
    phase: 'live',
    teamA: {
      score: 14,
      starters: [starter('1', 20, { status: 'final', points: 14 }), starter('2', 8)]
    },
    teamB: {
      score: 6,
      starters: [starter('3', 12, { status: 'final', points: 6 }), starter('4', null, { name: 'Projection Pending' })]
    }
  });

  const matchup = watch.matchups[0];
  assert.deepEqual([matchup.currentScoreA, matchup.currentScoreB], [14, 6]);
  assert.equal(matchup.projectionA, 22);
  assert.equal(matchup.projectionB, null);
  assert.equal(matchup.forecastStatus, 'incomplete');
  assert.equal(matchup.predictedWinner, null);
  assert.equal(matchup.winProbability, null);
  assert.deepEqual(matchup.missingProjectionPlayers.map((player) => player.name), ['Projection Pending']);
});

test('final matchup projections collapse to official totals and preserve the winner', () => {
  const watch = fixture({
    phase: 'final',
    teamA: {
      score: 101.5,
      starters: [starter('1', 20, { status: 'final', points: 61.5 }), starter('2', 10, { status: 'final', points: 40 })]
    },
    teamB: {
      score: 99.25,
      starters: [starter('3', 12, { status: 'final', points: 50 }), starter('4', 14, { status: 'final', points: 49.25 })]
    }
  });

  const matchup = watch.matchups[0];
  assert.equal(watch.phase.key, 'final');
  assert.deepEqual([matchup.currentScoreA, matchup.currentScoreB], [101.5, 99.25]);
  assert.deepEqual([matchup.projectionA, matchup.projectionB], [101.5, 99.25]);
  assert.equal(matchup.predictedWinner, 'Alpha');
});
