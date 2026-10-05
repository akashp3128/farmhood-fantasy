import assert from 'node:assert/strict';
import test from 'node:test';
import {
  longFormArticleSchema,
  PRESS_V2_BYLINE,
  PRESS_V2_DESK_SECTIONS,
  validateLongFormShape
} from './editorial-schema.mjs';
import { testContext, validArticle } from './test-fixtures.mjs';

test('builds a strict recap schema with the newsroom byline and section enums', () => {
  const context = testContext('recap');
  const schema = longFormArticleSchema(context);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.byline.enum, [PRESS_V2_BYLINE]);
  assert.deepEqual(schema.properties.edition.enum, ['recap']);
  assert.deepEqual(schema.$defs.deskSection.properties.kind.enum, [...PRESS_V2_DESK_SECTIONS.recap]);
  assert.deepEqual(schema.$defs.factId.enum, context.factIds);
  assert.deepEqual(schema.properties.deskSections.items, { $ref: '#/$defs/deskSection' });
  assert.equal(schema.properties.supportingStories.minItems, 2);
  assert.equal(schema.properties.supportingStories.maxItems, 2);
});

test('uses the post-Thursday outlook desk instead of recap sections', () => {
  const schema = longFormArticleSchema(testContext('weekend_outlook'));
  assert.deepEqual(schema.$defs.deskSection.properties.kind.enum, [...PRESS_V2_DESK_SECTIONS.weekend_outlook]);
  assert.deepEqual(schema.properties.edition.enum, ['weekend_outlook']);
});

test('accepts a complete long-form article hierarchy', () => {
  assert.deepEqual(validateLongFormShape(validArticle('recap'), testContext('recap')), []);
});

test('requires each edition-specific desk section exactly once', () => {
  const article = structuredClone(validArticle('recap'));
  article.deskSections[3].kind = 'turning_points';
  const issues = validateLongFormShape(article, testContext('recap'));
  assert(issues.some((finding) => finding.code === 'section.required' && /carries_forward/.test(finding.message)));
  assert(issues.some((finding) => finding.code === 'section.required' && /turning_points/.test(finding.message)));
});

test('requires every matchup exactly once in the editorial hierarchy', () => {
  const article = structuredClone(validArticle('recap'));
  article.aroundLeague[2].matchupId = 5;
  const issues = validateLongFormShape(article, testContext('recap'));
  assert(issues.some((finding) => finding.code === 'matchup.coverage' && /Matchup 5/.test(finding.message)));
  assert(issues.some((finding) => finding.code === 'matchup.coverage' && /Matchup 6/.test(finding.message)));
});

test('rejects unknown citations and manager subjects', () => {
  const article = structuredClone(validArticle('recap'));
  article.mainEvent.body[0].factIds = ['invented:fact'];
  article.mainEvent.subjects = ['NotAManager'];
  const issues = validateLongFormShape(article, testContext('recap'));
  assert(issues.some((finding) => finding.code === 'citation.unknown'));
  assert(issues.some((finding) => finding.code === 'manager.unknown'));
});

test('binds feature and notebook manager metadata to the stated matchup', () => {
  const featureMismatch = structuredClone(validArticle('recap'));
  featureMismatch.mainEvent.subjects = ['maco71'];
  assert(validateLongFormShape(featureMismatch, testContext('recap')).some((finding) => finding.code === 'manager.matchup_mismatch'));
  const notebookMismatch = structuredClone(validArticle('recap'));
  notebookMismatch.aroundLeague[0].subjects = ['akaaashh', 'pgorny'];
  assert(validateLongFormShape(notebookMismatch, testContext('recap')).some((finding) => finding.code === 'manager.matchup_mismatch'));
});

test('binds current-week evidence to each story matchup', () => {
  const article = structuredClone(validArticle('recap'));
  const firstBody = article.mainEvent.body;
  article.mainEvent.body = article.supportingStories[0].body;
  article.supportingStories[0].body = firstBody;
  const issues = validateLongFormShape(article, testContext('recap'));
  assert(issues.some((finding) => finding.code === 'citation.matchup_mismatch'));
});

test('does not let season-only evidence nominally cover a matchup', () => {
  const article = structuredClone(validArticle('recap'));
  article.mainEvent.body.forEach((block) => { block.factIds = ['week:4:standings']; });
  const issues = validateLongFormShape(article, testContext('recap'));
  assert(issues.some((finding) => finding.code === 'citation.matchup_core_missing'));
});

test('rejects invalid schema-builder context before generation', () => {
  assert.throws(
    () => longFormArticleSchema({ ...testContext('recap'), factIds: [] }),
    /factIds must be a non-empty array/
  );
});
