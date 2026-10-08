import test from 'node:test';
import assert from 'node:assert/strict';
import { FactRegistry } from './fact-registry.mjs';
import { createIdentityIndex, IdentityIndex } from './identity.mjs';

function identities() {
  return createIdentityIndex({
    league: { leagueId: 'league-1', name: 'League One' },
    managers: [{ managerId: 'm1', displayName: 'Canonical_Manager', externalIds: { sleeper: 'owner-1' } }],
    players: [{ playerId: 'p1', fullName: 'Player One', position: 'QB', externalIds: { gsis: '00-1' } }]
  });
}

function registry() {
  return new FactRegistry({
    identities: identities(),
    sources: [{
      sourceId: 'source-1', provider: 'Sleeper', dataset: 'week 1',
      retrievedAt: '2026-09-10T12:00:00Z', observedAt: '2026-09-10T11:59:00Z', finality: 'final'
    }]
  });
}

function baseFact(overrides = {}) {
  return {
    semanticKey: '2026:w1:score:m1',
    kind: 'team_week_score',
    subject: { type: 'manager', id: 'm1' },
    value: 123.45,
    unit: 'fantasy_points',
    state: 'final',
    asOf: '2026-09-10T12:00:00Z',
    context: { season: 2026, week: 1 },
    claim: 'Canonical_Manager scored 123.45 points.',
    sourceIds: ['source-1'],
    eligibleEditions: ['recap'],
    ...overrides
  };
}

test('identity index resolves canonical and external identities without trusting aliases', () => {
  const index = identities();
  assert.equal(index.resolve('manager', 'm1').label, 'Canonical_Manager');
  assert.equal(index.resolveExternal('manager', 'sleeper', 'owner-1').id, 'm1');
  assert.equal(index.resolveExternal('player', 'gsis', '00-1').label, 'Player One');
  assert.throws(() => index.resolve('manager', 'canonical_manager'), /Unknown manager identity/);
});

test('identity index rejects duplicate external IDs', () => {
  assert.throws(() => new IdentityIndex({ managers: [
    { managerId: 'm1', displayName: 'One', externalIds: { sleeper: 'same' } },
    { managerId: 'm2', displayName: 'Two', externalIds: { sleeper: 'same' } }
  ] }), /maps to more than one entity/);
  assert.throws(() => new IdentityIndex({ managers: [
    { managerId: 'm1', displayName: 'SameName' },
    { managerId: 'm2', displayName: 'samename' }
  ] }), /display name .* is not unique/);
});

test('fact IDs are deterministic, canonical, and immutable', () => {
  const first = registry().add(baseFact());
  const second = registry().add(baseFact());
  assert.equal(first.factId, second.factId);
  assert.equal(first.subject.label, 'Canonical_Manager');
  assert.ok(Object.isFrozen(first));
  assert.throws(() => { first.value = 9; }, TypeError);
});

test('fact registry rejects semantic conflicts and unsupported provenance', () => {
  const store = registry();
  store.add(baseFact());
  assert.throws(() => store.add(baseFact({ value: 100, claim: 'Different.' })), /Semantic fact .* already exists/);
  assert.throws(() => registry().add(baseFact({ semanticKey: 'bad-source', sourceIds: ['missing'] })), /unknown source/);
  assert.throws(() => registry().add(baseFact({ semanticKey: 'bad-manager', subject: { type: 'manager', id: 'missing' } })), /Unknown manager identity/);
  assert.throws(() => new FactRegistry({ identities: identities(), sources: [{
    sourceId: 'future-source', provider: 'Test', dataset: 'future', finality: 'live',
    retrievedAt: '2026-09-10T11:00:00Z', observedAt: '2026-09-10T12:00:00Z'
  }] }), /observed materially after it was retrieved/);
});

test('numeric facts require units and derived facts require existing lineage', () => {
  assert.throws(() => registry().add(baseFact({ unit: null })), /requires a unit/);
  assert.throws(() => registry().add(baseFact({
    semanticKey: 'derived-missing', sourceIds: [], derivedFrom: ['fact:missing']
  })), /derives from unknown fact/);
  const store = registry();
  const source = store.add(baseFact());
  const derived = store.add(baseFact({
    semanticKey: '2026:w1:rank:m1', kind: 'weekly_rank', value: 1, unit: 'rank',
    sourceIds: [], derivedFrom: [source.factId], claim: 'Canonical_Manager ranked first.'
  }));
  assert.deepEqual(derived.derivedFrom, [source.factId]);
});

test('facts accept only recursive JSON data and unique canonical relationships', () => {
  assert.throws(() => registry().add(baseFact({ semanticKey: 'undefined-value', value: { bad: undefined }, unit: null })), /only JSON values/);
  assert.throws(() => registry().add(baseFact({ semanticKey: 'date-value', value: new Date(), unit: null })), /only JSON values/);
  assert.throws(() => registry().add(baseFact({
    semanticKey: 'self-related', related: [{ type: 'manager', id: 'm1' }]
  })), /cannot relate its subject to itself/);
  const store = registry();
  const nested = store.add(baseFact({ semanticKey: 'nested-value', value: { b: [2, 1], a: true }, unit: null }));
  assert.deepEqual(nested.value, { a: true, b: [2, 1] });
});

test('fact queries filter by edition, tags, subjects, and context', () => {
  const store = registry();
  store.add(baseFact({ tags: ['current-week', 'score'] }));
  assert.equal(store.find({ kind: 'team_week_score', edition: 'recap' }).length, 1);
  assert.equal(store.find({ tag: 'score', subjectKey: 'manager:m1', context: { week: 1 } }).length, 1);
  assert.equal(store.find({ context: { season: 2026 } }).length, 1);
  assert.equal(store.find({ edition: 'preview' }).length, 0);
});
