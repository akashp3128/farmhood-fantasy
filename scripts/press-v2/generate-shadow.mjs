import path from 'node:path';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildReportingInputFromSnapshots } from './adapters/production-snapshot.mjs';
import { assertArticleClaims, buildAllowedClaimIndex } from './claim-checker.mjs';
import { PRESS_V2_CONFIG } from './config.mjs';
import { assertCopyDesk } from './copy-desk.mjs';
import { validateLongFormShape } from './editorial-schema.mjs';
import { buildReportingPacket } from './reporting-packet.mjs';
import { scoreLongFormArticle } from './rubric.mjs';
import { buildStoryAssignment } from './story-angles.mjs';
import { deriveEditorialMemory, recordStoryEdition } from './story-memory.mjs';
import { digest, invariant, unique } from './utils.mjs';
import { buildResearchRequest, estimateUsageCost, runWebResearch, validateResearchPacket, verifyResearchPacketSources } from './web-research.mjs';
import {
  aliasWriterContext,
  buildCitationAliases,
  buildWriterContext,
  buildWriterRequest,
  citedFactIds,
  expandArticleCitations,
  reportingEdition,
  researchSubjectsFromFacts,
  runWriter,
  selectWriterFacts,
  webClaimsAsFacts
} from './writer.mjs';

export const PRESS_V2_ROOT = fileURLToPath(new URL('../..', import.meta.url));

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function readJsonIfExists(filePath, fallback = null) {
  try { return await readJson(filePath); } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(tempPath, filePath);
}

async function writeTextAtomic(filePath, text) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, text, 'utf8');
  await rename(tempPath, filePath);
}

async function commitJsonTransaction(entries) {
  const originals = new Map();
  for (const { filePath } of entries) {
    try { originals.set(filePath, await readFile(filePath, 'utf8')); }
    catch (error) { if (error?.code === 'ENOENT') originals.set(filePath, null); else throw error; }
  }
  const written = [];
  try {
    for (const { filePath, value } of entries) {
      await writeJsonAtomic(filePath, value);
      written.push(filePath);
    }
  } catch (error) {
    for (const filePath of written.reverse()) {
      const original = originals.get(filePath);
      if (original === null) {
        try { await unlink(filePath); } catch (rollbackError) { if (rollbackError?.code !== 'ENOENT') error.message += ` Rollback failed for ${filePath}: ${rollbackError.message}`; }
      } else {
        try { await writeTextAtomic(filePath, original); } catch (rollbackError) { error.message += ` Rollback failed for ${filePath}: ${rollbackError.message}`; }
      }
    }
    throw error;
  }
}

function parseCli(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    invariant(token.startsWith('--'), `Unexpected argument ${token}.`);
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) values[key] = true;
    else { values[key] = next; index += 1; }
  }
  return values;
}

function weekSlug(week) {
  return `week-${String(week).padStart(2, '0')}`;
}

function editionSlug(edition) {
  return edition === 'weekend_outlook' ? 'weekend-outlook' : 'recap';
}

function paidResponseReceipt(payload, fallbackModel, webSearchCalls = 0) {
  const input = Number(payload?.usage?.input_tokens);
  const output = Number(payload?.usage?.output_tokens);
  if (!Number.isFinite(input) || !Number.isFinite(output)) return { cost: null, status: 'usage_missing', pricingError: null };
  try {
    return { cost: estimateUsageCost({ model: payload.model || fallbackModel, usage: payload.usage, webSearchCalls }), status: 'recorded', pricingError: null };
  } catch (error) {
    return { cost: null, status: 'pricing_unresolved', pricingError: String(error?.message || error).slice(0, 500) };
  }
}

function phaseFileFor(edition) {
  return edition === 'recap' ? 'final.json' : 'live.json';
}

async function listSeasonFinalSnapshots(root, season, throughWeek) {
  const seasonDir = path.join(root, 'content', 'snapshots', String(season));
  const entries = await readdir(seasonDir, { withFileTypes: true });
  const snapshots = [];
  for (const entry of entries) {
    const match = entry.isDirectory() && /^week-(\d{2})$/.exec(entry.name);
    if (!match || Number(match[1]) > throughWeek) continue;
    const snapshot = await readJsonIfExists(path.join(seasonDir, entry.name, 'final.json'));
    if (snapshot) snapshots.push(snapshot);
  }
  return snapshots.sort((left, right) => Number(left.week) - Number(right.week));
}

