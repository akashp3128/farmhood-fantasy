import path from 'node:path';
import { appendFile } from 'node:fs/promises';
import {
  assert,
  digest,
  fetchJson,
  parseCli,
  readJsonIfExists,
  repoRoot,
  safeText,
  writeJsonAtomic
} from '../press/utils.mjs';
import {
  attachTeamScores,
  buildSeasonPrizes,
  displayScore,
  finalizedWeek,
  managerTotals,
  pendingWeek,
  preserveRevision,
  scoreUnits,
  validateConfig
} from './model.mjs';

const API = 'https://api.sleeper.app/v1';
const DEFENSE_NAMES = Object.freeze({
  ARI: 'Arizona Cardinals', ATL: 'Atlanta Falcons', BAL: 'Baltimore Ravens', BUF: 'Buffalo Bills', CAR: 'Carolina Panthers',
  CHI: 'Chicago Bears', CIN: 'Cincinnati Bengals', CLE: 'Cleveland Browns', DAL: 'Dallas Cowboys', DEN: 'Denver Broncos',
  DET: 'Detroit Lions', GB: 'Green Bay Packers', HOU: 'Houston Texans', IND: 'Indianapolis Colts', JAX: 'Jacksonville Jaguars',
  KC: 'Kansas City Chiefs', LAC: 'Los Angeles Chargers', LAR: 'Los Angeles Rams', LV: 'Las Vegas Raiders', MIA: 'Miami Dolphins',
  MIN: 'Minnesota Vikings', NE: 'New England Patriots', NO: 'New Orleans Saints', NYG: 'New York Giants', NYJ: 'New York Jets',
  PHI: 'Philadelphia Eagles', PIT: 'Pittsburgh Steelers', SEA: 'Seattle Seahawks', SF: 'San Francisco 49ers', TB: 'Tampa Bay Buccaneers',
  TEN: 'Tennessee Titans', WAS: 'Washington Commanders'
});

function finite(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function officialTeamScore(row) {
  const value = row?.custom_points ?? row?.points;
  assert(finite(value), `Roster ${row?.roster_id || '?'} has no official team score.`);
  return Number(value);
}

function seasonPoints(settings) {
  const whole = Number(settings?.fpts || 0), decimal = Math.abs(Number(settings?.fpts_decimal || 0)) / 100;
  return whole < 0 ? whole - decimal : whole + decimal;
}

function currentRosterIdentities(rosters, config) {
  const byOwner = new Map(config.managers.map((manager) => [manager.ownerId, manager]));
  const seen = new Set();
  const identities = new Map((rosters || []).map((roster) => {
    const ownerId = String(roster?.owner_id || '');
    const manager = byOwner.get(ownerId);
    assert(manager, `Sleeper roster ${roster?.roster_id || '?'} is not assigned to a configured payout owner.`);
    assert(Number(roster.roster_id) === manager.rosterId, `${manager.manager} moved from configured roster ${manager.rosterId} to ${roster.roster_id}; payout review is required.`);
    assert(!seen.has(ownerId), `Payout owner ${ownerId} appears on multiple rosters.`);
    const coOwners = (roster.co_owners || []).filter(Boolean);
    assert(coOwners.length === 0, `${manager.manager} has co-owners; configure the payout recipient before reconciliation.`);
    seen.add(ownerId);
    return [manager.rosterId, { ...manager, officialSeasonPoints: seasonPoints(roster.settings), games: Number(roster.settings?.wins || 0) + Number(roster.settings?.losses || 0) + Number(roster.settings?.ties || 0) }];
  }));
  assert(identities.size === config.managers.length, 'Sleeper did not return all configured payout rosters.');
  return identities;
}

function playerInfo(playerId, players) {
  if (DEFENSE_NAMES[playerId]) return { name: `${DEFENSE_NAMES[playerId]} D/ST`, position: 'DEF' };
  const player = players?.[playerId];
  assert(player && /^[A-Z_]{1,12}$/.test(String(player.position || '').toUpperCase()), `Player metadata is missing for starter ${playerId}.`);
  const name = safeText(player.full_name || `${player.first_name || ''} ${player.last_name || ''}`, 80);
  assert(name, `Player name is missing for starter ${playerId}.`);
  return { name, position: String(player.position).toUpperCase() };
}

function normalizeWeek(rawRows, rosterPositions, identities, players, week) {
  const slots = rosterPositions.filter((slot) => slot !== 'BN');
  assert(slots.length > 0, 'Sleeper returned no starting lineup slots.');
  return (rawRows || []).map((raw) => {
    const rosterId = Number(raw.roster_id), identity = identities.get(rosterId);
    assert(identity, `Week ${week} contains unknown roster ${rosterId}.`);
    const starters = Array.isArray(raw.starters) ? raw.starters.map((id) => String(id || '0')) : [];
    const starterPoints = Array.isArray(raw.starters_points) ? raw.starters_points : [];
    assert(starters.length === slots.length && starterPoints.length === starters.length, `Week ${week} roster ${rosterId} has an incomplete final starting lineup.`);
    const pointsByPlayer = raw.players_points || {};
    const normalizedStarters = starters.map((id, index) => {
      if (id === '0') return { id, slot: slots[index], name: 'Empty slot', position: slots[index], scoreUnits: 0 };
      const indexed = starterPoints[index], mapped = pointsByPlayer[id];
      assert(finite(indexed) || finite(mapped), `Week ${week} starter ${id} has no final score.`);
      if (finite(indexed) && finite(mapped)) assert(Math.abs(Number(indexed) - Number(mapped)) <= 0.011, `Week ${week} starter ${id} has conflicting official scores.`);
      const score = finite(mapped) ? Number(mapped) : Number(indexed), info = playerInfo(id, players);
      return { id, slot: slots[index], name: info.name, position: info.position, scoreUnits: scoreUnits(score) };
    });
    return {
      ...identity,
      matchupId: Number(raw.matchup_id),
      scoreUnits: scoreUnits(officialTeamScore(raw)),
      starters: normalizedStarters
    };
  }).sort((left, right) => left.rosterId - right.rosterId);
}

function auditSeasonPoints(weekly, identities, completedThrough) {
  if (completedThrough < 14) return [];
  const sums = new Map([...identities.values()].map((identity) => [identity.rosterId, 0]));
  weekly.filter((week) => week.status === 'final').forEach((week) => week.teamScores.forEach((row) => sums.set(row.rosterId, sums.get(row.rosterId) + row.scoreUnits)));
  const flags = [];
  identities.forEach((identity, rosterId) => {
    const weeklyTotal = displayScore(sums.get(rosterId)), official = Number(identity.officialSeasonPoints.toFixed(2));
    if (Math.abs(weeklyTotal - official) > 0.011) flags.push({ code: 'season_points_mismatch', manager: identity.manager, weeklyTotal, sleeperTotal: official });
  });
  return flags;
}

async function workflowOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${name}=${String(value).replace(/[\r\n]/g, ' ')}\n`, 'utf8');
}

async function workflowSummary(lines) {
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`, 'utf8');
}

