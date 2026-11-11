import { FactRegistry } from './fact-registry.mjs';
import { createIdentityIndex } from './identity.mjs';
import {
  compareText,
  deepFreeze,
  digest,
  finiteNumber,
  identifier,
  integer,
  invariant,
  isoTimestamp,
  mean,
  nonEmptyText,
  round,
  unique
} from './utils.mjs';

const PHASES = Object.freeze(['scheduled', 'live', 'final']);
const PROJECTION_KINDS = Object.freeze(['pregame', 'late-outlook', 'current']);
const POSITION_SLOTS = Object.freeze({
  QB: ['QB', 'SUPER_FLEX'],
  RB: ['RB', 'FLEX', 'SUPER_FLEX'],
  WR: ['WR', 'FLEX', 'REC_FLEX', 'SUPER_FLEX'],
  TE: ['TE', 'FLEX', 'REC_FLEX', 'SUPER_FLEX'],
  K: ['K'],
  DEF: ['DEF'],
  DL: ['DL', 'IDP'],
  LB: ['LB', 'IDP'],
  DB: ['DB', 'IDP']
});

function numberOrNull(value, label) {
  return finiteNumber(value, label, { nullable: true });
}

function sourceIds(raw, label) {
  const ids = unique((raw || []).map((value) => identifier(value, label))).sort();
  invariant(ids.length > 0, `${label} requires at least one source.`);
  return ids;
}

function normalizeProjection(raw, label) {
  if (raw === null || raw === undefined) return null;
  invariant(raw && typeof raw === 'object' && !Array.isArray(raw), `${label} must include value, kind, asOf, and sourceIds.`);
  const kind = nonEmptyText(raw.kind, `${label}.kind`, 20);
  invariant(PROJECTION_KINDS.includes(kind), `${label}.kind must be pregame, late-outlook, or current.`);
  return deepFreeze({
    value: finiteNumber(raw.value, `${label}.value`),
    kind,
    asOf: isoTimestamp(raw.asOf, `${label}.asOf`),
    sourceIds: sourceIds(raw.sourceIds, `${label}.sourceIds`)
  });
}

function normalizeLineupPlayer(raw, identities, label) {
  invariant(raw && typeof raw === 'object', `${label} must be an object.`);
  const player = identities.resolve('player', raw.playerId);
  const position = (raw.position || player.position || '').toUpperCase();
  invariant(position, `${label}.position is required.`);
  const eligibleSlots = unique((raw.eligibleSlots || POSITION_SLOTS[position] || [position])
    .map((slot) => nonEmptyText(slot, `${label}.eligibleSlots`, 20).toUpperCase()));
  const injuryStatus = raw.injuryStatus == null ? null : nonEmptyText(raw.injuryStatus, `${label}.injuryStatus`, 40);
  const injuryAsOf = raw.injuryAsOf == null ? null : isoTimestamp(raw.injuryAsOf, `${label}.injuryAsOf`);
  const injurySourceIds = raw.injurySourceIds?.length ? sourceIds(raw.injurySourceIds, `${label}.injurySourceIds`) : [];
  invariant(!injuryStatus || (injuryAsOf && injurySourceIds.length > 0), `${label} injury status requires injuryAsOf and injurySourceIds.`);
  return deepFreeze({
    playerId: player.id,
    playerKey: player.key,
    name: player.label,
    position,
    slot: raw.slot == null ? null : nonEmptyText(raw.slot, `${label}.slot`, 20).toUpperCase(),
    eligibleSlots,
    points: numberOrNull(raw.points, `${label}.points`),
    projection: normalizeProjection(raw.projection, `${label}.projection`),
    availableAtLock: raw.availableAtLock === true,
    locked: Boolean(raw.locked),
    injuryStatus,
    injuryAsOf,
    injurySourceIds
  });
}

function normalizeCurrentTeam(raw, identities, label) {
  invariant(raw && typeof raw === 'object', `${label} must be an object.`);
  const manager = identities.resolve('manager', raw.managerId);
  const starters = (raw.starters || []).map((player, index) => normalizeLineupPlayer(player, identities, `${label}.starters[${index}]`));
  const bench = (raw.bench || []).map((player, index) => normalizeLineupPlayer(player, identities, `${label}.bench[${index}]`));
  const playerIds = [...starters, ...bench].map((player) => player.playerId);
  invariant(new Set(playerIds).size === playerIds.length, `${label} lists a player more than once.`);
  starters.forEach((player) => invariant(player.slot, `${label} starter ${player.name} requires a lineup slot.`));
  return deepFreeze({
    managerId: manager.id,
    managerKey: manager.key,
    manager: manager.label,
    score: numberOrNull(raw.score, `${label}.score`),
    projection: normalizeProjection(raw.projection, `${label}.projection`),
    starters,
    bench,
    emptySlots: unique((raw.emptySlots || []).map((slot) => nonEmptyText(slot, `${label}.emptySlots`, 20).toUpperCase()))
  });
}

function normalizeCurrentMatchup(raw, identities, index) {
  const matchupId = integer(raw.matchupId, `currentWeek.matchups[${index}].matchupId`, { minimum: 1 });
  invariant(Array.isArray(raw.teams) && raw.teams.length === 2, `Matchup ${matchupId} must contain exactly two teams.`);
  const teams = raw.teams.map((team, teamIndex) => normalizeCurrentTeam(team, identities, `matchup ${matchupId}.teams[${teamIndex}]`));
  invariant(teams[0].managerId !== teams[1].managerId, `Matchup ${matchupId} repeats manager ${teams[0].manager}.`);
  return deepFreeze({ matchupId, startedAtCapture: Boolean(raw.startedAtCapture), teams });
}

function normalizeSeasonWeek(raw, identities, index) {
  const week = integer(raw.week, `seasonWeeks[${index}].week`, { minimum: 1 });
  invariant(Array.isArray(raw.matchups), `seasonWeeks[${index}].matchups must be an array.`);
  const matchups = raw.matchups.map((matchup, matchupIndex) => {
    const matchupId = integer(matchup.matchupId, `seasonWeeks[${index}].matchups[${matchupIndex}].matchupId`, { minimum: 1 });
    invariant(Array.isArray(matchup.teams) && matchup.teams.length === 2, `Season week ${week} matchup ${matchupId} must contain two teams.`);
    const teams = matchup.teams.map((team, teamIndex) => {
      const manager = identities.resolve('manager', team.managerId);
      return deepFreeze({
        managerId: manager.id,
        managerKey: manager.key,
        manager: manager.label,
        score: finiteNumber(team.score, `season week ${week} matchup ${matchupId} team ${teamIndex}.score`)
      });
    });
    invariant(teams[0].managerId !== teams[1].managerId, `Season week ${week} matchup ${matchupId} repeats a manager.`);
    return deepFreeze({ matchupId, teams });
  });
  const managerIds = matchups.flatMap((matchup) => matchup.teams.map((team) => team.managerId));
  invariant(new Set(managerIds).size === managerIds.length, `Season week ${week} includes a manager more than once.`);
  return deepFreeze({
    week,
    final: raw.final !== false,
    sourceIds: sourceIds(raw.sourceIds, `seasonWeeks[${index}].sourceIds`),
    matchups
  });
}