export async function loadProductionReportingInput({ root = PRESS_V2_ROOT, season, week, editorialEdition }) {
  const weekDir = path.join(root, 'content', 'snapshots', String(season), weekSlug(week));
  const currentSnapshot = await readJson(path.join(weekDir, phaseFileFor(editorialEdition)));
  let referenceSnapshot = currentSnapshot;
  if (editorialEdition === 'recap') {
    referenceSnapshot = await readJsonIfExists(path.join(weekDir, 'pre.json'))
      || await readJsonIfExists(path.join(weekDir, 'live.json'));
    invariant(referenceSnapshot, `Week ${week} recap has no pregame or post-Thursday baseline snapshot.`);
  }
  const [seasonSnapshots, leagueCanon, managersCanon] = await Promise.all([
    listSeasonFinalSnapshots(root, season, editorialEdition === 'recap' ? week : week - 1),
    readJson(path.join(root, 'content', 'canon', 'league.json')),
    readJson(path.join(root, 'content', 'canon', 'managers.json'))
  ]);
  return buildReportingInputFromSnapshots({ currentSnapshot, referenceSnapshot, seasonSnapshots, leagueCanon, managersCanon });
}

function emptyMemory() {
  return { schemaVersion: 1, entries: [] };
}

function managerSubjectKeys(assignment) {
  return unique([assignment.main, ...(assignment.supporting || []), ...(assignment.notebook || [])]
    .flatMap((angle) => angle?.subjects || [])
    .filter((key) => key.startsWith('manager:')));
}

export function prepareShadowEdition({ rawInput, editorialEdition, storyMemory = emptyMemory() }) {
  const packet = buildReportingPacket(rawInput);
  const memory = deriveEditorialMemory(storyMemory, { season: packet.league.season, week: packet.league.week });
  const cooledFactIds = packet.facts
    .filter((fact) => memory.cooledHistoryFactIds.includes(fact.factId) || memory.cooledHistoryFactIds.includes(fact.semanticKey))
    .map((fact) => fact.factId);
  const researchEdition = reportingEdition(editorialEdition);
  const assignment = buildStoryAssignment(packet, {
    edition: researchEdition,
    recentAngleKeys: memory.recentAngles,
    recentSubjectKeys: memory.activeStoryArcs.flatMap((arc) => arc.subjects || []),
    excludedFactIds: cooledFactIds,
    notebookCount: packet.summary.matchupCount
  });
  const historyPrioritySubjects = memory.activeStoryArcs
    .filter((arc) => /champion|title|record|scor|points|history/i.test(arc.summary))
    .flatMap((arc) => arc.subjects || []);
  const facts = selectWriterFacts(packet, assignment, { prioritySubjectKeys: historyPrioritySubjects, excludedFactIds: cooledFactIds });
  const researchSubjects = researchSubjectsFromFacts(packet, facts);
  invariant(researchSubjects.length > 0, 'The assignment produced no public NFL research subjects.');
  const managerNames = packet.identities.filter((identity) => identity.type === 'manager').map((identity) => identity.label);
  const researchRequest = buildResearchRequest({
    edition: researchEdition,
    season: packet.league.season,
    week: packet.league.week,
    subjects: researchSubjects,
    researchQuestions: [
      'Find only current NFL context that materially explains the selected fantasy players.',
      'Prefer official injury/game status and established reporting; ignore private fantasy-manager identities.'
    ],
    managerNames
  });
  return { packet, memory, assignment, facts, researchSubjects, managerNames, researchEdition, researchRequest };
}

function articleId(packet, editorialEdition) {
  return `${packet.league.season}-week-${String(packet.league.week).padStart(2, '0')}-${editionSlug(editorialEdition)}-v2-shadow`;
}

async function saveRecovery({ recoveryDir, id, value }) {
  const filePath = path.join(recoveryDir, `${id}.json`);
  await writeJsonAtomic(filePath, value);
  return filePath;
}

