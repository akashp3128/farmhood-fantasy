const assert = require('node:assert/strict');
const test = require('node:test');
const desk = require('./desk.js');

test('dollars ranks the high score, the position prize, and a rivalry', () => {
  const board = desk.dollarsOnTheTable({
    mode: 'actual',
    position: 'QB',
    rivalry: {a: 'Alpha', b: 'Bravo', labelA: 'Al', labelB: 'Be'},
    teams: [
      {name: 'Alpha', points: 120, starters: [{id: '1', name: 'QB A', slot: 'QB', position: 'QB', points: 22}]},
      {name: 'Bravo', points: 110, starters: [{id: '2', name: 'QB B', slot: 'QB', position: 'QB', points: 30}]},
      {name: 'Charlie', points: 120, starters: [{id: '3', name: 'QB C', slot: 'QB', position: 'QB', points: 10}]}
    ]
  });
  assert.equal(board.high[0].share, 15);
  assert.equal(board.high[1].share, 15);
  assert.equal(board.high[2].gap, 10);
  assert.equal(board.positionBoard[0].player, 'QB B');
  assert.equal(board.positionBoard[0].share, 10);
  assert.equal(board.rivalry.leader, 'Alpha');
  const missing = desk.dollarsOnTheTable({
    mode: 'projected',
    rivalry: {a: 'Alpha', b: 'Bravo', labelA: 'Al', labelB: 'Be'},
    teams: [
      {name: 'Alpha', projection: 98.3, starters: []},
      {name: 'Bravo', projection: null, starters: []}
    ]
  });
  assert.equal(missing.rivalry.leader, null);
  assert.equal(missing.rivalry.scoreB, null);
});

test('exposure separates a one-game manager from a settled one', () => {
  const report = desk.mondayExposure({
    started: true,
    teams: [
      {name: 'Alpha', starters: [
        {id: '1', name: 'Early', locked: true, gameStatus: 'final', gameDate: '2026-11-15', gameStartTime: 1, team: 'DAL'},
        {id: '2', name: 'Late', locked: false, gameStatus: 'pre_game', gameDate: '2026-11-16', gameStartTime: 2, team: 'KC', opponent: 'BUF'}
      ]},
      {name: 'Bravo', starters: [
        {id: '3', name: 'Done', locked: true, gameStatus: 'final', gameDate: '2026-11-15', gameStartTime: 1, team: 'NYG'}
      ]}
    ]
  });
  assert.equal(report.phase, 'live');
  assert.equal(report.oneGame.length, 1);
  assert.equal(report.oneGame[0].name, 'Alpha');
  assert.deepEqual(report.settled, ['Bravo']);
  assert.equal(report.latest, '2026-11-16');
});

test('playoff equity is deterministic and gives the title to the dominant seed', () => {
  const input = {
    sims: 40,
    seed: 7,
    playoffTeams: 2,
    games: [],
    teams: [
      {id: 1, name: 'Alpha', wins: 6, pf: 600, scores: [200]},
      {id: 2, name: 'Bravo', wins: 4, pf: 400, scores: [50]},
      {id: 3, name: 'Charlie', wins: 4, pf: 300, scores: [50]},
      {id: 4, name: 'Delta', wins: 0, pf: 100, scores: [50]}
    ]
  };
  const first = desk.playoffEquity(input);
  const second = desk.playoffEquity(input);
  assert.deepEqual(first, second);
  assert.equal(first.find(row => row.name === 'Alpha').titlePct, 1);
  assert.equal(first.find(row => row.name === 'Alpha').playoffPct, 1);
  assert.equal(first.find(row => row.name === 'Bravo').playoffPct, 1);
  assert.equal(first.find(row => row.name === 'Delta').playoffPct, 0);
  const playoffSum = first.reduce((sum, row) => sum + row.playoffPct, 0);
  const titleSum = first.reduce((sum, row) => sum + row.titlePct, 0);
  assert.ok(Math.abs(playoffSum - 2) < 0.001);
  assert.ok(Math.abs(titleSum - 1) < 0.001);
});

