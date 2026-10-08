import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildAllowedClaimIndex, validateArticleClaims } from './claim-checker.mjs';
import { runCopyDesk } from './copy-desk.mjs';
import { validateLongFormShape } from './editorial-schema.mjs';
import { loadProductionReportingInput, prepareShadowEdition } from './generate-shadow.mjs';
import { buildWriterContext } from './writer.mjs';

const fixture = JSON.parse(await readFile(new URL('../../content/press-v2/fixtures/week-03-layout-preview.json', import.meta.url), 'utf8'));
const rawInput = await loadProductionReportingInput({ season: 2026, week: 3, editorialEdition: 'recap' });
const { packet } = prepareShadowEdition({ rawInput, editorialEdition: 'recap' });
const context = buildWriterContext({ packet, facts: fixture.evidence.facts, editorialEdition: 'recap' });

test('the manually authored review stays isolated from paid editions and generation memory', async () => {
  assert.equal(fixture.shadowOnly, true);
  assert.equal(fixture.publicationStatus, 'format_preview');
  assert.equal(fixture.generation.model, 'none-review-preview');
  assert.equal(fixture.generation.totalEstimatedCostUsd, 0);
  assert.equal(fixture.generation.responseId, null);
  assert.equal(fixture.memory.eligibleForGenerationInput, false);
  const canonicalMemory = JSON.parse(await readFile(new URL('../../content/press-v2/story-memory.json', import.meta.url), 'utf8'));
  assert.equal(canonicalMemory.entries.some((entry) => entry.articleId === fixture.articleId), false);
  const index = JSON.parse(await readFile(new URL('../../content/press-v2/index.json', import.meta.url), 'utf8'));
  assert.equal(index.articles.find((entry) => entry.articleId === fixture.articleId).title, fixture.article.title);
});

test('review evidence preserves immutable league atoms and complete derived lineage', () => {
  const originals = new Map(packet.facts.map((fact) => [fact.factId, fact]));
  const available = new Set(fixture.evidence.facts.map((fact) => fact.factId));
  for (const fact of fixture.evidence.facts) {
    if (fact.factId.startsWith('review:')) continue;
    assert.deepEqual(fact, originals.get(fact.factId), `Immutable league fact ${fact.factId}`);
    for (const parent of fact.derivedFrom || []) assert.ok(available.has(parent), `Missing lineage ${parent}`);
  }
});

test('the real six-game review passes the strict depth, citation and claim checks', () => {
  assert.deepEqual(validateLongFormShape(fixture.article, context), []);
  const copy = runCopyDesk(fixture.article, context);
  assert.equal(copy.pass, true, JSON.stringify(copy.errors));
  const claims = validateArticleClaims(fixture.article, buildAllowedClaimIndex({ facts: fixture.evidence.facts, identities: packet.identities }));
  assert.equal(claims.pass, true, JSON.stringify(claims.errors));
  assert.equal(fixture.article.mainEvent.matchupIds.length + fixture.article.supportingStories.length + fixture.article.aroundLeague.length, 6);
});
