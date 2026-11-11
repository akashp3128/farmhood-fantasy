const assert = require('node:assert/strict');
const test = require('node:test');
const schedule = require('./schedule.js');

function row(rosterId, matchupId, points) {
  return {rosterId, matchupId, points};
}

function fixture() {
  return schedule.analyze({
    regularSeasonWeeks: 4,
    playoffStart: 5,
    playoffTeams: 2,
    completedThrough: 1,
    currentWeek: 2,
    rosters: [
      {rosterId: 1, name: 'Alpha', wins: 3, losses: 0, ties: 0, pf: 300},
      {rosterId: 2, name: 'Bravo', wins: 2, losses: 1, ties: 0, pf: 240},
      {rosterId: 3, name: 'Charlie', wins: 1, losses: 2, ties: 0, pf: 180},
      {rosterId: 4, name: 'Delta', wins: 0, losses: 3, ties: 0, pf: 90}
    ],
    weeks: {
      1: [row(1, 1, 100), row(4, 1, 80), row(2, 2, 90), row(3, 2, 70)],
      2: [row(1, 1, 0), row(3, 1, 0), row(2, 2, 0), row(4, 2, 0)],
      3: [row(1, 1, 0), row(4, 1, 0), row(2, 2, 0), row(3, 2, 0)],
      4: [row(1, 1, 0), row(2, 1, 0), row(3, 2, 0), row(4, 2, 0)],
      5: [row(1, 1, 0), row(4, 1, 0), row(2, 2, 0), row(3, 2, 0)]
    }
  });
}

function cell(model, name, week) {
  const roster = model.rosters.find(item => item.name === name);
  return roster.cells.find(item => item.week === week);
}

test('strength blends win percentage with points-for rank', () => {
  const rosters = [
    {rosterId: 1, wins: 2, losses: 0, pf: 300},
    {rosterId: 2, wins: 1, losses: 1, pf: 200},
    {rosterId: 3, wins: 0, losses: 2, pf: 100}
  ];
  const top = schedule.opponentStrength(rosters[0], rosters);
  const mid = schedule.opponentStrength(rosters[1], rosters);
  const bottom = schedule.opponentStrength(rosters[2], rosters);
  assert.equal(top.strength, 1);
  assert.equal(top.band, 'hard');
  assert.equal(mid.winPct, 0.5);
  assert.equal(mid.pfPct, 0.5);
  assert.equal(mid.strength, 0.5);
  assert.equal(mid.band, 'mid');
  assert.equal(bottom.strength, 0);
  assert.equal(bottom.band, 'easy');
});

test('future zeros are unplayed and finals honor the score', () => {
  const model = fixture();
  const alphaWeek1 = cell(model, 'Alpha', 1);
  const deltaWeek1 = cell(model, 'Delta', 1);
  const alphaWeek2 = cell(model, 'Alpha', 2);
  assert.equal(alphaWeek1.result, 'W');
  assert.equal(deltaWeek1.result, 'L');
  assert.equal(alphaWeek1.opponentName, 'Delta');
  assert.equal(alphaWeek2.result, null);
  assert.equal(alphaWeek2.phase, 'scheduled');
  assert.equal(alphaWeek2.opponentName, 'Charlie');
  assert.equal(cell(model, 'Alpha', 5).phase, 'playoff');
});

test('a live week keeps the score provisional', () => {
  const model = schedule.analyze({
    regularSeasonWeeks: 2,
    playoffStart: 3,
    playoffTeams: 1,
    completedThrough: 0,
    currentWeek: 1,
    rosters: [
      {rosterId: 1, name: 'Alpha', wins: 0, losses: 0, pf: 10},
      {rosterId: 2, name: 'Bravo', wins: 0, losses: 0, pf: 5}
    ],
    weeks: {1: [row(1, 1, 12), row(2, 1, 4)]}
  });
  const live = cell(model, 'Alpha', 1);
  assert.equal(live.phase, 'live');
  assert.equal(live.result, null);
  assert.match(schedule.cellSummary(live), /live 12\.0 to 4\.0/);
});

test('remaining slate, stretches, and the playoff cut', () => {
  const model = fixture();
  const alpha = model.rosters.find(item => item.name === 'Alpha');
  const bravo = model.rosters.find(item => item.name === 'Bravo');
  const charlie = model.rosters.find(item => item.name === 'Charlie');
  const delta = model.rosters.find(item => item.name === 'Delta');
  assert.equal(alpha.band, 'hard');
  assert.equal(bravo.band, 'hard');
  assert.equal(charlie.band, 'easy');
  assert.equal(delta.band, 'easy');
  assert.equal(alpha.remaining.index, 33);
  assert.equal(alpha.remaining.label, 'Soft');
  assert.equal(bravo.remaining.index, 44);
  assert.equal(charlie.remaining.index, 56);
  assert.equal(delta.remaining.index, 67);
  assert.equal(delta.remaining.label, 'Brutal');
  assert.deepEqual(alpha.stretches.soft.weeks, [2, 3]);
  assert.equal(alpha.stretches.brutal, null);
  assert.deepEqual(delta.stretches.brutal.weeks, [2, 3]);
  assert.equal(model.softestId, alpha.rosterId);
  assert.equal(model.toughestId, delta.rosterId);
  assert.equal(alpha.remaining.vsPicture, 1);
  assert.equal(delta.remaining.vsPicture, 2);
  assert.deepEqual(schedule.defaultPair(model), [bravo.rosterId, charlie.rosterId]);

  assert.deepEqual(schedule.leagueInsights(model).map(note => note.text), [
    'Alpha has the softest road left, slate index 33, against opponents who are a combined 3-6 right now.',
    'Delta has the heaviest road left, slate index 67, against opponents who are a combined 6-3 right now.',
    'Bravo sits in the last playoff spot and Charlie is first out. Bravo has the softer remaining slate, index 44 versus 56.'
  ]);
  assert.deepEqual(schedule.matchupInsights(model, 1, 4).map(note => note.text), [
    'Alpha and Delta still meet in Week 3.',
    "Alpha's remaining slate index is 33 (opponents 3-6). Delta's is 67 (opponents 6-3).",
    'Weeks 2-3 are a brutal run for Delta.',
    'Week 2 is the swing. Alpha draws the easier opponent.',
    'Week 5 pairs them on the posted playoff slate. The bracket reseeds, so that pairing is not locked.'
  ]);
});