function normalizeHistory(raw = {}, identities, activeSeason) {
  invariant(raw.headToHead === undefined, 'Use history.headToHeadBeforeSeason so current-season games cannot be counted twice.');
  const teamWeekScores = (raw.teamWeekScores || []).map((row, index) => ({
    season: integer(row.season, `history.teamWeekScores[${index}].season`, { minimum: 2000 }),
    week: integer(row.week, `history.teamWeekScores[${index}].week`, { minimum: 1 }),
    score: finiteNumber(row.score, `history.teamWeekScores[${index}].score`)
  }));
  teamWeekScores.forEach((row) => invariant(row.season < activeSeason, 'history.teamWeekScores must contain only seasons before the active season.'));
  const championships = (raw.championships || []).map((row, index) => {
    const manager = identities.resolve('manager', row.managerId);
    const season = integer(row.season, `history.championships[${index}].season`, { minimum: 2000 });
    invariant(season < activeSeason, 'history.championships must contain only seasons before the active season.');
    return {
      season,
      managerId: manager.id,
      managerKey: manager.key,
      manager: manager.label
    };
  });
  const priorHeadToHead = (raw.headToHeadBeforeSeason || []).map((row, index) => {
    const managerA = identities.resolve('manager', row.managerAId);
    const managerB = identities.resolve('manager', row.managerBId);
    invariant(managerA.id !== managerB.id, `history.headToHead[${index}] repeats a manager.`);
    const winsA = integer(row.winsA, `history.headToHead[${index}].winsA`, { minimum: 0 });
    const winsB = integer(row.winsB, `history.headToHead[${index}].winsB`, { minimum: 0 });
    const ties = integer(row.ties ?? 0, `history.headToHead[${index}].ties`, { minimum: 0 });
    return { managerAId: managerA.id, managerBId: managerB.id, winsA, winsB, ties, games: winsA + winsB + ties };
  });
  const canonicalClaims = (raw.canonicalClaims || []).map((row, index) => {
    const manager = identities.resolve('manager', row.managerId);
    return {
      semanticKey: identifier(row.semanticKey, `history.canonicalClaims[${index}].semanticKey`),
      managerId: manager.id,
      managerKey: manager.key,
      manager: manager.label,
      claim: nonEmptyText(row.claim, `history.canonicalClaims[${index}].claim`, 500)
    };
  });
  invariant(new Set(canonicalClaims.map((row) => row.semanticKey)).size === canonicalClaims.length, 'history.canonicalClaims contains a duplicate semantic key.');
  invariant(new Set(priorHeadToHead.map((row) => pairKey(row.managerAId, row.managerBId))).size === priorHeadToHead.length, 'history.headToHeadBeforeSeason contains a duplicate manager pair.');
  const hasHistoricalData = teamWeekScores.length > 0 || championships.length > 0 || priorHeadToHead.length > 0 || canonicalClaims.length > 0;
  const historicalSourceIds = raw.sourceIds?.length ? sourceIds(raw.sourceIds, 'history.sourceIds') : [];
  invariant(!hasHistoricalData || historicalSourceIds.length > 0, 'Historical facts require history.sourceIds provenance.');
  return deepFreeze({
    sourceIds: historicalSourceIds,
    teamWeekScores,
    championships,
    headToHead: priorHeadToHead,
    canonicalClaims
  });
}

function reconcileFinalWeek({ league, currentSourceIds, currentMatchups, seasonWeeks }) {
  seasonWeeks.forEach((week) => invariant(week.week <= league.week, `seasonWeeks contains future Week ${week.week}.`));
  const activeSeasonWeek = seasonWeeks.find((week) => week.week === league.week);
  if (league.phase !== 'final') {
    invariant(!activeSeasonWeek?.final, `Week ${league.week} cannot be final in seasonWeeks while the current phase is ${league.phase}.`);
    return;
  }
  invariant(activeSeasonWeek?.final, `Final Week ${league.week} requires one matching finalized seasonWeeks row.`);
  invariant(activeSeasonWeek.matchups.length === currentMatchups.length, `Final Week ${league.week} season matchup count does not match currentWeek.`);
  invariant(activeSeasonWeek.sourceIds.some((sourceId) => currentSourceIds.includes(sourceId)), `Final Week ${league.week} currentWeek and seasonWeeks do not share source provenance.`);
  const seasonByMatchup = new Map(activeSeasonWeek.matchups.map((matchup) => [matchup.matchupId, matchup]));
  currentMatchups.forEach((currentMatchup) => {
    const seasonMatchup = seasonByMatchup.get(currentMatchup.matchupId);
    invariant(seasonMatchup, `Final Week ${league.week} matchup ${currentMatchup.matchupId} is missing from seasonWeeks.`);
    const seasonByManager = new Map(seasonMatchup.teams.map((team) => [team.managerId, team]));
    currentMatchup.teams.forEach((currentTeam) => {
      const seasonTeam = seasonByManager.get(currentTeam.managerId);
      invariant(seasonTeam, `Final Week ${league.week} matchup ${currentMatchup.matchupId} is missing ${currentTeam.manager}.`);
      invariant(round(seasonTeam.score, 6) === round(currentTeam.score, 6), `Final Week ${league.week} score for ${currentTeam.manager} differs between currentWeek and seasonWeeks.`);
    });
  });
}

export function normalizeReportingInput(raw) {
  invariant(raw && typeof raw === 'object', 'Reporting input must be an object.');
  invariant(raw.league && typeof raw.league === 'object', 'league is required.');
  const league = {
    leagueId: identifier(raw.league.leagueId, 'league.leagueId'),
    name: nonEmptyText(raw.league.name, 'league.name', 100),
    season: integer(raw.league.season, 'league.season', { minimum: 2000 }),
    week: integer(raw.league.week, 'league.week', { minimum: 1 }),
    phase: nonEmptyText(raw.league.phase, 'league.phase', 20),
    capturedAt: isoTimestamp(raw.league.capturedAt, 'league.capturedAt'),
    externalIds: raw.league.externalIds || {}
  };
  invariant(PHASES.includes(league.phase), `Unsupported league phase ${league.phase}.`);
  const identities = createIdentityIndex({ league, managers: raw.managers || [], players: raw.players || [] });
  const activeManagerIds = identities.list('manager').filter((manager) => manager.active).map((manager) => manager.id).sort(compareText);
  invariant(activeManagerIds.length >= 2, 'At least two active manager identities are required.');
  const currentWeek = raw.currentWeek || {};
  const matchups = (currentWeek.matchups || []).map((matchup, index) => normalizeCurrentMatchup(matchup, identities, index));
  invariant(matchups.length > 0, 'currentWeek.matchups cannot be empty.');
  const matchupIds = matchups.map((matchup) => matchup.matchupId);
  invariant(new Set(matchupIds).size === matchupIds.length, 'Current matchup IDs must be unique.');
  const currentManagerIds = matchups.flatMap((matchup) => matchup.teams.map((team) => team.managerId));
  invariant(new Set(currentManagerIds).size === currentManagerIds.length, 'A manager appears in more than one current matchup.');
  invariant(JSON.stringify(currentManagerIds.slice().sort(compareText)) === JSON.stringify(activeManagerIds), `currentWeek must include every active manager exactly once; expected ${activeManagerIds.join(', ')}.`);
  if (league.phase !== 'scheduled') {
    matchups.flatMap((matchup) => matchup.teams).forEach((team) => invariant(team.score !== null, `${team.manager} requires a score while Week ${league.week} is ${league.phase}.`));
  }
  const currentPlayerIds = matchups.flatMap((matchup) => matchup.teams.flatMap((team) => [...team.starters, ...team.bench].map((player) => player.playerId)));
  invariant(new Set(currentPlayerIds).size === currentPlayerIds.length, 'A player appears on more than one current roster.');
  const seasonWeeks = (raw.seasonWeeks || []).map((week, index) => normalizeSeasonWeek(week, identities, index)).sort((left, right) => left.week - right.week);
  invariant(new Set(seasonWeeks.map((week) => week.week)).size === seasonWeeks.length, 'seasonWeeks cannot contain the same week more than once.');
  seasonWeeks.filter((week) => week.final).forEach((week) => {
    const weekManagerIds = week.matchups.flatMap((matchup) => matchup.teams.map((team) => team.managerId)).sort(compareText);
    invariant(JSON.stringify(weekManagerIds) === JSON.stringify(activeManagerIds), `Finalized season Week ${week.week} must include every active manager exactly once.`);
  });
  const currentSourceIds = sourceIds(currentWeek.sourceIds, 'currentWeek.sourceIds');
  reconcileFinalWeek({ league, currentSourceIds, currentMatchups: matchups, seasonWeeks });
  return deepFreeze({
    league,
    sources: raw.sources || [],
    identities,
    currentWeek: {
      sourceIds: currentSourceIds,
      matchups
    },
    seasonWeeks,
    history: normalizeHistory(raw.history, identities, league.season)
  });
}

