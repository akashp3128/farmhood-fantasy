import { createRequire } from 'node:module';
import { LATE_OUTLOOK_MODEL, PRESS_CONFIG, PRESS_SCHEMA_VERSION, PREDICTION_MODEL } from './config.mjs';
import { buildLateMatchupOutlook, buildLateTeamOutlook } from './outlook.mjs';
import { assert, digest, isoNow, round } from './utils.mjs';

const require = createRequire(import.meta.url);

function loadLeagueRuntime() {
  globalThis.window = globalThis;
  if (!globalThis.LEAGUE) require('../../assets/data.js');
  if (!globalThis.LEAGUE.allTime) require('../../assets/data_alltime.js');
  return { league: globalThis.LEAGUE, live: require('../../assets/live.js') };
}

function titleCounts(league) {
  const result = {};
  Object.values({ ...(league.foundersChampions || {}), ...(league.championsByYear || {}) })
    .forEach((name) => { result[name] = (result[name] || 0) + 1; });
  return result;
}

function compactPlayer(player) {
  return {
    id: player.id,
    slot: player.slot,
    name: player.name,
    position: player.position,
    team: player.team,
    opponent: player.opponent,
    projection: player.projection == null ? null : round(player.projection),
    points: player.points == null ? null : round(player.points),
    injuryStatus: player.injury || null,
    gameStatus: player.gameStatus || null,
    gameDate: player.gameDate || null,
    locked: Boolean(player.locked)
  };
}

function compactTeam(team) {
  return {
    rosterId: team.rosterId,
    manager: team.name,
    projectedScore: team.projection == null ? null : round(team.projection),
    lineupHash: team.lineupHash,
    starterIds: team.starterIds,
    starters: team.starters.map(compactPlayer),
    injuries: team.injuries,
    emptySlots: team.emptySlots,
    lockedSlots: team.lockedSlots,
    suggestedSwaps: team.pivots.map((pivot) => ({
      slot: pivot.slot,
      starterId: pivot.starterId,
      starterName: pivot.starter,
      alternativeId: pivot.replacementId,
      alternativeName: pivot.replacement,
      projectionDelta: round(pivot.delta),
      reason: pivot.reason
    }))
  };
}

function factIdsForMatchup(season, week, matchup, edition) {
  if (edition === 'late-preview') {
    return [
      `${season}:w${week}:m${matchup.matchupId}:live-score:${matchup.managerA}`,
      `${season}:w${week}:m${matchup.matchupId}:live-score:${matchup.managerB}`,
      `${season}:w${week}:m${matchup.matchupId}:remaining:${matchup.managerA}`,
      `${season}:w${week}:m${matchup.matchupId}:remaining:${matchup.managerB}`,
      `${season}:w${week}:m${matchup.matchupId}:late-forecast`
    ];
  }
  return [
    `${season}:w${week}:m${matchup.matchupId}:projection:${matchup.managerA}`,
    `${season}:w${week}:m${matchup.matchupId}:projection:${matchup.managerB}`,
    `${season}:w${week}:m${matchup.matchupId}:pick`
  ];
}

