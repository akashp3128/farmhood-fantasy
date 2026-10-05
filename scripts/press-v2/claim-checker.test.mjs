import test from 'node:test';
import assert from 'node:assert/strict';
import {
  articleNarrativeBlocks,
  assertArticleClaims,
  buildAllowedClaimIndex,
  validateArticleClaims
} from './claim-checker.mjs';

const identities = [
  { type: 'league', id: 'farmhood', key: 'league:farmhood', label: 'Farmhood Fantasy' },
  { type: 'manager', id: 'alpha', key: 'manager:alpha', label: 'Alpha_One' },
  { type: 'manager', id: 'beta', key: 'manager:beta', label: 'BetaTwo' },
  { type: 'manager', id: 'gamma', key: 'manager:gamma', label: 'Gamma' },
  { type: 'player', id: 'player-one', key: 'player:player-one', label: 'Player One' },
  { type: 'player', id: 'player-two', key: 'player:player-two', label: 'Player Two' }
];

const facts = [
  {
    factId: 'fact:w3:m1:result',
    kind: 'matchup_result',
    subject: { type: 'manager', id: 'alpha', key: 'manager:alpha', label: 'Alpha_One' },
    related: [{ type: 'manager', id: 'beta', key: 'manager:beta', label: 'BetaTwo' }],
    value: { winnerScore: 120, loserScore: 100 },
    state: 'final',
    context: { season: 2026, week: 3, matchupId: 1 },
    claim: 'Alpha_One defeated BetaTwo 120-100 in Week 3.',
    tags: ['current-week']
  },
  {
    factId: 'fact:w3:m1:live', kind: 'matchup_result', state: 'live',
    subject: { type: 'manager', id: 'alpha', key: 'manager:alpha', label: 'Alpha_One' },
    related: [{ type: 'manager', id: 'beta', key: 'manager:beta', label: 'BetaTwo' }],
    value: 'alpha', context: { season: 2026, week: 3, matchupId: 1 },
    claim: 'Alpha_One led BetaTwo 38.9-0.', tags: ['current-week']
  },
  {
    factId: 'fact:w3:m1:tie', kind: 'matchup_result', state: 'final',
    subject: { type: 'manager', id: 'alpha', key: 'manager:alpha', label: 'Alpha_One' },
    related: [{ type: 'manager', id: 'beta', key: 'manager:beta', label: 'BetaTwo' }],
    value: 'tie', context: { season: 2026, week: 3, matchupId: 1 },
    claim: 'Alpha_One and BetaTwo were tied 100-100.', tags: ['current-week']
  },
  {
    factId: 'fact:w3:player-one',
    kind: 'player_starter_points',
    subject: { type: 'player', id: 'player-one', key: 'player:player-one', label: 'Player One' },
    related: [{ type: 'manager', id: 'alpha', key: 'manager:alpha', label: 'Alpha_One' }],
    value: 30,
    context: { season: 2026, week: 3, matchupId: 1, managerId: 'alpha' },
    claim: 'Player One scored 30 points as Alpha_One\'s starter in Week 3.',
    tags: ['starter']
  },
  {
    factId: 'fact:w3:beta-score',
    kind: 'team_week_score',
    subject: { type: 'manager', id: 'beta', key: 'manager:beta', label: 'BetaTwo' },
    related: [{ type: 'manager', id: 'alpha', key: 'manager:alpha', label: 'Alpha_One' }],
    value: 100,
    context: { season: 2026, week: 3, matchupId: 1 },
    claim: 'BetaTwo finished Week 3 with 100 points.',
    tags: ['team-score']
  },
  {
    factId: 'fact:w3:gamma-standing',
    kind: 'season_standing_rank',
    subject: { type: 'manager', id: 'gamma', key: 'manager:gamma', label: 'Gamma' },
    related: [],
    value: 2,
    context: { season: 2026, throughWeek: 3 },
    claim: 'Gamma ranked second through Week 3.',
    tags: ['standings']
  },
  {
    factId: 'fact:w3:weekly-high',
    kind: 'weekly_high_score',
    subject: { type: 'manager', id: 'alpha', key: 'manager:alpha', label: 'Alpha_One' },
    related: [],
    value: 120,
    context: { season: 2026, week: 3 },
    claim: 'Alpha_One had the Week 3 high score at 120 points.',
    tags: ['weekly-leader']
  },
  {
    factId: 'fact:w3:player-one-questionable',
    kind: 'player_availability_status',
    subject: { type: 'player', id: 'player-one', key: 'player:player-one', label: 'Player One' },
    related: [{ type: 'manager', id: 'alpha', key: 'manager:alpha', label: 'Alpha_One' }],
    value: 'Questionable',
    context: { season: 2026, week: 3, matchupId: 1 },
    claim: 'Player One was listed Questionable in Week 3.',
    tags: ['availability']
  },
  {
    factId: 'fact:w3:player-one-full', kind: 'player_availability_status',
    subject: { type: 'player', id: 'player-one', key: 'player:player-one', label: 'Player One' }, related: [], value: 'Full participant',
    context: { season: 2026, week: 3, matchupId: 1 }, claim: 'Player One was listed Full participant.', tags: ['availability']
  },
  {
    factId: 'fact:w3:player-one-out', kind: 'player_availability_status',
    subject: { type: 'player', id: 'player-one', key: 'player:player-one', label: 'Player One' }, related: [], value: 'Out',
    context: { season: 2026, week: 3, matchupId: 1 }, claim: 'Player One was listed Out.', tags: ['availability']
  },
  {
    factId: 'fact:alpha:titles', kind: 'manager_championship_count',
    subject: { type: 'manager', id: 'alpha', key: 'manager:alpha', label: 'Alpha_One' }, related: [], value: 2,
    context: { throughSeason: 2025 }, claim: 'Alpha_One had won 2 championships.', tags: ['history', 'championships']
  },
  {
    factId: 'fact:w3:m1:projection-edge', kind: 'matchup_projection_edge',
    subject: { type: 'manager', id: 'alpha', key: 'manager:alpha', label: 'Alpha_One' },
    related: [{ type: 'manager', id: 'beta', key: 'manager:beta', label: 'BetaTwo' }], value: 5,
    context: { season: 2026, week: 3, matchupId: 1 }, claim: 'Alpha_One held a 5-point projection edge over BetaTwo.', tags: ['projection']
  },
  {
    factId: 'fact:gamma:no-title', kind: 'manager_canonical_lore',
    subject: { type: 'manager', id: 'gamma', key: 'manager:gamma', label: 'Gamma' }, related: [], value: 'no title',
    context: { throughSeason: 2025 }, claim: 'Gamma remains without a championship.', tags: ['history', 'canonical-lore']
  },
  {
    factId: 'fact:w3:drop', kind: 'waiver_transaction',
    subject: { type: 'player', id: 'player-one', key: 'player:player-one', label: 'Player One' },
    related: [{ type: 'manager', id: 'alpha', key: 'manager:alpha', label: 'Alpha_One' }], value: 'dropped',
    context: { season: 2026, week: 3 }, claim: 'Alpha_One dropped Player One.', tags: ['transaction']
  }
];