test('abbreviations stay short and unique', () => {
  const map = schedule.abbreviateAll(['maco71', 'maco99', 'martinch94', 'jwislek_20']);
  assert.equal(map.get('maco71'), 'maco');
  assert.equal(map.get('maco99'), 'maco9');
  assert.equal(map.get('martinch94'), 'mart');
  assert.equal(map.get('jwislek_20'), 'jwis');
  assert.equal(new Set(map.values()).size, map.size);
});

test('bye radar finds collisions, covers, and waiver holes', () => {
  const nfl = {
    11: {
      DAL: {opponent: 'NYG', home: true},
      NYG: {opponent: 'DAL', home: false}
    },
    12: {
      DAL: {opponent: 'LV', home: false},
      NYG: {opponent: 'NE', home: true},
      PHI: {opponent: 'TB', home: true}
    }
  };
  const report = schedule.byeReport({
    weeks: [11, 12],
    nfl,
    starters: [
      {id: 'a', name: 'Achane', position: 'RB', slot: 'RB', team: 'PHI'},
      {id: 'l', name: 'London', position: 'WR', slot: 'WR', team: 'PHI'},
      {id: 'd', name: 'Eagles', position: 'DEF', slot: 'DEF', team: 'PHI'}
    ],
    bench: [
      {id: 'g', name: 'Allgeier', position: 'RB', slot: 'BN', team: 'DAL'},
      {id: 's', name: 'Smith', position: 'WR', slot: 'BN', team: 'NYG'}
    ]
  });
  assert.equal(report.starters[0].weeks[0].status, 'bye');
  assert.equal(report.starters[0].weeks[1].status, 'play');
  assert.deepEqual(report.weekSummaries.map(item => item.week), [11]);
  const defense = report.weekSummaries[0].byes.find(bye => bye.slot === 'DEF');
  const runner = report.weekSummaries[0].byes.find(bye => bye.name === 'Achane');
  assert.equal(defense.covers.length, 0);
  assert.equal(runner.covers.length, 1);
  assert.equal(runner.covers[0].name, 'Allgeier');
  assert.deepEqual(schedule.byeInsights(report).map(note => note.title), ['Week 11 goes dark', 'Waiver weeks']);
  assert.match(schedule.byeInsights(report)[1].text, /Week 11 DEF/);

  const comparison = schedule.comparePlayers(
    {name: 'Achane', team: 'PHI'},
    {name: 'Allgeier', team: 'DAL'},
    nfl,
    [11, 12]
  );
  assert.deepEqual(comparison.edges.map(edge => edge.week + ':' + edge.edge), ['11:b']);
  assert.equal(
    schedule.duelInsights(comparison, {name: 'Achane'}, {name: 'Allgeier'})[0].text,
    'Start Allgeier. Achane is on bye, and Allgeier plays vs NYG.'
  );
});

test('pickup options skip rostered, injured, and bye-week players', () => {
  const slate = {DAL: {opponent: 'NYG', home: true}, PHI: {opponent: 'TB', home: false}};
  const options = schedule.pickupOptions({
    1: {id: '1', name: 'Rostered', position: 'WR', team: 'DAL', projection: 20},
    2: {id: '2', name: 'Hurt', position: 'WR', team: 'DAL', projection: 18, injury: 'OUT'},
    3: {id: '3', name: 'Dark', position: 'WR', team: 'GB', projection: 17},
    4: {id: '4', name: 'Useful', position: 'WR', team: 'DAL', projection: 11.5},
    5: {id: '5', name: 'Runner', position: 'RB', team: 'PHI', projection: 14}
  }, slate, 'WR', new Set(['1']));
  assert.deepEqual(options.map(option => option.name), ['Useful']);
  assert.equal(options[0].home, true);
  assert.equal(options[0].projection, 11.5);
});

test('the loudest bye collision wins, then the earliest week', () => {
  const worst = schedule.worstCollision([
    {rosterId: 1, name: 'Alpha', report: {weekSummaries: [{week: 12, byes: [{}, {}]}]}},
    {rosterId: 2, name: 'Bravo', report: {weekSummaries: [{week: 11, byes: [{}, {}, {}]}, {week: 13, byes: [{}, {}, {}]}]}}
  ]);
  assert.equal(worst.name, 'Bravo');
  assert.equal(worst.week, 11);
  assert.equal(worst.count, 3);
});

test('nfl weeks keep home and away, and empty feeds are unknown', () => {
  const slate = schedule.normalizeNflWeek([{home: 'dal', away: 'nyg', metadata: {}}]);
  assert.equal(slate.DAL.opponent, 'NYG');
  assert.equal(slate.DAL.home, true);
  assert.equal(slate.NYG.home, false);
  assert.equal(schedule.normalizeNflWeek([]), null);
});

test('empty input does not throw', () => {
  const model = schedule.analyze({});
  assert.deepEqual(model.rosters, []);
  assert.equal(model.softestId, null);
  assert.deepEqual(schedule.leagueInsights(model), []);
  assert.deepEqual(schedule.matchupInsights(model, 1, 2), []);
});