function phaseState(phase) {
  return phase === 'final' ? 'final' : phase === 'live' ? 'live' : 'projection';
}

function currentEditions(phase) {
  return phase === 'final' ? ['recap', 'season'] : phase === 'live' ? ['late-preview'] : ['preview'];
}

function score(value) {
  return Number(value).toFixed(2);
}

function projectionLabel(kind) {
  return kind === 'pregame' ? 'pregame' : kind === 'late-outlook' ? 'post-Thursday outlook' : 'current';
}

function projectionEditions(kind) {
  return kind === 'pregame' ? ['preview', 'late-preview', 'recap'] : kind === 'late-outlook' ? ['late-preview', 'recap'] : ['preview', 'late-preview'];
}

function percent(value) {
  return `${round(value * 100, 1).toFixed(1)}%`;
}

function matchupContext(packet, matchupId) {
  return { season: packet.league.season, week: packet.league.week, matchupId };
}

function addCurrentFacts(packet, registry) {
  const state = phaseState(packet.league.phase);
  const editions = currentEditions(packet.league.phase);
  const teamScoreFacts = new Map();
  const teamProjectionFacts = new Map();
  const playerPointFacts = new Map();
  const matchupResultFacts = new Map();

  packet.currentWeek.matchups.forEach((matchup) => {
    const [teamA, teamB] = matchup.teams;
    const context = matchupContext(packet, matchup.matchupId);
    matchup.teams.forEach((team) => {
      if (team.score !== null && packet.league.phase !== 'scheduled' && (packet.league.phase === 'final' || matchup.startedAtCapture)) {
        const fact = registry.add({
          semanticKey: `${packet.league.season}:w${packet.league.week}:m${matchup.matchupId}:score:${team.managerId}`,
          kind: 'team_week_score',
          subject: { type: 'manager', id: team.managerId },
          related: [{ type: 'manager', id: team.managerId === teamA.managerId ? teamB.managerId : teamA.managerId }],
          value: round(team.score),
          unit: 'fantasy_points',
          state,
          asOf: packet.league.capturedAt,
          context,
          claim: `${team.manager} ${packet.league.phase === 'final' ? 'finished with' : 'had'} ${score(team.score)} fantasy points in Week ${packet.league.week}.`,
          sourceIds: packet.currentWeek.sourceIds,
          eligibleEditions: editions,
          tags: ['current-week', 'team-score']
        });
        teamScoreFacts.set(team.managerId, fact);
      }
      if (team.projection !== null) {
        const fact = registry.add({
          semanticKey: `${packet.league.season}:w${packet.league.week}:m${matchup.matchupId}:projection:${team.managerId}`,
          kind: 'team_week_projection',
          subject: { type: 'manager', id: team.managerId },
          related: [],
          value: round(team.projection.value),
          unit: 'fantasy_points',
          state: 'projection',
          asOf: team.projection.asOf,
          context: { ...context, projectionKind: team.projection.kind },
          claim: `${team.manager}'s Week ${packet.league.week} lineup carried a ${score(team.projection.value)}-point ${projectionLabel(team.projection.kind)} projection.`,
          sourceIds: team.projection.sourceIds,
          eligibleEditions: projectionEditions(team.projection.kind),
          tags: ['current-week', 'projection', `projection-${team.projection.kind}`]
        });
        teamProjectionFacts.set(team.managerId, fact);
      }
      team.starters.forEach((player) => {
        let pointsFact = null;
        if (player.points !== null && packet.league.phase !== 'scheduled' && (packet.league.phase === 'final' || matchup.startedAtCapture)) {
          pointsFact = registry.add({
            semanticKey: `${packet.league.season}:w${packet.league.week}:m${matchup.matchupId}:starter-points:${team.managerId}:${player.playerId}`,
            kind: 'player_starter_points',
            subject: { type: 'player', id: player.playerId },
            related: [{ type: 'manager', id: team.managerId }],
            value: round(player.points),
            unit: 'fantasy_points',
            state,
            asOf: packet.league.capturedAt,
            context: { ...context, managerId: team.managerId, slot: player.slot },
            claim: `${player.name} scored ${score(player.points)} fantasy points as ${team.manager}'s ${player.slot} starter in Week ${packet.league.week}.`,
            sourceIds: packet.currentWeek.sourceIds,
            eligibleEditions: editions,
            tags: ['current-week', 'player-performance', 'starter']
          });
          playerPointFacts.set(`${team.managerId}:${player.playerId}`, pointsFact);
        }
        let projectionFact = null;
        if (player.projection !== null) {
          projectionFact = registry.add({
            semanticKey: `${packet.league.season}:w${packet.league.week}:m${matchup.matchupId}:player-projection:${team.managerId}:${player.playerId}`,
            kind: 'player_projection',
            subject: { type: 'player', id: player.playerId },
            related: [{ type: 'manager', id: team.managerId }],
            value: round(player.projection.value),
            unit: 'fantasy_points',
            state: 'projection',
            asOf: player.projection.asOf,
            context: { ...context, managerId: team.managerId, slot: player.slot, projectionKind: player.projection.kind },
            claim: `${player.name} carried a ${score(player.projection.value)}-point ${projectionLabel(player.projection.kind)} projection in ${team.manager}'s ${player.slot} slot.`,
            sourceIds: player.projection.sourceIds,
            eligibleEditions: projectionEditions(player.projection.kind),
            tags: ['current-week', 'projection', 'starter', `projection-${player.projection.kind}`]
          });
        }
        if (packet.league.phase === 'final' && pointsFact && projectionFact && player.projection.kind !== 'current') {
          const delta = round(player.points - player.projection.value);
          const deltaEditions = projectionEditions(player.projection.kind).filter((edition) => editions.includes(edition));
          registry.add({
            semanticKey: `${packet.league.season}:w${packet.league.week}:m${matchup.matchupId}:projection-delta:${team.managerId}:${player.playerId}`,
            kind: 'player_projection_delta',
            subject: { type: 'player', id: player.playerId },
            related: [{ type: 'manager', id: team.managerId }],
            value: delta,
            unit: 'fantasy_points',
            state,
            asOf: packet.league.capturedAt,
            context: { ...context, managerId: team.managerId, slot: player.slot },
            claim: `${player.name} scored ${score(Math.abs(delta))} points ${delta >= 0 ? 'above' : 'below'} the ${projectionLabel(player.projection.kind)} projection for ${team.manager}.`,
            derivedFrom: [pointsFact.factId, projectionFact.factId],
            eligibleEditions: deltaEditions,
            tags: ['current-week', 'projection-variance', `projection-${player.projection.kind}`, delta >= 0 ? 'over-performance' : 'under-performance']
          });
        }
        if (player.injuryStatus) {
          registry.add({
            semanticKey: `${packet.league.season}:w${packet.league.week}:availability:${player.playerId}`,
            kind: 'player_availability_status',
            subject: { type: 'player', id: player.playerId },
            related: [{ type: 'manager', id: team.managerId }],
            value: player.injuryStatus,
            state: packet.league.phase === 'final' ? 'historical' : state,
            asOf: player.injuryAsOf || packet.league.capturedAt,
            context: { ...context, managerId: team.managerId, slot: player.slot },
            claim: `${player.name} was listed ${player.injuryStatus} as of ${player.injuryAsOf || packet.league.capturedAt}.`,
            sourceIds: player.injurySourceIds,
            eligibleEditions: packet.league.phase === 'final' ? ['recap'] : editions,
            tags: ['current-week', 'availability']
          });
        }
      });

      const scoredStarters = packet.league.phase === 'scheduled' || (packet.league.phase === 'live' && !matchup.startedAtCapture)
        ? []
        : team.starters.filter((player) => player.points !== null);
      if (scoredStarters.length) {
        const top = scoredStarters.slice().sort((left, right) => right.points - left.points || compareText(left.name, right.name))[0];
        const topFact = playerPointFacts.get(`${team.managerId}:${top.playerId}`);
        const teamStarterFactIds = scoredStarters.map((player) => playerPointFacts.get(`${team.managerId}:${player.playerId}`).factId);
        registry.add({
          semanticKey: `${packet.league.season}:w${packet.league.week}:m${matchup.matchupId}:top-starter:${team.managerId}`,
          kind: 'team_top_starter',
          subject: { type: 'player', id: top.playerId },
          related: [{ type: 'manager', id: team.managerId }],
          value: round(top.points),
          unit: 'fantasy_points',
          state,
          asOf: packet.league.capturedAt,
          context: { ...context, managerId: team.managerId, slot: top.slot },
          claim: packet.league.phase === 'final'
            ? `${top.name} was ${team.manager}'s highest-scoring starter with ${score(top.points)} points.`
            : `${top.name} was ${team.manager}'s highest-scoring starter at capture time with ${score(top.points)} points.`,
          derivedFrom: teamStarterFactIds,
          eligibleEditions: editions,
          tags: ['current-week', 'team-leader']
        });
        const teamScoreFact = teamScoreFacts.get(team.managerId);
        if (teamScoreFact && team.score > 0) {
          const share = round(top.points / team.score, 4);
          registry.add({
            semanticKey: `${packet.league.season}:w${packet.league.week}:m${matchup.matchupId}:score-share:${team.managerId}:${top.playerId}`,
            kind: 'player_team_score_share',
            subject: { type: 'player', id: top.playerId },
            related: [{ type: 'manager', id: team.managerId }],
            value: share,
            unit: 'ratio',
            state,
            asOf: packet.league.capturedAt,
            context: { ...context, managerId: team.managerId },
            claim: `${top.name} supplied ${percent(share)} of ${team.manager}'s Week ${packet.league.week} score.`,
            derivedFrom: [topFact.factId, teamScoreFact.factId],
            eligibleEditions: editions,
            tags: ['current-week', 'score-share']
          });
        }
      }
      if (packet.league.phase === 'final') addBenchRegretFact(packet, registry, matchup, team, playerPointFacts);
    });

    const projectionA = teamA.projection;
    const projectionB = teamB.projection;
    const projectionFactA = teamProjectionFacts.get(teamA.managerId);
    const projectionFactB = teamProjectionFacts.get(teamB.managerId);
    if (projectionA && projectionB && projectionFactA && projectionFactB && projectionA.kind === projectionB.kind) {
      const projectedLeader = projectionA.value >= projectionB.value ? teamA : teamB;
      const projectedUnderdog = projectedLeader === teamA ? teamB : teamA;
      const gap = round(Math.abs(projectionA.value - projectionB.value));
      const lateOutlook = projectionA.kind === 'late-outlook';
      registry.add({
        semanticKey: `${packet.league.season}:w${packet.league.week}:m${matchup.matchupId}:${lateOutlook ? 'outlook' : 'projection'}-edge`,
        kind: lateOutlook ? 'matchup_outlook_edge' : 'matchup_projection_edge',
        subject: { type: 'manager', id: projectedLeader.managerId },
        related: [{ type: 'manager', id: projectedUnderdog.managerId }],
        value: gap,
        unit: 'fantasy_points',
        state: 'projection',
        asOf: projectionA.asOf > projectionB.asOf ? projectionA.asOf : projectionB.asOf,
        context: { ...context, projectionKind: projectionA.kind },
        claim: gap === 0
          ? `${projectedLeader.manager} and ${projectedUnderdog.manager} were even in the captured ${projectionLabel(projectionA.kind)} projections.`
          : `${projectedLeader.manager} held a ${score(gap)}-point edge over ${projectedUnderdog.manager} in the captured ${projectionLabel(projectionA.kind)} projections.`,
        derivedFrom: [projectionFactA.factId, projectionFactB.factId],
        eligibleEditions: projectionEditions(projectionA.kind),
        tags: ['current-week', lateOutlook ? 'outlook-edge' : 'projection-edge', gap <= 5 ? 'projected-close-game' : 'projected-margin']
      });
    }

    if (packet.league.phase !== 'scheduled' && (packet.league.phase === 'final' || matchup.startedAtCapture) && teamA.score !== null && teamB.score !== null) {
      const winner = teamA.score === teamB.score ? null : teamA.score > teamB.score ? teamA : teamB;
      const loser = winner ? (winner === teamA ? teamB : teamA) : null;
      const margin = round(Math.abs(teamA.score - teamB.score));
      const lineage = [teamScoreFacts.get(teamA.managerId)?.factId, teamScoreFacts.get(teamB.managerId)?.factId].filter(Boolean);
      const resultFact = registry.add({
        semanticKey: `${packet.league.season}:w${packet.league.week}:m${matchup.matchupId}:result`,
        kind: 'matchup_result',
        subject: { type: 'manager', id: (winner || teamA).managerId },
        related: [{ type: 'manager', id: (loser || teamB).managerId }],
        value: winner ? winner.managerId : 'tie',
        state,
        asOf: packet.league.capturedAt,
        context,
        claim: winner
          ? `${winner.manager} ${packet.league.phase === 'final' ? 'defeated' : 'led'} ${loser.manager} ${score(winner.score)}–${score(loser.score)}.`
          : `${teamA.manager} and ${teamB.manager} were tied ${score(teamA.score)}–${score(teamB.score)}.`,
        derivedFrom: lineage,
        eligibleEditions: editions,
        tags: ['current-week', 'matchup-result', winner ? 'decided' : 'tie']
      });
      matchupResultFacts.set(matchup.matchupId, resultFact);
      registry.add({
        semanticKey: `${packet.league.season}:w${packet.league.week}:m${matchup.matchupId}:margin`,
        kind: 'matchup_margin',
        subject: { type: 'manager', id: (winner || teamA).managerId },
        related: [{ type: 'manager', id: (loser || teamB).managerId }],
        value: margin,
        unit: 'fantasy_points',
        state,
        asOf: packet.league.capturedAt,
        context,
        claim: winner ? `${winner.manager}'s margin over ${loser.manager} was ${score(margin)} points.` : 'The matchup margin was 0.00 points.',
        derivedFrom: [resultFact.factId],
        eligibleEditions: editions,
        tags: ['current-week', 'matchup-margin']
      });
      const projectedA = teamProjectionFacts.get(teamA.managerId);
      const projectedB = teamProjectionFacts.get(teamB.managerId);
      if (packet.league.phase === 'final' && winner && projectedA && projectedB && teamA.projection.kind === 'pregame' && teamB.projection.kind === 'pregame' && teamA.projection.value !== teamB.projection.value) {
        const projectedWinner = teamA.projection.value > teamB.projection.value ? teamA : teamB;
        if (projectedWinner.managerId !== winner.managerId) {
          registry.add({
            semanticKey: `${packet.league.season}:w${packet.league.week}:m${matchup.matchupId}:projection-upset`,
            kind: 'projection_upset',
            subject: { type: 'manager', id: winner.managerId },
            related: [{ type: 'manager', id: loser.managerId }],
            value: round(Math.abs(teamA.projection.value - teamB.projection.value)),
            unit: 'fantasy_points',
            state,
            asOf: packet.league.capturedAt,
            context,
            claim: `${winner.manager} beat ${loser.manager} after trailing by ${score(Math.abs(teamA.projection.value - teamB.projection.value))} points in the captured pregame lineup projections.`,
            derivedFrom: [resultFact.factId, projectedA.factId, projectedB.factId],
            eligibleEditions: editions,
            tags: ['current-week', 'upset', 'projection-variance']
          });
        }
      }
    }
  });
  return { teamScoreFacts, matchupResultFacts };
}

