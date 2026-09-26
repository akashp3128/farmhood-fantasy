import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWaiverArticle, buildWaiverSnapshot, validateWaiverArticle } from './waivers.mjs';

const players = {
  '10': { player_id: '10', full_name: 'Verified Runner', position: 'RB', team: 'CHI' },
  '20': { player_id: '20', first_name: 'Known', last_name: 'Receiver', position: 'WR', team: 'DET' },
  '30': { player_id: '30', full_name: 'Dropped Player', position: 'TE', team: 'NYJ' }
};

const completed = (overrides = {}) => ({
  transaction_id: 'tx1',
  type: 'waiver',
  status: 'complete',
  status_updated: Date.parse('2026-09-23T12:00:00Z'),
  created: Date.parse('2026-09-23T11:00:00Z'),
  leg: 3,
  roster_ids: [1],
  adds: { 10: 1 },
  drops: { 30: 1 },
  settings: { waiver_bid: 0, priority: 0, seq: 2 },
  ...overrides
});

test('normalizes only completed weekly waiver and free-agent moves', () => {
  const snapshot = buildWaiverSnapshot({
    season: 2026,
    week: 3,
    generatedAt: '2026-09-24T14:00:00.000Z',
    players,
    rosterNames: { 1: 'Alpha', 2: 'Bravo' },
    rawTransactions: [
      completed(),
      completed({ transaction_id: 'tx2', type: 'free_agent', roster_ids: [2], adds: { 20: 2 }, drops: null, settings: null, status_updated: Date.parse('2026-09-24T13:00:00Z') }),
      completed({ transaction_id: 'pending', status: 'pending' }),
      completed({ transaction_id: 'trade', type: 'trade' }),
      completed({ transaction_id: 'other-week', leg: 2 })
    ]
  });

  assert.equal(snapshot.kind, 'transactions');
  assert.equal(snapshot.transactions.length, 2);
  assert.equal(snapshot.transactions[0].transactionId, 'tx2');
  assert.equal(snapshot.transactions[1].waiverBid, 0);
  assert.equal(snapshot.transactions[1].waiverPriority, 0);
  assert.equal(snapshot.transactions[1].claimSequence, 2);
  assert.deepEqual(snapshot.summary, {
    completedTransactions: 2,
    waiverClaims: 1,
    freeAgentMoves: 1,
    adds: 2,
    drops: 1,
    managersActive: 2,
    waiverBidsReported: 1,
    faabSpent: 0,
    highestBids: [{ manager: 'Alpha', player: 'Verified Runner', bid: 0, transactionId: 'tx1' }],
    mostActiveManagers: ['Alpha', 'Bravo'],
    mostActiveCount: 1,
    topAddedPositions: ['RB', 'WR'],
    topAddedPositionCount: 1
  });
  assert.equal(snapshot.managerSummaries[0].manager, 'Alpha');
  assert.equal(snapshot.managerSummaries[1].manager, 'Bravo');
});

test('uses a verified team-code D/ST label when Sleeper omits the defense player row', () => {
  const snapshot = buildWaiverSnapshot({
    season: 2026,
    week: 3,
    generatedAt: '2026-09-24T14:00:00.000Z',
    players: {},
    rosterNames: { 1: 'Blumbo' },
    rawTransactions: [completed({ adds: { KC: 1 }, drops: { PHI: 1 } })]
  });
  assert.deepEqual(snapshot.transactions[0].adds[0], { playerId: 'KC', name: 'KC D/ST', position: 'DEF', team: 'KC' });
  assert.deepEqual(snapshot.transactions[0].drops[0], { playerId: 'PHI', name: 'PHI D/ST', position: 'DEF', team: 'PHI' });
});

