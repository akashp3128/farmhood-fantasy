import assert from 'node:assert/strict';
import test from 'node:test';
import { validateArticleCopy } from './schema.mjs';

const snapshot = {
  matchups: [{ matchupId: 1, managerA: 'Blumbo', managerB: 'maco71', factIds: ['late:1'] }],
  teams: [{ manager: 'Blumbo' }, { manager: 'maco71' }],
  factIds: ['late:1']
};

function copyWith(analysis) {
  return {
    title: 'Weekend Outlook after Thursday',
    dek: 'Known points and the remaining Sunday slate.',
    lead: ['Thursday is already in the books.', 'The rest of the matchup remains unsettled.'],
    pullQuote: 'This is the current state, not time travel.',
    keyStat: { label: 'Locked starters', value: '2', note: 'Captured after Thursday.' },
    matchups: [{ matchupId: 1, headline: 'A live matchup', analysis, upsetPath: '', historyNote: '', factIds: ['late:1'] }],
    storylines: [
      { title: 'One', body: 'Known scoring leads the outlook.', subjects: ['Blumbo'], factIds: ['late:1'] },
      { title: 'Two', body: 'Sunday still has work to do.', subjects: ['maco71'], factIds: ['late:1'] },
      { title: 'Three', body: 'The range remains open.', subjects: ['Blumbo', 'maco71'], factIds: ['late:1'] }
    ],
    awards: []
  };
}

test('accepts explicit post-kickoff late-outlook language', () => {
  const copy = copyWith('Blumbo leads on known Thursday points; the remaining projection still favors a close finish.');
  assert.equal(validateArticleCopy(copy, snapshot, 'late-preview'), copy);
});

test('rejects hindsight framed as an original prediction', () => {
  assert.throws(
    () => validateArticleCopy(copyWith('Our original prediction had Blumbo all along.'), snapshot, 'late-preview'),
    /must not describe an original pick or prediction/
  );
});

test('rejects original-pick language in a recap sourced from a late outlook', () => {
  assert.throws(
    () => validateArticleCopy(copyWith('The original forecast called Blumbo before kickoff.'), snapshot, 'recap', { lateForecast: true }),
    /must not describe an original pick or prediction/
  );
});

test('allows an explicit denial of a missing original prediction', () => {
  const copy=copyWith('There was no original pregame prediction this week; this is a frozen Friday outlook.');
  assert.equal(validateArticleCopy(copy, snapshot, 'recap', { lateForecast: true }), copy);
});
