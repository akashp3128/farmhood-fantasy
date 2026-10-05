import { EDITIONS } from './fact-registry.mjs';
import { compareText, deepFreeze, invariant, round, unique } from './utils.mjs';

function subjectsFor(fact) {
  return unique([fact.subject.key, ...fact.related.map((entity) => entity.key)]).sort();
}

function matchupScope(fact) {
  return fact.context.matchupId == null ? null : `matchup:${fact.context.matchupId}`;
}

function candidate({ type, fact, baseScore, magnitude = 0, headlineHint, reasonCodes = [] }) {
  const scope = matchupScope(fact) || fact.subject.key;
  const subjects = subjectsFor(fact);
  const subjectSignature = subjects.join('+');
  const narrativeKey = `${type}:${subjectSignature}`;
  const eventWeek = fact.context.week ?? fact.context.throughWeek ?? 'na';
  return {
    angleKey: narrativeKey,
    narrativeKey,
    eventKey: `${fact.context.season ?? 'na'}:w${eventWeek}:${type}:${scope}:${subjectSignature}`,
    type,
    scope,
    subjects,
    primaryFactId: fact.factId,
    score: round(baseScore + magnitude, 2),
    headlineHint,
    reasonCodes: unique(reasonCodes).sort()
  };
}

function buildCandidates(packet, edition) {
  const facts = packet.facts.filter((fact) => fact.eligibleEditions.includes(edition));
  const candidates = [];
  const byKind = (kind) => facts.filter((fact) => fact.kind === kind);

  byKind('weekly_high_score').forEach((fact) => {
    const percentile = byKind('historical_week_score_percentile').find((row) => row.subject.key === fact.subject.key);
    const leaderNames = [fact.subject.label, ...fact.related.filter((entity) => entity.type === 'manager').map((entity) => entity.label)];
    candidates.push(candidate({
      type: fact.state === 'final' ? 'weekly-scoring-leader' : 'current-scoring-leader',
      fact,
      baseScore: 88,
      magnitude: percentile ? Math.max(0, Number(percentile.value) - 0.75) * 40 : 0,
      headlineHint: leaderNames.length > 1
        ? `${leaderNames.join(' and ')} share the scoring headline`
        : fact.state === 'final' ? `${fact.subject.label} owns the week's scoring headline` : `${fact.subject.label} leads the live scoring board`,
      reasonCodes: [fact.state === 'final' ? 'weekly-high' : 'live-scoring-lead', ...(percentile && percentile.value >= 0.9 ? ['historical-percentile'] : [])]
    }));
  });

  byKind('weekly_closest_game').forEach((fact) => candidates.push(candidate({
    type: fact.state === 'final' ? 'close-finish' : 'closest-live-margin',
    fact,
    baseScore: 94,
    magnitude: -Math.min(30, Number(fact.value) * 1.25),
    headlineHint: fact.state === 'final'
      ? `Matchup ${fact.context.matchupId} supplied the week's tightest finish`
      : `Matchup ${fact.context.matchupId} has the week's smallest live margin`,
    reasonCodes: ['small-margin', fact.state === 'final' ? (Number(fact.value) <= 2 ? 'photo-finish' : 'competitive-game') : 'live-state']
  })));

  byKind('weekly_largest_margin').forEach((fact) => candidates.push(candidate({
    type: fact.state === 'final' ? 'blowout' : 'largest-live-margin',
    fact,
    baseScore: 58,
    magnitude: Math.min(32, Number(fact.value) * 0.55),
    headlineHint: fact.state === 'final'
      ? `Matchup ${fact.context.matchupId} became the week's defining rout`
      : `Matchup ${fact.context.matchupId} has the week's largest live margin`,
    reasonCodes: [fact.state === 'final' ? 'largest-margin' : 'largest-live-margin']
  })));

  byKind('projection_upset').forEach((fact) => candidates.push(candidate({
    type: 'projection-upset',
    fact,
    baseScore: 76,
    magnitude: Math.min(18, Number(fact.value) * 0.8),
    headlineHint: `${fact.subject.label} overturned the captured projection`,
    reasonCodes: ['result-reversed-projection', Number(fact.value) >= 10 ? 'large-projection-gap' : 'projection-gap']
  })));

  if (edition === 'preview') {
    byKind('matchup_projection_edge').forEach((fact) => candidates.push(candidate({
      type: 'projected-main-event',
      fact,
      baseScore: 76,
      magnitude: -Math.min(24, Number(fact.value) * 1.2),
      headlineHint: fact.value === 0
        ? `${fact.subject.label} and ${fact.related[0].label} project as a dead heat`
        : `${fact.subject.label} and ${fact.related[0].label} form the tightest projected matchup`,
      reasonCodes: ['pregame-projection', Number(fact.value) <= 5 ? 'projected-close-game' : 'projected-edge']
    })));
  }

  if (edition === 'late-preview') {
    byKind('matchup_outlook_edge').forEach((fact) => candidates.push(candidate({
      type: 'weekend-outlook-edge',
      fact,
      baseScore: 72,
      magnitude: -Math.min(20, Number(fact.value)),
      headlineHint: `${fact.subject.label} and ${fact.related[0].label} anchor the post-Thursday outlook`,
      reasonCodes: ['post-thursday-outlook', Number(fact.value) <= 5 ? 'forecast-close-game' : 'forecast-edge']
    })));
  }

  byKind('bench_regret_counterfactual').forEach((fact) => candidates.push(candidate({
    type: 'bench-counterfactual',
    fact,
    baseScore: 55,
    magnitude: Math.min(25, Number(fact.value) * 0.75),
    headlineHint: `${fact.subject.label} has a ${Number(fact.value).toFixed(2)}-point bench counterfactual`,
    reasonCodes: ['eligible-bench-swap', 'counterfactual-not-causation']
  })));

  byKind('player_projection_delta').filter((fact) => Math.abs(Number(fact.value)) >= 8).forEach((fact) => candidates.push(candidate({
    type: Number(fact.value) >= 0 ? 'player-breakout' : 'player-disappointment',
    fact,
    baseScore: 49,
    magnitude: Math.min(24, Math.abs(Number(fact.value)) * 0.7),
    headlineHint: `${fact.subject.label} produced a major projection swing`,
    reasonCodes: [Number(fact.value) >= 0 ? 'beat-projection' : 'missed-projection', 'player-performance']
  })));

  byKind('historical_week_score_percentile').filter((fact) => Number(fact.value) >= 0.9).forEach((fact) => candidates.push(candidate({
    type: 'historical-scoring-performance',
    fact,
    baseScore: 54,
    magnitude: (Number(fact.value) - 0.9) * 100,
    headlineHint: `${fact.subject.label}'s score belongs in historical context`,
    reasonCodes: ['historical-percentile', Number(fact.value) >= 0.98 ? 'rare-score' : 'top-decile-score']
  })));

  byKind('season_current_streak').filter((fact) => Number(fact.value?.length) >= 2).forEach((fact) => candidates.push(candidate({
    type: fact.value.result === 'W' ? 'winning-streak' : fact.value.result === 'L' ? 'losing-streak' : 'tie-streak',
    fact,
    baseScore: 46,
    magnitude: Math.min(30, Number(fact.value.length) * 6),
    headlineHint: `${fact.subject.label}'s ${fact.value.length}-game run shapes the season`,
    reasonCodes: ['multi-week-trend', `result-${String(fact.value.result).toLowerCase()}`]
  })));

  byKind('head_to_head_record').filter((fact) => Number(fact.value?.games) >= 3).forEach((fact) => {
    const margin = Math.abs(Number(fact.value.winsA) - Number(fact.value.winsB));
    candidates.push(candidate({
      type: 'rivalry-history',
      fact,
      baseScore: 40,
      magnitude: Math.min(22, Number(fact.value.games) + (margin <= 1 ? 8 : 0)),
      headlineHint: `${fact.subject.label} and ${fact.related[0].label} add another chapter`,
      reasonCodes: ['head-to-head-history', margin <= 1 ? 'balanced-rivalry' : 'lopsided-history']
    }));
  });

  byKind('player_availability_status').forEach((fact) => candidates.push(candidate({
    type: 'availability-watch',
    fact,
    baseScore: edition === 'preview' || edition === 'late-preview' ? 62 : 34,
    magnitude: /out|inactive|ir|doubtful/i.test(String(fact.value)) ? 12 : 0,
    headlineHint: `${fact.subject.label}'s listed availability belongs on the desk`,
    reasonCodes: ['listed-status', 'time-sensitive']
  })));

  byKind('season_scoring_leader').forEach((fact) => {
    const leaderNames = [fact.subject.label, ...fact.related.filter((entity) => entity.type === 'manager').map((entity) => entity.label)];
    candidates.push(candidate({
    type: 'season-scoring-leader',
    fact,
    baseScore: 48,
    magnitude: 8,
    headlineHint: leaderNames.length > 1 ? `${leaderNames.join(' and ')} share the season scoring pace` : `${fact.subject.label} sets the season scoring pace`,
    reasonCodes: ['season-context', 'scoring-rank-one']
    }));
  });

  return candidates;
}

