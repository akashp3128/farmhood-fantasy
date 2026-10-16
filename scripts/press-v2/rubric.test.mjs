import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreLongFormArticle } from './rubric.mjs';
import { testContext, validArticle } from './test-fixtures.mjs';

const testOptions = { copyDesk: { minimumWords: 0, maximumWords: 3000, minimumSectionDepth: false } };

test('awards a passing score only when the hard gate is clean', () => {
  const result = scoreLongFormArticle(validArticle('recap'), testContext('recap'), testOptions);
  assert.equal(result.hardGatePassed, true, JSON.stringify(result.copyDesk.errors, null, 2));
  assert.equal(result.pass, true);
  assert(result.score >= 85);
  assert.equal(result.components.factualIntegrity, 40);
  assert.equal(result.history.used, 1);
});

test('does not let a numerical score override an invented quote', () => {
  const article = structuredClone(validArticle('recap'));
  article.pullQuote.text = '“I called every result,” Siccboi said.';
  const result = scoreLongFormArticle(article, testContext('recap'), testOptions);
  assert.equal(result.hardGatePassed, false);
  assert.equal(result.pass, false);
  assert(result.components.factualIntegrity < 40);
});

test('rewards relevant history without requiring trivia when none is assigned', () => {
  const withoutHistory = structuredClone(validArticle('recap'));
  withoutHistory.deskSections[3].body[0].factIds = ['week:4:standings'];
  withoutHistory.seasonStoryline.body[0].factIds = ['week:4:standings'];
  const context = testContext('recap');
  const missed = scoreLongFormArticle(withoutHistory, context, testOptions);
  const used = scoreLongFormArticle(validArticle('recap'), context, testOptions);
  assert(used.components.historicalRelevance > missed.components.historicalRelevance);

  const noHistoryAvailable = testContext('recap');
  noHistoryAvailable.historyFactIds = [];
  const neutral = scoreLongFormArticle(withoutHistory, noHistoryAvailable, testOptions);
  assert.equal(neutral.components.historicalRelevance, 10);
});

test('reduces voice score and produces a repair recommendation for clichés', () => {
  const article = structuredClone(validArticle('recap'));
  article.lead[0].text = 'At the end of the day, Siccboi still had 146.8 points in Week 4.';
  const result = scoreLongFormArticle(article, testContext('recap'), testOptions);
  assert(result.components.voiceAndOriginality < 10);
  assert(result.recommendations.some((recommendation) => /clich/i.test(recommendation)));
  assert.equal(result.pass, false);
});
