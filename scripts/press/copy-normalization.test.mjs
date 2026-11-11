import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeArticleCopy } from './copy-normalization.mjs';

test('repairs only exact whitespace and case variants in narrative fields', () => {
  const source = {
    title: 'AK AAASHH meets JWISLEK_20',
    lead: ['ak\taaashh scored.', 'jwislek_ 20 finished.'],
    matchups: [{ matchupId: 1, analysis: 'ak aaashh and jwislek_20.', factIds: ['ak aaashh'] }],
    storylines: [{ title: 'Scores', body: 'AKAAASHH wins.', subjects: ['ak aaashh'] }],
    awards: [{ title: 'Winner', recipient: 'ak aaashh', body: 'ak aaashh scored.' }]
  };
  const result = normalizeArticleCopy(source, ['akaaashh', 'jwislek_20']);
  assert.equal(result.copy.title, 'akaaashh meets jwislek_20');
  assert.equal(result.copy.lead[0], 'akaaashh scored.');
  assert.equal(result.copy.lead[1], 'jwislek_20 finished.');
  assert.equal(result.copy.matchups[0].factIds[0], 'ak aaashh');
  assert.equal(result.copy.storylines[0].subjects[0], 'ak aaashh');
  assert.equal(result.copy.awards[0].recipient, 'ak aaashh');
  assert.equal(source.title, 'AK AAASHH meets JWISLEK_20');
  assert.equal(result.corrections.length, 7);
  assert.deepEqual(result.corrections[0], { field: 'title', original: 'AK AAASHH', canonical: 'akaaashh' });
});

test('never guesses spelling, adds punctuation, or replaces text inside another identity', () => {
  const copy = { title: 'akaaash, ak-aaashh, akaaashhh, prefixakaaashh, jwislek20, ak. aaashh' };
  const result = normalizeArticleCopy(copy, ['akaaashh', 'jwislek_20']);
  assert.deepEqual(result.copy, copy);
  assert.deepEqual(result.corrections, []);
});

test('canonical copy is unchanged and produces no correction record', () => {
  const copy = { title: 'akaaashh wins', matchups: [{ analysis: 'jwislek_20 scored.' }] };
  assert.deepEqual(normalizeArticleCopy(copy, ['akaaashh', 'jwislek_20']), { copy, corrections: [] });
});