function publicSources(researchPacket, article) {
  const used = new Set(citedFactIds(article).filter((id) => id.startsWith('web:')));
  const urls = new Set((researchPacket?.claims || []).filter((claim) => used.has(claim.claimId)).flatMap((claim) => claim.sourceUrls));
  return (researchPacket?.sources || []).filter((source) => urls.has(source.url));
}

function buildGamebook(prepared) {
  const matchupIds = unique(prepared.packet.facts.map((fact) => Number(fact.context?.matchupId)).filter(Number.isInteger)).sort((a, b) => a - b);
  return {
    phase: prepared.packet.league.phase,
    matchups: matchupIds.map((matchupId) => {
      const facts = prepared.packet.facts.filter((fact) => Number(fact.context?.matchupId) === matchupId);
      const managerNames = unique(facts
        .filter((fact) => fact.kind === 'team_week_score' || fact.kind === 'team_week_projection')
        .map((fact) => fact.subject?.label)
        .filter(Boolean)).sort();
      const result = facts.find((fact) => fact.kind === 'matchup_result');
      const fallbackManagers = [result?.subject?.label, ...(result?.related || []).filter((row) => row.type === 'manager').map((row) => row.label)].filter(Boolean);
      const managers = unique([...managerNames, ...fallbackManagers]).slice(0, 2);
      return {
        matchupId,
        teams: managers.map((manager) => {
          const score = facts.find((fact) => fact.kind === 'team_week_score' && fact.subject?.label === manager);
          const projection = facts.find((fact) => fact.kind === 'team_week_projection' && fact.subject?.label === manager);
          return {
            manager,
            score: score?.value ?? null,
            projection: projection?.value ?? null,
            projectionKind: projection?.context?.projectionKind ?? null
          };
        }),
        resultLeader: result?.value === 'tie' ? null : result?.subject?.label || null,
        resultClaim: result?.claim || null,
        topStarters: facts.filter((fact) => fact.kind === 'team_top_starter').map((fact) => ({ player: fact.subject.label, manager: fact.related?.find((row) => row.type === 'manager')?.label || null, points: fact.value })),
        injuries: facts.filter((fact) => fact.kind === 'player_availability_status').map((fact) => ({ player: fact.subject.label, status: fact.value, claim: fact.claim }))
      };
    })
  };
}

function shadowRecord({ prepared, article, researchPacket, claimCheck, copyDesk, rubric, researchRun, writerRun, generatedAt }) {
  const id = articleId(prepared.packet, article.edition);
  const usedIds = new Set(citedFactIds(article));
  const totalCostUsd = Number((researchRun.estimatedCostUsd + writerRun.estimatedCostUsd).toFixed(6));
  return {
    schemaVersion: 1,
    kind: 'farmhood_press_v2_shadow_edition',
    shadowOnly: true,
    publicationStatus: 'review_only',
    articleId: id,
    season: prepared.packet.league.season,
    week: prepared.packet.league.week,
    editorialEdition: article.edition,
    title: article.title,
    dek: article.dek,
    byline: article.byline,
    generatedAt,
    dataAsOf: prepared.packet.league.capturedAt,
    article,
    gamebook: buildGamebook(prepared),
    assignment: prepared.assignment,
    evidence: {
      facts: prepared.facts,
      citedFactIds: [...usedIds].sort(),
      sourceLedger: prepared.packet.sources,
      acceptedWebClaims: researchPacket.claims.filter((claim) => usedIds.has(claim.claimId)),
      webSources: publicSources(researchPacket, article)
    },
    quality: { claimCheck, copyDesk, rubric },
    research: {
      researchId: researchPacket.researchId,
      researchedAt: researchPacket.researchedAt,
      unrestrictedExternalWeb: true,
      webSearchCalls: researchPacket.webSearchCalls,
      queryCount: researchPacket.queries.length,
      acceptedClaimCount: researchPacket.claims.length,
      rejectedClaimCount: researchPacket.rejectedClaims?.length || 0,
      sourceCount: researchPacket.sources.length,
      model: researchRun.payload.model || PRESS_V2_CONFIG.researchModel,
      estimatedCostUsd: researchRun.estimatedCostUsd
    },
    generation: {
      model: writerRun.payload.model || PRESS_V2_CONFIG.writerModel,
      estimatedCostUsd: writerRun.estimatedCostUsd,
      totalEstimatedCostUsd: totalCostUsd,
      hardCostLimitUsd: PRESS_V2_CONFIG.totalCostLimitUsd,
      userApprovedMaximumUsd: PRESS_V2_CONFIG.userApprovedMaximumUsd,
      usage: writerRun.payload.usage,
      responseId: writerRun.payload.id || null,
      pricingAsOf: PRESS_V2_CONFIG.pricingAsOf
    },
    review: {
      productionFilesMutated: false,
      eligibleForAutomaticPublication: false,
      requiredNextStep: 'Human review on the isolated V2 branch'
    }
  };
}