function evidenceCategory(fact) {
  if (fact.tags.includes('current-week')) return 'currentWeek';
  if (fact.tags.includes('current-season')) return 'currentSeason';
  if (fact.tags.includes('history')) return 'history';
  return 'other';
}

function evidenceScore(fact, angle) {
  let score = 0;
  if (fact.factId === angle.primaryFactId) score += 1000;
  if (matchupScope(fact) && matchupScope(fact) === angle.scope) score += 100;
  const overlap = subjectsFor(fact).filter((subject) => angle.subjects.includes(subject)).length;
  score += overlap * 25;
  if (fact.tags.includes('current-week')) score += 12;
  if (fact.kind === 'matchup_result' || fact.kind === 'team_week_score') score += 8;
  if (fact.tags.includes('history')) score -= 2;
  return score;
}

function attachEvidence(angle, packet, edition, limits = {}, excludedFactIds = new Set()) {
  const cap = {
    currentWeek: limits.currentWeek ?? 5,
    currentSeason: limits.currentSeason ?? 2,
    history: limits.history ?? 1,
    other: limits.other ?? 1,
    total: limits.total ?? 8
  };
  const candidates = packet.facts
    .filter((fact) => fact.eligibleEditions.includes(edition) && !excludedFactIds.has(fact.factId))
    .map((fact) => ({ fact, relevance: evidenceScore(fact, angle) }))
    .filter((row) => row.relevance > 0)
    .sort((left, right) => right.relevance - left.relevance || compareText(left.fact.semanticKey, right.fact.semanticKey));
  const selected = [];
  const counts = { currentWeek: 0, currentSeason: 0, history: 0, other: 0 };
  for (const { fact } of candidates) {
    const category = evidenceCategory(fact);
    if (counts[category] >= cap[category]) continue;
    selected.push(fact);
    counts[category] += 1;
    if (selected.length >= cap.total) break;
  }
  invariant(selected.some((fact) => fact.factId === angle.primaryFactId), `Angle ${angle.angleKey} lost its primary evidence.`);
  return deepFreeze({
    ...angle,
    factIds: selected.map((fact) => fact.factId),
    evidence: selected.map((fact) => ({
      factId: fact.factId,
      claim: fact.claim,
      state: fact.state,
      asOf: fact.asOf,
      sourceIds: fact.sourceIds,
      derivedFrom: fact.derivedFrom,
      category: evidenceCategory(fact)
    })),
    evidenceMix: counts
  });
}

