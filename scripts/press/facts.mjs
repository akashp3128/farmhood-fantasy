import { createRequire } from 'node:module';
import { PRESS_CONFIG, PRESS_SCHEMA_VERSION, PREDICTION_MODEL } from './config.mjs';
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

function factIdsForMatchup(season, week, matchup) {
  return [
    `${season}:w${week}:m${matchup.matchupId}:projection:${matchup.managerA}`,
    `${season}:w${week}:m${matchup.matchupId}:projection:${matchup.managerB}`,
    `${season}:w${week}:m${matchup.matchupId}:pick`
  ];
}

export async function buildWeeklyFacts({ season = PRESS_CONFIG.season, week, now } = {}) {
  assert(season === PRESS_CONFIG.season, `Only the ${PRESS_CONFIG.season} season is configured.`);
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
  const teams = watch.teams.map(compactTeam);
  const teamByName = new Map(teams.map((team) => [team.manager, team]));
  const matchups = watch.matchups.map((matchup) => {
    const a = teamByName.get(matchup.managerA);
    const b = teamByName.get(matchup.managerB);
    return {
      matchupId: Number(matchup.matchupId),
      status: watch.phase.key,
      managerA: matchup.managerA,
      managerB: matchup.managerB,
      rosterIdA: a.rosterId,
      rosterIdB: b.rosterId,
      currentScoreA: round(scoped.matchups.find((row) => row.rosterId === a.rosterId)?.points || 0),
      currentScoreB: round(scoped.matchups.find((row) => row.rosterId === b.rosterId)?.points || 0),
      projectedScoreA: round(matchup.projectionA),
      projectedScoreB: round(matchup.projectionB),
      predictedWinner: matchup.predictedWinner,
      winProbability: round(matchup.winProbability, 4),
      injuries: [...a.injuries, ...b.injuries],
      suggestedSwaps: [...a.suggestedSwaps, ...b.suggestedSwaps],
      factIds: factIdsForMatchup(season, selectedWeek, matchup)
    };
  });
  const snapshotCore = {
    schemaVersion: PRESS_SCHEMA_VERSION,
    kind: watch.phase.key === 'final' ? 'final' : 'pre',
    season,
    week: selectedWeek,
    generatedAt,
    factsAsOf: generatedAt,
    phase: watch.phase,
    lineupLockPolicy: {
      originalPrediction: 'Frozen when the edition is published and never silently overwritten.',
      latestForecast: 'Updates until each affected NFL player game reports live.',
      postLockBehavior: 'Locked starters receive no bench-pivot suggestions.'
    },
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
  const snapshot = { ...snapshotCore, id: snapshotId, immutable: snapshotCore.kind === 'final' };
  const predictionSetId = `farmhood-${season}-week-${String(selectedWeek).padStart(2, '0')}-original`;
  const prediction = {
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
