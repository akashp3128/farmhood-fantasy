import { invariant } from '../utils.mjs';

function phaseKey(snapshot) {
  return typeof snapshot?.phase === 'string' ? snapshot.phase : snapshot?.phase?.key;
}

function sourceId(snapshot, role) {
  return `snapshot:${snapshot.season}:w${snapshot.week}:${role}`;
}

function sourceFor(snapshot, role, finality = phaseKey(snapshot)) {
  const timestamp = snapshot.factsAsOf || snapshot.generatedAt;
  invariant(timestamp, `The ${role} snapshot needs factsAsOf or generatedAt.`);
  const leagueId = snapshot?.league?.leagueId || snapshot?.league?.id || '1377086848295260160';
  return {
    sourceId: sourceId(snapshot, role),
    provider: 'Sleeper + Farmhood deterministic snapshot',
    dataset: `${snapshot.season} Week ${snapshot.week} ${role} snapshot`,
    retrievedAt: timestamp,
    observedAt: timestamp,
    finality,
    uri: `https://api.sleeper.app/v1/league/${leagueId}/matchups/${snapshot.week}`,
    contentHash: snapshot.id || null,
    licenseClass: 'first-party-derived'
  };
}

function canonSource(capturedAt) {
  return {
    sourceId: 'canon:managers',
    provider: 'Farmhood verified canon',
    dataset: 'Manager championship history',
    retrievedAt: capturedAt,
    observedAt: capturedAt,
    finality: 'canonical',
    licenseClass: 'first-party'
  };
}

function managerIdFor(displayName, managersCanon) {
  const manager = (managersCanon?.managers || []).find((row) => row.displayName === displayName);
  invariant(manager?.ownerId, `No canonical owner ID exists for ${displayName}.`);
  return String(manager.ownerId);
}

function matchupScore(snapshot, rosterId) {
  const matchup = (snapshot.matchups || []).find((row) => Number(row.rosterIdA) === Number(rosterId) || Number(row.rosterIdB) === Number(rosterId));
  invariant(matchup, `Roster ${rosterId} has no matchup in the current snapshot.`);
  return Number(matchup.rosterIdA) === Number(rosterId) ? matchup.currentScoreA : matchup.currentScoreB;
}

function teamByRoster(snapshot) {
  return new Map((snapshot?.teams || []).map((team) => [Number(team.rosterId), team]));
}

function projectionKind(snapshot) {
  const phase = phaseKey(snapshot);
  return phase === 'live' ? 'late-outlook' : 'pregame';
}

function projectedTeamValue(team, snapshot) {
  if (!team) return null;
  if (phaseKey(snapshot) === 'live') return team.forecastScore ?? team.projectedScore ?? null;
  return team.projectedScore ?? null;
}

function projectedPlayerValue(player) {
  const value = Number(player?.projection);
  return Number.isFinite(value) ? value : null;
}

function playerPoints(player, activePhase) {
  if (activePhase === 'scheduled') return null;
  if (activePhase === 'live' && player?.gameStatus === 'pre_game') return null;
  const value = Number(player?.points);
  return Number.isFinite(value) ? value : null;
}

function normalizeStarter(player, baselinePlayer, baselineSnapshot, activeSnapshot, activePhase, capturedAt) {
  const projectionValue = projectedPlayerValue(baselinePlayer);
  return {
    playerId: String(player.id),
    slot: player.slot,
    position: player.position,
    points: playerPoints(player, activePhase),
    ...(projectionValue === null ? {} : {
      projection: {
        value: projectionValue,
        kind: projectionKind(baselineSnapshot),
        asOf: baselineSnapshot.factsAsOf || baselineSnapshot.generatedAt,
        sourceIds: [sourceId(baselineSnapshot, phaseKey(baselineSnapshot) === 'live' ? 'late-outlook' : 'pregame')]
      }
    }),
    availableAtLock: true,
    locked: Boolean(player.locked),
    injuryStatus: player.injuryStatus || null,
    injuryAsOf: player.injuryStatus ? capturedAt : null,
    injurySourceIds: player.injuryStatus
      ? [sourceId(activeSnapshot, activePhase === 'final' ? 'final' : activePhase === 'live' ? 'late-outlook' : 'pregame')]
      : []
  };
}

function currentTeam(team, currentSnapshot, baselineSnapshot, managersCanon) {
  const activePhase = phaseKey(currentSnapshot);
  const baseline = teamByRoster(baselineSnapshot).get(Number(team.rosterId));
  const baselinePlayers = new Map((baseline?.starters || []).map((player) => [String(player.id), player]));
  const projectionValue = projectedTeamValue(baseline, baselineSnapshot);
  return {
    managerId: managerIdFor(team.manager, managersCanon),
    score: activePhase === 'scheduled' ? null : matchupScore(currentSnapshot, team.rosterId),
    ...(projectionValue === null ? {} : {
      projection: {
        value: projectionValue,
        kind: projectionKind(baselineSnapshot),
        asOf: baselineSnapshot.factsAsOf || baselineSnapshot.generatedAt,
        sourceIds: [sourceId(baselineSnapshot, phaseKey(baselineSnapshot) === 'live' ? 'late-outlook' : 'pregame')]
      }
    }),
    starters: (team.starters || []).map((player) => normalizeStarter(
      player,
      baselinePlayers.get(String(player.id)),
      baselineSnapshot,
      currentSnapshot,
      activePhase,
      currentSnapshot.factsAsOf || currentSnapshot.generatedAt
    )),
    bench: [],
    emptySlots: team.emptySlots || []
  };
}