function article(text, factIds) {
  return { thesis: { text, factIds } };
}

function index(overrides = {}) {
  return buildAllowedClaimIndex({ facts, identities, ...overrides });
}

test('narrative traversal covers prose plus title, dek, and section headlines', () => {
  const sample = {
    title: 'Grounded title',
    dek: 'Grounded dek',
    thesis: { text: 'One.', factIds: ['a'] },
    lead: [{ text: 'Two.', factIds: ['b'] }],
    mainEvent: { headline: 'Feature', body: [{ text: 'Three.', factIds: ['c'] }] },
    supportingStories: [{ body: [{ text: 'Four.', factIds: ['d'] }] }],
    deskSections: [{ body: [{ text: 'Five.', factIds: ['e'] }] }],
    aroundLeague: [{ body: 'Six.', factIds: ['f'] }],
    pullQuote: { text: 'Seven.', factIds: ['g'] }
  };
  assert.deepEqual(articleNarrativeBlocks(sample).map((block) => block.path), [
    '$.title', '$.dek', '$.thesis', '$.lead[0]', '$.mainEvent.headline', '$.mainEvent.body[0]',
    '$.supportingStories[0].body[0]', '$.deskSections[0].body[0]', '$.aroundLeague[0].body', '$.pullQuote'
  ]);
});

