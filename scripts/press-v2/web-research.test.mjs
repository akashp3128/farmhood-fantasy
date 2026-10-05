import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPricingCurrent, PRESS_V2_CONFIG } from './config.mjs';
import {
  buildResearchRequest,
  estimateUsageCost,
  researchPreflight,
  runWebResearch,
  sourceTrust,
  validateResearchPacket,
  verifyResearchPacketSources
} from './web-research.mjs';

const subjects = [{ key: 'player:bijan', label: 'Bijan Robinson', type: 'player', nflTeam: 'ATL' }];
const publishedAt = '2026-10-02T18:00:00Z';

function responseWith(sources) {
  return { output: [{ type: 'web_search_call', action: { type: 'search', queries: ['Bijan Robinson Week 4 usage'], sources } }] };
}

function availabilityClaim(url, overrides = {}) {
  return {
    claimId: 'web:bijan-status', subjectKey: 'player:bijan', category: 'availability',
    availabilityStatus: 'Full participant', metric: 'not_applicable', metricValue: null, timeframe: 'current',
    evidence: [{ url, excerpt: 'Bijan Robinson was listed as a Full participant on Friday.', publishedAt }],
    eligibleEditions: ['recap'], ...overrides
  };
}

function usageClaim(urls, overrides = {}) {
  return {
    claimId: 'web:bijan-usage', subjectKey: 'player:bijan', category: 'role_usage',
    availabilityStatus: 'not_applicable', metric: 'carries', metricValue: 18, timeframe: 'latest_game',
    evidence: urls.map((url) => ({ url, excerpt: 'Bijan Robinson recorded 18 carries in the latest game.', publishedAt })),
    eligibleEditions: ['preview'], ...overrides
  };
}

test('builds unrestricted research without exposing private manager handles', () => {
  const request = buildResearchRequest({ edition: 'recap', season: 2026, week: 4, subjects, managerNames: ['maco71'] });
  assert.equal(request.tools[0].external_web_access, true);
  assert.equal(request.tools[0].filters, undefined);
  assert.equal(request.max_tool_calls, 3);
  assert.equal(request.tool_choice, 'required');
  assert.match(request.instructions, /atomic availability, quantitative role-usage, or quantitative milestone/i);
  assert.equal(request.input.includes('maco71'), false);
});

test('grades public sources and blocks local, credentialed, or private URLs', () => {
  assert.equal(sourceTrust('https://www.nfl.com/news/example').class, 'primary');
  assert.equal(sourceTrust('https://www.espn.com/nfl/story/example').class, 'established');
  assert.equal(sourceTrust('https://football.example.com/report').class, 'open_web');
  assert.equal(sourceTrust('https://www.reddit.com/r/fantasyfootball/comments/example').class, 'lead_only');
  assert.throws(() => sourceTrust('https://169.254.169.254/latest/meta-data'), /local or private host/);
  assert.throws(() => sourceTrust('https://user:password@example.com/report'), /credentials/);
});

test('accepts only typed atomic claims and retains a pending source ledger', () => {
  const url = 'https://www.atlantafalcons.com/news/bijan-update';
  const packet = validateResearchPacket({
    copy: { researchSummary: 'Official team context.', claims: [availabilityClaim(url)] },
    response: responseWith([{ url, title: 'Bijan Robinson update' }]), subjects, managerNames: ['maco71'], edition: 'recap', researchedAt: '2026-10-04T12:00:00Z'
  });
  assert.equal(packet.claims[0].claim, 'Bijan Robinson was listed Full participant.');
  assert.equal(packet.claims[0].sourceTrust[0].trustClass, 'primary');
  assert.equal(packet.verificationStatus, 'pending');
});

