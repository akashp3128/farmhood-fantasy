import { articleProseBlocks, runCopyDesk } from './copy-desk.mjs';

export const PRESS_V2_RUBRIC_WEIGHTS = Object.freeze({
  factualIntegrity: 40,
  narrativeCoherence: 20,
  specificityAndDepth: 15,
  historicalRelevance: 10,
  voiceAndOriginality: 10,
  readability: 5
});

export const PRESS_V2_PASSING_SCORE = 85;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
function round(value) {
  return Number(value.toFixed(1));
}

function countByPrefix(errors, prefixes) {
  return errors.filter((finding) => prefixes.some((prefix) => finding.code.startsWith(prefix))).length;
}

function hasCode(errors, code) {
  return errors.some((finding) => finding.code === code);
}

function usedFactIds(article) {
  return new Set(articleProseBlocks(article).flatMap((block) => block.factIds));
}

function recommendations(report, componentScores) {
  const output = [];
  if (countByPrefix(report.errors, ['citation.', 'claim.', 'manager.', 'matchup.']) > 0) {
    output.push('Repair factual sourcing and canonical entities before any prose polish.');
  }
  if (componentScores.narrativeCoherence < 17) {
    output.push('Strengthen the central thesis and restore the complete edition-specific story hierarchy.');
  }
  if (componentScores.specificityAndDepth < 12) {
    output.push('Replace generic sentences with verified managers, players, scores, margins, or standings consequences.');
  }
  if (componentScores.historicalRelevance < 8) {
    output.push('Use one to three assignment-relevant history facts, only where they change the present interpretation.');
  }
  if (componentScores.voiceAndOriginality < 8) {
    output.push('Remove clichés, cooldown phrases, and repeated formulations; keep humor subordinate to reporting.');
  }
  if (componentScores.readability < 4) {
    output.push('Shorten long sentences and vary cadence before publication.');
  }
  return output;
}

/**
 * Scores deterministic proxies for the public editorial rubric.
 * A score never overrides a failed copy-desk gate.
 */
export function scoreLongFormArticle(article, context, options = {}) {
  const report = runCopyDesk(article, context, options.copyDesk);
  const errors = report.errors;

  const factualDeductions =
    countByPrefix(errors, ['claim.']) * 14 +
    countByPrefix(errors, ['citation.']) * 10 +
    countByPrefix(errors, ['manager.', 'matchup.']) * 8 +
    countByPrefix(errors, ['shape.']) * 4;
  const factualIntegrity = clamp(PRESS_V2_RUBRIC_WEIGHTS.factualIntegrity - factualDeductions, 0, 40);

  let narrativeCoherence = 20;
  narrativeCoherence -= countByPrefix(errors, ['section.']) * 4;
  narrativeCoherence -= countByPrefix(errors, ['shape.lead', 'shape.feature', 'shape.supporting', 'shape.notebook', 'shape.season', 'depth.main_hierarchy']) * 3;
  narrativeCoherence -= countByPrefix(errors, ['matchup.coverage']) * 3;
  if (!article?.thesis?.text) narrativeCoherence -= 5;
  narrativeCoherence = clamp(narrativeCoherence, 0, 20);

  const densityTarget = options.factReferencesPer100WordsTarget ?? 1.25;
  const specificityTarget = options.concreteSentenceRatioTarget ?? 0.65;
  const specificityAndDepth = clamp(
    7 * Math.min(1, report.metrics.factReferencesPer100Words / densityTarget) +
    8 * Math.min(1, report.metrics.concreteSentenceRatio / specificityTarget) -
    countByPrefix(errors, ['depth.']) * 2,
    0,
    15
  );

  const relevantHistory = new Set(context.historyFactIds || []);
  const used = usedFactIds(article);
  const usedHistoryCount = [...relevantHistory].filter((factId) => used.has(factId)).length;
  let historicalRelevance;
  if (relevantHistory.size === 0) historicalRelevance = 10;
  else if (usedHistoryCount === 0) historicalRelevance = 4;
  else if (usedHistoryCount <= 3) historicalRelevance = 10;
  else historicalRelevance = 7;

  const voiceDeductions =
    countByPrefix(errors, ['voice.cliche', 'voice.cooldown']) * 2.5 +
    countByPrefix(errors, ['repetition.']) * 3 +
    countByPrefix(errors, ['voice.injury_joke']) * 5;
  const voiceAndOriginality = clamp(10 - voiceDeductions, 0, 10);

  let readability = 5;
  if (hasCode(report.warnings, 'readability.long_sentence')) readability -= 1.5;
  if (hasCode(report.warnings, 'readability.sentence_average')) readability -= 1.5;
  if (report.metrics.average > 35) readability -= 1;
  readability = clamp(readability, 0, 5);

  const components = {
    factualIntegrity: round(factualIntegrity),
    narrativeCoherence: round(narrativeCoherence),
    specificityAndDepth: round(specificityAndDepth),
    historicalRelevance: round(historicalRelevance),
    voiceAndOriginality: round(voiceAndOriginality),
    readability: round(readability)
  };
  const score = round(Object.values(components).reduce((sum, value) => sum + value, 0));
  return {
    pass: report.pass && score >= (options.passingScore ?? PRESS_V2_PASSING_SCORE),
    score,
    passingScore: options.passingScore ?? PRESS_V2_PASSING_SCORE,
    hardGatePassed: report.pass,
    components,
    history: { available: relevantHistory.size, used: usedHistoryCount },
    recommendations: recommendations(report, components),
    copyDesk: report
  };
}
