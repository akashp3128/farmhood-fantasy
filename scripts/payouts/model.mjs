import { assert, round, stableStringify } from '../press/utils.mjs';

const SCORE_SCALE = 100;

export function scoreUnits(value) {
  assert(Number.isFinite(Number(value)), `Invalid fantasy score: ${value}`);
  return Math.round(Number(value) * SCORE_SCALE);
}

export function displayScore(units) {
  return round(Number(units) / SCORE_SCALE, 2);
}

export function dollarsToCents(value) {
  const cents = Math.round(Number(value) * 100);
  assert(Number.isInteger(cents) && cents >= 0, `Invalid payout amount: ${value}`);
  return cents;
}

export function validateConfig(config) {
  assert(config?.schemaVersion === 1 && config.season === 2026, 'Payout configuration must be schema version 1 for 2026.');
  assert(/^\d{6,24}$/.test(String(config.leagueId || '')), 'Payout league ID is invalid.');
  assert(config.regularSeasonWeeks === 14, 'The payout schedule must contain 14 regular-season weeks.');
  assert(Array.isArray(config.managers) && config.managers.length === config.pot.teams, 'The payout manager list is incomplete.');
  const ownerIds = new Set(), managers = new Set(), rosterIds = new Set();
  config.managers.forEach((manager) => {
    assert(/^\d{6,24}$/.test(String(manager.ownerId || '')) && !ownerIds.has(manager.ownerId), `Invalid or duplicate payout owner: ${manager.ownerId}`);
    assert(typeof manager.manager === 'string' && manager.manager && !managers.has(manager.manager), `Invalid or duplicate payout manager: ${manager.manager}`);
    assert(Number.isInteger(manager.rosterId) && manager.rosterId > 0 && !rosterIds.has(manager.rosterId), `Invalid or duplicate payout roster: ${manager.rosterId}`);
    ownerIds.add(manager.ownerId);managers.add(manager.manager);rosterIds.add(manager.rosterId);
  });
  const allowedPositions = new Set(['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DEF']);
  for (let week = 1; week <= config.regularSeasonWeeks; week += 1) {
    assert(allowedPositions.has(config.positionSchedule[String(week)]), `Week ${week} has an invalid position prize.`);
  }
  assert(Array.isArray(config.rivalries) && config.rivalries.length === 6, 'Exactly six rivalry payouts are required.');
  const rivalryWeeks = new Set(), rivalryIds = new Set();
  config.rivalries.forEach((rivalry) => {
    assert(Number.isInteger(rivalry.week) && rivalry.week >= 1 && rivalry.week <= 14 && !rivalryWeeks.has(rivalry.week), `Invalid or duplicate rivalry week: ${rivalry.week}`);
    assert(Number.isInteger(rivalry.matchupId) && rivalry.matchupId > 0, `Rivalry Week ${rivalry.week} has no verified matchup ID.`);
    assert(rivalry.id && !rivalryIds.has(rivalry.id), `Invalid or duplicate rivalry ID: ${rivalry.id}`);
    assert(managers.has(rivalry.managerA) && managers.has(rivalry.managerB) && rivalry.managerA !== rivalry.managerB, `Invalid rivalry managers for Week ${rivalry.week}.`);
    rivalryWeeks.add(rivalry.week);rivalryIds.add(rivalry.id);
  });
  const seasonPoolCents = Object.values(config.seasonPrizes).reduce((sum, value) => sum + dollarsToCents(value), 0);
  const weeklyHighPoolCents = dollarsToCents(config.weeklyPrizes.highestScore) * config.regularSeasonWeeks;
  const positionPoolCents = dollarsToCents(config.weeklyPrizes.positionLeader) * config.regularSeasonWeeks;
  const rivalryPoolCents = dollarsToCents(config.rivalryPrize) * config.rivalries.length;
  const totalCents = dollarsToCents(config.pot.total);
  assert(dollarsToCents(config.pot.buyIn) * config.pot.teams === totalCents, 'Buy-ins do not reconcile to the configured pot.');
  assert(seasonPoolCents + weeklyHighPoolCents + positionPoolCents + rivalryPoolCents === totalCents, 'Payout categories do not reconcile to the configured pot.');
  return { totalCents, seasonPoolCents, weeklyHighPoolCents, positionPoolCents, rivalryPoolCents };
}

function uniqueOwners(leaders) {
  const byOwner = new Map();
  leaders.forEach((leader) => {
    if (!byOwner.has(leader.ownerId)) byOwner.set(leader.ownerId, leader);
  });
  return [...byOwner.values()].sort((left, right) => left.ownerId.localeCompare(right.ownerId));
}

export function allocatePrize(awardCents, leaders) {
  const owners = uniqueOwners(leaders);
  assert(owners.length > 0, 'A finalized prize must have at least one recipient.');
  const base = Math.floor(awardCents / owners.length), remainder = awardCents - base * owners.length;
  return owners.map((leader, index) => ({
    ownerId: leader.ownerId,
    rosterId: leader.rosterId,
    manager: leader.manager,
    firstName: leader.firstName,
    shareCents: base + (index < remainder ? 1 : 0)
  }));
}