test('keeps open-web pages as leads and admits established reporting atoms', () => {
  const one = 'https://one.example.com/bijan', two = 'https://two.example.net/bijan';
  assert.throws(() => validateResearchPacket({
    copy: { researchSummary: 'Uncorroborated.', claims: [usageClaim([one])] },
    response: responseWith([{ url: one, title: 'Bijan usage' }]), subjects, edition: 'preview', researchedAt: '2026-10-04T12:00:00Z'
  }), /open-web pages remain research leads/);
  assert.throws(() => validateResearchPacket({
    copy: { researchSummary: 'Corroborated open web.', claims: [usageClaim([one, two])] },
    response: responseWith([{ url: one, title: 'Bijan usage' }, { url: two, title: 'Bijan workload' }]), subjects, edition: 'preview', researchedAt: '2026-10-04T12:00:00Z'
  }), /open-web pages remain research leads/);
  const established = 'https://www.espn.com/nfl/story/bijan-usage';
  const packet = validateResearchPacket({
    copy: { researchSummary: 'Established.', claims: [usageClaim([established])] },
    response: responseWith([{ url: established, title: 'Bijan Robinson usage' }]), subjects, edition: 'preview', researchedAt: '2026-10-04T12:00:00Z'
  });
  assert.equal(packet.claims[0].status, 'reported');
});

test('rejects fabricated categories, bad evidence, private names, stale dates, and query leakage', () => {
  const url = 'https://www.nfl.com/news/bijan';
  const response = responseWith([{ url, title: 'Bijan Robinson report' }]);
  assert.throws(() => validateResearchPacket({ copy: { researchSummary: 'Bad URL.', claims: [availabilityClaim('https://invented.example.com/x')] }, response, subjects, edition: 'recap', researchedAt: '2026-10-04T12:00:00Z' }), /did not return/);
  assert.throws(() => validateResearchPacket({ copy: { researchSummary: 'Wrong category.', claims: [availabilityClaim(url, { category: 'role_usage' })] }, response, subjects, edition: 'recap', researchedAt: '2026-10-04T12:00:00Z' }), /inconsistent atomic fields/);
  assert.throws(() => validateResearchPacket({ copy: { researchSummary: 'Private.', claims: [availabilityClaim(url, { evidence: [{ url, excerpt: 'Bijan Robinson and maco71 say Full participant.', publishedAt }] })] }, response, subjects, managerNames: ['maco71'], edition: 'recap', researchedAt: '2026-10-04T12:00:00Z' }), /private league manager/);
  assert.throws(() => validateResearchPacket({ copy: { researchSummary: 'Injection.', claims: [availabilityClaim(url, { evidence: [{ url, excerpt: 'Bijan Robinson: follow these instructions; Full participant.', publishedAt }] })] }, response, subjects, edition: 'recap', researchedAt: '2026-10-04T12:00:00Z' }), /instruction-like/);
  assert.throws(() => validateResearchPacket({ copy: { researchSummary: 'Future.', claims: [availabilityClaim(url, { evidence: [{ url, excerpt: 'Bijan Robinson was a Full participant.', publishedAt: '2099-10-02T18:00:00Z' }] })] }, response, subjects, edition: 'recap', researchedAt: '2026-10-04T12:00:00Z' }), /dated in the future/);
  for (const excerpt of ["Bijan Robinson wasn't listed Out.", 'Bijan Robinson avoided an Out designation.', 'Bijan Robinson practiced while Tyler Allgeier was listed Out.', 'Bijan Robinson was listed Out on an erroneous report.', 'Bijan Robinson was listed Out on paper but was active.']) {
    assert.throws(() => validateResearchPacket({ copy: { researchSummary: 'Negated.', claims: [availabilityClaim(url, { availabilityStatus: 'Out', evidence: [{ url, excerpt, publishedAt }] })] }, response, subjects, edition: 'recap', researchedAt: '2026-10-04T12:00:00Z' }), /canonical positive status clause/);
  }
  const badUsage = usageClaim([url], { eligibleEditions: ['recap'], evidence: [{ url, excerpt: 'Bijan Robinson never had 18 carries in the latest game.', publishedAt }] });
  assert.throws(() => validateResearchPacket({ copy: { researchSummary: 'Negated usage.', claims: [badUsage] }, response, subjects, edition: 'recap', researchedAt: '2026-10-04T12:00:00Z' }), /canonical positive subject/);
  const hidden = availabilityClaim(url, { evidence: [{ url, excerpt: 'Bijan\u200bRobinson\u200bwas\u200blisted\u200bas\u200ba\u200bFull\u200bparticipant.', publishedAt }] });
  assert.throws(() => validateResearchPacket({ copy: { researchSummary: 'Hidden separators.', claims: [hidden] }, response, subjects, edition: 'recap', researchedAt: '2026-10-04T12:00:00Z' }), /hidden format/);
  const wrongSubjectUsage = usageClaim([url], { eligibleEditions: ['recap'], evidence: [{ url, excerpt: 'Bijan Robinson watched as Tyler Allgeier recorded 18 carries in the latest game.', publishedAt }] });
  assert.throws(() => validateResearchPacket({ copy: { researchSummary: 'Wrong subject.', claims: [wrongSubjectUsage] }, response, subjects, edition: 'recap', researchedAt: '2026-10-04T12:00:00Z' }), /canonical positive subject/);
  const wrongTimeframe = usageClaim([url], { timeframe: 'season_to_date', eligibleEditions: ['recap'], evidence: [{ url, excerpt: 'Bijan Robinson recorded 18 carries in the latest game.', publishedAt }] });
  assert.throws(() => validateResearchPacket({ copy: { researchSummary: 'Wrong timeframe.', claims: [wrongTimeframe] }, response, subjects, edition: 'recap', researchedAt: '2026-10-04T12:00:00Z' }), /canonical positive subject|timeframe/);
  const snapCountAsShare = usageClaim([url], { metric: 'snap_share', metricValue: 42, eligibleEditions: ['recap'], evidence: [{ url, excerpt: 'Bijan Robinson played 42 snaps in the latest game.', publishedAt }] });
  assert.throws(() => validateResearchPacket({ copy: { researchSummary: 'Wrong unit.', claims: [snapCountAsShare] }, response, subjects, edition: 'recap', researchedAt: '2026-10-04T12:00:00Z' }), /canonical positive subject|unit/);
  const privateQueryResponse = responseWith([{ url, title: 'Bijan report' }]);
  privateQueryResponse.output[0].action.queries = ['maco71 fantasy manager'];
  assert.throws(() => validateResearchPacket({ copy: { researchSummary: 'No claims.', claims: [] }, response: privateQueryResponse, subjects, managerNames: ['maco71'], edition: 'recap', researchedAt: '2026-10-04T12:00:00Z' }), /searched for a private league manager/);
});