async function main() {
  const options = parseCli(process.argv.slice(2)), root = repoRoot(import.meta.url);
  const configPath = path.join(root, 'content', 'payouts', '2026-config.json');
  const ledgerPath = path.join(root, 'content', 'payouts', '2026.json');
  const config = await readJsonIfExists(configPath), allocation = validateConfig(config);
  const now = options.now ? new Date(options.now) : new Date();
  assert(Number.isFinite(now.getTime()), `Invalid --now timestamp: ${options.now}`);
  const existing = await readJsonIfExists(ledgerPath);
  if (options.scheduled) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(now).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    const localDate = `${parts.year}-${parts.month}-${parts.day}`;
    if (localDate < '2026-09-01' || localDate > '2027-01-31') {
      await workflowOutput('changed', false);
      await workflowOutput('completed_week', existing?.status?.completedThroughWeek || 0);
      await workflowSummary(['### Farmhood payout reconciliation', `- ${localDate} is outside the 2026 payout season.`, '- Sleeper requests: 0', '- OpenAI usage: 0 tokens']);
      console.log(JSON.stringify({ status: 'skipped', reason: 'outside_2026_payout_season', localDate }, null, 2));
      return;
    }
  }
  const [league, rosters, bracket] = await Promise.all([
    fetchJson(`${API}/league/${config.leagueId}`, { attempts: 3, label: 'Sleeper league' }),
    fetchJson(`${API}/league/${config.leagueId}/rosters`, { attempts: 3, label: 'Sleeper rosters' }),
    fetchJson(`${API}/league/${config.leagueId}/winners_bracket`, { attempts: 3, label: 'Sleeper playoff bracket' })
  ]);
  assert(String(league?.league_id) === config.leagueId && Number(league?.season) === config.season, 'Sleeper returned the wrong payout league or season.');
  assert(Number(league?.total_rosters) === config.managers.length, 'Sleeper league size does not match the payout rules.');
  const identities = currentRosterIdentities(rosters, config);
  const completedThrough = Math.min(config.regularSeasonWeeks, ...[...identities.values()].map((identity) => identity.games));
  assert(completedThrough >= Number(existing?.status?.completedThroughWeek || 0), 'Sleeper finalization moved backward; preserving the last verified payout ledger for review.');
  const rosterPositions = (league.roster_positions || []).map((slot) => String(slot).toUpperCase());
  const completedRows = await Promise.all(Array.from({ length: completedThrough }, (_, index) => index + 1).map(async (week) => [
    week,
    await fetchJson(`${API}/league/${config.leagueId}/matchups/${week}`, { attempts: 3, label: `Sleeper Week ${week} matchups` })
  ]));
  const players = completedThrough > 0 ? await fetchJson(`${API}/players/nfl`, { attempts: 3, timeoutMs: 60_000, label: 'Sleeper NFL players' }) : {};
  const rawByWeek = new Map(completedRows);
  const previousByWeek = new Map((existing?.weekly || []).map((week) => [week.week, week]));
  const weekly = [];
  for (let week = 1; week <= config.regularSeasonWeeks; week += 1) {
    if (week > completedThrough) {
      weekly.push(pendingWeek(config, week));
      continue;
    }
    const rows = normalizeWeek(rawByWeek.get(week), rosterPositions, identities, players, week);
    const sourceDigest = digest(rows.map((row) => ({ rosterId: row.rosterId, matchupId: row.matchupId, scoreUnits: row.scoreUnits, starters: row.starters.map(({ id, slot, position, scoreUnits: points }) => ({ id, slot, position, scoreUnits: points })) })));
    const calculated = attachTeamScores(finalizedWeek(config, week, rows, sourceDigest), rows);
    weekly.push(preserveRevision(calculated, previousByWeek.get(week), now.toISOString()));
  }
  const season = buildSeasonPrizes(config, weekly, bracket);
  const totals = managerTotals(config, weekly, season), awardedCents = totals.reduce((sum, row) => sum + row.totalCents, 0);
  const auditFlags = auditSeasonPoints(weekly, identities, completedThrough);
  const base = {
    schemaVersion: 1,
    season: config.season,
    leagueId: config.leagueId,
    currency: config.currency,
    status: {
      currentWeek: Number(league.settings?.leg || 1),
      completedThroughWeek: completedThrough,
      season: season.status,
      nextRun: `Tuesday at 9:00 AM ${config.timezone}`
    },
    accounting: {
      totalCents: allocation.totalCents,
      seasonPoolCents: allocation.seasonPoolCents,
      weeklyHighPoolCents: allocation.weeklyHighPoolCents,
      positionPoolCents: allocation.positionPoolCents,
      rivalryPoolCents: allocation.rivalryPoolCents,
      awardedCents,
      reservedCents: allocation.totalCents - awardedCents
    },
    rules: config.rules,
    seasonPrizes: season,
    weekly,
    managerTotals: totals,
    audit: { status: auditFlags.length ? 'needs_review' : 'passed', flags: auditFlags },
    source: {
      provider: 'Sleeper',
      leagueId: config.leagueId,
      completedThroughWeek: completedThrough,
      teamScorePolicy: 'custom_points when present, otherwise points',
      playerScorePolicy: 'players_points cross-checked against starters_points'
    }
  };
  const revision = digest(base), changed = existing?.revision !== revision;
  if (changed && !options['dry-run']) await writeJsonAtomic(ledgerPath, { ...base, revision, updatedAt: now.toISOString() });
  await workflowOutput('changed', changed && !options['dry-run']);
  await workflowOutput('completed_week', completedThrough);
  await workflowOutput('revision', revision);
  await workflowSummary([
    '### Farmhood payout reconciliation',
    `- Finalized through Week ${completedThrough}`,
    `- Awarded: $${(awardedCents / 100).toFixed(2)}`,
    `- Reserved: $${((allocation.totalCents - awardedCents) / 100).toFixed(2)}`,
    `- Ledger: ${changed ? options['dry-run'] ? 'changes found (dry run)' : 'updated' : 'already current'}`,
    `- Audit: ${auditFlags.length ? `${auditFlags.length} item(s) need review` : 'passed'}`,
    '- OpenAI usage: 0 tokens'
  ]);
  console.log(JSON.stringify({ status: 'ok', changed, completedThroughWeek: completedThrough, awardedCents, reservedCents: allocation.totalCents - awardedCents, revision, audit: auditFlags }, null, 2));
}

main().catch((error) => {
  console.error(`Farmhood payout reconciliation failed: ${error.message}`);
  process.exitCode = 1;
});