function eligibleForStarter(benchPlayer, starter) {
  return benchPlayer.eligibleSlots.includes(starter.slot);
}

function addBenchRegretFact(packet, registry, matchup, team, playerPointFacts) {
  const candidates = [];
  team.bench.filter((player) => player.availableAtLock && player.points !== null).forEach((benchPlayer) => {
    team.starters.filter((starter) => starter.points !== null && eligibleForStarter(benchPlayer, starter)).forEach((starter) => {
      const delta = round(benchPlayer.points - starter.points);
      if (delta > 0) candidates.push({ benchPlayer, starter, delta });
    });
  });
  if (!candidates.length) return;
  const best = candidates.sort((left, right) => right.delta - left.delta || compareText(left.benchPlayer.name, right.benchPlayer.name))[0];
  const benchFact = registry.add({
    semanticKey: `${packet.league.season}:w${packet.league.week}:m${matchup.matchupId}:bench-points:${team.managerId}:${best.benchPlayer.playerId}`,
    kind: 'player_bench_points',
    subject: { type: 'player', id: best.benchPlayer.playerId },
    related: [{ type: 'manager', id: team.managerId }],
    value: round(best.benchPlayer.points),
    unit: 'fantasy_points',
    state: 'final',
    asOf: packet.league.capturedAt,
    context: { ...matchupContext(packet, matchup.matchupId), managerId: team.managerId },
    claim: `${best.benchPlayer.name} scored ${score(best.benchPlayer.points)} points on ${team.manager}'s bench.`,
    sourceIds: packet.currentWeek.sourceIds,
    eligibleEditions: ['recap'],
    tags: ['current-week', 'bench']
  });
  const starterFact = playerPointFacts.get(`${team.managerId}:${best.starter.playerId}`);
  registry.add({
    semanticKey: `${packet.league.season}:w${packet.league.week}:m${matchup.matchupId}:bench-regret:${team.managerId}`,
    kind: 'bench_regret_counterfactual',
    subject: { type: 'manager', id: team.managerId },
    related: [
      { type: 'player', id: best.benchPlayer.playerId },
      { type: 'player', id: best.starter.playerId }
    ],
    value: best.delta,
    unit: 'fantasy_points',
    state: 'final',
    asOf: packet.league.capturedAt,
    context: { ...matchupContext(packet, matchup.matchupId), slot: best.starter.slot, counterfactual: true },
    claim: `${best.benchPlayer.name} outscored ${best.starter.name} by ${score(best.delta)} points and was eligible for ${best.starter.slot}; this is a lineup counterfactual, not proof a swap would have changed the result.`,
    derivedFrom: [benchFact.factId, starterFact.factId],
    eligibleEditions: ['recap'],
    tags: ['current-week', 'bench-regret', 'counterfactual']
  });
}