function seasonWeek(snapshot, managersCanon) {
  invariant(phaseKey(snapshot) === 'final', `Week ${snapshot.week} season history must use a final snapshot.`);
  return {
    week: Number(snapshot.week),
    final: true,
    sourceIds: [sourceId(snapshot, 'final')],
    matchups: (snapshot.matchups || []).map((matchup) => ({
      matchupId: Number(matchup.matchupId),
      teams: [
        { managerId: managerIdFor(matchup.managerA, managersCanon), score: Number(matchup.currentScoreA) },
        { managerId: managerIdFor(matchup.managerB, managersCanon), score: Number(matchup.currentScoreB) }
      ]
    }))
  };
}

/**
 * Adapts the immutable production snapshots into the isolated V2 reporting input.
 * It intentionally does not infer bench players because production snapshots only
 * preserve starters. V2 will omit bench counterfactuals when that evidence is absent.
 */
export function buildReportingInputFromSnapshots({
  currentSnapshot,
  referenceSnapshot = currentSnapshot,
  seasonSnapshots = [],
  leagueCanon,
  managersCanon
}) {
  invariant(currentSnapshot && referenceSnapshot, 'Current and reference snapshots are required.');
  invariant(Number(currentSnapshot.season) === Number(referenceSnapshot.season) && Number(currentSnapshot.week) === Number(referenceSnapshot.week), 'The reference snapshot must describe the same season and week.');
  const activePhase = phaseKey(currentSnapshot);
  invariant(['scheduled', 'live', 'final'].includes(activePhase), `Unsupported production snapshot phase ${activePhase}.`);
  if (activePhase === 'final') invariant(['scheduled', 'live'].includes(phaseKey(referenceSnapshot)), 'A final recap requires the pregame or live outlook snapshot as its projection baseline.');

  const currentRole = activePhase === 'final' ? 'final' : activePhase === 'live' ? 'late-outlook' : 'pregame';
  const referenceRole = phaseKey(referenceSnapshot) === 'live' ? 'late-outlook' : 'pregame';
  const sourceRows = [
    sourceFor(currentSnapshot, currentRole, activePhase === 'scheduled' ? 'provisional' : activePhase),
    ...(referenceSnapshot === currentSnapshot ? [] : [sourceFor(referenceSnapshot, referenceRole, 'provisional')]),
    ...seasonSnapshots.map((snapshot) => sourceFor(snapshot, 'final', 'final')),
    canonSource(currentSnapshot.factsAsOf || currentSnapshot.generatedAt)
  ];
  const sources = [...new Map(sourceRows.map((source) => [source.sourceId, source])).values()];
  const teams = teamByRoster(currentSnapshot);
  const managers = (currentSnapshot.teams || []).map((team) => ({
    managerId: managerIdFor(team.manager, managersCanon),
    displayName: team.manager,
    ownerId: managerIdFor(team.manager, managersCanon),
    rosterId: String(team.rosterId),
    externalIds: { sleeper: managerIdFor(team.manager, managersCanon) }
  }));
  const playerRows = (currentSnapshot.teams || []).flatMap((team) => team.starters || []).map((player) => ({
    playerId: String(player.id),
    fullName: player.name,
    position: player.position,
    nflTeam: player.team || null,
    externalIds: { sleeper: String(player.id) }
  }));
  const players = [...new Map(playerRows.map((player) => [player.playerId, player])).values()];

  const currentWeekSourceIds = [sourceId(currentSnapshot, currentRole)];
  return {
    league: {
      leagueId: String(leagueCanon?.leagueId || currentSnapshot?.league?.leagueId || '1377086848295260160'),
      name: leagueCanon?.name || currentSnapshot?.league?.name || 'Farmhood Fantasy',
      season: Number(currentSnapshot.season),
      week: Number(currentSnapshot.week),
      phase: activePhase,
      capturedAt: currentSnapshot.factsAsOf || currentSnapshot.generatedAt,
      externalIds: { sleeper: String(leagueCanon?.leagueId || '1377086848295260160') }
    },
    sources,
    managers,
    players,
    currentWeek: {
      sourceIds: currentWeekSourceIds,
      matchups: (currentSnapshot.matchups || []).map((matchup) => ({
        matchupId: Number(matchup.matchupId),
        startedAtCapture: activePhase === 'final' ? true : Boolean(matchup.startedAtCapture),
        teams: [
          currentTeam(teams.get(Number(matchup.rosterIdA)), currentSnapshot, referenceSnapshot, managersCanon),
          currentTeam(teams.get(Number(matchup.rosterIdB)), currentSnapshot, referenceSnapshot, managersCanon)
        ]
      }))
    },
    seasonWeeks: seasonSnapshots
      .filter((snapshot) => Number(snapshot.week) <= Number(currentSnapshot.week))
      .sort((left, right) => Number(left.week) - Number(right.week))
      .map((snapshot) => seasonWeek(snapshot, managersCanon)),
    history: {
      sourceIds: ['canon:managers'],
      teamWeekScores: [],
      championships: (managersCanon?.managers || []).flatMap((manager) => (manager.approvedLore || [])
        .flatMap((lore) => (lore.factIds || [])
          .map((factId) => /^champion:(\d{4})$/.exec(String(factId)))
          .filter(Boolean)
          .map((match) => ({ season: Number(match[1]), managerId: String(manager.ownerId) })))),
      headToHeadBeforeSeason: [],
      canonicalClaims: (managersCanon?.managers || []).flatMap((manager, managerIndex) => (manager.approvedLore || []).map((lore, loreIndex) => ({
        semanticKey: `manager-${managerIndex + 1}-lore-${loreIndex + 1}`,
        managerId: String(manager.ownerId),
        claim: lore.summary
      })))
    }
  };
}
