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