function seasonRows(packet) {
  const managerIds = packet.identities.list('manager').map((manager) => manager.id);
  const rows = new Map(managerIds.map((managerId) => [managerId, {
    managerId,
    wins: 0,
    losses: 0,
    ties: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    allPlayWins: 0,
    allPlayLosses: 0,
    allPlayTies: 0,
    weeklyScores: [],
    results: []
  }]));
  packet.seasonWeeks.filter((week) => week.final && week.week <= packet.league.week).forEach((week) => {
    const weekScores = week.matchups.flatMap((matchup) => matchup.teams.map((team) => ({ managerId: team.managerId, score: team.score })));
    week.matchups.forEach((matchup) => {
      const [a, b] = matchup.teams;
      const rowA = rows.get(a.managerId), rowB = rows.get(b.managerId);
      rowA.pointsFor += a.score; rowA.pointsAgainst += b.score; rowA.weeklyScores.push({ week: week.week, score: a.score });
      rowB.pointsFor += b.score; rowB.pointsAgainst += a.score; rowB.weeklyScores.push({ week: week.week, score: b.score });
      if (a.score === b.score) {
        rowA.ties += 1; rowB.ties += 1; rowA.results.push('T'); rowB.results.push('T');
      } else if (a.score > b.score) {
        rowA.wins += 1; rowB.losses += 1; rowA.results.push('W'); rowB.results.push('L');
      } else {
        rowB.wins += 1; rowA.losses += 1; rowB.results.push('W'); rowA.results.push('L');
      }
    });
    weekScores.forEach((team) => {
      const row = rows.get(team.managerId);
      weekScores.filter((opponent) => opponent.managerId !== team.managerId).forEach((opponent) => {
        if (team.score > opponent.score) row.allPlayWins += 1;
        else if (team.score < opponent.score) row.allPlayLosses += 1;
        else row.allPlayTies += 1;
      });
    });
  });
  return rows;
}

function streak(results) {
  if (!results.length) return { type: 'none', length: 0 };
  const type = results.at(-1);
  let length = 0;
  for (let index = results.length - 1; index >= 0 && results[index] === type; index -= 1) length += 1;
  return { type, length };
}