export function rankStoryAngles(packet, {
  edition,
  recentAngleKeys = [],
  recentSubjectKeys = [],
  excludedFactIds = [],
  exactRepeatPenalty = 30,
  subjectRepeatPenalty = 4
} = {}) {
  invariant(packet && packet.schemaVersion === 1 && Array.isArray(packet.facts), 'A Press V2 reporting packet is required.');
  invariant(EDITIONS.includes(edition), `Unsupported edition ${edition}.`);
  const recentAngles = new Set(recentAngleKeys);
  const recentSubjects = new Set(recentSubjectKeys);
  const excluded = new Set(excludedFactIds);
  return buildCandidates(packet, edition).filter((angle) => !excluded.has(angle.primaryFactId)).map((angle) => {
    const exactPenalty = recentAngles.has(angle.angleKey) ? exactRepeatPenalty : 0;
    const repeatedSubjects = angle.subjects.filter((subject) => recentSubjects.has(subject)).length;
    const noveltyPenalty = exactPenalty + repeatedSubjects * subjectRepeatPenalty;
    return attachEvidence({
      ...angle,
      rawScore: angle.score,
      noveltyPenalty,
      score: round(Math.max(0, angle.score - noveltyPenalty), 2),
      reasonCodes: unique([...angle.reasonCodes, ...(exactPenalty ? ['recent-angle-penalty'] : []), ...(repeatedSubjects ? ['recent-subject-penalty'] : [])]).sort()
    }, packet, edition, {}, excluded);
  }).sort((left, right) => right.score - left.score || compareText(left.angleKey, right.angleKey));
}