async function nextShadowIndex(root, record, relativePath) {
  const indexPath = path.join(root, 'content', 'press-v2', 'index.json');
  const current = await readJsonIfExists(indexPath, {
    schemaVersion: 1,
    kind: 'farmhood_press_v2_shadow_index',
    shadowOnly: true,
    featuredArticleId: null,
    articles: []
  });
  const meta = {
    articleId: record.articleId,
    status: 'shadow_review',
    season: record.season,
    week: record.week,
    edition: record.editorialEdition,
    title: record.title,
    dek: record.dek,
    generatedAt: record.generatedAt,
    publishedAt: record.generatedAt,
    dataAsOf: record.dataAsOf,
    storylines: [record.article.mainEvent?.headline, ...(record.article.supportingStories || []).map((row) => row.headline), ...(record.article.deskSections || []).map((row) => row.headline)].filter(Boolean),
    path: relativePath
  };
  const articles = [meta, ...(current.articles || []).filter((row) => row.articleId !== meta.articleId)]
    .sort((left, right) => String(right.generatedAt).localeCompare(String(left.generatedAt)));
  return { filePath: indexPath, value: { ...current, featuredArticleId: meta.articleId, articles } };
}

async function nextStoryMemory(root, prepared, record) {
  const memoryPath = path.join(root, 'content', 'press-v2', 'story-memory.json');
  const existing = await readJsonIfExists(memoryPath, emptyMemory());
  const cited = new Set(citedFactIds(record.article));
  const usedHistory = prepared.facts.filter((fact) => cited.has(fact.factId) && fact.tags.includes('history')).map((fact) => fact.semanticKey);
  const editionArcs = [prepared.assignment.main, ...(prepared.assignment.supporting || [])].map((angle) => ({
    id: `angle:${angle.angleKey}`,
    status: 'active',
    summary: angle.headlineHint,
    subjects: angle.subjects
  }));
  const storyArcs = [...new Map(editionArcs.map((arc) => [arc.id, arc])).values()];
  const next = recordStoryEdition(existing, {
    articleId: record.articleId,
    season: record.season,
    week: record.week,
    edition: record.editorialEdition,
    angles: [prepared.assignment.main, ...(prepared.assignment.supporting || [])].map((angle) => angle.angleKey),
    cooldownPhrases: [record.article.title, record.article.mainEvent?.headline, ...(record.article.supportingStories || []).map((row) => row.headline)].filter(Boolean),
    historyFactIds: usedHistory,
    storyArcs
  });
  return { filePath: memoryPath, value: next };
}