function addSeasonFacts(packet, registry) {
  const rows = seasonRows(packet);
  const active = [...rows.values()].filter((row) => row.weeklyScores.length > 0);
  const throughWeek = Math.max(0, ...packet.seasonWeeks.filter((week) => week.final && week.week <= packet.league.week).map((week) => week.week));
  if (!active.length) return rows;
  const completedWeeks = packet.seasonWeeks.filter((week) => week.week <= throughWeek && week.final);
  const allSeasonSources = unique(completedWeeks.flatMap((week) => week.sourceIds));
  const context = { season: packet.league.season, throughWeek };
  const comparisonFact = registry.add({
    semanticKey: `${packet.league.season}:through-w${throughWeek}:season-comparison-set`,
    kind: 'season_comparison_set',
    subject: { type: 'league', id: packet.league.leagueId },
    value: active.slice().sort((left, right) => compareText(left.managerId, right.managerId)).map((row) => ({
      managerId: row.managerId,
      wins: row.wins,
      losses: row.losses,
      ties: row.ties,
      pointsFor: round(row.pointsFor),
      pointsAgainst: round(row.pointsAgainst)
    })),
    state: 'derived',
    asOf: packet.league.capturedAt,
    context,
    claim: `The season comparison set contained ${active.length} active managers through Week ${throughWeek}.`,
    sourceIds: allSeasonSources,
    eligibleEditions: ['preview', 'late-preview', 'recap', 'season'],
    tags: ['current-season', 'comparison-set']
  });
  const recordFacts = new Map();
  const pointsFacts = new Map();
  active.forEach((row) => {
    const manager = packet.identities.resolve('manager', row.managerId);
    const weekFacts = completedWeeks
      .flatMap((week) => week.matchups.flatMap((matchup) => matchup.teams
        .filter((team) => team.managerId === row.managerId)
        .map(() => week.sourceIds))).flat();
    const sources = unique(weekFacts);
    const recordFact = registry.add({
      semanticKey: `${packet.league.season}:through-w${throughWeek}:season-record:${row.managerId}`,
      kind: 'season_record',
      subject: { type: 'manager', id: row.managerId },
      value: { wins: row.wins, losses: row.losses, ties: row.ties },
      state: 'derived',
      asOf: packet.league.capturedAt,
      context,
      claim: `${manager.label} was ${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ''} through Week ${throughWeek}.`,
      sourceIds: sources,
      eligibleEditions: ['preview', 'late-preview', 'recap', 'season'],
      tags: ['current-season', 'record']
    });
    recordFacts.set(row.managerId, recordFact);
    const pointsFact = registry.add({
      semanticKey: `${packet.league.season}:through-w${throughWeek}:points-for:${row.managerId}`,
      kind: 'season_points_for',
      subject: { type: 'manager', id: row.managerId },
      value: round(row.pointsFor),
      unit: 'fantasy_points',
      state: 'derived',
      asOf: packet.league.capturedAt,
      context,
      claim: `${manager.label} scored ${score(row.pointsFor)} points through Week ${throughWeek}.`,
      sourceIds: sources,
      eligibleEditions: ['preview', 'late-preview', 'recap', 'season'],
      tags: ['current-season', 'scoring']
    });
    pointsFacts.set(row.managerId, pointsFact);
    const average = round(mean(row.weeklyScores.map((entry) => entry.score)));
    registry.add({
      semanticKey: `${packet.league.season}:through-w${throughWeek}:scoring-average:${row.managerId}`,
      kind: 'season_scoring_average',
      subject: { type: 'manager', id: row.managerId },
      value: average,
      unit: 'fantasy_points_per_week',
      state: 'derived',
      asOf: packet.league.capturedAt,
      context,
      claim: `${manager.label} averaged ${score(average)} points per week through Week ${throughWeek}.`,
      derivedFrom: [pointsFact.factId],
      eligibleEditions: ['preview', 'late-preview', 'recap', 'season'],
      tags: ['current-season', 'scoring-average']
    });
    const lastThree = row.weeklyScores.slice(-3);
    const recentAverage = round(mean(lastThree.map((entry) => entry.score)));
    registry.add({
      semanticKey: `${packet.league.season}:through-w${throughWeek}:last-three-average:${row.managerId}`,
      kind: 'season_last_three_average',
      subject: { type: 'manager', id: row.managerId },
      value: recentAverage,
      unit: 'fantasy_points_per_week',
      state: 'derived',
      asOf: packet.league.capturedAt,
      context: { ...context, sampleWeeks: lastThree.map((entry) => entry.week) },
      claim: `${manager.label} averaged ${score(recentAverage)} points over the most recent ${lastThree.length} completed week${lastThree.length === 1 ? '' : 's'}.`,
      sourceIds: sources,
      eligibleEditions: ['preview', 'late-preview', 'recap', 'season'],
      tags: ['current-season', 'recent-form']
    });
    registry.add({
      semanticKey: `${packet.league.season}:through-w${throughWeek}:all-play:${row.managerId}`,
      kind: 'season_all_play_record',
      subject: { type: 'manager', id: row.managerId },
      value: { wins: row.allPlayWins, losses: row.allPlayLosses, ties: row.allPlayTies },
      state: 'derived',
      asOf: packet.league.capturedAt,
      context,
      claim: `${manager.label}'s all-play record was ${row.allPlayWins}-${row.allPlayLosses}${row.allPlayTies ? `-${row.allPlayTies}` : ''} through Week ${throughWeek}.`,
      sourceIds: sources,
      eligibleEditions: ['preview', 'late-preview', 'recap', 'season'],
      tags: ['current-season', 'all-play']
    });
    const currentStreak = streak(row.results);
    if (currentStreak.length > 0) {
      registry.add({
        semanticKey: `${packet.league.season}:through-w${throughWeek}:streak:${row.managerId}`,
        kind: 'season_current_streak',
        subject: { type: 'manager', id: row.managerId },
        value: { result: currentStreak.type, length: currentStreak.length },
        state: 'derived',
        asOf: packet.league.capturedAt,
        context,
        claim: `${manager.label} carried a ${currentStreak.length}-game ${currentStreak.type === 'W' ? 'winning' : currentStreak.type === 'L' ? 'losing' : 'tie'} streak through Week ${throughWeek}.`,
        sourceIds: sources,
        eligibleEditions: ['preview', 'late-preview', 'recap', 'season'],
        tags: ['current-season', 'streak', `streak-${currentStreak.type.toLowerCase()}`]
      });
    }
  });
  const winningPercentage = (row) => {
    const games = row.wins + row.losses + row.ties;
    return games ? (row.wins + row.ties * 0.5) / games : 0;
  };
  const scoringRankFacts = new Map();
  active.forEach((row) => {
    const manager = packet.identities.resolve('manager', row.managerId);
    const rowPct = winningPercentage(row);
    const standingRank = 1 + active.filter((candidate) => {
      const candidatePct = winningPercentage(candidate);
      return candidatePct > rowPct || (candidatePct === rowPct && candidate.pointsFor > row.pointsFor);
    }).length;
    registry.add({
      semanticKey: `${packet.league.season}:through-w${throughWeek}:standing-rank:${row.managerId}`,
      kind: 'season_standing_rank',
      subject: { type: 'manager', id: row.managerId },
      value: standingRank,
      unit: 'rank',
      state: 'derived',
      asOf: packet.league.capturedAt,
      context: { ...context, rankingMethod: 'competition-rank-by-record-then-points' },
      claim: `${manager.label} held competition rank ${standingRank} in the standings through Week ${throughWeek}.`,
      derivedFrom: [recordFacts.get(row.managerId).factId, comparisonFact.factId],
      eligibleEditions: ['preview', 'late-preview', 'recap', 'season'],
      tags: ['current-season', 'standings']
    });
    const scoringRank = 1 + active.filter((candidate) => candidate.pointsFor > row.pointsFor).length;
    const scoringRankFact = registry.add({
      semanticKey: `${packet.league.season}:through-w${throughWeek}:scoring-rank:${row.managerId}`,
      kind: 'season_scoring_rank',
      subject: { type: 'manager', id: row.managerId },
      value: scoringRank,
      unit: 'rank',
      state: 'derived',
      asOf: packet.league.capturedAt,
      context: { ...context, rankingMethod: 'competition-rank-by-points' },
      claim: `${manager.label} held competition rank ${scoringRank} in season scoring through Week ${throughWeek}.`,
      derivedFrom: [pointsFacts.get(row.managerId).factId, comparisonFact.factId],
      eligibleEditions: ['preview', 'late-preview', 'recap', 'season'],
      tags: ['current-season', 'scoring-rank']
    });
    scoringRankFacts.set(row.managerId, scoringRankFact);
  });
  const scoringLeaders = active.filter((row) => scoringRankFacts.get(row.managerId).value === 1)
    .sort((left, right) => compareText(packet.identities.resolve('manager', left.managerId).label, packet.identities.resolve('manager', right.managerId).label));
  const firstLeader = scoringLeaders[0];
  const firstManager = packet.identities.resolve('manager', firstLeader.managerId);
  const otherManagers = scoringLeaders.slice(1).map((row) => packet.identities.resolve('manager', row.managerId));
  const leaderNames = [firstManager.label, ...otherManagers.map((manager) => manager.label)];
  registry.add({
    semanticKey: `${packet.league.season}:through-w${throughWeek}:season-scoring-leader`,
    kind: 'season_scoring_leader',
    subject: { type: 'manager', id: firstLeader.managerId },
    related: otherManagers.map((manager) => ({ type: 'manager', id: manager.id })),
    value: round(firstLeader.pointsFor),
    unit: 'fantasy_points',
    state: 'derived',
    asOf: packet.league.capturedAt,
    context,
    claim: scoringLeaders.length > 1
      ? `${leaderNames.join(' and ')} shared the season scoring lead through Week ${throughWeek} with ${score(firstLeader.pointsFor)} points.`
      : `${firstManager.label} led season scoring through Week ${throughWeek} with ${score(firstLeader.pointsFor)} points.`,
    derivedFrom: [comparisonFact.factId, ...scoringLeaders.flatMap((row) => [pointsFacts.get(row.managerId).factId, scoringRankFacts.get(row.managerId).factId])],
    eligibleEditions: ['preview', 'late-preview', 'recap', 'season'],
    tags: ['current-season', 'scoring-leader']
  });
  return rows;
}

function pairKey(managerAId, managerBId) {
  return JSON.stringify([String(managerAId), String(managerBId)].sort((left, right) => left < right ? -1 : left > right ? 1 : 0));
}