function topScorers(rows, field = 'scoreUnits') {
  assert(rows.length > 0, 'A finalized prize has no eligible scores.');
  const maximum = Math.max(...rows.map((row) => row[field]));
  return rows.filter((row) => row[field] === maximum);
}

function identityFields(row) {
  return { ownerId: row.ownerId, rosterId: row.rosterId, manager: row.manager, firstName: row.firstName };
}

function pendingPrize(awardCents) {
  return { status: 'pending', awardCents, leaders: [], allocations: [] };
}

function rivalryShell(config, week) {
  const rivalry = config.rivalries.find((item) => item.week === week);
  if (!rivalry) return null;
  const managers = new Map(config.managers.map((manager) => [manager.manager, manager]));
  return {
    id: rivalry.id,
    week,
    matchupId: rivalry.matchupId,
    status: 'pending',
    awardCents: dollarsToCents(config.rivalryPrize),
    participants: [managers.get(rivalry.managerA), managers.get(rivalry.managerB)].map((manager) => identityFields(manager)),
    scores: [],
    leaders: [],
    allocations: []
  };
}

export function pendingWeek(config, week) {
  const position = config.positionSchedule[String(week)];
  return {
    week,
    status: 'pending',
    position,
    highScore: pendingPrize(dollarsToCents(config.weeklyPrizes.highestScore)),
    positionPrize: { ...pendingPrize(dollarsToCents(config.weeklyPrizes.positionLeader)), position, players: [] },
    rivalry: rivalryShell(config, week),
    finalizedAt: null,
    correctedAt: null,
    sourceDigest: null
  };
}

export function finalizedWeek(config, week, rows, sourceDigest) {
  assert(Array.isArray(rows) && rows.length === config.managers.length, `Week ${week} does not contain all league rosters.`);
  const uniqueRosters = new Set(rows.map((row) => row.rosterId));
  assert(uniqueRosters.size === config.managers.length, `Week ${week} contains duplicate rosters.`);
  const groups = new Map();
  rows.forEach((row) => {
    assert(Number.isInteger(row.matchupId) && Number.isInteger(row.scoreUnits), `Week ${week} has an invalid matchup result.`);
    if (!groups.has(row.matchupId)) groups.set(row.matchupId, []);
    groups.get(row.matchupId).push(row);
  });
  assert(groups.size === config.managers.length / 2 && [...groups.values()].every((group) => group.length === 2), `Week ${week} does not contain six two-team matchups.`);

  const teamLeaders = topScorers(rows);
  const highLeaders = teamLeaders.map((row) => ({ ...identityFields(row), score: displayScore(row.scoreUnits) }));
  const highAwardCents = dollarsToCents(config.weeklyPrizes.highestScore);
  const target = config.positionSchedule[String(week)];
  const players = rows.flatMap((row) => row.starters
    .filter((player) => player.id !== '0' && (target === 'FLEX' ? player.slot === 'FLEX' : player.position === target))
    .map((player) => ({ ...identityFields(row), playerId: player.id, playerName: player.name, position: player.position, slot: player.slot, scoreUnits: player.scoreUnits })));
  assert(players.length > 0, `Week ${week} has no eligible ${target} starters.`);
  const playerLeaders = topScorers(players).map((player) => ({
    ...identityFields(player),
    playerId: player.playerId,
    playerName: player.playerName,
    position: player.position,
    slot: player.slot,
    score: displayScore(player.scoreUnits)
  }));
  const positionAwardCents = dollarsToCents(config.weeklyPrizes.positionLeader);
  const rivalry = rivalryShell(config, week);
  if (rivalry) {
    const configured = config.rivalries.find((item) => item.week === week);
    const sides = [configured.managerA, configured.managerB].map((manager) => rows.find((row) => row.manager === manager));
    assert(sides.every(Boolean), `Week ${week} rivalry managers are missing from the matchup feed.`);
    assert(sides[0].matchupId === sides[1].matchupId, `Week ${week} rivalry managers are not scheduled against one another.`);
    assert(sides[0].matchupId === configured.matchupId, `Week ${week} rivalry moved from verified matchup ${configured.matchupId}.`);
    const rivalryLeaders = topScorers(sides).map((row) => ({ ...identityFields(row), score: displayScore(row.scoreUnits) }));
    rivalry.status = 'final';
    rivalry.scores = sides.map((row) => ({ ...identityFields(row), score: displayScore(row.scoreUnits) }));
    rivalry.leaders = rivalryLeaders;
    rivalry.allocations = allocatePrize(rivalry.awardCents, rivalryLeaders);
  }
  return {
    week,
    status: 'final',
    position: target,
    highScore: { status: 'final', awardCents: highAwardCents, leaders: highLeaders, allocations: allocatePrize(highAwardCents, highLeaders) },
    positionPrize: { status: 'final', awardCents: positionAwardCents, position: target, players: playerLeaders, leaders: uniqueOwners(playerLeaders).map(identityFields), allocations: allocatePrize(positionAwardCents, playerLeaders) },
    rivalry,
    finalizedAt: null,
    correctedAt: null,
    sourceDigest
  };
}