export async function generateShadowEdition({
  rawInput,
  editorialEdition,
  storyMemory = emptyMemory(),
  apiKey,
  fetchImpl = fetch,
  sourceFetchImpl = fetch,
  root = PRESS_V2_ROOT,
  recoveryDir = process.env.PRESS_V2_RECOVERY_DIR || path.join(root, '.press-v2-recovery'),
  now = new Date()
}) {
  invariant(PRESS_V2_CONFIG.shadowOnly && !PRESS_V2_CONFIG.productionMutationAllowed, 'Press V2 safety boundary is not enabled.');
  const persistedStoryMemory = await readJsonIfExists(path.join(root, 'content', 'press-v2', 'story-memory.json'), emptyMemory());
  const effectiveStoryMemory = (storyMemory.entries || []).length ? storyMemory : persistedStoryMemory;
  const prepared = prepareShadowEdition({ rawInput, editorialEdition, storyMemory: effectiveStoryMemory });
  const id = articleId(prepared.packet, editorialEdition);
  const generatedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const existingIndex = await readJsonIfExists(path.join(root, 'content', 'press-v2', 'index.json'), { articles: [] });
  invariant(!(existingIndex.articles || []).some((row) => row.articleId === id), `${id} already exists in the shadow index. No OpenAI request was sent.`);
  invariant(!(persistedStoryMemory.entries || []).some((entry) => entry.articleId === id), `${id} already exists in story memory. No OpenAI request was sent.`);
  let recoveryState = {
    schemaVersion: 1,
    kind: 'farmhood_press_v2_recovery',
    shadowOnly: true,
    articleId: id,
    generatedAt,
    validationStatus: 'prepared',
    paidStages: [],
    estimatedCostUsd: null,
    usageReceiptStatus: 'no_paid_response',
    rawResponses: {},
    responseIds: { research: null, writer: null }
  };
  const recoveryPath = await saveRecovery({ recoveryDir, id, value: recoveryState });
  const checkpoint = async (patch) => {
    recoveryState = { ...recoveryState, ...patch };
    await saveRecovery({ recoveryDir, id, value: recoveryState });
  };
  try {
    const researchRun = await runWebResearch({
      request: prepared.researchRequest,
      apiKey,
      fetchImpl,
      now,
      onPaidResponse: async ({ payload, preflight }) => {
        const webSearchCalls = Array.isArray(payload?.output) ? payload.output.filter((item) => item?.type === 'web_search_call').length : 0;
        const receipt = paidResponseReceipt(payload, PRESS_V2_CONFIG.researchModel, webSearchCalls);
        await checkpoint({
          validationStatus: 'research_response_received',
          paidStages: ['research'],
          rawResponses: { ...recoveryState.rawResponses, research: payload },
          responseIds: { ...recoveryState.responseIds, research: payload?.id || null },
          preflights: { ...(recoveryState.preflights || {}), research: preflight },
          researchUsage: payload?.usage || null,
          estimatedCostUsd: receipt.cost,
          usageReceiptStatus: `research_${receipt.status}`,
          pricingReceiptError: receipt.pricingError
        });
      }
    });
    await checkpoint({ researchUsage: researchRun.payload.usage, estimatedCostUsd: researchRun.estimatedCostUsd });
    const pendingResearchPacket = validateResearchPacket({
      copy: researchRun.copy,
      response: researchRun.payload,
      subjects: prepared.researchSubjects,
      managerNames: prepared.managerNames,
      edition: prepared.researchEdition,
      researchedAt: researchRun.researchedAt
    });
    await checkpoint({ validationStatus: 'research_structured', pendingResearch: pendingResearchPacket });
    const researchPacket = await verifyResearchPacketSources(pendingResearchPacket, { fetchImpl: sourceFetchImpl, verifiedAt: now });
    await checkpoint({ validationStatus: 'research_accepted', acceptedResearch: researchPacket });
    const webFacts = webClaimsAsFacts(researchPacket);
    const context = buildWriterContext({
      packet: prepared.packet,
      facts: prepared.facts,
      webFacts,
      editorialEdition,
      memory: prepared.memory
    });
    const citationAliases = buildCitationAliases([...prepared.facts, ...webFacts]);
    const requestContext = aliasWriterContext(context, citationAliases);
    const writerRequest = buildWriterRequest({
      packet: prepared.packet,
      assignment: prepared.assignment,
      facts: prepared.facts,
      webFacts,
      context: requestContext,
      memory: prepared.memory,
      citationAliases
    });
    const writerRun = await runWriter({
      request: writerRequest,
      researchCostUsd: researchRun.estimatedCostUsd,
      apiKey,
      fetchImpl,
      now,
      onPaidResponse: async ({ payload, preflight }) => {
        const receipt = paidResponseReceipt(payload, PRESS_V2_CONFIG.writerModel);
        await checkpoint({
          validationStatus: 'writer_response_received',
          paidStages: ['research', 'writer'],
          rawResponses: { ...recoveryState.rawResponses, writer: payload },
          responseIds: { ...recoveryState.responseIds, writer: payload?.id || null },
          preflights: { ...(recoveryState.preflights || {}), writer: preflight },
          writerUsage: payload?.usage || null,
          estimatedCostUsd: receipt.cost == null || recoveryState.estimatedCostUsd == null ? null : Number((recoveryState.estimatedCostUsd + receipt.cost).toFixed(6)),
          usageReceiptStatus: receipt.status === 'recorded' && recoveryState.estimatedCostUsd != null ? 'complete' : `writer_${receipt.status}`,
          pricingReceiptError: receipt.pricingError || recoveryState.pricingReceiptError || null
        });
      }
    });
    const article = expandArticleCitations(writerRun.article, citationAliases);
    await checkpoint({
      validationStatus: 'article_recovered',
      article,
      writerUsage: writerRun.payload.usage,
      estimatedCostUsd: Number((researchRun.estimatedCostUsd + writerRun.estimatedCostUsd).toFixed(6))
    });
    const shapeIssues = validateLongFormShape(article, context);
    invariant(shapeIssues.length === 0, `Long-form shape validation failed:\n${shapeIssues.map((row) => `${row.code} ${row.path}: ${row.message}`).join('\n')}`);
    const claimIndex = buildAllowedClaimIndex({
      facts: prepared.facts,
      identities: prepared.packet.identities,
      webResearch: researchPacket,
      researchSubjects: prepared.researchSubjects
    });
    const claimCheck = assertArticleClaims(article, claimIndex);
    const copyDesk = assertCopyDesk(article, context);
    const rubric = scoreLongFormArticle(article, context);
    invariant(rubric.pass, `The Press V2 quality rubric scored ${rubric.score}/${rubric.passingScore}.`);
    const record = shadowRecord({ prepared, article, researchPacket, claimCheck, copyDesk, rubric, researchRun, writerRun, generatedAt });
    invariant(record.generation.totalEstimatedCostUsd <= PRESS_V2_CONFIG.totalCostLimitUsd, 'Accepted edition exceeded the hard cost cap.');
    const relativePath = `content/press-v2/${record.season}/${weekSlug(record.week)}-${editionSlug(record.editorialEdition)}.json`;
    const articleOutput = { filePath: path.join(root, relativePath), value: record };
    const indexOutput = await nextShadowIndex(root, record, relativePath);
    const memoryOutput = await nextStoryMemory(root, prepared, record);
    await commitJsonTransaction([articleOutput, indexOutput, memoryOutput]);
    await checkpoint({ validationStatus: 'passed', shadowPath: relativePath, quality: { claimCheck, copyDesk, rubric } });
    return { record, recoveryPath, relativePath, prepared };
  } catch (error) {
    try { await checkpoint({ validationStatus: 'rejected', validationError: String(error?.message || error).slice(0, 4000) }); }
    catch (checkpointError) { error.message += ` Recovery checkpoint also failed: ${checkpointError.message}`; }
    throw error;
  }
}

