import assert from 'node:assert/strict';
import test from 'node:test';
import { automaticArticleId, completedThroughWeek, planAutomaticEdition } from './plan.mjs';

const league = (week = 3) => ({ league_id: '1377086848295260160', season: '2026', settings: { leg: week } });
const rosters = (games) => Array.from({ length: 12 }, (_, index) => ({ roster_id: index + 1, settings: { wins: games, losses: 0, ties: 0 } }));

test('plans the earliest missing finalized recap with valid immutable lineage', () => {
  const plan = planAutomaticEdition({
    edition: 'recap', league: league(4), rosters: rosters(3),
    publishedIds: new Set(['2026-week-01-recap']),
    predictionsByWeek: new Map([[2, { state: 'locked_original' }], [3, { state: 'locked_late' }]])
  });
  assert.equal(plan.shouldRun, true);
  assert.equal(plan.week, 2);
  assert.equal(plan.articleId, '2026-week-02-recap');
});

test('does not let missing recap lineage starve a later eligible finalized week', () => {
  const plan = planAutomaticEdition({
    edition: 'recap', league: league(5), rosters: rosters(4),
    publishedIds: new Set(['2026-week-01-recap', '2026-week-02-recap']),
    predictionsByWeek: new Map([[4, { state: 'locked_original' }]])
  });
  assert.equal(plan.shouldRun, true);
  assert.equal(plan.week, 4);
});

test('skips recap planning before any paid request when every final is published', () => {
  const plan = planAutomaticEdition({
    edition: 'recap', league: league(3), rosters: rosters(2),
    publishedIds: new Set(['2026-week-01-recap', '2026-week-02-recap']),
    predictionsByWeek: new Map()
  });
  assert.equal(plan.shouldRun, false);
  assert.match(plan.reason, /already has a Recap/);
});

test('plans one waiver report for the current Sleeper leg', () => {
  const first = planAutomaticEdition({ edition: 'waiver', league: league(6), rosters: rosters(5), publishedIds: new Set() });
  assert.equal(first.shouldRun, true);
  assert.equal(first.week, 6);
  assert.equal(first.articleId, '2026-week-06-waiver-recap');
  const duplicate = planAutomaticEdition({ edition: 'waiver', league: league(6), rosters: rosters(5), publishedIds: new Set([first.articleId]) });
  assert.equal(duplicate.shouldRun, false);
});

test('never creates a late outlook over an original preview or prediction ledger', () => {
  const preview = planAutomaticEdition({ edition: 'late-preview', league: league(3), rosters: rosters(2), publishedIds: new Set(['2026-week-03-preview']) });
  assert.equal(preview.shouldRun, false);
  const ledger = planAutomaticEdition({ edition: 'late-preview', league: league(3), rosters: rosters(2), publishedIds: new Set(), predictionsByWeek: new Map([[3, { state: 'published_prelock' }]]) });
  assert.equal(ledger.shouldRun, false);
});

test('supports an explicit manual week without calendar arithmetic', () => {
  const plan = planAutomaticEdition({ edition: 'waiver', league: league(7), rosters: rosters(6), publishedIds: new Set(), requestedWeek: '5' });
  assert.equal(plan.week, 5);
  assert.equal(automaticArticleId('waiver', 2026, 5), '2026-week-05-waiver-recap');
  assert.equal(completedThroughWeek(rosters(6)), 6);
});