test('fair schedule credits all-play wins the head-to-head record missed', () => {
  const table = desk.fairSchedule([{
    week: 1,
    rows: [
      {id: 'Alpha', name: 'Alpha', matchupId: 1, points: 100},
      {id: 'Bravo', name: 'Bravo', matchupId: 1, points: 50},
      {id: 'Charlie', name: 'Charlie', matchupId: 2, points: 80},
      {id: 'Delta', name: 'Delta', matchupId: 2, points: 70}
    ]
  }]);
  const byName = Object.fromEntries(table.map(row => [row.name, row]));
  assert.equal(byName.Alpha.actual, 1);
  assert.equal(byName.Alpha.expected, 1);
  assert.equal(byName.Charlie.actual, 1);
  assert.equal(byName.Charlie.luck, 0.33);
  assert.equal(byName.Delta.luck, -0.33);
  assert.equal(byName.Bravo.actual, 0);
});

test('waiver autopsy separates hits, misses, and haunted drops', () => {
  const report = desk.waiverAutopsy({
    transactions: [
      {week: 2, manager: 'Alpha', adds: [{id: 'p1', name: 'Hero', position: 'WR'}], drops: [{id: 'p2', name: 'Ghost', position: 'RB'}]},
      {week: 2, manager: 'Bravo', adds: [{id: 'p3', name: 'Zero', position: 'TE'}], drops: []}
    ],
    weeks: [
      {week: 2, rosters: [
        {manager: 'Alpha', playerIds: ['p1'], starters: [{id: 'p1', points: 18}]},
        {manager: 'Bravo', playerIds: ['p2', 'p3'], starters: [{id: 'p2', points: 22}]}
      ]},
      {week: 3, rosters: [
        {manager: 'Alpha', playerIds: ['p1'], starters: []},
        {manager: 'Bravo', playerIds: ['p2'], starters: [{id: 'p2', points: 4}]}
      ]}
    ]
  });
  assert.equal(report.hits[0].name, 'Hero');
  assert.equal(report.hits[0].points, 18);
  assert.equal(report.misses[0].name, 'Zero');
  assert.equal(report.heists[0].name, 'Ghost');
  assert.equal(report.heists[0].points, 26);
  assert.equal(report.heists[0].scoredFor, 'Bravo');
});

test('draft graveyard marks kept, moved, and gone picks', () => {
  const report = desk.draftGraveyard({
    picks: [
      {playerId: '1', name: 'Kept', position: 'RB', round: 1, pick: 1, rosterId: 1, manager: 'Alpha'},
      {playerId: '2', name: 'Moved', position: 'WR', round: 2, pick: 14, rosterId: 1, manager: 'Alpha'},
      {playerId: '3', name: 'Gone', position: 'QB', round: 3, pick: 25, rosterId: 1, manager: 'Alpha'},
      {playerId: '4', name: 'Late', position: 'WR', round: 10, pick: 110, rosterId: 2, manager: 'Bravo'}
    ],
    rosters: [
      {rosterId: 1, manager: 'Alpha', playerIds: ['1']},
      {rosterId: 2, manager: 'Bravo', playerIds: ['2', '4']}
    ],
    starterIds: ['4']
  });
  assert.equal(report.kept, 2);
  assert.equal(report.moved, 1);
  assert.equal(report.gone, 1);
  assert.equal(report.earlyGone[0].name, 'Gone');
  assert.equal(report.lateKept[0].name, 'Late');
});

test('rivalry series joins the all-time record to this year\'s purse', () => {
  const series = desk.rivalrySeries({
    paid: [{id: 'martin-dom', week: 10, a: 'martinch94', b: 'cuch', labelA: 'Martin', labelB: 'Dom'}],
    allTime: [{a: 'cuch', b: 'martinch94', aWins: 4, bWins: 6, games: 10}],
    results: [{id: 'martin-dom', week: 10, a: 'martinch94', b: 'cuch', scoreA: 140, scoreB: 100, status: 'final'}],
    amount: 50
  });
  assert.equal(series[0].aWins, 6);
  assert.equal(series[0].bWins, 4);
  assert.equal(series[0].leader, 'martinch94');
  assert.equal(series[0].season.winner, 'martinch94');
  assert.equal(series[0].amount, 50);
});

test('fingerprints name a swing manager and a steady one', () => {
  const rows = desk.fingerprints({
    managers: [{name: 'Wild'}, {name: 'Calm'}],
    weeks: [1, 2, 3, 4].map(week => ({
      week,
      rows: [
        {name: 'Wild', matchupId: week, points: week % 2 ? 150 : 60},
        {name: 'Calm', matchupId: week, points: 108 + week}
      ]
    }))
  });
  const wild = rows.find(row => row.name === 'Wild');
  const calm = rows.find(row => row.name === 'Calm');
  assert.equal(wild.label, 'Swing');
  assert.equal(calm.label, 'Steady');
  assert.match(wild.summary, /Swing/);
});
