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

function resultsCopy(analysis) {
  const copy = copyWith(analysis);
  copy.title = 'Final scores settle the weekly table';
  copy.dek = 'The completed week in scoring.';
  copy.lead = ['All six matchups are final.', 'Blumbo won on the final score.'];
  copy.keyStat = { label: 'Final matchups', value: '6', note: 'Official scoring.' };
  copy.storylines.forEach((item) => { item.body = 'The final score is on the record.'; });
  return copy;
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

test('rejects a spaced typo of a canonical manager handle', () => {
  const misspelled = copyWith('martin ch94 has the remaining projection edge.');
  const withManager = { ...snapshot, teams: [...snapshot.teams, { manager: 'martinch94' }] };
  assert.throws(() => validateArticleCopy(misspelled, withManager, 'late-preview'), /misspells canonical manager martinch94/);
});

test('rejects a recap prediction record that contradicts the immutable receipt', () => {
  const recap = copyWith('The original forecast finished 1-for-1.');
  const finalSnapshot = {
    ...snapshot,
    matchups: [{ ...snapshot.matchups[0], currentScoreA: 100, currentScoreB: 90 }]
  };
  const prediction = { predictions: [{ matchupId: 1, predictedWinner: 'maco71', projectedScoreA: 95, projectedScoreB: 105 }] };
  assert.throws(() => validateArticleCopy(recap, finalSnapshot, 'recap', { prediction }), /does not match 0-for-1/);
});

test('rejects a weekly-high award for anyone other than the verified scoring leader', () => {
  const recap = copyWith('Blumbo finished on top.');
  recap.awards = [{ title: 'Weekly high scorer', recipient: 'maco71', body: 'The highest team score of the week.', factIds: ['late:1'] }];
  const finalSnapshot = {
    ...snapshot,
    matchups: [{ ...snapshot.matchups[0], currentScoreA: 100, currentScoreB: 90 }]
  };
  const prediction = { predictions: [{ matchupId: 1, predictedWinner: 'Blumbo', projectedScoreA: 95, projectedScoreB: 90 }] };
  assert.throws(() => validateArticleCopy(recap, finalSnapshot, 'recap', { prediction }), /verified leader is Blumbo/);
});

test('weekly-high fact checks also protect late-ledger and results-only recaps', () => {
  const recap = copyWith('Blumbo finished on top.');
  recap.awards = [{ title: 'Weekly high scorer', recipient: 'maco71', body: 'The highest team score of the week.', factIds: ['late:1'] }];
  const finalSnapshot = { ...snapshot, matchups: [{ ...snapshot.matchups[0], currentScoreA: 100, currentScoreB: 90 }] };
  for (const options of [{ resultsOnly: true }, { lateForecast: true }]) {
    assert.throws(() => validateArticleCopy(recap, finalSnapshot, 'recap', options), /verified leader is Blumbo/);
  }
});

test('results-only recap permits a transparent missing-preview disclosure but rejects invented receipts', () => {
  const results = resultsCopy('No original pregame prediction exists; Blumbo won on the final score.');
  assert.equal(validateArticleCopy(results, snapshot, 'recap', { resultsOnly: true }), results);
  for (const claim of ['Our forecast called Blumbo.', 'The original pick was Blumbo.', 'Prediction accuracy hit 100%.', 'The desk grade was 95/100.', 'Blumbo beat the projected score.', 'The favorite won.', 'An upset for the underdog.', 'We went 6-for-6 on picks.', 'The outlook had a 75% chance.', 'Our accuracy was perfect.']) {
    assert.throws(() => validateArticleCopy(resultsCopy(claim), snapshot, 'recap', { resultsOnly: true }), /Results-only recap/);
  }
});

test('results-only disclosure may deny a missing Preview, Outlook, comparisons and receipts', () => {
  for (const disclosure of ['No Preview or Weekend Outlook forecast was published.', 'No forecast comparisons or prediction receipts exist.', 'This final report is without a prediction grade.', 'There was not an original pre-kickoff pick.']) {
    const copy = resultsCopy(disclosure);
    assert.equal(validateArticleCopy(copy, snapshot, 'recap', { resultsOnly: true }), copy);
  }
});

test('results-only guards every narrative location and never repairs structured identities', () => {
  for (const location of ['title', 'dek', 'pullQuote', 'keyStat', 'storylines', 'awards', 'upsetPath']) {
    const copy = resultsCopy('Blumbo scored 100 points.');
    if (location === 'keyStat') copy.keyStat.note = 'Projected score: 110';
    else if (location === 'storylines') copy.storylines[0].body = 'Blumbo was the favorite.';
    else if (location === 'awards') copy.awards = [{ title: 'Perfect picks', body: 'Six correct predictions.', recipient: 'Blumbo', factIds: ['late:1'] }];
    else if (location === 'upsetPath') copy.matchups[0].upsetPath = 'The underdog won.';
    else copy[location] = 'Our original pick won the week';
    assert.throws(() => validateArticleCopy(copy, snapshot, 'recap', { resultsOnly: true }), /Results-only recap/);
  }
  const copy = resultsCopy('Blumbo scored 100 points.');
  copy.storylines[0].subjects = ['bl umbo'];
  assert.throws(() => validateArticleCopy(copy, snapshot, 'recap', { resultsOnly: true }), /Unknown storyline manager/);
});

test('top-scorer awards allow tied leaders but reject other recipients in every recap mode', () => {
  const finalSnapshot = { ...snapshot, matchups: [{ ...snapshot.matchups[0], currentScoreA: 100, currentScoreB: 100 }] };
  for (const recipient of ['Blumbo', 'maco71']) {
    const copy = resultsCopy('Both teams scored 100 points.');
    copy.awards = [{ title: 'Top scorer', recipient, body: 'The highest score of the week.', factIds: ['late:1'] }];
    assert.equal(validateArticleCopy(copy, finalSnapshot, 'recap', { resultsOnly: true }), copy);
  }
});
