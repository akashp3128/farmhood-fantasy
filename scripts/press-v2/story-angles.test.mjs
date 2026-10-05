import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReportingPacket } from './reporting-packet.mjs';
import { buildStoryAssignment, rankStoryAngles } from './story-angles.mjs';
import { sampleWeekInput } from './fixtures/sample-week.mjs';

test('assignment desk ranks newsworthiness deterministically', () => {
  const packet = buildReportingPacket(sampleWeekInput());
  const first = rankStoryAngles(packet, { edition: 'recap' });
  const second = rankStoryAngles(packet, { edition: 'recap' });
  assert.deepEqual(first, second);
  assert.equal(first[0].type, 'weekly-scoring-leader');
  assert.equal(first[0].subjects.includes('manager:gamma'), true);
  assert.ok(first.some((angle) => angle.type === 'close-finish'));
  assert.ok(first.some((angle) => angle.type === 'projection-upset'));
  assert.ok(first.some((angle) => angle.type === 'bench-counterfactual'));
  const close = first.find((angle) => angle.type === 'close-finish');
  assert.match(close.angleKey, /manager:alpha.*manager:beta|manager:beta.*manager:alpha/);
  assert.doesNotMatch(close.angleKey, /matchup:1/);
  assert.match(close.eventKey, /^2026:w3:/);
});

test('recent-angle penalties promote a fresh thesis without deleting continuing evidence', () => {
  const packet = buildReportingPacket(sampleWeekInput());
  const baseline = rankStoryAngles(packet, { edition: 'recap' });
  const repeated = baseline[0].angleKey;
  const reranked = rankStoryAngles(packet, { edition: 'recap', recentAngleKeys: [repeated] });
  assert.notEqual(reranked[0].angleKey, repeated);
  const demoted = reranked.find((angle) => angle.angleKey === repeated);
  assert.equal(demoted.noveltyPenalty, 30);
  assert.ok(demoted.reasonCodes.includes('recent-angle-penalty'));
});

test('assignment packet selects distinct supporting angles and bounded evidence', () => {
  const packet = buildReportingPacket(sampleWeekInput());
  const assignment = buildStoryAssignment(packet, { edition: 'recap', supportingCount: 2, notebookCount: 3 });
  assert.equal(assignment.main.type, 'weekly-scoring-leader');
  assert.equal(assignment.supporting.length, 2);
  assert.equal(new Set(assignment.supporting.map((angle) => angle.type)).size, 2);
  assert.ok(assignment.main.factIds.length <= 8);
  assert.ok(assignment.main.evidenceMix.history <= 1);
  assert.equal(assignment.policy.modelMayUseOnlyAssignedFacts, true);
  const packetFactIds = new Set(packet.facts.map((fact) => fact.factId));
  assignment.evidenceFactIds.forEach((factId) => assert.ok(packetFactIds.has(factId)));
});

test('every selected angle retains primary evidence and source timestamps', () => {
  const packet = buildReportingPacket(sampleWeekInput());
  const assignment = buildStoryAssignment(packet, { edition: 'recap' });
  [assignment.main, ...assignment.supporting, ...assignment.notebook].forEach((angle) => {
    assert.ok(angle.factIds.includes(angle.primaryFactId), angle.angleKey);
    angle.evidence.forEach((fact) => {
      assert.match(fact.asOf, /^2026-/);
      assert.ok(fact.sourceIds.length || packet.facts.find((row) => row.factId === fact.factId).derivedFrom.length);
      assert.deepEqual(fact.derivedFrom, packet.facts.find((row) => row.factId === fact.factId).derivedFrom);
    });
  });
});

test('unsupported editions and empty angle sets fail closed', () => {
  const packet = buildReportingPacket(sampleWeekInput());
  assert.throws(() => rankStoryAngles(packet, { edition: 'newsletter' }), /Unsupported edition/);
  const stripped = { ...packet, facts: [] };
  assert.throws(() => buildStoryAssignment(stripped, { edition: 'recap' }), /No eligible story angles/);
});

test('same-matchup availability stories keep distinct subject-aware keys', () => {
  const packet = buildReportingPacket(sampleWeekInput());
  const facts = packet.facts.map((fact) => fact.kind === 'player_availability_status'
    ? { ...fact, context: { ...fact.context, matchupId: 1 } }
    : fact);
  const angles = rankStoryAngles({ ...packet, facts }, { edition: 'recap' }).filter((angle) => angle.type === 'availability-watch');
  assert.equal(angles.length, 2);
  assert.equal(new Set(angles.map((angle) => angle.angleKey)).size, 2);
});

test('history cooldown removes a fact from angles and supporting evidence', () => {
  const packet = buildReportingPacket(sampleWeekInput());
  const cooled = packet.facts.find((fact) => fact.kind === 'head_to_head_record').factId;
  const assignment = buildStoryAssignment(packet, { edition: 'recap', excludedFactIds: [cooled] });
  assert.equal(assignment.evidenceFactIds.includes(cooled), false);
  assert.equal([assignment.main, ...assignment.supporting, ...assignment.notebook].some((angle) => angle.primaryFactId === cooled), false);
});
