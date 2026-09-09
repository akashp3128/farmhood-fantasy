import assert from 'node:assert/strict';
import path from 'node:path';
import { readJsonIfExists, repoRoot } from '../press/utils.mjs';
import { attachTeamScores, buildSeasonPrizes, finalizedWeek, managerTotals, scoreUnits, validateConfig } from './model.mjs';

const root = repoRoot(import.meta.url);
const config = await readJsonIfExists(path.join(root, 'content', 'payouts', '2026-config.json'));
validateConfig(config);
const managerByRoster = new Map(config.managers.map((manager) => [manager.rosterId, manager]));
const weekOnePairs = [[6, 9], [1, 11], [2, 10], [3, 12], [4, 5], [7, 8]];
const matchupByRoster = new Map(weekOnePairs.flatMap((pair, index) => pair.map((rosterId) => [rosterId, index + 1])));

function rowsForWeek(teamScore = (rosterId) => 100 + rosterId, rbScore = (rosterId) => rosterId) {
  return config.managers.map((manager) => ({
    ...manager,
    matchupId: matchupByRoster.get(manager.rosterId),
    scoreUnits: scoreUnits(teamScore(manager.rosterId)),
    starters: [
      { id: `rb-${manager.rosterId}-a`, slot: 'RB', name: `Runner ${manager.rosterId}A`, position: 'RB', scoreUnits: scoreUnits(rbScore(manager.rosterId)) },
      { id: `rb-${manager.rosterId}-b`, slot: 'FLEX', name: `Runner ${manager.rosterId}B`, position: 'RB', scoreUnits: scoreUnits(1) }
    ]
  }));
}

const standard = finalizedWeek(config, 1, rowsForWeek(), 'a'.repeat(64));
assert.equal(standard.highScore.leaders[0].rosterId, 12);
assert.equal(standard.positionPrize.players[0].rosterId, 12);
assert.equal(standard.rivalry.leaders[0].rosterId, 8);
assert.equal(standard.highScore.allocations.reduce((sum, row) => sum + row.shareCents, 0), 3000);
assert.equal(standard.positionPrize.allocations.reduce((sum, row) => sum + row.shareCents, 0), 1000);
assert.equal(standard.rivalry.allocations.reduce((sum, row) => sum + row.shareCents, 0), 5000);

const tiedTeams = finalizedWeek(config, 1, rowsForWeek((rosterId) => rosterId >= 11 ? 150 : 100 + rosterId), 'b'.repeat(64));
assert.deepEqual(tiedTeams.highScore.allocations.map((row) => row.shareCents), [1500, 1500]);

const threeWayPosition = finalizedWeek(config, 1, rowsForWeek(undefined, (rosterId) => rosterId <= 3 ? 30 : 10), 'c'.repeat(64));
assert.deepEqual(threeWayPosition.positionPrize.allocations.map((row) => row.shareCents), [334, 333, 333]);

const sameOwnerRows = rowsForWeek();
sameOwnerRows.forEach((row) => row.starters.forEach((player) => { player.scoreUnits = scoreUnits(1); }));
sameOwnerRows.find((row) => row.rosterId === 1).starters = [
  { id: 'rb-one-a', slot: 'RB', name: 'Runner One A', position: 'RB', scoreUnits: scoreUnits(40) },
  { id: 'rb-one-b', slot: 'FLEX', name: 'Runner One B', position: 'RB', scoreUnits: scoreUnits(40) }
];
const sameOwner = finalizedWeek(config, 1, sameOwnerRows, 'd'.repeat(64));
assert.equal(sameOwner.positionPrize.players.length, 2);
assert.equal(sameOwner.positionPrize.allocations.length, 1);
assert.equal(sameOwner.positionPrize.allocations[0].shareCents, 1000);

const individualRows = rowsForWeek();
individualRows.forEach((row) => row.starters.forEach((player) => { player.scoreUnits = scoreUnits(1); }));
individualRows.find((row) => row.rosterId === 1).starters.forEach((player) => { player.scoreUnits = scoreUnits(20); });
individualRows.find((row) => row.rosterId === 2).starters[0].scoreUnits = scoreUnits(30);
const individual = finalizedWeek(config, 1, individualRows, 'f'.repeat(64));
assert.equal(individual.positionPrize.players[0].rosterId, 2);

const rbInFlexRows = rowsForWeek();
rbInFlexRows.forEach((row) => row.starters.forEach((player) => { player.scoreUnits = scoreUnits(1); }));
rbInFlexRows.find((row) => row.rosterId === 5).starters[1].scoreUnits = scoreUnits(45);
const rbInFlex = finalizedWeek(config, 1, rbInFlexRows, '0'.repeat(64));
assert.equal(rbInFlex.positionPrize.players[0].playerId, 'rb-5-b');

const flexRows = rowsForWeek();
flexRows.forEach((row) => {
  row.starters = [
    { id: `rb-${row.rosterId}`, slot: 'RB', name: 'Benchmarked RB', position: 'RB', scoreUnits: scoreUnits(100 + row.rosterId) },
    { id: `flex-${row.rosterId}`, slot: 'FLEX', name: 'Eligible Flex', position: 'WR', scoreUnits: scoreUnits(row.rosterId) }
  ];
});
const flex = finalizedWeek(config, 10, flexRows.map((row) => ({ ...row, matchupId: Math.ceil(row.rosterId / 2) })), 'e'.repeat(64));
assert.equal(flex.positionPrize.players[0].playerId, 'flex-12');

const finalWeeks = Array.from({ length: 14 }, (_, index) => attachTeamScores({ ...standard, week: index + 1, rivalry: null }, rowsForWeek()));
const season = buildSeasonPrizes(config, finalWeeks, [{ p: 1, w: 6, l: 4 }, { p: 3, w: 9, l: 3 }]);
assert.equal(season.status, 'final');
assert.equal(season.prizes.find((prize) => prize.key === 'firstPlace').leaders[0].rosterId, 6);
assert.equal(season.prizes.find((prize) => prize.key === 'secondPlace').leaders[0].rosterId, 4);
assert.equal(season.prizes.find((prize) => prize.key === 'thirdPlace').leaders[0].rosterId, 9);
const totals = managerTotals(config, finalWeeks, season);
assert.equal(totals.reduce((sum, row) => sum + row.totalCents, 0), 214000 + (3000 + 1000) * 14);

console.log(JSON.stringify({ status: 'passed', tests: 20, managers: managerByRoster.size }, null, 2));