test('accepts grounded entities, numbers, matchup relationships and statistical claims', () => {
  const copy = article('Alpha_One had the Week 3 highest score at 120 points.', ['fact:w3:weekly-high']);
  const report = validateArticleClaims(copy, index());
  assert.equal(report.pass, true, JSON.stringify(report.errors));
  assert.equal(report.metrics.numericAssertions, 2);
  assert.equal(report.metrics.statisticalAssertions, 1);
});

test('rejects missing citations and unknown claim IDs paragraph by paragraph', () => {
  const missing = validateArticleClaims(article('Alpha_One scored 120 points.', []), index());
  assert.ok(missing.errors.some((finding) => finding.code === 'citation.missing'));
  const unknown = validateArticleClaims(article('Alpha_One scored 120 points.', ['fact:invented']), index());
  assert.ok(unknown.errors.some((finding) => finding.code === 'citation.unknown'));
  const duplicate = validateArticleClaims(article('Alpha_One scored 120 points in Week 3.', ['fact:w3:weekly-high', 'fact:w3:weekly-high']), index());
  assert.ok(duplicate.errors.some((finding) => finding.code === 'citation.duplicate'));
});

test('rejects uncited numeric and written-number assertions', () => {
  const numeric = validateArticleClaims(article('Player One scored 31 points for Alpha_One in Week 3.', ['fact:w3:player-one']), index());
  assert.ok(numeric.errors.some((finding) => finding.code === 'claim.uncited_number' && finding.value === 31));
  const written = validateArticleClaims(article('Player One scored four touchdowns for Alpha_One in Week 3.', ['fact:w3:player-one']), index());
  assert.ok(written.errors.some((finding) => finding.code === 'claim.uncited_number' && finding.value === 4));
});

test('rejects known entities that are unrelated to the cited evidence', () => {
  const report = validateArticleClaims(article('Gamma finished Week 3 with 100 points.', ['fact:w3:beta-score']), index());
  assert.ok(report.errors.some((finding) => finding.code === 'entity.uncited' && finding.entityKey === 'manager:gamma'));
});

test('rejects unknown proper names and near-miss canonical handles', () => {
  const unknown = validateArticleClaims(article('Mystery Manager watched Alpha_One score 120 points in Week 3.', ['fact:w3:weekly-high']), index());
  assert.ok(unknown.errors.some((finding) => finding.code === 'entity.unknown' && /Mystery Manager/.test(finding.message)));
  const typo = validateArticleClaims(article('Alphaa_One scored 120 points in Week 3.', ['fact:w3:weekly-high']), index());
  assert.ok(typo.errors.some((finding) => finding.code === 'entity.unknown' && /Alpha_One/.test(finding.message)));
});

test('catches player-manager and opponent relationship mismatches despite individually cited entities', () => {
  const roster = validateArticleClaims(article(
    'Player One supplied 30 points for BetaTwo in Week 3.',
    ['fact:w3:player-one', 'fact:w3:beta-score']
  ), index());
  assert.ok(roster.errors.some((finding) => finding.code === 'relationship.roster_mismatch'));

  const opponents = validateArticleClaims(article(
    'Alpha_One defeated Gamma 120-100 in Week 3.',
    ['fact:w3:m1:result', 'fact:w3:gamma-standing']
  ), index());
  assert.ok(opponents.errors.some((finding) => finding.code === 'relationship.matchup_mismatch'));
});

