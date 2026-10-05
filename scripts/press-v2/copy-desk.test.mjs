import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCopyDesk, runCopyDesk } from './copy-desk.mjs';
import { testContext, validArticle } from './test-fixtures.mjs';

const relaxedDepth = Object.freeze({ minimumWords: 0, maximumWords: 3000 });
const hasError = (report, code) => report.errors.some((finding) => finding.code === code);

test('passes grounded, specific copy through the deterministic desk', () => {
  const report = runCopyDesk(validArticle('recap'), testContext('recap'), relaxedDepth);
  assert.equal(report.pass, true, JSON.stringify(report.errors, null, 2));
  assert(report.metrics.factReferencesPer100Words >= 1);
  assert(report.metrics.concreteSentenceRatio >= 0.55);
  assert.doesNotThrow(() => assertCopyDesk(validArticle('recap'), testContext('recap'), relaxedDepth));
});
test('rejects missing and unknown paragraph citations', () => {
  const article = structuredClone(validArticle('recap'));
  article.lead[0].factIds = [];
  article.lead[1].factIds = ['not:a:fact'];
  const report = runCopyDesk(article, testContext('recap'), relaxedDepth);
  assert.equal(hasError(report, 'citation.missing'), true);
  assert.equal(hasError(report, 'citation.unknown'), true);
});

test('rejects an unsourced literal quote and implied private access', () => {
  const article = structuredClone(validArticle('recap'));
  article.lead[0].text = '“We knew this result was coming,” Blumbo said after Week 4.';
  article.lead[1].text = 'Sources close to Siccboi say the 4-0 start changed the locker room.';
  const report = runCopyDesk(article, testContext('recap'), relaxedDepth);
  assert.equal(hasError(report, 'claim.unverified_quote'), true);
  assert.equal(hasError(report, 'claim.fake_access'), true);
});

test('requires verified support for motive and causal claims', () => {
  const article = structuredClone(validArticle('recap'));
  article.lead[0].text = 'Blumbo believed the FLEX change would work because the matchup looked favorable.';
  const rejected = runCopyDesk(article, testContext('recap'), relaxedDepth);
  assert.equal(hasError(rejected, 'claim.unverified_motive'), true);
  assert.equal(hasError(rejected, 'claim.unsupported_causality'), true);

  const authorized = testContext('recap');
  authorized.verifiedIntentFactIds = ['week:4:league-summary'];
  authorized.verifiedCausalFactIds = ['week:4:league-summary'];
  const acceptedClaims = runCopyDesk(article, authorized, relaxedDepth);
  assert.equal(hasError(acceptedClaims, 'claim.unverified_motive'), false);
  assert.equal(hasError(acceptedClaims, 'claim.unsupported_causality'), false);
});

test('rejects a spaced or recased canonical manager handle', () => {
  const article = structuredClone(validArticle('recap'));
  article.aroundLeague[2].body = 'jwislek_20 defeated martin ch94 121.7-99.8 in Week 4.';
  const report = runCopyDesk(article, testContext('recap'), relaxedDepth);
  assert.equal(hasError(report, 'manager.noncanonical'), true);
});

test('enforces cliché and archive cooldown lists', () => {
  const article = structuredClone(validArticle('recap'));
  article.lead[0].text = 'Only time will tell whether Siccboi can reach 5-0 after Week 4.';
  article.lead[1].text = 'The commissioner schedules the headlines after cuch reached 118.9 points.';
  const report = runCopyDesk(article, testContext('recap'), relaxedDepth);
  assert.equal(hasError(report, 'voice.cliche'), true);
  assert.equal(hasError(report, 'voice.cooldown'), true);
});

test('blocks repeated sentences and repeated section phrasing', () => {
  const article = structuredClone(validArticle('recap'));
  const repeated = 'Siccboi scored 146.8 points and opened a two-game lead after Week 4.';
  article.lead[0].text = repeated;
  article.lead[1].text = repeated;
  article.deskSections[0].body[0].text = `${repeated} The standings now show Siccboi at 4-0.`;
  const report = runCopyDesk(article, testContext('recap'), relaxedDepth);
  assert.equal(hasError(report, 'repetition.sentence'), true);
  assert.equal(hasError(report, 'repetition.phrase'), true);
});

test('enforces fact-density and specificity floors', () => {
  const report = runCopyDesk(validArticle('recap'), testContext('recap'), {
    ...relaxedDepth,
    minimumFactReferencesPer100Words: 99,
    minimumConcreteSentenceRatio: 1.01
  });
  assert.equal(hasError(report, 'density.citations'), true);
  assert.equal(hasError(report, 'density.specificity'), true);
});

test('enforces long-form depth bounds separately from prose quality', () => {
  const report = runCopyDesk(validArticle('recap'), testContext('recap'), { minimumWords: 5000, maximumWords: 6000 });
  assert.equal(hasError(report, 'depth.too_short'), true);
});

test('does not permit injury status to become a punch line', () => {
  const article = structuredClone(validArticle('recap'));
  article.lead[0].text = 'The injury report became the funniest punchline of Week 4 for Blumbo.';
  const report = runCopyDesk(article, testContext('recap'), relaxedDepth);
  assert.equal(hasError(report, 'voice.injury_joke'), true);
});