export async function buildDryRunDossier({ rawInput, editorialEdition, storyMemory = emptyMemory(), root = PRESS_V2_ROOT, now = new Date() }) {
  const prepared = prepareShadowEdition({ rawInput, editorialEdition, storyMemory });
  const context = buildWriterContext({ packet: prepared.packet, facts: prepared.facts, editorialEdition, memory: prepared.memory });
  const citationAliases = buildCitationAliases(prepared.facts);
  const requestContext = aliasWriterContext(context, citationAliases);
  const writerRequest = buildWriterRequest({ packet: prepared.packet, assignment: prepared.assignment, facts: prepared.facts, context: requestContext, memory: prepared.memory, citationAliases });
  const writerRequestCharacters = JSON.stringify(writerRequest).length;
  const generatedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const summarizeAngle = (angle) => ({
    angleKey: angle.angleKey,
    type: angle.type,
    scope: angle.scope,
    headlineHint: angle.headlineHint,
    score: angle.score,
    primaryFactId: angle.primaryFactId
  });
  const dossier = {
    schemaVersion: 1,
    kind: 'farmhood_press_v2_dry_run_dossier',
    shadowOnly: true,
    articleId: articleId(prepared.packet, editorialEdition),
    generatedAt,
    league: prepared.packet.league,
    reportingSummary: prepared.packet.summary,
    assignment: {
      thesis: prepared.assignment.thesis,
      main: summarizeAngle(prepared.assignment.main),
      supporting: prepared.assignment.supporting.map(summarizeAngle),
      notebook: prepared.assignment.notebook.map(summarizeAngle),
      rankedAngleCount: prepared.assignment.rankedAngleCount
    },
    selectedFactCount: prepared.facts.length,
    selectedFactDigest: digest(prepared.facts),
    researchSubjects: prepared.researchSubjects,
    researchPolicy: {
      unrestrictedExternalWeb: prepared.researchRequest.tools[0].external_web_access,
      maximumSearchCalls: prepared.researchRequest.max_tool_calls,
      hardResearchCostUsd: PRESS_V2_CONFIG.researchCostLimitUsd
    },
    writerPolicy: {
      model: writerRequest.model,
      receivesTools: Boolean(writerRequest.tools),
      maximumOutputTokens: writerRequest.max_output_tokens,
      hardWriterCostUsd: PRESS_V2_CONFIG.writerCostLimitUsd,
      requestCharacters: writerRequestCharacters,
      roughLocalTokenEstimate: Math.ceil(writerRequestCharacters / 4),
      citationAliases: true,
      reusableSchemaDefinitions: true
    },
    hardTotalCostUsd: PRESS_V2_CONFIG.totalCostLimitUsd,
    userApprovedMaximumUsd: PRESS_V2_CONFIG.userApprovedMaximumUsd,
    productionMutationAllowed: PRESS_V2_CONFIG.productionMutationAllowed,
    managerSubjectKeys: managerSubjectKeys(prepared.assignment)
  };
  const dossierPath = path.join(root, 'content', 'press-v2', 'dossiers', `${dossier.articleId}.json`);
  await writeJsonAtomic(dossierPath, dossier);
  return { dossier, dossierPath, prepared };
}