test('refuses an unresolved non-defense player or unmapped manager', () => {
  assert.throws(() => buildWaiverSnapshot({
    season: 2026, week: 3, generatedAt: '2026-09-24T14:00:00.000Z', players: {}, rosterNames: { 1: 'Alpha' }, rawTransactions: [completed()]
  }), /could not be resolved/);
  assert.throws(() => buildWaiverSnapshot({
    season: 2026, week: 3, generatedAt: '2026-09-24T14:00:00.000Z', players, rosterNames: {}, rawTransactions: [completed()]
  }), /canonical manager mapping/);
});

test('snapshot identity depends on source transactions rather than run time', () => {
  const input = { season: 2026, week: 3, players, rosterNames: { 1: 'Alpha' }, rawTransactions: [completed()] };
  const first = buildWaiverSnapshot({ ...input, generatedAt: '2026-09-24T14:00:00.000Z' });
  const second = buildWaiverSnapshot({ ...input, generatedAt: '2026-09-25T14:00:00.000Z' });
  assert.equal(first.id, second.id);
  assert.notEqual(first.generatedAt, second.generatedAt);
});

test('does not turn a missing waiver bid into a reported zero-dollar spend', () => {
  const snapshot = buildWaiverSnapshot({
    season: 2026,
    week: 3,
    generatedAt: '2026-09-24T14:00:00.000Z',
    players,
    rosterNames: { 1: 'Blumbo' },
    rawTransactions: [completed({ settings: {} })]
  });
  assert.equal(snapshot.transactions[0].waiverBid, null);
  assert.equal(snapshot.summary.waiverBidsReported, 0);
  assert.equal(snapshot.summary.faabSpent, null);
  assert.equal(snapshot.managerSummaries[0].faabSpent, null);
  assert.match(buildWaiverArticle(snapshot).storylines[1].body, /without a bid amount/);
});

test('shows no FAAB amount when a manager made free-agent moves but no waiver claim', () => {
  const snapshot = buildWaiverSnapshot({
    season: 2026,
    week: 3,
    generatedAt: '2026-09-24T14:00:00.000Z',
    players,
    rosterNames: { 1: 'Blumbo' },
    rawTransactions: [completed({ type: 'free_agent', settings: null })]
  });
  assert.equal(snapshot.summary.waiverClaims, 0);
  assert.equal(snapshot.summary.faabSpent, null);
  assert.equal(snapshot.managerSummaries[0].faabSpent, null);
});

test('builds verified bid copy for a successful waiver claim', () => {
  const snapshot = buildWaiverSnapshot({
    season: 2026,
    week: 3,
    generatedAt: '2026-09-24T14:00:00.000Z',
    players,
    rosterNames: { 1: 'Blumbo' },
    rawTransactions: [completed({ settings: { waiver_bid: 17, priority: 2, seq: 4 } })]
  });
  const article = buildWaiverArticle(snapshot);
  assert.equal(article.title, 'Week 3 Waiver Wire: 1 Claim');
  assert.match(article.storylines[1].body, /totaled \$17/);
  assert.match(article.storylines[1].body, /Blumbo for Verified Runner/);
  assert.equal(article.transactions[0].waiverBid, 17);
  assert.equal(validateWaiverArticle(article, snapshot), article);
});

test('builds a useful deterministic zero-move edition intentionally', () => {
  const snapshot = buildWaiverSnapshot({
    season: 2026,
    week: 4,
    generatedAt: '2026-09-30T14:00:00.000Z',
    players: {},
    rosterNames: { 1: 'Alpha' },
    rawTransactions: []
  });
  const article = buildWaiverArticle(snapshot);
  assert.equal(article.title, 'Week 4 Waiver Wire: No Completed Moves');
  assert.match(article.dek, /0 completed transactions/);
  assert.equal(article.transactions.length, 0);
  assert.equal(article.managerSummaries.length, 0);
  assert.equal(article.source.openaiRequests, 0);
  assert.equal(article.transactionContext.timezone, 'America/Chicago');
  assert.equal(validateWaiverArticle(article, snapshot), article);
});