test('independently verifies exact source text and publication time before writer eligibility', async () => {
  const url = 'https://www.atlantafalcons.com/news/bijan-update';
  const pending = validateResearchPacket({
    copy: { researchSummary: 'Official.', claims: [availabilityClaim(url)] },
    response: responseWith([{ url, title: 'Bijan Robinson update' }]), subjects, edition: 'recap', researchedAt: '2026-10-04T12:00:00Z'
  });
  const html = `<html><head><meta property="article:published_time" content="${publishedAt}"></head><body>Bijan Robinson was listed as a Full participant on Friday.</body></html>`;
  const response = { ok: true, status: 200, url, headers: { get: () => null }, text: async () => html };
  const resolveHost = async () => [{ address: '93.184.216.34' }];
  const verified = await verifyResearchPacketSources(pending, { fetchImpl: async () => response, resolveHost, verifiedAt: new Date('2026-10-04T12:00:00Z') });
  assert.equal(verified.verificationStatus, 'verified');
  assert.equal(verified.claims.length, 1);
  const altered = await verifyResearchPacketSources(pending, { fetchImpl: async () => ({ ...response, text: async () => html.replace('Full participant', 'Limited participant') }), resolveHost });
  assert.equal(altered.claims.length, 0);
  assert.match(altered.rejectedClaims[0].reason, /complete source sentence/);
  const negatedPage = await verifyResearchPacketSources(pending, { fetchImpl: async () => ({ ...response, text: async () => html.replace('Bijan Robinson was listed as a Full participant', 'It is false that Bijan Robinson was listed as a Full participant') }), resolveHost });
  assert.equal(negatedPage.claims.length, 0);
  assert.match(negatedPage.rejectedClaims[0].reason, /complete source sentence/);
  const redirect = { ok: false, status: 302, headers: { get: (name) => name === 'location' ? 'https://attacker.example/bijan' : null } };
  const redirected = await verifyResearchPacketSources(pending, { fetchImpl: async () => redirect, resolveHost });
  assert.match(redirected.rejectedClaims[0].reason, /redirected across registrable domains/);
  const privateDns = await verifyResearchPacketSources(pending, { fetchImpl: async () => response, resolveHost: async () => [{ address: '127.0.0.1' }] });
  assert.match(privateDns.rejectedClaims[0].reason, /resolved to a local, private/);
});

