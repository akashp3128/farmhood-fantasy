import { assert, safeText, unique } from './utils.mjs';

const stringField = (maxLength) => ({ type: 'string', maxLength });

export function articleCopySchema(snapshot, type) {
  const matchupIds = snapshot.matchups.map((matchup) => matchup.matchupId);
  const playerIds = unique(snapshot.teams.flatMap((team) => team.starters.map((player) => player.id).filter((id) => id !== '0')));
  const managerNames = snapshot.teams.map((team) => team.manager);
  const factIds = unique([...(snapshot.factIds || []), ...snapshot.matchups.flatMap((matchup) => matchup.factIds)]);
  const matchupItem = {
    type: 'object',
    additionalProperties: false,
    properties: {
      matchupId: { type: 'integer', enum: matchupIds },
      headline: stringField(120),
      analysis: stringField(700),
      keyPlayerId: { type: 'string', enum: playerIds },
      upsetPath: stringField(360),
      historyNote: stringField(300),
      factIds: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string', enum: factIds } }
    },
    required: ['matchupId', 'headline', 'analysis', 'keyPlayerId', 'upsetPath', 'historyNote', 'factIds']
  };
  const storylineItem = {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: stringField(100),
      body: stringField(500),
      subjects: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string', enum: managerNames } },
      factIds: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string', enum: factIds } }
    },
    required: ['title', 'body', 'subjects', 'factIds']
  };
  const awardItem = {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: stringField(80),
      recipient: { type: 'string', enum: managerNames },
      body: stringField(240),
      factIds: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string', enum: factIds } }
    },
    required: ['title', 'recipient', 'body', 'factIds']
  };
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: stringField(130),
      dek: stringField(260),
      lead: { type: 'array', minItems: 2, maxItems: 4, items: stringField(900) },
      pullQuote: stringField(180),
      keyStat: {
        type: 'object',
        additionalProperties: false,
        properties: { label: stringField(60), value: stringField(60), note: stringField(180) },
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
  const teamByName = new Map(snapshot.teams.map((team) => [team.manager, team]));
  copy.matchups.forEach((item) => {
    const matchup = matchupById.get(item.matchupId);
    const validPlayers = new Set([matchup.managerA, matchup.managerB].flatMap((name) => teamByName.get(name).starters.map((player) => player.id)));
    assert(validPlayers.has(item.keyPlayerId), `Key player ${item.keyPlayerId} is not a starter in matchup ${item.matchupId}.`);
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