function addHistoricalFacts(packet, registry) {
  const throughWeek = Math.max(0, ...packet.seasonWeeks.filter((week) => week.final && week.week <= packet.league.week).map((week) => week.week));
  const historySources = packet.history.sourceIds;
  packet.history.canonicalClaims.forEach((row) => {
    registry.add({
      semanticKey: `history:canon:${row.semanticKey}`,
      kind: 'manager_canonical_lore',
      subject: { type: 'manager', id: row.managerId },
      value: row.claim,
      state: 'canonical',
      asOf: packet.league.capturedAt,
      context: { throughSeason: packet.league.season - 1 },
      claim: row.claim,
      sourceIds: historySources,
      eligibleEditions: ['preview', 'late-preview', 'recap', 'season'],
      tags: ['history', 'canonical-lore']
    });
  });
  if (historySources.length) {
    const titleCounts = new Map();
    packet.history.championships.forEach((row) => titleCounts.set(row.managerId, (titleCounts.get(row.managerId) || 0) + 1));
    titleCounts.forEach((count, managerId) => {
      const manager = packet.identities.resolve('manager', managerId);
      registry.add({
        semanticKey: `history:championship-count:${managerId}`,
        kind: 'manager_championship_count',
        subject: { type: 'manager', id: managerId },
        value: count,
        unit: 'championships',
        state: 'historical',
        asOf: packet.league.capturedAt,
        context: { throughSeason: packet.league.season - 1 },
        claim: `${manager.label} had won ${count} Farmhood championship${count === 1 ? '' : 's'} entering ${packet.league.season}.`,
        sourceIds: historySources,
        eligibleEditions: ['preview', 'late-preview', 'recap', 'season'],
        tags: ['history', 'championships']
      });
    });
  }

  const records = new Map();
  function addGame(managerAId, managerBId, scoreA, scoreB) {
    const ordered = [managerAId, managerBId].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
    const key = pairKey(managerAId, managerBId);
    const record = records.get(key) || { managerAId: ordered[0], managerBId: ordered[1], winsA: 0, winsB: 0, ties: 0, factSources: new Set() };
    const orderedScoreA = managerAId === record.managerAId ? scoreA : scoreB;
    const orderedScoreB = managerAId === record.managerAId ? scoreB : scoreA;
    if (orderedScoreA === orderedScoreB) record.ties += 1;
    else if (orderedScoreA > orderedScoreB) record.winsA += 1;
    else record.winsB += 1;
    records.set(key, record);
  }
  packet.history.headToHead.forEach((row) => {
    const ordered = [row.managerAId, row.managerBId].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
    const flip = ordered[0] !== row.managerAId;
    records.set(pairKey(...ordered), {
      managerAId: ordered[0], managerBId: ordered[1],
      winsA: flip ? row.winsB : row.winsA,
      winsB: flip ? row.winsA : row.winsB,
      ties: row.ties,
      factSources: new Set(packet.history.sourceIds)
    });
  });
  packet.seasonWeeks.filter((week) => week.final && week.week <= packet.league.week).forEach((week) => {
    week.matchups.forEach((matchup) => {
      const [a, b] = matchup.teams;
      addGame(a.managerId, b.managerId, a.score, b.score);
      week.sourceIds.forEach((sourceId) => records.get(pairKey(a.managerId, b.managerId)).factSources.add(sourceId));
    });
  });
  packet.currentWeek.matchups.forEach((matchup) => {
    const [currentA, currentB] = matchup.teams;
    const record = records.get(pairKey(currentA.managerId, currentB.managerId));
    if (!record) return;
    const managerA = packet.identities.resolve('manager', record.managerAId);
    const managerB = packet.identities.resolve('manager', record.managerBId);
    const games = record.winsA + record.winsB + record.ties;
    registry.add({
      semanticKey: `history:head-to-head:${digest([record.managerAId, record.managerBId], 16)}:through-${packet.league.season}-w${throughWeek}`,
      kind: 'head_to_head_record',
      subject: { type: 'manager', id: record.managerAId },
      related: [{ type: 'manager', id: record.managerBId }],
      value: { winsA: record.winsA, winsB: record.winsB, ties: record.ties, games },
      state: 'historical',
      asOf: packet.league.capturedAt,
      context: { season: packet.league.season, throughWeek },
      claim: `${managerA.label} was ${record.winsA}-${record.winsB}${record.ties ? `-${record.ties}` : ''} against ${managerB.label} across ${games} recorded meeting${games === 1 ? '' : 's'}.`,
      sourceIds: [...record.factSources],
      eligibleEditions: ['preview', 'late-preview', 'recap', 'season'],
      tags: ['history', 'head-to-head']
    });
  });

  if (packet.history.teamWeekScores.length && packet.league.phase === 'final') {
    const historicalScores = packet.history.teamWeekScores.map((row) => row.score).sort((left, right) => left - right);
    packet.currentWeek.matchups.flatMap((matchup) => matchup.teams).forEach((team) => {
      if (team.score === null) return;
      const atOrBelow = historicalScores.filter((value) => value <= team.score).length;
      const percentile = round(atOrBelow / historicalScores.length, 4);
      const teamScoreFact = registry.find({ kind: 'team_week_score', subjectKey: team.managerKey })[0];
      registry.add({
        semanticKey: `${packet.league.season}:w${packet.league.week}:historical-score-percentile:${team.managerId}`,
        kind: 'historical_week_score_percentile',
        subject: { type: 'manager', id: team.managerId },
        value: percentile,
        unit: 'ratio',
        state: 'historical',
        asOf: packet.league.capturedAt,
        context: { season: packet.league.season, week: packet.league.week, historicalSampleSize: historicalScores.length },
        claim: `${team.manager}'s ${score(team.score)} points ranked at the ${percent(percentile)} percentile of the verified historical team-week sample.`,
        sourceIds: packet.history.sourceIds,
        derivedFrom: teamScoreFact ? [teamScoreFact.factId] : [],
        eligibleEditions: ['recap', 'season'],
        tags: ['history', 'score-percentile']
      });
    });
  }
}

function addWeekSummaryFacts(packet, registry) {
  if (packet.league.phase === 'scheduled') return;
  const scoreFacts = registry.find({ kind: 'team_week_score' });
  if (!scoreFacts.length) return;
  const highScore = Math.max(...scoreFacts.map((fact) => Number(fact.value)));
  const highScorers = scoreFacts.filter((fact) => Number(fact.value) === highScore).sort((left, right) => compareText(left.subject.label, right.subject.label));
  const highest = highScorers[0];
  const highScoreNames = highScorers.map((fact) => fact.subject.label);
  registry.add({
    semanticKey: `${packet.league.season}:w${packet.league.week}:weekly-high-score`,
    kind: 'weekly_high_score',
    subject: { type: 'manager', id: highest.subject.id },
    related: highScorers.slice(1).map((fact) => ({ type: 'manager', id: fact.subject.id })),
    value: highScore,
    unit: 'fantasy_points',
    state: phaseState(packet.league.phase),
    asOf: packet.league.capturedAt,
    context: { season: packet.league.season, week: packet.league.week },
    claim: highScorers.length > 1
      ? `${highScoreNames.join(' and ')} ${packet.league.phase === 'final' ? 'tied for' : 'shared at capture time'} the Week ${packet.league.week} scoring lead at ${score(highScore)} points.`
      : packet.league.phase === 'final'
        ? `${highest.subject.label} had the Week ${packet.league.week} high score at ${score(highScore)} points.`
        : `${highest.subject.label} led Week ${packet.league.week} scoring at capture time with ${score(highScore)} points.`,
    derivedFrom: scoreFacts.map((fact) => fact.factId),
    eligibleEditions: currentEditions(packet.league.phase),
    tags: ['current-week', 'weekly-leader']
  });
  const margins = registry.find({ kind: 'matchup_margin' });
  if (!margins.length) return;
  const closest = margins.slice().sort((left, right) => left.value - right.value || left.context.matchupId - right.context.matchupId)[0];
  const largest = margins.slice().sort((left, right) => right.value - left.value || left.context.matchupId - right.context.matchupId)[0];
  registry.add({
    semanticKey: `${packet.league.season}:w${packet.league.week}:closest-game`,
    kind: 'weekly_closest_game',
    subject: { type: closest.subject.type, id: closest.subject.id },
    related: closest.related.map(({ type, id }) => ({ type, id })),
    value: closest.value,
    unit: 'fantasy_points',
    state: phaseState(packet.league.phase),
    asOf: packet.league.capturedAt,
    context: { season: packet.league.season, week: packet.league.week, matchupId: closest.context.matchupId },
    claim: packet.league.phase === 'final'
      ? `Matchup ${closest.context.matchupId} was Week ${packet.league.week}'s closest game at a ${score(closest.value)}-point margin.`
      : `Matchup ${closest.context.matchupId} had Week ${packet.league.week}'s smallest live margin at capture time: ${score(closest.value)} points.`,
    derivedFrom: margins.map((fact) => fact.factId),
    eligibleEditions: currentEditions(packet.league.phase),
    tags: ['current-week', packet.league.phase === 'final' ? 'close-game' : 'close-live-margin']
  });
  registry.add({
    semanticKey: `${packet.league.season}:w${packet.league.week}:largest-margin`,
    kind: 'weekly_largest_margin',
    subject: { type: largest.subject.type, id: largest.subject.id },
    related: largest.related.map(({ type, id }) => ({ type, id })),
    value: largest.value,
    unit: 'fantasy_points',
    state: phaseState(packet.league.phase),
    asOf: packet.league.capturedAt,
    context: { season: packet.league.season, week: packet.league.week, matchupId: largest.context.matchupId },
    claim: packet.league.phase === 'final'
      ? `Matchup ${largest.context.matchupId} had Week ${packet.league.week}'s largest margin at ${score(largest.value)} points.`
      : `Matchup ${largest.context.matchupId} had Week ${packet.league.week}'s largest live margin at capture time: ${score(largest.value)} points.`,
    derivedFrom: margins.map((fact) => fact.factId),
    eligibleEditions: currentEditions(packet.league.phase),
    tags: ['current-week', packet.league.phase === 'final' ? 'blowout' : 'largest-live-margin']
  });
}

