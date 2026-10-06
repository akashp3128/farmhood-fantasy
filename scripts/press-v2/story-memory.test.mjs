import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveEditorialMemory, recordStoryEdition, STORY_MEMORY_VERSION, validateStoryMemory } from './story-memory.mjs';

const memory = {
  schemaVersion: STORY_MEMORY_VERSION,
  entries: [
    {
      articleId: '2026-w1-recap', season: 2026, week: 1, edition: 'recap',
      angles: ['champion-under-pressure'],
      cooldownPhrases: ['the crown got heavier'],
      historyFactIds: ['history:title:martinch94'],
      storyArcs: [{ id: 'champion-start', status: 'active', summary: 'martinch94 opened 0-1.', subjects: ['martinch94'] }]
    },
    {
      articleId: '2026-w3-recap', season: 2026, week: 3, edition: 'recap',
      angles: ['scoring-separation'],
      cooldownPhrases: ['commissioner schedules the headlines'],
      historyFactIds: ['history:points:Siccboi'],
      storyArcs: [
        { id: 'champion-start', status: 'resolved', summary: 'martinch94 returned to .500.', subjects: ['martinch94'] },
        { id: 'scoring-leader', status: 'active', summary: 'Siccboi leads average scoring.', subjects: ['Siccboi'] }
      ]
    }
  ]
};

test('validates and normalizes an editorial memory archive', () => {
  const result = validateStoryMemory(memory);
  assert.equal(result.entries.length, 2);
  assert.equal(result.entries[0].articleId, '2026-w1-recap');
});

test('derives recent phrase/history cooldowns and only active latest arcs', () => {
  const result = deriveEditorialMemory(memory, { season: 2026, week: 4, phraseCooldownWeeks: 3, historyCooldownWeeks: 2 });
  assert.deepEqual(result.cooldownPhrases, ['commissioner schedules the headlines']);
  assert.deepEqual(result.cooledHistoryFactIds, ['history:points:Siccboi']);
  assert.deepEqual(result.recentAngles, ['scoring-separation']);
  assert.deepEqual(result.activeStoryArcs.map((arc) => arc.id), ['scoring-leader']);
});

test('retires story arcs that have not been updated inside the idle window', () => {
  const result = deriveEditorialMemory(memory, { season: 2026, week: 8, storyArcMaximumIdleWeeks: 4 });
  assert.deepEqual(result.activeStoryArcs, []);
});

test('records a new edition immutably and blocks duplicate article IDs', () => {
  const next = recordStoryEdition(memory, {
    articleId: '2026-w4-outlook', season: 2026, week: 4, edition: 'weekend_outlook',
    angles: ['first-place-stakes'], cooldownPhrases: ['the standings have a new fence'], historyFactIds: [], storyArcs: []
  });
  assert.equal(memory.entries.length, 2);
  assert.equal(next.entries.length, 3);
  assert.throws(() => recordStoryEdition(next, next.entries[2]), /already contains/);
});

test('rejects invalid arc status and duplicate article IDs', () => {
  const invalid = structuredClone(memory);
  invalid.entries[0].storyArcs[0].status = 'maybe';
  assert.throws(() => validateStoryMemory(invalid), /unknown status/);

  const duplicate = structuredClone(memory);
  duplicate.entries.push(structuredClone(duplicate.entries[0]));
  assert.throws(() => validateStoryMemory(duplicate), /duplicate article IDs/);
});

test('orders same-week legacy forecasts before the recap rather than by article ID', () => {
  const entries = ['recap', 'weekend_outlook'].map((edition) => ({
    articleId: `2026-w3-${edition}`, season: 2026, week: 3, edition, angles: [], cooldownPhrases: [], historyFactIds: [],
    storyArcs: [{ id: 'season:2026:manager-race', status: edition === 'recap' ? 'resolved' : 'active', summary: 'The same race has a final status.', subjects: ['Siccboi', 'Blumbo'] }]
  }));
  const result = deriveEditorialMemory({ schemaVersion: STORY_MEMORY_VERSION, entries }, { season: 2026, week: 4 });
  assert.equal(result.activeStoryArcs.some((arc) => arc.id === 'season:2026:manager-race'), false);
});

test('preserves capture chronology when an earlier forecast is backfilled after a resolved recap', () => {
  const entries = [
    { articleId: 'late-outlook', season: 2026, week: 3, edition: 'weekend_outlook', generatedAt: '2026-10-01T12:00:00Z', dataAsOf: '2026-09-25T14:00:00Z', angles: [], cooldownPhrases: [], historyFactIds: [], storyArcs: [{ id: 'race', status: 'active', summary: 'Earlier forecast.', subjects: ['Siccboi'] }] },
    { articleId: 'earlier-recap', season: 2026, week: 3, edition: 'recap', generatedAt: '2026-09-29T14:00:00Z', dataAsOf: '2026-09-29T12:00:00Z', angles: [], cooldownPhrases: [], historyFactIds: [], storyArcs: [{ id: 'race', status: 'resolved', summary: 'Final result resolved the arc.', subjects: ['Siccboi'] }] }
  ];
  const result = deriveEditorialMemory({ schemaVersion: STORY_MEMORY_VERSION, entries }, { season: 2026, week: 4 });
  assert.deepEqual(result.activeStoryArcs, []);
  assert.throws(() => validateStoryMemory({ schemaVersion: STORY_MEMORY_VERSION, entries: [{ ...entries[0], generatedAt: 'bad-time' }] }), /valid timestamp/);
});

test('keeps canonical manager history available after the ordinary arc idle window', () => {
  const canonical = { ...memory.entries[0], articleId: 'canon-2026-managers', edition: 'feature' };
  const result = deriveEditorialMemory({ schemaVersion: STORY_MEMORY_VERSION, entries: [canonical] }, { season: 2026, week: 12 });
  assert.equal(result.activeStoryArcs.length, 1);
  assert.equal(result.canonicalStoryArcs.length, 1);
  assert.equal(result.canonicalStoryArcs[0].canonicalContext, true);
});
