import { assert, safeText, unique } from './utils.mjs';
import { gradePredictions } from './grading.mjs';

const stringField = (maxLength) => ({ type: 'string', maxLength });

function generatedProse(copy) {
  return [
    copy.title, copy.dek, ...(copy.lead || []), copy.pullQuote,
    copy.keyStat?.label, copy.keyStat?.value, copy.keyStat?.note,
    ...(copy.matchups || []).flatMap((row) => [row.headline, row.analysis, row.upsetPath, row.historyNote]),
    ...(copy.storylines || []).flatMap((row) => [row.title, row.body]),
    ...(copy.awards || []).flatMap((row) => [row.title, row.body])
  ].filter((value) => typeof value === 'string');
}

function assertCanonicalManagerSpellings(copy, managerNames) {
  const canonical = new Map(managerNames.map((name) => [name.replace(/[^a-z0-9]/gi, '').toLowerCase(), name]));
  generatedProse(copy).forEach((text) => {
    const words = text.match(/[A-Za-z0-9_]+/g) || [];
    for (let start = 0; start < words.length; start += 1) {
      for (let size = 1; size <= 3 && start + size <= words.length; size += 1) {
        const phrase = words.slice(start, start + size).join(' '), normalized = phrase.replace(/[^a-z0-9]/gi, '').toLowerCase();
        const expected = canonical.get(normalized);
        if (expected && phrase.toLowerCase() !== expected.toLowerCase()) {
          throw new Error(`Generated copy misspells canonical manager ${expected} as "${phrase}".`);
        }
      }
    }
  });
}

function receiptRows(snapshot, prediction) {
  const predictions = new Map((prediction?.predictions || []).map((row) => [Number(row.matchupId), row]));
  return snapshot.matchups.map((matchup) => {
    const pick = predictions.get(Number(matchup.matchupId));
    if (!pick?.predictedWinner) return null;
    const winner = matchup.currentScoreA === matchup.currentScoreB ? 'Tie' : matchup.currentScoreA > matchup.currentScoreB ? matchup.managerA : matchup.managerB;
    return {
      winner,
      predictedWinner: pick.predictedWinner,
      predictionCorrect: winner === pick.predictedWinner,
      projectedScoreA: pick.projectedScoreA,
      projectedScoreB: pick.projectedScoreB,
      finalScoreA: matchup.currentScoreA,
      finalScoreB: matchup.currentScoreB
    };
  }).filter(Boolean);
}

function assertRecapClaims(copy, snapshot, prediction) {
  const rows = receiptRows(snapshot, prediction), receipts = gradePredictions(rows);
  if (!receipts) return;
  const correct = Number(String(receipts.correctWinners).split('/')[0]), graded = Number(receipts.graded);
  generatedProse(copy).forEach((text) => {
    if (!/\b(?:forecast|pick|prediction|favorite|receipt|desk|accuracy)\b/i.test(text)) return;
    for (const match of text.matchAll(/\b(\d+)\s*(?:-\s*)?(?:for|of)\s*-?\s*(\d+)\b/gi)) {
      if (Number(match[2]) === graded) assert(Number(match[1]) === correct, `Generated prediction record ${match[0]} does not match ${correct}-for-${graded}.`);
    }
    for (const match of text.matchAll(/\b(\d+)\s*[-/]\s*(\d+)\b/g)) {
      const left = Number(match[1]), right = Number(match[2]);
      if (left + right === graded) assert(left === correct, `Generated prediction record ${match[0]} does not match ${correct}-${graded - correct}.`);
      if (right === graded) assert(left === correct, `Generated prediction receipt ${match[0]} does not match ${correct}/${graded}.`);
    }
    if (/\b(?:accuracy|hit rate|correct picks?|receipt rate)\b/i.test(text)) {
      for (const match of text.matchAll(/\b(\d{1,3})%/g)) {
        assert(Number(match[1]) === Number(String(receipts.winnerAccuracy).replace('%', '')), `Generated prediction accuracy ${match[0]} does not match ${receipts.winnerAccuracy}.`);
      }
    }
    for (const match of text.matchAll(/\b(\d{1,3})\s*\/\s*100\b/g)) {
      if (/\bgrade\b/i.test(text)) assert(`${match[1]}/100` === receipts.deskGrade, `Generated desk grade ${match[0]} does not match ${receipts.deskGrade}.`);
    }
  });

  const highScore = Math.max(...snapshot.matchups.flatMap((row) => [Number(row.currentScoreA), Number(row.currentScoreB)]));
  const highManagers = new Set(snapshot.matchups.flatMap((row) => [
    Number(row.currentScoreA) === highScore ? row.managerA : null,
    Number(row.currentScoreB) === highScore ? row.managerB : null
  ]).filter(Boolean));
  (copy.awards || []).forEach((award) => {
    const claim = `${award.title || ''} ${award.body || ''}`;
    if (/\b(?:weekly|week\s+\d+|week's)\s+(?:high|high scorer|scoring leader)|\bhighest team score\b|\bled the week in scoring\b/i.test(claim)) {
      assert(highManagers.has(award.recipient), `Generated weekly-high award names ${award.recipient}, but the verified leader is ${[...highManagers].join(' or ')}.`);
    }
  });
}

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

export function validateArticleCopy(copy, snapshot, type = 'preview', options = {}) {
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
  assertCanonicalManagerSpellings(copy, snapshot.teams.map((team) => team.manager));
  if (type === 'recap' && options.lateForecast !== true) assertRecapClaims(copy, snapshot, options.prediction);
  if (type === 'late-preview' || options.lateForecast === true) {
    const hindsightClaims=text.replace(/\b(?:no|not\s+(?:an?\s+)?|without\s+(?:an?\s+)?)\s*(?:original\s+)?(?:pregame\s+)?(?:pick|prediction|forecast|preview)s?\b/gi,'');
    assert(!/\boriginal\s+(?:pregame\s+)?(?:pick|prediction|forecast|preview)s?\b/i.test(hindsightClaims), 'Late-outlook copy must not describe an original pick or prediction.');
    assert(!/\bpregame\s+(?:pick|prediction|forecast|preview)s?\b/i.test(hindsightClaims), 'Late-outlook copy must not imply it was published before kickoff.');
  }
  return copy;
}