function freshnessReport(packet, registry, maximumAgeMinutes) {
  const capture = Date.parse(packet.league.capturedAt);
  const currentSources = packet.currentWeek.sourceIds.map((sourceId) => registry.source(sourceId));
  const rows = currentSources.map((source) => {
    const ageMinutes = round((capture - Date.parse(source.observedAt)) / 60000, 2);
    invariant(ageMinutes >= -5, `Source ${source.sourceId} is dated materially after the reporting capture.`);
    return deepFreeze({ sourceId: source.sourceId, ageMinutes, stale: maximumAgeMinutes != null && ageMinutes > maximumAgeMinutes });
  });
  if (maximumAgeMinutes != null) {
    const stale = rows.filter((row) => row.stale);
    invariant(stale.length === 0, `Current reporting sources exceeded the ${maximumAgeMinutes}-minute freshness gate: ${stale.map((row) => row.sourceId).join(', ')}.`);
  }
  return deepFreeze({ capturedAt: packet.league.capturedAt, maximumAgeMinutes: maximumAgeMinutes ?? null, sources: rows });
}

function validatePacketProvenance(packet, registry) {
  const capturedAt = Date.parse(packet.league.capturedAt);
  registry.sources().forEach((source) => {
    invariant(Date.parse(source.retrievedAt) <= capturedAt, `Source ${source.sourceId} was retrieved after the reporting packet capture.`);
  });
  const currentSources = packet.currentWeek.sourceIds.map((sourceId) => registry.source(sourceId));
  if (packet.league.phase === 'final') {
    invariant(currentSources.every((source) => source.finality === 'final'), 'A final reporting packet requires final currentWeek source provenance.');
  }
  packet.seasonWeeks.filter((week) => week.final).forEach((week) => {
    invariant(week.sourceIds.every((sourceId) => registry.source(sourceId).finality === 'final'), `Finalized season Week ${week.week} requires final source provenance.`);
  });
  packet.history.sourceIds.forEach((sourceId) => {
    invariant(['historical', 'final', 'canonical'].includes(registry.source(sourceId).finality), `Historical source ${sourceId} has incompatible finality.`);
  });
  packet.currentWeek.matchups.flatMap((matchup) => matchup.teams).forEach((team) => {
    const projections = [team.projection, ...team.starters.map((player) => player.projection), ...team.bench.map((player) => player.projection)].filter(Boolean);
    projections.forEach((projection) => invariant(Date.parse(projection.asOf) <= capturedAt, `Projection as-of ${projection.asOf} is after the reporting packet capture.`));
    [...team.starters, ...team.bench].filter((player) => player.injuryAsOf).forEach((player) => {
      invariant(Date.parse(player.injuryAsOf) <= capturedAt, `Availability as-of ${player.injuryAsOf} for ${player.name} is after the reporting packet capture.`);
    });
  });
}

export function buildReportingPacket(raw, { maximumCurrentSourceAgeMinutes = null } = {}) {
  const packet = normalizeReportingInput(raw);
  const registry = new FactRegistry({ identities: packet.identities, sources: packet.sources });
  packet.currentWeek.sourceIds.forEach((sourceId) => invariant(registry.hasSource(sourceId), `Current week cites unknown source ${sourceId}.`));
  packet.seasonWeeks.flatMap((week) => week.sourceIds).forEach((sourceId) => invariant(registry.hasSource(sourceId), `Season history cites unknown source ${sourceId}.`));
  packet.history.sourceIds.forEach((sourceId) => invariant(registry.hasSource(sourceId), `Historical data cites unknown source ${sourceId}.`));
  validatePacketProvenance(packet, registry);
  const freshness = freshnessReport(packet, registry, maximumCurrentSourceAgeMinutes);
  addCurrentFacts(packet, registry);
  addSeasonFacts(packet, registry);
  addHistoricalFacts(packet, registry);
  addWeekSummaryFacts(packet, registry);
  return deepFreeze({
    schemaVersion: 1,
    league: packet.league,
    freshness,
    identities: packet.identities.toJSON(),
    sources: registry.sources(),
    facts: registry.list(),
    summary: {
      managerCount: packet.identities.list('manager').length,
      activeManagerCount: packet.identities.list('manager').filter((manager) => manager.active).length,
      playerCount: packet.identities.list('player').length,
      matchupCount: packet.currentWeek.matchups.length,
      completedSeasonWeeks: packet.seasonWeeks.filter((week) => week.final && week.week <= packet.league.week).length,
      factCount: registry.list().length
    }
  });
}

export function registryFromPacket(packet) {
  invariant(packet && packet.schemaVersion === 1, 'A Press V2 reporting packet is required.');
  const league = packet.identities.find((entity) => entity.type === 'league');
  const identities = createIdentityIndex({
    league: { leagueId: league.id, name: league.label, externalIds: league.externalIds },
    managers: packet.identities.filter((entity) => entity.type === 'manager').map((entity) => ({
      managerId: entity.id,
      displayName: entity.label,
      ownerId: entity.ownerId,
      rosterId: entity.rosterId,
      active: entity.active,
      externalIds: entity.externalIds
    })),
    players: packet.identities.filter((entity) => entity.type === 'player').map((entity) => ({
      playerId: entity.id,
      fullName: entity.label,
      position: entity.position,
      nflTeam: entity.nflTeam,
      externalIds: entity.externalIds
    }))
  });
  const registry = new FactRegistry({ identities, sources: packet.sources });
  let pending = packet.facts.slice();
  while (pending.length) {
    let added = 0;
    pending = pending.filter((fact) => {
      if (!fact.derivedFrom.every((factId) => registry.has(factId))) return true;
      registry.add({
        ...fact,
        subject: { type: fact.subject.type, id: fact.subject.id },
        related: fact.related.map(({ type, id }) => ({ type, id }))
      });
      added += 1;
      return false;
    });
    invariant(added > 0, `Reporting packet contains unresolved or cyclic fact lineage: ${pending.map((fact) => fact.factId).join(', ')}.`);
  }
  return registry;
}
