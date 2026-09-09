import { assert, safeText, unique } from './utils.mjs';

const stringField = (maxLength) => ({ type: 'string', maxLength });

export function articleCopySchema(snapshot, type) {
  const matchupIds = snapshot.matchups.map((matchup) => matchup.matchupId);
  const managerNames = snapshot.teams.map((team) => team.manager);
  const factIds = unique([...(snapshot.factIds || []), ...snapshot.matchups.flatMap((matchup) => matchup.factIds)]);
  const matchupItem = {
    type: 'object',
    additionalProperties: false,
    properties: {
      matchupId: { type: 'integer', enum: matchupIds },
      headline: stringField(120),
      analysis: stringField(450),
      upsetPath: stringField(280),
      historyNote: stringField(220),
      factIds: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'string', enum: factIds } }
    },
    required: ['matchupId', 'headline', 'analysis', 'upsetPath', 'historyNote', 'factIds']
  };
  const storylineItem = {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: stringField(100),
      body: stringField(350),
      subjects: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string', enum: managerNames } },
      factIds: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'string', enum: factIds } }
    },
    required: ['title', 'body', 'subjects', 'factIds']
  };
  const awardItem = {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: stringField(80),
      recipient: { type: 'string', enum: managerNames },
      body: stringField(200),
      factIds: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string', enum: factIds } }
    },
    required: ['title', 'recipient', 'body', 'factIds']
  };
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: stringField(120),
      dek: stringField(220),
      lead: { type: 'array', minItems: 2, maxItems: 3, items: stringField(600) },
      pullQuote: stringField(150),
      keyStat: {
        type: 'object',
        additionalProperties: false,
        properties: { label: stringField(50), value: stringField(50), note: stringField(150) },
        required: ['label', 'value', 'note']
      },
      matchups: { type: 'array', minItems: matchupIds.length, maxItems: matchupIds.length, items: matchupItem },
      storylines: { type: 'array', minItems: 3, maxItems: 3, items: storylineItem },
      awards: { type: 'array', minItems: type === 'recap' ? 3 : 0, maxItems: type === 'recap' ? 5 : 0, items: awardItem }
    },
    required: ['title', 'dek', 'lead', 'pullQuote', 'keyStat', 'matchups', 'storylines', 'awards']
  };
}

export function validateArticleCopy(copy, snapshot) {
  assert(copy && typeof copy === 'object', 'The model did not return an article object.');
  const expectedIds = snapshot.matchups.map((matchup) => matchup.matchupId).sort((a, b) => a - b);
  const actualIds = (copy.matchups || []).map((matchup) => matchup.matchupId).sort((a, b) => a - b);
  assert(JSON.stringify(actualIds) === JSON.stringify(expectedIds), 'Generated matchup IDs do not match the snapshot.');
  const factIds = new Set([...(snapshot.factIds || []), ...snapshot.matchups.flatMap((matchup) => matchup.factIds)]);
  const matchupById = new Map(snapshot.matchups.map((matchup) => [matchup.matchupId, matchup]));
  copy.matchups.forEach((item) => {
    const matchup = matchupById.get(item.matchupId);
    assert(matchup, `Unknown generated matchup: ${item.matchupId}.`);
    item.factIds.forEach((id) => assert(factIds.has(id), `Unknown fact ID in generated matchup copy: ${id}`));
  });
  (copy.storylines || []).flatMap((item) => item.factIds || []).forEach((id) => assert(factIds.has(id), `Unknown storyline fact ID: ${id}`));
  (copy.awards || []).flatMap((item) => item.factIds || []).forEach((id) => assert(factIds.has(id), `Unknown award fact ID: ${id}`));
  const text = JSON.stringify(copy);
  assert(!/<\/?[a-z][^>]*>/i.test(text), 'Generated copy contains raw HTML.');
  assert(!/\b(?:nigger|faggot|retard)\b/i.test(text), 'Generated copy failed the editorial language gate.');
  assert(safeText(copy.title, 140).length >= 12, 'Generated headline is too short.');
  return copy;
}