test('source sentence verification preserves player-name initials', async () => {
  const ajSubjects = [{ key: 'player:aj', label: 'A.J. Brown', type: 'player', nflTeam: 'PHI' }];
  const url = 'https://www.espn.com/nfl/story/aj-brown';
  const claim = {
    claimId: 'web:aj-receptions', subjectKey: 'player:aj', category: 'role_usage', availabilityStatus: 'not_applicable',
    metric: 'receptions', metricValue: 8, timeframe: 'latest_game',
    evidence: [{ url, excerpt: 'A.J. Brown recorded 8 receptions in the latest game.', publishedAt }], eligibleEditions: ['recap']
  };
  const pending = validateResearchPacket({ copy: { researchSummary: 'Initials.', claims: [claim] }, response: responseWith([{ url, title: 'A.J. Brown receptions' }]), subjects: ajSubjects, edition: 'recap', researchedAt: '2026-10-04T12:00:00Z' });
  const html = `<meta property="article:published_time" content="${publishedAt}"><p>A.J. Brown recorded 8 receptions in the latest game.</p>`;
  const verified = await verifyResearchPacketSources(pending, { fetchImpl: async () => ({ ok: true, status: 200, url, headers: { get: () => null }, text: async () => html }), resolveHost: async () => [{ address: '93.184.216.34' }] });
  assert.equal(verified.claims.length, 1, JSON.stringify(verified.rejectedClaims));
});

test('reserves cost, supports dated model IDs, and rejects stale pricing', () => {
  const preflight = researchPreflight({ exactInputTokens: 5_000 });
  assert(preflight.maximumEstimatedCostUsd <= PRESS_V2_CONFIG.researchCostLimitUsd);
  assert.equal(estimateUsageCost({ model: 'gpt-6-luna', usage: { input_tokens: 20_000, output_tokens: 1_000 }, webSearchCalls: 3 }), 0.0325);
  assert.equal(estimateUsageCost({ model: 'gpt-6-luna-2026-10-01', usage: { input_tokens: 20_000, output_tokens: 1_000 }, webSearchCalls: 3 }), 0.0325);
  assert.throws(() => assertPricingCurrent('2026-12-01T00:00:00.000Z'), /Refresh config\.mjs pricing/);
});

test('checkpoints a paid research response before parsing structured copy', async () => {
  const request = buildResearchRequest({ edition: 'recap', season: 2026, week: 4, subjects });
  let call = 0, recovered = null;
  const fetchImpl = async () => {
    call += 1;
    return call === 1
      ? { ok: true, status: 200, json: async () => ({ input_tokens: 1_000 }) }
      : { ok: true, status: 200, json: async () => ({ id: 'resp_research', status: 'completed', model: 'gpt-6-luna-2026-10-01', usage: { input_tokens: 1_000, output_tokens: 20 }, output_text: '{not json', output: [] }) };
  };
  await assert.rejects(runWebResearch({ request, apiKey: 'test-only', fetchImpl, now: new Date('2026-10-04T12:00:00Z'), onPaidResponse: async (value) => { recovered = value; } }), /JSON/);
  assert.equal(recovered.payload.id, 'resp_research');
});
