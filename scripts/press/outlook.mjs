import { PRESS_CONFIG, ZERO_PROJECTION_INJURY_STATUSES } from './config.mjs';
import { clamp, round } from './utils.mjs';

const MINIMUM_WIN_PROBABILITY = 0.15;
const MAXIMUM_WIN_PROBABILITY = 0.85;

function nullableFinite(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function officialScore(team) {
  const value = team?.officialCurrentScore ?? team?.currentScore ?? team?.points ?? 0;
  const score = nullableFinite(value);
  if (score === null) throw new TypeError('A late outlook requires a finite official current score.');
  return score;
}

function isOccupied(starter) {
  if (!starter || starter.empty === true || starter.occupied === false) return false;
  return String(starter.id ?? '').trim() !== '0';
}

function injuryStatus(starter) {
  return String(starter?.injuryStatus ?? starter?.injury ?? '').trim().toLowerCase();
}

function playerReference(starter) {
  return {
    id: String(starter?.id ?? ''),
    name: String(starter?.name || `Player ${starter?.id || 'unknown'}`),
    slot: String(starter?.slot || ''),
    position: String(starter?.position || ''),
    injuryStatus: starter?.injuryStatus ?? starter?.injury ?? null
  };
}

/**
 * Returns the projection that may still be added to a team's official score.
 * Empty slots and unavailable starters are deterministic zeroes. A null value
 * means an occupied, otherwise-available player is missing a projection.
 */
export function effectiveStarterProjection(starter) {
  if (!isOccupied(starter)) return 0;
  if (ZERO_PROJECTION_INJURY_STATUSES.has(injuryStatus(starter))) return 0;
  return nullableFinite(starter.projection);
}

/**
 * Build a late-week team forecast without mutating the supplied team or lineup.
 * The official score already contains every locked player's result, including
 * a locked zero, so only unlocked projections are added to it.
 */
export function buildLateTeamOutlook(team = {}) {
  const starters = Array.isArray(team.starters) ? team.starters : [];
  const currentScore = officialScore(team);
  const occupiedStarters = starters.filter(isOccupied);
  const lockedStarters = occupiedStarters.filter((starter) => Boolean(starter.locked));
  const unlockedStarters = occupiedStarters.filter((starter) => !starter.locked);

  const missingProjectionPlayers = unlockedStarters
    .filter((starter) => effectiveStarterProjection(starter) === null)
    .map(playerReference);
  const pregameMissingProjectionPlayers = occupiedStarters
    .filter((starter) => effectiveStarterProjection(starter) === null)
    .map(playerReference);
  const complete = missingProjectionPlayers.length === 0;

  const remainingProjection = complete
    ? round(unlockedStarters.reduce((sum, starter) => sum + effectiveStarterProjection(starter), 0))
    : null;
  const pregameProjection = pregameMissingProjectionPlayers.length === 0
    ? round(occupiedStarters.reduce((sum, starter) => sum + effectiveStarterProjection(starter), 0))
    : null;

  return {
    currentScore: round(currentScore),
    remainingProjection,
    forecastScore: complete ? round(currentScore + remainingProjection) : null,
    pregameProjection,
    startedAtCapture: lockedStarters.length > 0,
    lockedStarterCount: lockedStarters.length,
    forecastStatus: complete ? 'complete' : 'incomplete',
    missingProjectionPlayers,
    pregameMissingProjectionPlayers,
    receiptEligible: false
  };
}

function isTeamOutlook(value) {
  return value
    && ['complete', 'incomplete'].includes(value.forecastStatus)
    && Object.hasOwn(value, 'forecastScore')
    && Object.hasOwn(value, 'remainingProjection');
}

function teamName(explicitName, team, fallback) {
  return String(explicitName || team?.manager || team?.name || fallback);
}

/**
 * Build the corresponding matchup forecast. The probability is the same
 * bounded logistic transform used by the Press prediction model, but it is
 * deliberately withheld whenever either team's remaining projection is
 * incomplete.
 */
export function buildLateMatchupOutlook(matchup = {}) {
  const teamA = isTeamOutlook(matchup.teamA)
    ? { ...matchup.teamA, missingProjectionPlayers: [...(matchup.teamA.missingProjectionPlayers || [])], receiptEligible: false }
    : buildLateTeamOutlook(matchup.teamA);
  const teamB = isTeamOutlook(matchup.teamB)
    ? { ...matchup.teamB, missingProjectionPlayers: [...(matchup.teamB.missingProjectionPlayers || [])], receiptEligible: false }
    : buildLateTeamOutlook(matchup.teamB);
  const managerA = teamName(matchup.managerA, matchup.teamA, 'Team A');
  const managerB = teamName(matchup.managerB, matchup.teamB, 'Team B');
  const complete = teamA.forecastStatus === 'complete' && teamB.forecastStatus === 'complete';

  let probabilityA = null;
  let forecastWinner = null;
  let forecastProbability = null;
  if (complete) {
    const rawProbabilityA = 1 / (1 + Math.exp(-(teamA.forecastScore - teamB.forecastScore) / PRESS_CONFIG.projectionLogisticScale));
    probabilityA = round(clamp(rawProbabilityA, MINIMUM_WIN_PROBABILITY, MAXIMUM_WIN_PROBABILITY), 4);
    forecastWinner = probabilityA >= 0.5 ? managerA : managerB;
    forecastProbability = round(Math.max(probabilityA, 1 - probabilityA), 4);
  }

  const missingProjectionPlayers = [
    ...teamA.missingProjectionPlayers.map((player) => ({ ...player, manager: managerA, side: 'A' })),
    ...teamB.missingProjectionPlayers.map((player) => ({ ...player, manager: managerB, side: 'B' }))
  ];

  return {
    matchupId: matchup.matchupId ?? null,
    managerA,
    managerB,
    currentScoreA: teamA.currentScore,
    currentScoreB: teamB.currentScore,
    remainingProjectionA: teamA.remainingProjection,
    remainingProjectionB: teamB.remainingProjection,
    forecastScoreA: teamA.forecastScore,
    forecastScoreB: teamB.forecastScore,
    pregameProjectionA: teamA.pregameProjection,
    pregameProjectionB: teamB.pregameProjection,
    startedAtCapture: teamA.startedAtCapture || teamB.startedAtCapture,
    lockedStarterCount: teamA.lockedStarterCount + teamB.lockedStarterCount,
    forecastStatus: complete ? 'complete' : 'incomplete',
    missingProjectionPlayers,
    probabilityA,
    predictedWinner: forecastWinner,
    winProbability: forecastProbability,
    forecastWinner,
    forecastProbability,
    receiptEligible: false,
    teamA,
    teamB
  };
}
