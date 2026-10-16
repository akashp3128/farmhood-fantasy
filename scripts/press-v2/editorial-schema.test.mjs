import assert from 'node:assert/strict';
import test from 'node:test';
import {
  longFormArticleSchema,
  PRESS_V2_BYLINE,
  PRESS_V2_MAX_PARAGRAPH_CITATIONS,
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

test('requires the manager-led season story and its fresh evidence', () => {
  const missing = structuredClone(validArticle());
  delete missing.seasonStoryline;
  assert(validateLongFormShape(missing, testContext()).some((finding) => finding.code === 'shape.season_storyline'));
  const unsupported = structuredClone(validArticle());
  for (const block of [unsupported.seasonStoryline.thesis, ...unsupported.seasonStoryline.body, unsupported.seasonStoryline.whyNow, unsupported.seasonStoryline.carryForward]) block.factIds = ['history:Siccboi:2025'];
  const issues = validateLongFormShape(unsupported, testContext());
  assert(issues.some((finding) => finding.code === 'citation.season_context_missing'));
  assert(issues.some((finding) => finding.code === 'citation.season_week_missing'));
});

test('binds the season storyline to assigned managers and evidence', () => {
  const context = { ...testContext(), requiredSeasonStorylineSubjects: ['Siccboi', 'Blumbo'], seasonStorylineFactIds: ['week:4:standings'] };
  const article = structuredClone(validArticle());
  article.seasonStoryline.subjects = ['Siccboi', 'pgorny'];
  const issues = validateLongFormShape(article, context);
  assert(issues.some((finding) => finding.code === 'manager.season_assignment_mismatch'));
});

test('requires three distinct matchup chapters in the correct order', () => {
  const article = structuredClone(validArticle());
  article.aroundLeague[0].body[2].focus = 'what_happened';
  article.aroundLeague[1].body.splice(1, 1);
  const issues = validateLongFormShape(article, testContext());
  assert(issues.some((finding) => finding.code === 'shape.notebook_focus'));
  assert(issues.some((finding) => finding.code === 'shape.notebook_body'));
});

test('requires specific starter and season evidence for each matchup manager when available', () => {
  const context = testContext();
  context.factIds.push('starter:Siccboi', 'starter:sidjunlee', 'season:Siccboi', 'season:sidjunlee');
  context.factKinds['starter:Siccboi'] = context.factKinds['starter:sidjunlee'] = 'player_starter_points';
  context.factMatchupIds['starter:Siccboi'] = context.factMatchupIds['starter:sidjunlee'] = 1;
  context.factManagerNames = { 'starter:Siccboi': ['Siccboi'], 'starter:sidjunlee': ['sidjunlee'], 'season:Siccboi': ['Siccboi'], 'season:sidjunlee': ['sidjunlee'] };
  context.factTags['season:Siccboi'] = context.factTags['season:sidjunlee'] = ['current-season'];
  const article = structuredClone(validArticle());
  article.mainEvent.body[1].factIds.push('starter:Siccboi', 'season:Siccboi');
  const issues = validateLongFormShape(article, context);
  assert(issues.some((finding) => finding.code === 'citation.matchup_player_missing' && /sidjunlee/.test(finding.message)));
  assert(issues.some((finding) => finding.code === 'citation.matchup_season_missing' && /sidjunlee/.test(finding.message)));
  article.mainEvent.body[2].factIds.push('starter:sidjunlee', 'season:sidjunlee');
  assert.deepEqual(validateLongFormShape(article, context), []);
});

test('allows detailed source bundles but keeps the twelve-citation paragraph bound in schema and runtime', () => {
  const context = testContext();
  context.factIds.push('extra:verified-fact');
  assert.equal(longFormArticleSchema(context).$defs.citedParagraph.properties.factIds.maxItems, PRESS_V2_MAX_PARAGRAPH_CITATIONS);
  assert.equal(longFormArticleSchema(context).$defs.notebookParagraph.properties.factIds.maxItems, PRESS_V2_MAX_PARAGRAPH_CITATIONS);
  const article = structuredClone(validArticle());
  article.lead[0].factIds = context.factIds.slice(0, 12);
  assert.equal(validateLongFormShape(article, context).some((finding) => finding.code === 'citation.too_many'), false);
  article.lead[0].factIds = [...context.factIds];
  assert(validateLongFormShape(article, context).some((finding) => finding.code === 'citation.too_many'));
});

test('Friday outlook starter gates include actual player_projection atoms for unstarted matchups', () => {
  const context = testContext('weekend_outlook');
  context.factIds.push('projected:Siccboi', 'projected:sidjunlee');
  context.factKinds['projected:Siccboi'] = context.factKinds['projected:sidjunlee'] = 'player_projection';
  context.factMatchupIds['projected:Siccboi'] = context.factMatchupIds['projected:sidjunlee'] = 1;
  context.factManagerNames['projected:Siccboi'] = ['Siccboi'];
  context.factManagerNames['projected:sidjunlee'] = ['sidjunlee'];
  const article = structuredClone(validArticle('weekend_outlook'));
  article.mainEvent.body[1].factIds.push('projected:Siccboi');
  const missing = validateLongFormShape(article, context);
  assert(missing.some((finding) => finding.code === 'citation.matchup_player_missing' && /sidjunlee/.test(finding.message)));
  article.mainEvent.body[2].factIds.push('projected:sidjunlee');
  assert.deepEqual(validateLongFormShape(article, context), []);
});
