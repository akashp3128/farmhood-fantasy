const assert = require('node:assert/strict');
const test = require('node:test');
const {scheduleReplay, seasonStrength} = require('./desk.js');

const row = (id, matchupId, points) => ({id, name: id, matchupId, points});
const weeks = [
  {week: 1, rows: [row('A', 1, 100), row('B', 1, 120), row('C', 2, 90), row('D', 2, 80)]},
  {week: 2, rows: [row('A', 1, 100), row('C', 1, 80), row('B', 2, 90), row('D', 2, 70)]},
  {week: 3, rows: [row('A', 1, 90), row('D', 1, 100), row('B', 2, 80), row('C', 2, 70)]},
  {week: 4, rows: [row('A', 1, 90), row('C', 1, 90), row('B', 2, 100), row('D', 2, 90)]}
];
const record = value => [value.wins, value.losses, value.ties];

test('borrowed schedule compares actual weekly scores on identical eligible weeks', () => {
  const report = scheduleReplay({weeks, teamId: 'A', scheduleId: 'B'});
  assert.equal(report.rows[0].status, 'self');
  assert.equal(report.rows[0].replayResult, null);
  assert.deepEqual(record(report.actual), [1, 1, 1]);
  assert.deepEqual(record(report.replay), [2, 0, 1]);
  assert.deepEqual(record(report.fullActual), [1, 2, 1]);
  assert.equal(report.games, 3);
  assert.equal(report.skippedWeeks, 1);
  assert.equal(report.winsDelta, 1);
  assert.deepEqual(report.rows.slice(1).map(row => row.opponent), ['D', 'C', 'D']);
  assert.equal(report.rows[2].changed, true);
});

test('two-way swap avoids self-scoring while preserving the original head-to-head', () => {
  const report = scheduleReplay({weeks, teamId: 'A', scheduleId: 'B', selfMatch: 'swap'});
  assert.equal(report.rows[0].swapped, true);
  assert.equal(report.rows[0].opponent, 'B');
  assert.equal(report.rows[0].opponentPoints, 120);
  assert.deepEqual(record(report.actual), [1, 2, 1]);
  assert.deepEqual(record(report.replay), [2, 1, 1]);
  assert.equal(report.games, 4);
  assert.equal(report.winsDelta, 1);
});

test('your own schedule is an identity replay, in either self-matchup mode', () => {
  for (const selfMatch of ['skip', 'swap']) for (const teamId of ['A', 'B', 'C', 'D']) {
    const report = scheduleReplay({weeks, teamId, scheduleId: teamId, selfMatch});
    assert.deepEqual(report.replay, report.actual);
    assert.equal(report.winsDelta, 0);
    assert.equal(report.games, 4);
    assert.ok(report.rows.every(row => !row.changed && !row.swapped));
  }
});

test('zero and negative final scores are valid and hundredth-point differences decide games', () => {
  const report = scheduleReplay({teamId: 'A', scheduleId: 'A', weeks: [
    {week: 1, rows: [row('A', 1, 0), row('B', 1, -1)]},
    {week: 2, rows: [row('A', 1, 100.01), row('B', 1, 100)]},
    {week: 3, rows: [row('A', 1, 0), row('B', 1, 0)]}
  ]});
  assert.deepEqual(record(report.replay), [2, 0, 1]);
});

test('unfinished, missing, duplicated or ambiguous data never invents replay outcomes', () => {
  const input = [
    {week: 1, status: 'live', rows: weeks[0].rows},
    {week: 2, rows: [row('A', 1, 100), row('C', 1, 80), row('B', 2, 90), row('D', 2, null)]},
    {week: 3, rows: [row('A', 1, 100), row('A', 2, 80), row('B', 2, 70)]},
    {week: 4, rows: [row('A', null, 100), row('B', null, 80)]},
    {week: 5, rows: weeks[0].rows}, {week: 5, rows: weeks[1].rows}
  ];
  const report = scheduleReplay({weeks: input, teamId: 'A', scheduleId: 'B'});
  assert.equal(report.games, 0);
  assert.equal(report.rows.length, 4);
  assert.ok(report.rows.every(row => row.status === 'missing' && row.replayResult === null));
  assert.equal(scheduleReplay({weeks: [], teamId: 'A', scheduleId: 'B'}).actualOpponentMean, null);
});

test('season strength separates own scoring and same-week opponent scoring from all-play', () => {
  const profiles = seasonStrength(weeks);
  const a = profiles.find(row => row.id === 'A');
  assert.equal(a.ppg, 95);
  assert.equal(a.median, 95);
  assert.equal(a.opponentPPG, 97.5);
  assert.equal(a.opponentMedian, 95);
  assert.deepEqual(record(a.record), [1, 2, 1]);
  assert.equal(a.allPlayWeeks, 4);
  assert.ok(a.allPlayPct >= 0 && a.allPlayPct <= 1);
  assert.ok(Math.abs(profiles.reduce((sum, row) => sum + row.allPlayPct, 0) - 2) < 1e-10);
});

test('partial final boards may supply known matchups but not an invented full-league all-play rate', () => {
  const profiles = seasonStrength([{week: 1, rows: [row('A', 1, 0), row('B', 1, 1), row('C', 2, null)]}]);
  assert.equal(profiles.length, 2);
  assert.ok(profiles.every(profile => profile.allPlayPct === null && profile.allPlayWeeks === 0));
  assert.deepEqual(record(profiles.find(profile => profile.id === 'A').record), [0, 1, 0]);
});