test('enforces winner and loser direction in prose and headlines', () => {
  for (const text of ['BetaTwo defeated Alpha_One 120-100 in Week 3.', 'BetaTwo edged Alpha_One 120-100.', 'BetaTwo outscored Alpha_One 120-100.', 'BetaTwo topped Alpha_One 120-100.', 'BetaTwo wins against Alpha_One 120-100.', 'BetaTwo wins over Alpha_One 120-100.', 'BetaTwo prevailed against Alpha_One 120-100.', 'Alpha_One fell to BetaTwo 120-100.']) {
    const reversed = validateArticleClaims(article(text, ['fact:w3:m1:result']), index());
    assert.ok(reversed.errors.some((finding) => finding.code === 'relationship.matchup_mismatch'), text);
  }
  const invertedScore = validateArticleClaims(article('Alpha_One defeated BetaTwo 100-120 in Week 3.', ['fact:w3:m1:result']), index());
  assert.ok(invertedScore.errors.some((finding) => finding.code === 'relationship.matchup_mismatch'));
  for (const text of ['BetaTwo triumphs over Alpha_One.', 'BetaTwo gets past Alpha_One.']) {
    const openEnded = validateArticleClaims(article(text, ['fact:w3:m1:result']), index());
    assert.ok(openEnded.errors.some((finding) => finding.code === 'relationship.result_format'), text);
  }
  const headline = validateArticleClaims({
    title: 'BetaTwo Defeats Alpha_One 120-100',
    thesis: { text: 'Alpha_One defeated BetaTwo 120-100 in Week 3.', factIds: ['fact:w3:m1:result'] }
  }, index());
  assert.ok(headline.errors.some((finding) => finding.path === '$.title' && finding.code === 'relationship.matchup_mismatch'));
});

test('requires two-manager scorelines and preserves live versus final result state', () => {
  for (const text of ['BetaTwo won the matchup.', 'BetaTwo takes the win.', 'Alpha_One did not win.']) {
    const report = validateArticleClaims(article(text, ['fact:w3:m1:result']), index());
    assert.ok(report.errors.some((finding) => finding.code === 'relationship.result_format'), text);
  }
  const premature = validateArticleClaims(article('Alpha_One defeated BetaTwo 38.9-0.', ['fact:w3:m1:live']), index());
  assert.ok(premature.errors.some((finding) => finding.code === 'relationship.result_phase'));
  const live = validateArticleClaims(article('Alpha_One led BetaTwo 38.9-0.', ['fact:w3:m1:live']), index());
  assert.equal(live.pass, true, JSON.stringify(live.errors));
  const tie = validateArticleClaims(article('Alpha_One and BetaTwo tied 100-100.', ['fact:w3:m1:tie']), index());
  assert.equal(tie.pass, true, JSON.stringify(tie.errors));
  const fakeTieWinner = validateArticleClaims(article('BetaTwo triumphed over Alpha_One 100-100.', ['fact:w3:m1:tie']), index());
  assert.ok(fakeTieWinner.errors.some((finding) => finding.code.startsWith('relationship.')));
  const scoresWithoutResult = validateArticleClaims(article('BetaTwo triumphed over Alpha_One 100-120.', ['fact:w3:beta-score', 'fact:w3:weekly-high']), index());
  assert.ok(scoresWithoutResult.errors.some((finding) => finding.code === 'relationship.result_missing'));
});

test('catches an incorrect matchup number even when other values are grounded', () => {
  const report = validateArticleClaims(article(
    'Matchup 2 ended with Alpha_One defeating BetaTwo 120-100 in Week 3.',
    ['fact:w3:m1:result']
  ), index());
  assert.ok(report.errors.some((finding) => finding.code === 'relationship.matchup_id_mismatch'));
});

