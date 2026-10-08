import assert from 'node:assert/strict';
import test from 'node:test';
import { PRESS_V2_CONFIG } from './config.mjs';
import { buildReportingPacket } from './reporting-packet.mjs';
import { buildStoryAssignment } from './story-angles.mjs';
import { sampleWeekInput } from './fixtures/sample-week.mjs';
import {
  aliasWriterContext,
  buildCitationAliases,
  buildWriterContext,
  buildWriterRequest,
  expandArticleCitations,
  researchSubjectsFromFacts,
  runWriter,
  selectWriterFacts,
  webClaimsAsFacts,
  writerPreflight
} from './writer.mjs';

test('selects a bounded writer packet with complete current-matchup evidence', () => {
  const packet = buildReportingPacket(sampleWeekInput());
  const assignment = buildStoryAssignment(packet, { edition: 'recap' });
  const facts = selectWriterFacts(packet, assignment);
  assert.ok(facts.length <= 160);
  for (const matchupId of [1, 2]) {
    assert.ok(facts.some((fact) => fact.kind === 'matchup_result' && fact.context.matchupId === matchupId));
    assert.equal(facts.filter((fact) => fact.kind === 'team_week_score' && fact.context.matchupId === matchupId).length, 2);
  }
  assert.ok(facts.some((fact) => fact.kind === 'season_record'));
  for (const manager of packet.identities.filter((entity) => entity.type === 'manager')) {
    const delta = facts.find((fact) => fact.kind === 'player_projection_delta' && fact.related.some((entity) => entity.key === manager.key));
    assert.ok(delta, `Specific player variance for ${manager.label}`);
    assert.ok(delta.derivedFrom.every((id) => facts.some((fact) => fact.factId === id)), `Raw points and projections for ${manager.label}`);
    assert.ok(facts.some((fact) => fact.kind === 'team_top_starter' && fact.related.some((entity) => entity.key === manager.key)));
  }
});

test('derives public NFL research subjects without using private managers as subjects', () => {
  const packet = buildReportingPacket(sampleWeekInput());
  const assignment = buildStoryAssignment(packet, { edition: 'recap' });
  const facts = selectWriterFacts(packet, assignment);
  const subjects = researchSubjectsFromFacts(packet, facts);
  assert.ok(subjects.length > 0);
  assert.ok(subjects.every((subject) => subject.type === 'player' && subject.key.startsWith('player:')));
  assert.equal(subjects.some((subject) => subject.label === 'Alpha_One'), false);
});

test('maps verified web-player atoms back to the player roster and matchup scope', () => {
  const packet = buildReportingPacket(sampleWeekInput());
  const assignment = buildStoryAssignment(packet, { edition: 'recap' });
  const facts = selectWriterFacts(packet, assignment);
  const webFacts = webClaimsAsFacts({ verificationStatus: 'verified', claims: [{
    claimId: 'web:aaron-touchdowns', subjectKey: 'player:a-qb', subjectLabel: 'Aaron Accurate',
    claim: 'Aaron Accurate recorded 3 touchdowns in the latest game.', category: 'milestone', status: 'official', asOf: '2026-09-29T12:00:00Z',
    sourceUrls: ['https://www.nfl.com/news/aaron'], eligibleEditions: ['recap']
  }] });
  const context = buildWriterContext({ packet, facts, webFacts, editorialEdition: 'recap' });
  assert.equal(context.factMatchupIds['web:aaron-touchdowns'], 1);
  assert.deepEqual(context.factManagerNames['web:aaron-touchdowns'], ['Alpha_One']);
});

test('builds a tool-free strict writer request', () => {
  const packet = buildReportingPacket(sampleWeekInput());
  const assignment = buildStoryAssignment(packet, { edition: 'recap' });
  const facts = selectWriterFacts(packet, assignment);
  const context = buildWriterContext({ packet, facts, editorialEdition: 'recap' });
  const request = buildWriterRequest({ packet, assignment, facts, context });
  assert.equal(request.tools, undefined);
  assert.equal(request.store, false);
  assert.equal(request.text.format.strict, true);
  assert.deepEqual(request.text.format.schema.properties.edition.enum, ['recap']);
  assert.match(request.instructions, /only the supplied evidence/i);
  const assignmentInput = JSON.parse(request.input).assignment;
  assert.ok(assignmentInput.main.subjects.every((subject) => !subject.startsWith('manager:')));
});

test('uses short paid-request citations and restores permanent fact IDs afterward', () => {
  const packet = buildReportingPacket(sampleWeekInput());
  const assignment = buildStoryAssignment(packet, { edition: 'recap' });
  const facts = selectWriterFacts(packet, assignment);
  const context = buildWriterContext({ packet, facts, editorialEdition: 'recap' });
  const aliases = buildCitationAliases(facts);
  const requestContext = aliasWriterContext(context, aliases);
  const request = buildWriterRequest({ packet, assignment, facts, context: requestContext, citationAliases: aliases });
  assert.equal(JSON.stringify(request).includes(facts[0].factId), false);
  assert.ok(request.text.format.schema.$defs.factId.enum.every((id) => /^f\d{3}$/.test(id)));
  const alias = aliases.toAlias[facts[0].factId];
  const restored = expandArticleCitations({ thesis: { text: 'Grounded copy.', factIds: [alias] } }, aliases);
  assert.deepEqual(restored.thesis.factIds, [facts[0].factId]);
});

