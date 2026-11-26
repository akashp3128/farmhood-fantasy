import { createRequire } from 'node:module';
import { PRESS_CONFIG } from '../../scripts/press/config.mjs';
import { buildWeeklyFacts } from '../../scripts/press/facts.mjs';

const require = createRequire(import.meta.url);
const liveRuntime = require('../../assets/live.js');

export const LATE_FACTS_NOW = '2026-11-27T15:07:00.000Z';

/**
 * Feed-only test fixture: no network, filesystem writes, or paid requests.
 * Starter selectors are zero-based "rosterId:index" strings. Synthetic unique
 * team keys deliberately isolate game-status changes to one player at a time.
 */
export function lateFactsFixture({
  unknown = ['1:2'],
  unknownStatus = '',
  missingProjections = []
} = {}) {
  const unknownSelectors = new Set(unknown);
  const missingProjectionSelectors = new Set(missingProjections);
  const players = {};
  const games = {};
  const rosters = [];
  const matchups = [];
  let teamNumber = 0;

  function addPlayer(id, name, projection, gameStatus, points = null) {
    const team = `T${String(++teamNumber).padStart(3, '0')}`;
    players[id] = { id, name, position: 'RB', team, opponent: '', projection, injury: '' };
    if (gameStatus !== undefined && gameStatus !== null) games[team] = { status: gameStatus, date: gameStatus === 'final' ? '2026-11-26' : '2026-11-29' };
    return { id, points };
  }

  for (let rosterId = 1; rosterId <= PRESS_CONFIG.teamCount; rosterId += 1) {
    const name = PRESS_CONFIG.rosterNames[rosterId];
    const currentScore = rosterId === 1 ? 17.5 : rosterId === 2 ? 0 : rosterId * 2;
    rosters.push({ rosterId, name, wins: 11, losses: 0, ties: 0, pf: currentScore });
    const starters = Array.from({ length: 10 }, (_value, index) => {
      const selector = `${rosterId}:${index}`;
      return addPlayer(
        `s${rosterId}-${index}`,
        `${name} Starter ${index + 1}`,
        missingProjectionSelectors.has(selector) ? null : 10,
        unknownSelectors.has(selector) ? unknownStatus : index < 2 ? 'final' : 'pre_game',
        index === 0 ? currentScore : index === 1 ? 0 : null
      );
    });
    const bench = [];
    if ([1, 2, 3].includes(rosterId)) {
      // Real lineupWatch offers all three. The newsroom must remove an unknown
      // starter target (roster 1) and unknown bench replacement (roster 3), while
      // retaining the entirely known roster-2 pivot.
      bench.push(addPlayer(`b${rosterId}`, `${name} Bench Upgrade`, 40, rosterId === 3 ? '' : 'pre_game'));
    }
    matchups.push({
      rosterId,
      matchupId: Math.ceil(rosterId / 2),
      points: currentScore,
      starters: starters.map(({ id }) => id),
      players: [...starters, ...bench].map(({ id }) => id),
      starterPoints: starters.map(({ points }) => points),
      playerPoints: Object.fromEntries(starters.filter(({ points }) => points !== null).map(({ id, points }) => [id, points]))
    });
  }

  const base = {
    season: PRESS_CONFIG.season,
    leagueId: PRESS_CONFIG.leagueId,
    status: 'in_season',
    currentWeek: 12,
    regularSeasonWeeks: PRESS_CONFIG.regularSeasonWeeks,
    rosterPositions: Array.from({ length: 10 }, () => 'FLEX'),
    scoringSettings: { pts_half_ppr: 1 },
    rosters,
    matchups
  };
  const playerFeed = { players, games, season: base.season, week: base.currentWeek, source: 'test', stale: false };
  const league = { meta: { name: 'Farmhood Test League', scoring: 'Test scoring' }, managers: rosters.map(({ name }) => name) };
  const live = {
    ...liveRuntime,
    load: async () => base,
    loadWeek: async () => base.matchups,
    loadPlayers: async () => playerFeed,
    loadSeasonWeeks: async () => ({ 12: base.matchups }),
    buildPower: () => ({ rows: rosters.map(({ name, rosterId }) => ({ name, rank: rosterId, power: 100 - rosterId, tag: { label: 'Test form' } })) })
  };
  const loadRuntime = () => ({ league, live });
  const buildFacts = (overrides = {}) => buildWeeklyFacts({
    season: base.season,
    week: base.currentWeek,
    now: LATE_FACTS_NOW,
    edition: 'late-preview',
    ...overrides,
    now: overrides.now ?? LATE_FACTS_NOW,
    loadRuntime
  });
  return { base, playerFeed, league, loadRuntime, buildFacts, rawWatch: liveRuntime.lineupWatch(base, playerFeed) };
}

export async function buildLateFactsFixture(options = {}) {
  return lateFactsFixture(options).buildFacts();
}