test('requires evidence carrying the same statistical meaning', () => {
  const unsupported = validateArticleClaims(article('BetaTwo posted the highest score at 100 points in Week 3.', ['fact:w3:beta-score']), index());
  assert.ok(unsupported.errors.some((finding) => finding.code === 'claim.unsupported_statistic' && finding.marker === 'maximum'));
  const supported = validateArticleClaims(article('Alpha_One posted the highest score at 120 points in Week 3.', ['fact:w3:weekly-high']), index());
  assert.equal(supported.pass, true, JSON.stringify(supported.errors));
});

test('rejects invented injury predicates in prose and headlines', () => {
  const prose = validateArticleClaims(article('Player One tore his ACL after scoring 30 points.', ['fact:w3:player-one']), index());
  assert.ok(prose.errors.some((finding) => finding.code === 'claim.unsupported_predicate'));
  const headline = validateArticleClaims({
    title: 'Player One Tears ACL',
    thesis: { text: 'Player One scored 30 points.', factIds: ['fact:w3:player-one'] }
  }, index());
  assert.ok(headline.errors.some((finding) => finding.path === '$.title' && finding.code === 'claim.unsupported_predicate'));
});

test('rejects contradictory lineup, game-event, and availability predicates', () => {
  for (const text of ['Player One was benched.', 'Player One scored a touchdown.', 'Player One was ejected from the game.']) {
    const report = validateArticleClaims(article(text, ['fact:w3:player-one']), index());
    assert.ok(report.errors.some((finding) => finding.code === 'claim.unsupported_predicate'), text);
  }
  const status = validateArticleClaims(article('Player One was ruled out.', ['fact:w3:player-one-questionable']), index());
  assert.ok(status.errors.some((finding) => finding.code === 'claim.unsupported_predicate'));
  for (const text of ['Player One was not Questionable.', 'Player One was not Out.', 'Player One avoided injury.']) {
    const negated = validateArticleClaims(article(text, [text.includes('Questionable') || text.includes('injury') ? 'fact:w3:player-one-questionable' : 'fact:w3:player-one-out']), index());
    assert.ok(negated.errors.some((finding) => finding.code === 'claim.unsupported_predicate'), text);
  }
  const fullToDnp = validateArticleClaims(article('Player One did not participate.', ['fact:w3:player-one-full']), index());
  assert.ok(fullToDnp.errors.some((finding) => finding.code === 'claim.unsupported_predicate'));
  const outToAvailable = validateArticleClaims(article('Player One was available to play.', ['fact:w3:player-one-out']), index());
  assert.ok(outToAvailable.errors.some((finding) => finding.code === 'claim.unsupported_predicate'));
  for (const text of ['Player One was active.', 'Player One was healthy.', 'Player One was cleared to play.']) {
    const contradicted = validateArticleClaims(article(text, ['fact:w3:player-one-out']), index());
    assert.ok(contradicted.errors.some((finding) => finding.code === 'claim.unsupported_predicate'), text);
  }
  for (const text of ['Player One suited up.', 'Player One was good to go.', 'Player One was not sidelined.', 'Player One dressed for the game.']) {
    const unclassified = validateArticleClaims(article(text, ['fact:w3:player-one-out']), index());
    assert.ok(unclassified.errors.some((finding) => finding.code === 'claim.unsupported_predicate'), text);
  }
  const ringless = validateArticleClaims(article('Alpha_One remains ringless with 2 recorded championships.', ['fact:alpha:titles']), index());
  assert.ok(ringless.errors.some((finding) => finding.code === 'claim.unsupported_predicate'));
  const favorite = validateArticleClaims(article('BetaTwo entered as the favorite over Alpha_One by 5 points.', ['fact:w3:m1:projection-edge']), index());
  assert.ok(favorite.errors.some((finding) => finding.code === 'relationship.projection_mismatch'));
  const projectedWinner = validateArticleClaims(article('The outlook leaned toward BetaTwo over Alpha_One by 5 points.', ['fact:w3:m1:projection-edge']), index());
  assert.ok(projectedWinner.errors.some((finding) => finding.code === 'relationship.projection_mismatch'));
  const negatedFavorite = validateArticleClaims(article('Alpha_One was not the favorite over BetaTwo.', ['fact:w3:m1:projection-edge']), index());
  assert.ok(negatedFavorite.errors.some((finding) => finding.code === 'claim.unsupported_predicate' || finding.code === 'relationship.projection_mismatch'));
  const wrongProjectedWinner = validateArticleClaims(article('BetaTwo was projected to win over Alpha_One by 5 points.', ['fact:w3:m1:projection-edge']), index());
  assert.ok(wrongProjectedWinner.errors.some((finding) => finding.code === 'relationship.projection_mismatch'));
  const validProjectedWinner = validateArticleClaims(article('Alpha_One was projected to win over BetaTwo by 5 points.', ['fact:w3:m1:projection-edge']), index());
  assert.equal(validProjectedWinner.pass, true, JSON.stringify(validProjectedWinner.errors));
  const falseChampion = validateArticleClaims(article('Gamma won the championship.', ['fact:gamma:no-title']), index());
  assert.ok(falseChampion.errors.some((finding) => finding.code === 'claim.unsupported_predicate'));
  const validChampion = validateArticleClaims(article('Alpha_One had won 2 championships.', ['fact:alpha:titles']), index());
  assert.equal(validChampion.pass, true, JSON.stringify(validChampion.errors));
  for (const text of ['Alpha_One did not drop Player One.', 'Alpha_One claimed Player One.']) {
    const transaction = validateArticleClaims(article(text, ['fact:w3:drop']), index());
    assert.ok(transaction.errors.some((finding) => finding.code === 'claim.unsupported_predicate'), text);
  }
});