async function main(argv) {
  const args = parseCli(argv);
  const season = Number(args.season || PRESS_V2_CONFIG.season);
  const week = Number(args.week);
  const editorialEdition = String(args.edition || 'recap').replace(/-/g, '_');
  const mode = String(args.mode || 'dry-run');
  invariant(Number.isInteger(week) && week > 0, '--week must be a positive integer.');
  invariant(['recap', 'weekend_outlook'].includes(editorialEdition), '--edition must be recap or weekend_outlook.');
  invariant(['dry-run', 'generate'].includes(mode), '--mode must be dry-run or generate.');
  const rawInput = await loadProductionReportingInput({ season, week, editorialEdition });
  const memoryPath = path.join(PRESS_V2_ROOT, 'content', 'press-v2', 'story-memory.json');
  const storyMemory = await readJsonIfExists(memoryPath, emptyMemory());
  if (mode === 'dry-run') {
    const { dossier, dossierPath } = await buildDryRunDossier({ rawInput, editorialEdition, storyMemory });
    process.stdout.write(`${JSON.stringify({ mode, dossierPath: path.relative(PRESS_V2_ROOT, dossierPath), dossier }, null, 2)}\n`);
    return;
  }
  invariant(process.env.OPENAI_API_KEY, 'OPENAI_API_KEY is required for --mode generate.');
  const result = await generateShadowEdition({ rawInput, editorialEdition, storyMemory, apiKey: process.env.OPENAI_API_KEY });
  process.stdout.write(`${JSON.stringify({
    mode,
    articleId: result.record.articleId,
    shadowPath: result.relativePath,
    totalEstimatedCostUsd: result.record.generation.totalEstimatedCostUsd,
    hardCostLimitUsd: result.record.generation.hardCostLimitUsd,
    publicationStatus: result.record.publicationStatus
  }, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`Farmhood Press V2 shadow generation failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