export async function buildWeeklyFacts({ season = PRESS_CONFIG.season, week, now, edition = 'preview' } = {}) {
  assert(season === PRESS_CONFIG.season, `Only the ${PRESS_CONFIG.season} season is configured.`);
  assert(['preview', 'late-preview', 'recap'].includes(edition), `Unsupported Farmhood Press edition: ${edition}.`);
  const latePreview = edition === 'late-preview';
  const { league, live } = loadLeagueRuntime();
  const base = await live.load({ force: true });
  const selectedWeek = week || base.currentWeek;
  assert(selectedWeek <= base.currentWeek, 'Cannot generate facts for a future Sleeper week.');
  const scoped = selectedWeek === base.currentWeek
    ? base
    : { ...base, currentWeek: selectedWeek, matchups: await live.loadWeek(selectedWeek, { force: true }) };
  const [playerFeed, seasonWeeks] = await Promise.all([
    live.loadPlayers(scoped, selectedWeek, { force: true }),
    live.loadSeasonWeeks(scoped)
  ]);
  const watch = live.lineupWatch(scoped, playerFeed);
  assert(watch.projectionCoverage >= PRESS_CONFIG.minimumProjectionCoverage, `Projection coverage ${(watch.projectionCoverage * 100).toFixed(0)}% is below the newsroom gate.`);
  const power = live.buildPower(scoped, seasonWeeks, league.managers, titleCounts(league), playerFeed);
  const generatedAt = isoNow(now);
  const scoreByRoster = new Map(scoped.matchups.map((row) => [row.rosterId, round(row.points || 0)]));
  const teams = watch.teams.map((rawTeam) => {
    const team = compactTeam(rawTeam);
    if (!latePreview) return team;
    return {
      ...team,
      ...buildLateTeamOutlook({ currentScore: scoreByRoster.get(team.rosterId) || 0, starters: team.starters })
    };
  });
  const occupiedStarters = teams.flatMap((team) => team.starters.filter((player) => player.id !== '0'));
  const missingGameStatusStarters = occupiedStarters.filter((player) => !player.gameStatus);
  if (latePreview) {
    assert(missingGameStatusStarters.length === 0, `Game-status coverage is incomplete for ${missingGameStatusStarters.length} occupied starter${missingGameStatusStarters.length === 1 ? '' : 's'}. No late outlook can be generated safely.`);
  }
  const teamByName = new Map(teams.map((team) => [team.manager, team]));
  const matchups = watch.matchups.map((matchup) => {
    const a = teamByName.get(matchup.managerA);
    const b = teamByName.get(matchup.managerB);
    const baseMatchup = {
      matchupId: Number(matchup.matchupId),
      status: watch.phase.key,
      managerA: matchup.managerA,
      managerB: matchup.managerB,
      rosterIdA: a.rosterId,
      rosterIdB: b.rosterId,
      currentScoreA: round(scoped.matchups.find((row) => row.rosterId === a.rosterId)?.points || 0),
      currentScoreB: round(scoped.matchups.find((row) => row.rosterId === b.rosterId)?.points || 0),
      ...(!latePreview ? {
        projectedScoreA: matchup.pregameProjectionA == null ? null : round(matchup.pregameProjectionA),
        projectedScoreB: matchup.pregameProjectionB == null ? null : round(matchup.pregameProjectionB),
        predictedWinner: watch.phase.key === 'scheduled' ? matchup.predictedWinner : null,
        winProbability: watch.phase.key === 'scheduled' && matchup.winProbability != null ? round(matchup.winProbability, 4) : null
      } : {}),
      injuries: [...a.injuries, ...b.injuries],
      suggestedSwaps: [...a.suggestedSwaps, ...b.suggestedSwaps],
      factIds: factIdsForMatchup(season, selectedWeek, matchup, edition)
    };
    if (!latePreview) return baseMatchup;
    const outlook = buildLateMatchupOutlook({
      matchupId: baseMatchup.matchupId,
      managerA: baseMatchup.managerA,
      managerB: baseMatchup.managerB,
      teamA: a,
      teamB: b
    });
    return {
      matchupId: baseMatchup.matchupId,
      status: baseMatchup.status,
      managerA: baseMatchup.managerA,
      managerB: baseMatchup.managerB,
      rosterIdA: baseMatchup.rosterIdA,
      rosterIdB: baseMatchup.rosterIdB,
      currentScoreA: outlook.currentScoreA,
      currentScoreB: outlook.currentScoreB,
      remainingProjectionA: outlook.remainingProjectionA,
      remainingProjectionB: outlook.remainingProjectionB,
      forecastScoreA: outlook.forecastScoreA,
      forecastScoreB: outlook.forecastScoreB,
      pregameProjectionA: outlook.pregameProjectionA,
      pregameProjectionB: outlook.pregameProjectionB,
      forecastWinner: outlook.forecastWinner,
      forecastProbability: outlook.forecastProbability,
      probabilityA: outlook.probabilityA,
      startedAtCapture: outlook.startedAtCapture,
      lockedStarterCount: outlook.lockedStarterCount,
      forecastStatus: outlook.forecastStatus,
      missingProjectionPlayers: outlook.missingProjectionPlayers,
      receiptEligible: false,
      injuries: baseMatchup.injuries,
      suggestedSwaps: baseMatchup.suggestedSwaps,
      factIds: baseMatchup.factIds
    };
  });
  const snapshotCore = {
    schemaVersion: PRESS_SCHEMA_VERSION,
    kind: latePreview ? 'live' : watch.phase.key === 'final' ? 'final' : 'pre',
    season,
    week: selectedWeek,
    generatedAt,
    factsAsOf: generatedAt,
    phase: watch.phase,
    lineupLockPolicy: {
      originalPrediction: latePreview
        ? 'No original pregame prediction exists for this week; the Weekend Outlook begins after scoring started.'
        : 'Frozen when the edition is published and never silently overwritten.',
      latestForecast: latePreview
        ? 'The late outlook combines official points already scored with only the remaining projections at capture time.'
        : 'Updates until each affected NFL player game reports live.',
      postLockBehavior: 'Locked starters receive no bench-pivot suggestions.'
    },
    ...(latePreview ? {
      forecastContext: {
        mode: 'late_outlook',
        knownScoringIncluded: true,
        receiptEligible: false,
        description: 'Published after the weekly slate began; this is a current-state outlook, not an original pregame prediction.'
      }
    } : {}),
    projectionPolicy: {
      method: 'Farmhood scoring settings applied to Sleeper projected player stat lines.',
      injuryTreatment: 'Questionable status is reported without a second penalty; Out, IR, PUP, Suspended or Inactive starters contribute zero to the latest forecast.',
      minimumCoverage: PRESS_CONFIG.minimumProjectionCoverage
    },
    sourcePolicy: 'Official final Sleeper facts outrank calculations, canon and editorial prose, in that order.',
    league: {
      leagueId: PRESS_CONFIG.leagueId,
      name: league.meta.name,
      scoring: league.meta.scoring,
      teamCount: PRESS_CONFIG.teamCount,
      currentWeek: base.currentWeek
    },
    validation: {
      teamCount: teams.length,
      matchupCount: matchups.length,
      starterSlots: teams.reduce((sum, team) => sum + team.starters.length, 0),
      occupiedStarterSlots: teams.reduce((sum, team) => sum + team.starters.filter((player) => player.id !== '0').length, 0),
      projectedOccupiedStarters: teams.reduce((sum, team) => sum + team.starters.filter((player) => player.id !== '0' && player.projection != null).length, 0),
      gameStatusOccupiedStarters: occupiedStarters.length - missingGameStatusStarters.length,
      gameStatusCoverage: occupiedStarters.length ? round((occupiedStarters.length - missingGameStatusStarters.length) / occupiedStarters.length, 4) : 1,
      missingGameStatusStarters: missingGameStatusStarters.map((player) => ({ id: player.id, name: player.name, team: player.team, slot: player.slot })),
      emptyStarterSlots: teams.reduce((sum, team) => sum + team.emptySlots.length, 0),
      questionableStarters: teams.reduce((sum, team) => sum + team.injuries.filter((injury) => String(injury.status).toLowerCase() === 'questionable').length, 0),
      projectionCoverage: round(watch.projectionCoverage, 4)
    },
    powerBoard: power.rows.map((row) => ({ rank: row.rank, manager: row.name, score: round(row.power), tag: row.tag.label })),
    teams,
    matchups,
    sources: [
      `https://api.sleeper.app/v1/league/${PRESS_CONFIG.leagueId}`,
      `https://api.sleeper.app/v1/league/${PRESS_CONFIG.leagueId}/rosters`,
      `https://api.sleeper.app/v1/league/${PRESS_CONFIG.leagueId}/matchups/${selectedWeek}`,
      `https://api.sleeper.app/projections/nfl/${season}/${selectedWeek}`
    ]
  };
  const snapshotId = `farmhood-${season}-week-${String(selectedWeek).padStart(2, '0')}-${snapshotCore.kind}-${digest(snapshotCore).slice(0, 16)}`;
  const snapshot = { ...snapshotCore, id: snapshotId, immutable: snapshotCore.kind === 'final' || latePreview };
  const predictionSetId = `farmhood-${season}-week-${String(selectedWeek).padStart(2, '0')}-${latePreview ? 'late' : 'original'}`;
  const prediction = latePreview ? {
    schemaVersion: PRESS_SCHEMA_VERSION,
    predictionSetId,
    predictionKind: 'late_forecast',
    receiptEligible: false,
    season,
    week: selectedWeek,
    state: 'locked_late',
    generatedAt,
    factsAsOf: generatedAt,
    sourceSnapshotId: snapshotId,
    immutableAfterKickoff: true,
    model: {
      id: LATE_OUTLOOK_MODEL,
      method: 'Official points already scored plus projections only for starters whose games had not started at capture time.',
      scale: PRESS_CONFIG.projectionLogisticScale,
      minimumProbability: 0.15,
      maximumProbability: 0.85
    },
    predictions: matchups.map((matchup) => ({
      predictionId: `${season}-w${selectedWeek}-m${matchup.matchupId}-late`,
      predictionKind: 'late_forecast',
      receiptEligible: false,
      matchupId: matchup.matchupId,
      managerA: matchup.managerA,
      managerB: matchup.managerB,
      currentScoreA: matchup.currentScoreA,
      currentScoreB: matchup.currentScoreB,
      remainingProjectionA: matchup.remainingProjectionA,
      remainingProjectionB: matchup.remainingProjectionB,
      forecastScoreA: matchup.forecastScoreA,
      forecastScoreB: matchup.forecastScoreB,
      forecastWinner: matchup.forecastWinner,
      forecastProbability: matchup.forecastProbability,
      startedAtCapture: matchup.startedAtCapture,
      lockedStarterCount: matchup.lockedStarterCount,
      forecastStatus: matchup.forecastStatus,
      missingProjectionPlayers: matchup.missingProjectionPlayers,
      factIds: matchup.factIds
    })),
    grading: null,
    lockedAt: generatedAt,
    lockReason: 'Weekend Outlook captured after scoring began; it is immutable and ineligible for original-prediction receipts.'
  } : {
    schemaVersion: PRESS_SCHEMA_VERSION,
    predictionSetId,
    season,
    week: selectedWeek,
    state: watch.phase.key === 'scheduled' ? 'published_prelock' : 'locked',
    generatedAt,
    factsAsOf: generatedAt,
    sourceSnapshotId: snapshotId,
    immutableAfterKickoff: true,
    model: {
      id: PREDICTION_MODEL,
      method: 'Bounded logistic transform of the difference between league-scored starting-lineup projections.',
      scale: PRESS_CONFIG.projectionLogisticScale,
      minimumProbability: 0.15,
      maximumProbability: 0.85
    },
    predictions: matchups.map((matchup) => ({
      predictionId: `${season}-w${selectedWeek}-m${matchup.matchupId}`,
      matchupId: matchup.matchupId,
      managerA: matchup.managerA,
      managerB: matchup.managerB,
      projectedScoreA: matchup.projectedScoreA,
      projectedScoreB: matchup.projectedScoreB,
      predictedWinner: matchup.predictedWinner,
      winProbability: matchup.winProbability,
      factIds: matchup.factIds
    })),
    grading: null
  };
  return { snapshot, prediction, league, playerFeed };
}