function subjectOverlap(left, right) {
  return left.subjects.filter((subject) => right.subjects.includes(subject)).length;
}

export function buildStoryAssignment(packet, {
  edition,
  recentAngleKeys = [],
  recentSubjectKeys = [],
  excludedFactIds = [],
  supportingCount = 2,
  notebookCount = 4
} = {}) {
  const ranked = rankStoryAngles(packet, { edition, recentAngleKeys, recentSubjectKeys, excludedFactIds });
  invariant(ranked.length > 0, `No eligible story angles were found for ${edition}.`);
  const main = ranked[0];
  const supporting = [];
  for (const angle of ranked.slice(1)) {
    if (supporting.length >= supportingCount) break;
    if (angle.type === main.type) continue;
    if (angle.scope === main.scope && subjectOverlap(angle, main) > 0) continue;
    if (supporting.some((selected) => selected.type === angle.type || (selected.scope === angle.scope && subjectOverlap(selected, angle) > 0))) continue;
    supporting.push(angle);
  }
  const selectedKeys = new Set([main.angleKey, ...supporting.map((angle) => angle.angleKey)]);
  const notebook = ranked.filter((angle) => !selectedKeys.has(angle.angleKey)).slice(0, notebookCount);
  const selected = [main, ...supporting, ...notebook];
  const factIds = unique(selected.flatMap((angle) => angle.factIds));
  const factIndex = new Map(packet.facts.map((fact) => [fact.factId, fact]));
  factIds.forEach((factId) => invariant(factIndex.has(factId), `Assignment cites missing fact ${factId}.`));
  const mix = factIds.reduce((counts, factId) => {
    counts[evidenceCategory(factIndex.get(factId))] += 1;
    return counts;
  }, { currentWeek: 0, currentSeason: 0, history: 0, other: 0 });
  return deepFreeze({
    schemaVersion: 1,
    edition,
    season: packet.league.season,
    week: packet.league.week,
    dataAsOf: packet.league.capturedAt,
    thesis: main.headlineHint,
    main,
    supporting,
    notebook,
    evidenceFactIds: factIds,
    evidenceMix: mix,
    rankedAngleCount: ranked.length,
    policy: {
      assignmentIsDeterministic: true,
      modelMayUseOnlyAssignedFacts: true,
      historyIsContextNotSourceOfCurrentResults: true,
      counterfactualsMustRemainLabeled: true
    }
  });
}