function seasonPrize(key, label, awardCents) {
  return { key, label, status: 'pending', awardCents, leaders: [], allocations: [] };
}

export function buildSeasonPrizes(config, weekly, bracket) {
  const prizes = [
    seasonPrize('firstPlace', 'First Place', dollarsToCents(config.seasonPrizes.firstPlace)),
    seasonPrize('secondPlace', 'Second Place', dollarsToCents(config.seasonPrizes.secondPlace)),
    seasonPrize('thirdPlace', 'Third Place', dollarsToCents(config.seasonPrizes.thirdPlace)),
    seasonPrize('regularSeasonPointsLeader', 'Regular-Season Points Champion', dollarsToCents(config.seasonPrizes.regularSeasonPointsLeader))
  ];
  const finalWeeks = weekly.filter((item) => item.status === 'final');
  if (finalWeeks.length === config.regularSeasonWeeks) {
    const totals = new Map(config.managers.map((manager) => [manager.manager, { ...manager, scoreUnits: 0 }]));
    finalWeeks.forEach((item) => item.teamScores.forEach((score) => { totals.get(score.manager).scoreUnits += score.scoreUnits; }));
    const leaders = topScorers([...totals.values()]);
    const pointsPrize = prizes.find((prize) => prize.key === 'regularSeasonPointsLeader');
    pointsPrize.status = 'provisional';
    pointsPrize.leaders = leaders.map((leader) => ({ ...identityFields(leader), score: displayScore(leader.scoreUnits) }));
  }
  const title = (bracket || []).find((item) => Number(item.p) === 1);
  const third = (bracket || []).find((item) => Number(item.p) === 3);
  const byRoster = new Map(config.managers.map((manager) => [manager.rosterId, manager]));
  const complete = title?.w && title?.l && third?.w && byRoster.has(Number(title.w)) && byRoster.has(Number(title.l)) && byRoster.has(Number(third.w));
  if (!complete) return { status: 'pending', prizes };
  const placements = [
    ['firstPlace', byRoster.get(Number(title.w))],
    ['secondPlace', byRoster.get(Number(title.l))],
    ['thirdPlace', byRoster.get(Number(third.w))]
  ];
  placements.forEach(([key, manager]) => {
    const prize = prizes.find((item) => item.key === key), leaders = [identityFields(manager)];
    prize.status = 'final';prize.leaders = leaders;prize.allocations = allocatePrize(prize.awardCents, leaders);
  });
  const pointsPrize = prizes.find((prize) => prize.key === 'regularSeasonPointsLeader');
  assert(pointsPrize.leaders.length > 0, 'The playoff bracket is final before all regular-season scoring was reconciled.');
  pointsPrize.status = 'final';pointsPrize.allocations = allocatePrize(pointsPrize.awardCents, pointsPrize.leaders);
  return { status: 'final', prizes };
}

export function attachTeamScores(week, rows) {
  return { ...week, teamScores: rows.map((row) => ({ ...identityFields(row), scoreUnits: row.scoreUnits, score: displayScore(row.scoreUnits) })) };
}

export function preserveRevision(next, previous, now) {
  if (!previous || previous.status !== 'final' || next.status !== 'final') return { ...next, finalizedAt: next.status === 'final' ? now : null };
  const comparable = (value) => {
    const copy = structuredClone(value);delete copy.finalizedAt;delete copy.correctedAt;return copy;
  };
  if (stableStringify(comparable(next)) === stableStringify(comparable(previous))) {
    return { ...next, finalizedAt: previous.finalizedAt, correctedAt: previous.correctedAt || null };
  }
  return { ...next, finalizedAt: previous.finalizedAt || now, correctedAt: now };
}

export function managerTotals(config, weekly, season) {
  const rows = new Map(config.managers.map((manager) => [manager.ownerId, {
    ...manager,
    weeklyHighCents: 0,
    positionCents: 0,
    rivalryCents: 0,
    seasonCents: 0,
    totalCents: 0
  }]));
  const add = (allocations, field) => (allocations || []).forEach((allocation) => {
    const row = rows.get(allocation.ownerId);assert(row, `Unknown payout recipient: ${allocation.ownerId}`);
    row[field] += allocation.shareCents;row.totalCents += allocation.shareCents;
  });
  weekly.forEach((week) => {
    add(week.highScore.allocations, 'weeklyHighCents');
    add(week.positionPrize.allocations, 'positionCents');
    if (week.rivalry) add(week.rivalry.allocations, 'rivalryCents');
  });
  (season.prizes || []).forEach((prize) => add(prize.allocations, 'seasonCents'));
  return [...rows.values()].sort((left, right) => right.totalCents - left.totalCents || left.manager.localeCompare(right.manager));
}