test('accepts sanitized web-research claim IDs with their subject, names and numbers', () => {
  const webResearch = {
    kind: 'farmhood_press_v2_web_research',
    schemaVersion: 1,
    verificationStatus: 'verified',
    claims: [{
      claimId: 'web:player-one-week-four',
      subjectKey: 'player:player-one',
      claim: 'Player One recorded 3 touchdowns for the Chicago Bears on 2026-10-03.',
      status: 'official',
      asOf: '2026-10-03T23:00:00.000Z',
      sourceUrls: ['https://www.chicagobears.com/news/player-one-week-four']
    }]
  };
  const copy = article('Player One recorded three touchdowns for the Chicago Bears on 2026-10-03.', ['web:player-one-week-four']);
  const report = validateArticleClaims(copy, index({ webResearch }));
  assert.equal(report.pass, true, JSON.stringify(report.errors));
  assert.equal(report.metrics.webClaimReferences, 1);
});

test('web claims must already be accepted, sourced and attached to a known research subject', () => {
  assert.throws(() => index({ webResearch: { claims: [] } }), /source-verified Farmhood Press V2 research packet/);
  assert.throws(() => index({ webClaims: [{
    claimId: 'web:unknown', subjectKey: 'player:missing', claim: 'A claim.', sourceUrls: ['https://example.com/a']
  }] }), /unknown subject/);
  assert.throws(() => index({ webClaims: [{
    claimId: 'web:unsourced', subjectKey: 'player:player-one', claim: 'A claim.', sourceUrls: []
  }] }), /requires accepted source URLs/);
});

test('assertion API throws one actionable aggregate error', () => {
  assert.throws(
    () => assertArticleClaims(article('Player One scored 99 points for BetaTwo.', ['fact:w3:player-one']), index()),
    /claim checker rejected[\s\S]*claim\.uncited_number[\s\S]*relationship\.roster_mismatch/
  );
});