test('dynamically spends only the cents left after research', () => {
  const standardConfig = { ...PRESS_V2_CONFIG, minimumWriterOutputTokens: 2_000 };
  const preflight = writerPreflight({ exactInputTokens: 8_000, researchCostUsd: 0.04, serviceTier: 'default' }, standardConfig);
  assert.equal(preflight.maxOutputTokens, 2_500);
  assert.ok(preflight.maximumTotalCostUsd <= PRESS_V2_CONFIG.totalCostLimitUsd);
  const optimized = writerPreflight({ exactInputTokens: 10_000, researchCostUsd: 0.04, serviceTier: 'default' }, standardConfig);
  assert.equal(optimized.maxOutputTokens, 2_083);
  assert.ok(optimized.maximumTotalCostUsd <= PRESS_V2_CONFIG.totalCostLimitUsd);
  assert.equal(writerPreflight({ exactInputTokens: 10_000, researchCostUsd: 0.04, model: 'gpt-5.6-terra-2026-10-01', serviceTier: 'default' }, standardConfig).maxOutputTokens, 2_083);
  assert.throws(() => writerPreflight({ exactInputTokens: 20_000, researchCostUsd: 0.075 }), /Only .* writer output tokens remain/);
});

test('funds the deeper structured edition using Flex while enforcing the same total ceiling', () => {
  const preflight = writerPreflight({ exactInputTokens: 13_000, researchCostUsd: 0.04 });
  assert.equal(preflight.serviceTier, 'flex');
  assert.equal(preflight.maxOutputTokens, 5_625);
  assert.ok(preflight.maxOutputTokens >= 4_500);
  assert.ok(preflight.maximumTotalCostUsd <= PRESS_V2_CONFIG.totalCostLimitUsd);
  assert.throws(() => writerPreflight({ exactInputTokens: 23_001, researchCostUsd: 0.04 }), /4500 are required/);
  assert.throws(() => writerPreflight({ exactInputTokens: 10_000, researchCostUsd: 0.04, serviceTier: 'default' }), /4500 are required/);
});

test('reserves the highest input rate before buying a draft, including Flex cache writes', () => {
  const preflight = writerPreflight({ exactInputTokens: 13_000, researchCostUsd: 0.04 });
  assert.equal(preflight.reservedInputRatePerMillion, 1.25);
  const price = PRESS_V2_CONFIG.modelPricingPerMillionTokens[PRESS_V2_CONFIG.writerModel];
  const maximumCacheWriteCost = (13_000 * price.cacheWriteInput + preflight.maxOutputTokens * price.output) * PRESS_V2_CONFIG.flexTokenPriceMultiplier / 1_000_000;
  assert.ok(maximumCacheWriteCost <= preflight.writerCostLimitUsd);
  assert.ok(maximumCacheWriteCost + 0.04 <= PRESS_V2_CONFIG.totalCostLimitUsd);
  assert.throws(() => writerPreflight({ exactInputTokens: 28_000, researchCostUsd: 0.035 }), /4500 are required/);
});

test('retains a truncated paid writer response and rejects it before publication', async () => {
  let call = 0, recovery;
  const request = { model: PRESS_V2_CONFIG.writerModel, service_tier: 'flex', input: 'test', max_output_tokens: 6_000 };
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ++call === 1 ? { input_tokens: 1_000 } : { id: 'truncated', status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, service_tier: 'flex', usage: { input_tokens: 1_000, output_tokens: 6_000 }, output_text: '{}' } });
  await assert.rejects(runWriter({ request, apiKey: 'test-only', fetchImpl, now: new Date('2026-10-04T12:00:00Z'), onPaidResponse: async (value) => { recovery = value; } }), /did not complete/);
  assert.equal(recovery.payload.id, 'truncated');
});

test('records Flex usage and never automatically buys a fallback response on a tier mismatch', async () => {
  for (const actualTier of ['flex', 'default']) {
    let calls = 0, checkpoint;
    const request = { model: PRESS_V2_CONFIG.writerModel, service_tier: 'flex', input: 'test', max_output_tokens: 6_000 };
    const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ++calls === 1
      ? { input_tokens: 1_000 }
      : { id: 'tier-receipt', status: 'completed', model: request.model, service_tier: actualTier, usage: { input_tokens: 1_000, output_tokens: 100 }, output_text: '{}' } });
    const run = runWriter({ request, apiKey: 'test-only', fetchImpl, now: new Date('2026-10-04T12:00:00Z'), onPaidResponse: async (value) => { checkpoint = value; } });
    if (actualTier === 'flex') assert.equal((await run).estimatedCostUsd, 0.0016);
    else await assert.rejects(run, /budget requires flex/);
    assert.equal(checkpoint.payload.service_tier, actualTier);
    assert.equal(calls, 2, 'Only one free token-count and one paid writer request are allowed.');
  }
});

test('checkpoints a paid writer response before parsing structured copy', async () => {
  const request = { model: 'gpt-5.6-terra', input: 'test', text: { format: { type: 'json_schema', name: 'test', strict: true, schema: { type: 'object', properties: {}, required: [], additionalProperties: false } } }, max_output_tokens: 2_000, store: false };
  let call = 0, recovered = null;
  const fetchImpl = async () => {
    call += 1;
    return call === 1
      ? { ok: true, status: 200, json: async () => ({ input_tokens: 100 }) }
      : { ok: true, status: 200, json: async () => ({ id: 'resp_writer', status: 'completed', model: 'gpt-5.6-terra-2026-10-01', usage: { input_tokens: 100, output_tokens: 20 }, output_text: '{not json', output: [] }) };
  };
  await assert.rejects(runWriter({ request, researchCostUsd: 0.03, apiKey: 'test-only', fetchImpl, now: new Date('2026-10-04T12:00:00Z'), onPaidResponse: async (value) => { recovered = value; } }), /JSON/);
  assert.equal(recovered.payload.id, 'resp_writer');
});
