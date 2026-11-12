/* Farmhood Fantasy — schedule desk.
   Compares remaining fantasy slates and roster bye weeks.
   Opponent difficulty uses the live standings only. */
(function(root, factory) {
  const api = factory(root);
  root.FarmhoodSchedule = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function(root) {
  'use strict';

  const EASY_AT = 0.42;
  const HARD_AT = 0.58;
  const SOFT_SLATE_AT = 0.45;
  const BRUTAL_SLATE_AT = 0.55;
  const SWING_GAP = 0.18;
  const WIN_WEIGHT = 0.62;
  const PF_WEIGHT = 0.38;
  const NFL_TEAMS = new Set('ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LAC LAR LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS'.split(' '));

  function nflTeam(value) {
    const code = String(value || '').toUpperCase();
    return ({JAC: 'JAX', LA: 'LAR', WSH: 'WAS', OAK: 'LV', SD: 'LAC'})[code] || code;
  }

  function finite(value, fallback) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }

  function finiteOrNull(value) {
    return value != null && Number.isFinite(Number(value)) ? Number(value) : null;
  }

  function percentile(value, values) {
    if (!values || values.length < 2) return 0.5;
    const less = values.filter(item => item < value - 0.0001).length;
    const equal = values.filter(item => Math.abs(item - value) <= 0.0001).length;
    return (less + Math.max(0, equal - 1) * 0.5) / (values.length - 1);
  }

  function bandFor(strength) {
    if (strength == null) return 'none';
    if (strength >= HARD_AT) return 'hard';
    if (strength <= EASY_AT) return 'easy';
    return 'mid';
  }

  function slateLabel(avg) {
    if (avg == null) return 'Done';
    if (avg <= SOFT_SLATE_AT) return 'Soft';
    if (avg >= BRUTAL_SLATE_AT) return 'Brutal';
    return 'Even';
  }

  function formatOwn(roster) {
    return roster.ties ? roster.wins + '-' + roster.losses + '-' + roster.ties : roster.wins + '-' + roster.losses;
  }

  function formatCombined(remaining) {
    if (!remaining) return '0-0';
    return remaining.opponentTies
      ? remaining.opponentWins + '-' + remaining.opponentLosses + '-' + remaining.opponentTies
      : remaining.opponentWins + '-' + remaining.opponentLosses;
  }

  function abbreviateAll(names) {
    const map = new Map();
    const used = new Set();
    [...names].map(name => String(name || 'Team')).sort((a, b) => a.localeCompare(b)).forEach(name => {
      const compact = name.replace(/[^A-Za-z0-9]/g, '') || 'Team';
      const letters = name.replace(/\d+$/, '').replace(/[^A-Za-z]/g, '');
      const seed = letters || compact;
      let size = Math.min(4, seed.length);
      let abbr = seed.slice(0, size) || compact.slice(0, 4) || 'Team';
      while (used.has(abbr.toLowerCase())) {
        size += 1;
        abbr = compact.slice(0, size);
        if (size > compact.length + 2) {
          abbr = compact + String(used.size);
          break;
        }
      }
      used.add(abbr.toLowerCase());
      map.set(name, abbr);
    });
    return map;
  }

  function weekHasScoring(rows) {
    return (rows || []).some(row => {
      const points = finiteOrNull(row && row.points);
      return points != null && Math.abs(points) > 0.0001;
    });
  }

  function pairWeeks(weekMap) {
    const paired = {};
    Object.keys(weekMap || {}).forEach(key => {
      const week = Number(key);
      const rows = Array.isArray(weekMap[key]) ? weekMap[key] : [];
      const groups = new Map();
      const rosterCounts = new Map();
      rows.forEach(row => rosterCounts.set(Number(row && row.rosterId), (rosterCounts.get(Number(row && row.rosterId)) || 0) + 1));
      rows.forEach(row => {
        const rosterId = Number(row && row.rosterId);
        if (!rosterId) return;
        const matchupId = row.matchupId == null || row.matchupId < 0 ? 'bye-' + rosterId : String(row.matchupId);
        if (!groups.has(matchupId)) groups.set(matchupId, []);
        groups.get(matchupId).push(row);
      });
      const cells = {};
      groups.forEach(sides => {
        if (sides.length !== 2 || sides.some(row => rosterCounts.get(Number(row.rosterId)) > 1)) {
          sides.forEach(row => {
            const explicitBye = rosterCounts.get(Number(row.rosterId)) === 1 && (row.matchupId == null || row.matchupId < 0);
            cells[Number(row.rosterId)] = {opponentId: null, points: finiteOrNull(row.points), oppPoints: null, bye: explicitBye, missing: !explicitBye};
          });
          return;
        }
        const left = sides[0];
        const right = sides[1];
        const leftPoints = finiteOrNull(left.points);
        const rightPoints = finiteOrNull(right.points);
        cells[Number(left.rosterId)] = {opponentId: Number(right.rosterId), points: leftPoints, oppPoints: rightPoints, bye: false};
        cells[Number(right.rosterId)] = {opponentId: Number(left.rosterId), points: rightPoints, oppPoints: leftPoints, bye: false};
      });
      paired[week] = {cells, rows};
    });
    return paired;
  }

  function resultFor(points, oppPoints, final) {
    if (!final || points == null || oppPoints == null) return null;
    if (Math.abs(points - oppPoints) <= 0.0001) return 'T';
    return points > oppPoints ? 'W' : 'L';
  }

  function findStretch(cells, band) {
    const ordered = cells.filter(cell => cell.remaining && cell.opponentStrength != null);
    let best = null;
    let run = [];
    const consider = () => {
      if (run.length < 2) {
        run = [];
        return;
      }
      const avg = run.reduce((sum, cell) => sum + cell.opponentStrength, 0) / run.length;
      const candidate = {start: run[0].week, end: run[run.length - 1].week, weeks: run.map(cell => cell.week), avg};
      const better = !best
        || candidate.weeks.length > best.weeks.length
        || (candidate.weeks.length === best.weeks.length && (band === 'easy' ? candidate.avg < best.avg : candidate.avg > best.avg));
      if (better) best = candidate;
      run = [];
    };
    ordered.forEach(cell => {
      const continues = run.length && cell.week === run[run.length - 1].week + 1 && cell.band === band;
      if (cell.band === band && (!run.length || continues)) run.push(cell);
      else {
        consider();
        if (cell.band === band) run = [cell];
      }
    });
    consider();
    return best;
  }

  function opponentStrength(roster, rosters) {
    const records = (rosters || []).map(item => {
      const wins = finite(item.wins, 0);
      const losses = finite(item.losses, 0);
      const ties = finite(item.ties, 0);
      const games = wins + losses + ties;
      return {
        winPct: games ? (wins + ties * 0.5) / games : 0.5,
        pf: finite(item.pf, 0),
        games
      };
    });
    const wins = finite(roster && roster.wins, 0);
    const losses = finite(roster && roster.losses, 0);
    const ties = finite(roster && roster.ties, 0);
    const games = wins + losses + ties;
    const winPct = games ? (wins + ties * 0.5) / games : 0.5;
    const pf = finite(roster && roster.pf, 0);
    const pfPct = percentile(pf, records.map(item => item.pf));
    const strength = (games ? winPct : 0.5) * WIN_WEIGHT + pfPct * PF_WEIGHT;
    return {winPct, pf, pfPct, games, strength, band: bandFor(strength)};
  }

  function analyze(input) {
    const source = input || {};
    const regularSeasonWeeks = Math.max(1, finite(source.regularSeasonWeeks, 14));
    const playoffStart = Math.max(1, finite(source.playoffStart, regularSeasonWeeks + 1));
    const playoffTeams = Math.max(1, finite(source.playoffTeams, 6));
    const completedThrough = Math.max(0, finite(source.completedThrough, 0));
    const currentWeek = Math.max(1, finite(source.currentWeek, completedThrough + 1));
    const regularWeeks = [];
    for (let week = 1; week <= regularSeasonWeeks; week++) regularWeeks.push(week);
    const playoffWeeks = [];
    for (let week = playoffStart; week <= playoffStart + 2; week++) {
      const rows = source.weeks && source.weeks[week];
      if (Array.isArray(rows) && rows.length) playoffWeeks.push(week);
    }
    const remainingWeeks = regularWeeks.filter(week => week > completedThrough);
    const remainingSet = new Set(remainingWeeks);
    const paired = pairWeeks(source.weeks || {});
    const base = (source.rosters || []).map(roster => {
      const wins = finite(roster.wins, 0);
      const losses = finite(roster.losses, 0);
      const ties = finite(roster.ties, 0);
      const games = wins + losses + ties;
      return {
        rosterId: Number(roster.rosterId),
        name: String(roster.name || ('Roster ' + roster.rosterId)),
        wins,
        losses,
        ties,
        games,
        winPct: games ? (wins + ties * 0.5) / games : 0.5,
        pf: finite(roster.pf, 0)
      };
    }).filter(roster => roster.rosterId > 0);
    const abbrev = abbreviateAll(base.map(roster => roster.name));
    const pfValues = base.map(roster => roster.pf);
    base.forEach(roster => {
      const pfPct = percentile(roster.pf, pfValues);
      const strength = (roster.games ? roster.winPct : 0.5) * WIN_WEIGHT + pfPct * PF_WEIGHT;
      roster.pfPct = pfPct;
      roster.strength = strength;
      roster.band = bandFor(strength);
      roster.abbrev = abbrev.get(roster.name) || roster.name.slice(0, 4);
    });
    base.slice().sort((a, b) => b.winPct - a.winPct || b.wins - a.wins || b.pf - a.pf || a.name.localeCompare(b.name))
      .forEach((roster, index) => {
        roster.rank = index + 1;
        roster.inPlayoffPicture = roster.rank <= playoffTeams;
      });
    const byId = new Map(base.map(roster => [roster.rosterId, roster]));
    const columns = regularWeeks.concat(playoffWeeks);

    base.forEach(roster => {
      roster.cells = columns.map(week => {
        const pack = paired[week];
        const entry = pack && pack.cells[roster.rosterId];
        const phase = week >= playoffStart
          ? (week <= completedThrough ? 'playoff-final' : 'playoff')
          : week <= completedThrough
            ? 'final'
            : (week === currentWeek && pack && weekHasScoring(pack.rows) ? 'live' : 'scheduled');
        if (!entry || entry.missing || (!entry.bye && !byId.has(entry.opponentId))) {
          return {week, missing: true, bye: false, opponentId: null, band: 'none', phase, result: null, remaining: false, points: null, oppPoints: null};
        }
        const opponent = entry.opponentId != null ? byId.get(entry.opponentId) : null;
        const final = phase === 'final' || phase === 'playoff-final';
        return {
          week,
          missing: false,
          bye: !!entry.bye,
          opponentId: opponent ? opponent.rosterId : null,
          opponentName: opponent ? opponent.name : null,
          opponentAbbrev: opponent ? opponent.abbrev : null,
          opponentStrength: opponent ? opponent.strength : null,
          opponentRank: opponent ? opponent.rank : null,
          opponentRecord: opponent ? formatOwn(opponent) : null,
          band: opponent ? opponent.band : (entry.bye ? 'bye' : 'none'),
          phase,
          result: opponent ? resultFor(entry.points, entry.oppPoints, final) : null,
          points: entry.points,
          oppPoints: entry.oppPoints,
          remaining: !!(opponent && remainingSet.has(week))
        };
      });
      const samples = roster.cells.filter(cell => cell.remaining && cell.opponentStrength != null);
      const avgStrength = samples.length ? samples.reduce((sum, cell) => sum + cell.opponentStrength, 0) / samples.length : null;
      const tally = {opponentWins: 0, opponentLosses: 0, opponentTies: 0, vsPicture: 0};
      samples.forEach(cell => {
        const opponent = byId.get(cell.opponentId);
        if (!opponent) return;
        tally.opponentWins += opponent.wins;
        tally.opponentLosses += opponent.losses;
        tally.opponentTies += opponent.ties;
        if (opponent.inPlayoffPicture) tally.vsPicture += 1;
      });
      roster.remaining = {
        games: samples.length,
        avgStrength,
        index: avgStrength == null ? null : Math.round(avgStrength * 100),
        label: slateLabel(avgStrength),
        opponentWins: tally.opponentWins,
        opponentLosses: tally.opponentLosses,
        opponentTies: tally.opponentTies,
        vsPicture: tally.vsPicture
      };
      roster.stretches = {
        soft: findStretch(roster.cells, 'easy'),
        brutal: findStretch(roster.cells, 'hard')
      };
    });

    const contenders = base.filter(roster => roster.remaining.games);
    contenders.sort((a, b) => a.remaining.avgStrength - b.remaining.avgStrength || a.name.localeCompare(b.name));
    base.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
    return {
      regularSeasonWeeks,
      playoffStart,
      playoffTeams,
      completedThrough,
      currentWeek,
      regularWeeks,
      playoffWeeks,
      remainingWeeks,
      incompleteWeeks: remainingWeeks.filter(week => base.some(roster => roster.cells.some(cell => cell.week === week && cell.missing))),
      rosters: base,
      softestId: contenders.length ? contenders[0].rosterId : null,
      toughestId: contenders.length ? contenders[contenders.length - 1].rosterId : null
    };
  }

  function listWeeks(cells) {
    const weeks = cells.map(cell => 'Week ' + cell.week);
    if (weeks.length <= 1) return weeks[0] || '';
    if (weeks.length === 2) return weeks[0] + ' and ' + weeks[1];
    return weeks.slice(0, -1).join(', ') + ' and ' + weeks[weeks.length - 1];
  }

  function leagueInsights(model) {
    const source = model || {rosters: []};
    if (!source.rosters || !source.rosters.length) return [];
    const notes = [];
    if ((source.incompleteWeeks || []).length) notes.push({tone: 'mid', title: 'Incomplete fantasy schedule', text: 'Opponent pairings are missing in ' + source.incompleteWeeks.map(week => 'Week ' + week).join(', ') + '. Slate indices use only known opponents and may not cover the full road left.'});
    const soft = source.rosters.find(roster => roster.rosterId === source.softestId);
    const hard = source.rosters.find(roster => roster.rosterId === source.toughestId);
    if (soft && soft.remaining.games) {
      notes.push({
        tone: 'easy',
        title: 'Softest road left',
        text: soft.name + ' has the softest road left, slate index ' + soft.remaining.index + ', against opponents who are a combined ' + formatCombined(soft.remaining) + ' right now.'
      });
    }
    if (hard && hard.remaining.games && (!soft || hard.rosterId !== soft.rosterId) && (!soft || hard.remaining.avgStrength - soft.remaining.avgStrength > 0.0001)) {
      notes.push({
        tone: 'hard',
        title: 'Heaviest road left',
        text: hard.name + ' has the heaviest road left, slate index ' + hard.remaining.index + ', against opponents who are a combined ' + formatCombined(hard.remaining) + ' right now.'
      });
    }
    const ranked = source.rosters.slice().sort((a, b) => a.rank - b.rank);
    const inside = ranked[source.playoffTeams - 1];
    const outside = ranked[source.playoffTeams];
    if (inside && outside && inside.remaining.games && outside.remaining.games) {
      const softer = inside.remaining.avgStrength <= outside.remaining.avgStrength ? inside : outside;
      const other = softer === inside ? outside : inside;
      notes.push({
        tone: 'gold',
        title: 'On the playoff cut',
        text: inside.name + ' sits in the last playoff spot and ' + outside.name + ' is first out. ' + softer.name + ' has the softer remaining slate, index ' + softer.remaining.index + ' versus ' + other.remaining.index + '.'
      });
    }
    if (!notes.length) {
      notes.push({
        tone: 'mid',
        title: source.remainingWeeks.length ? 'Schedule not yet confirmed' : 'Regular season complete',
        text: source.remainingWeeks.length ? 'Regular-season weeks remain, but their opponent pairings are missing or incomplete. No remaining-slate ranking is available.' : 'Every regular-season game is final. The heatmap is the road they walked, and the last columns are the posted playoff slate.'
      });
    }
    return notes;
  }

  function bestStretchNote(left, right) {
    const options = [];
    [left, right].forEach(roster => {
      ['brutal', 'soft'].forEach(kind => {
        const stretch = roster.stretches && roster.stretches[kind];
        if (stretch) options.push({roster, kind, stretch});
      });
    });
    if (!options.length) return null;
    options.sort((a, b) => {
      if (b.stretch.weeks.length !== a.stretch.weeks.length) return b.stretch.weeks.length - a.stretch.weeks.length;
      if (a.kind !== b.kind) return a.kind === 'brutal' ? -1 : 1;
      return a.roster.name.localeCompare(b.roster.name);
    });
    const pick = options[0];
    const label = pick.kind === 'soft' ? 'soft' : 'brutal';
    const span = pick.stretch.start === pick.stretch.end ? 'Week ' + pick.stretch.start : 'Weeks ' + pick.stretch.start + '-' + pick.stretch.end;
    const verb = pick.stretch.weeks.length > 1 ? 'are' : 'is';
    return {
      tone: pick.kind === 'soft' ? 'easy' : 'hard',
      title: pick.kind === 'soft' ? 'Soft run' : 'Brutal run',
      text: span + ' ' + verb + ' a ' + label + ' run for ' + pick.roster.name + '.'
    };
  }

  function topSwing(left, right) {
    const swings = [];
    (left.cells || []).forEach(cell => {
      if (!cell.remaining || cell.opponentStrength == null) return;
      const other = (right.cells || []).find(item => item.week === cell.week);
      if (!other || other.opponentStrength == null || other.opponentId === left.rosterId) return;
      const gap = Math.abs(cell.opponentStrength - other.opponentStrength);
      if (gap + 1e-9 < SWING_GAP) return;
      swings.push({week: cell.week, gap, easier: cell.opponentStrength < other.opponentStrength ? left : right});
    });
    swings.sort((a, b) => b.gap - a.gap || a.week - b.week);
    if (!swings.length) return null;
    return {
      tone: 'gold',
      title: 'Swing week',
      text: 'Week ' + swings[0].week + ' is the swing. ' + swings[0].easier.name + ' draws the easier opponent.'
    };
  }

  function matchupInsights(model, leftId, rightId) {
    const left = (model.rosters || []).find(roster => roster.rosterId === Number(leftId));
    const right = (model.rosters || []).find(roster => roster.rosterId === Number(rightId));
    if (!left || !right || left.rosterId === right.rosterId) return [];
    const notes = [];
    const meetings = (left.cells || []).filter(cell => cell.opponentId === right.rosterId);
    const futureRegular = meetings.filter(cell => cell.phase === 'scheduled' || cell.phase === 'live');
    const posted = meetings.filter(cell => cell.phase === 'playoff');
    if (futureRegular.length) {
      notes.push({tone: 'gold', title: 'They meet', text: left.name + ' and ' + right.name + ' still meet in ' + listWeeks(futureRegular) + '.'});
    } else {
      notes.push({tone: 'mid', title: 'No regular-season rematch', text: left.name + ' and ' + right.name + ' do not play again in the regular season.'});
    }
    if (left.remaining.games && right.remaining.games) {
      notes.push({
        tone: left.remaining.avgStrength <= right.remaining.avgStrength ? 'easy' : 'hard',
        title: 'Road left',
        text: left.name + "'s remaining slate index is " + left.remaining.index + ' (opponents ' + formatCombined(left.remaining) + '). ' + right.name + "'s is " + right.remaining.index + ' (opponents ' + formatCombined(right.remaining) + ').'
      });
    }
    const stretch = bestStretchNote(left, right);
    if (stretch) notes.push(stretch);
    const swing = topSwing(left, right);
    if (swing) notes.push(swing);
    if (posted.length) {
      notes.push({
        tone: 'gold',
        title: 'Pencil mark',
        text: listWeeks(posted) + ' pairs them on the posted playoff slate. Future bracket pairings are not locked.'
      });
    }
    return notes;
  }

  function defaultPair(model) {
    const ranked = ((model && model.rosters) || []).slice().sort((a, b) => a.rank - b.rank);
    if (!ranked.length) return [null, null];
    const cut = Math.max(1, finite(model.playoffTeams, 6));
    const inside = ranked[Math.min(ranked.length, cut) - 1] || ranked[0];
    const outside = ranked[Math.min(ranked.length - 1, cut)] || ranked[0];
    return [inside.rosterId, outside.rosterId];
  }

  function eligibleForSlot(position, slot) {
    const pos = String(position || '').toUpperCase();
    const target = String(slot || '').toUpperCase();
    if (!pos || !target || target === 'BN') return false;
    if (target === 'FLEX') return ['RB', 'WR', 'TE'].includes(pos);
    if (target === 'REC_FLEX') return ['WR', 'TE'].includes(pos);
    if (target === 'SUPER_FLEX') return ['QB', 'RB', 'WR', 'TE'].includes(pos);
    return pos === target;
  }

  function isHardOut(injury) {
    return /^(out|ir|pup|suspended|inactive)$/i.test(String(injury || '').trim());
  }

  function normalizeNflWeek(rows, week, verifiedSeason) {
    const teams = {};
    let valid = true;
    let games = 0;
    (Array.isArray(rows) ? rows : []).filter(game => week == null || game && Number(game.week) === Number(week)).forEach(game => {
      const meta = (game && game.metadata) || {};
      const home = nflTeam(game && (game.home || meta.home_team));
      const away = nflTeam(game && (game.away || meta.away_team));
      if (NFL_TEAMS.has(home) && NFL_TEAMS.has(away) && home !== away && !teams[home] && !teams[away]) {
        teams[home] = {opponent: away, home: true};
        teams[away] = {opponent: home, home: false};
        games += 1;
      } else valid = false;
    });
    if (!Object.keys(teams).length) return null;
    // Absence proves a bye only after the full season passes validation.
    Object.defineProperty(teams, 'complete', {value: valid && (verifiedSeason === true || games === 16)});
    return teams;
  }

  function normalizeNflSeason(rows) {
    if (!Array.isArray(rows) || rows.length !== 272) return null;
    const counts = new Map([...NFL_TEAMS].map(team => [team, 0]));
    const ids = new Set();
    const appearances = new Set();
    for (const game of rows) {
      const week = Number(game && game.week);
      const home = nflTeam(game && game.home);
      const away = nflTeam(game && game.away);
      const id = String(game && game.game_id || '');
      if (!Number.isInteger(week) || week < 1 || week > 18 || !NFL_TEAMS.has(home) || !NFL_TEAMS.has(away) || home === away || !id || ids.has(id) || /cancel|postpon/i.test(String(game.status || ''))) return null;
      ids.add(id);
      for (const team of [home, away]) {
        const key = week + ':' + team;
        if (appearances.has(key)) return null;
        appearances.add(key);
        counts.set(team, counts.get(team) + 1);
      }
    }
    if ([...counts.values()].some(count => count !== 17)) return null;
    const season = {};
    for (let week = 1; week <= 18; week++) {
      season[week] = normalizeNflWeek(rows, week, true);
      if (!season[week]) return null;
    }
    return season;
  }

  function describeTeamWeek(team, slate, week) {
    const code = nflTeam(team);
    if (!NFL_TEAMS.has(code)) return {week, status: 'unknown', label: '—'};
    if (!slate) return {week, status: 'unknown', label: '—'};
    const game = slate[code];
    if (!game) return slate.complete === true
      ? {week, status: 'bye', label: 'BYE'}
      : {week, status: 'unknown', label: '—'};
    return {week, status: 'play', opponent: game.opponent, home: !!game.home, label: game.home ? game.opponent : '@' + game.opponent};
  }

  function byeReport(input) {
    const source = input || {};
    const weeks = source.weeks || [];
    const nfl = source.nfl || {};
    const decorate = player => Object.assign({}, player, {
      weeks: weeks.map(week => describeTeamWeek(player.team, nfl[week], week))
    });
    const starters = (source.starters || []).filter(player => player && player.id && player.id !== '0').map(decorate);
    const bench = (source.bench || []).filter(player => player && player.id && player.id !== '0').map(decorate);
    const weekSummaries = weeks.map(week => {
      const byes = starters.filter(player => {
        const slot = player.weeks.find(item => item.week === week);
        return slot && slot.status === 'bye';
      }).map(player => ({
        id: player.id,
        name: player.name,
        slot: player.slot || player.position,
        position: player.position,
        covers: bench.filter(candidate => {
          const slot = candidate.weeks.find(item => item.week === week);
          return slot && slot.status === 'play' && !isHardOut(candidate.injury) && eligibleForSlot(candidate.position, player.slot || player.position);
        }).map(candidate => {
          const slot = candidate.weeks.find(item => item.week === week);
          return {id: candidate.id, name: candidate.name, position: candidate.position, opponent: slot.opponent, home: slot.home};
        })
      }));
      // Maximum bipartite matching: one healthy bench player can cover only
      // one simultaneous hole, including FLEX slots that share candidates.
      const assigned = new Map();
      function assign(index, seen) {
        for (const candidate of byes[index].covers) {
          if (seen.has(candidate.id)) continue;
          seen.add(candidate.id);
          const previous = assigned.get(candidate.id);
          if (previous == null || assign(previous, seen)) {
            assigned.set(candidate.id, index);
            return true;
          }
        }
        return false;
      }
      byes.forEach((_bye, index) => assign(index, new Set()));
      byes.forEach((bye, index) => {
        bye.cover = bye.covers.find(candidate => assigned.get(candidate.id) === index) || null;
      });
      return {week, byes};
    }).filter(item => item.byes.length);
    const unknownWeeks = weeks.filter(week => starters.some(player => player.weeks.some(item => item.week === week && item.status === 'unknown')));
    return {weeks, starters, bench, weekSummaries, unknownWeeks};
  }

  function byeInsights(report) {
    const source = report || {starters: [], weekSummaries: []};
    if (!source.starters || !source.starters.length) {
      return [{tone: 'mid', title: 'Roster unavailable', text: 'Sleeper did not return a roster for this manager, so bye weeks cannot be mapped yet.'}];
    }
    const notes = [];
    const unknown = source.unknownWeeks || [];
    if (unknown.length) notes.push({tone: 'mid', title: 'Incomplete NFL calendar', text: 'Availability is unknown in ' + unknown.map(week => 'Week ' + week).join(', ') + '. Missing games are not counted as byes; check again when the schedule is complete.'});
    const collisions = (source.weekSummaries || []).filter(item => item.byes.length >= 2)
      .sort((a, b) => b.byes.length - a.byes.length || a.week - b.week);
    if (!collisions.length) {
      notes.push({tone: unknown.length ? 'mid' : 'easy', title: unknown.length ? 'No confirmed collision' : 'Bye calendar is clean', text: unknown.length ? 'No two-starter bye collision is confirmed on the posted portion of this calendar.' : 'No remaining week puts two starters on bye at once.'});
    } else {
      const worst = collisions[0];
      notes.push({
        tone: 'hard',
        title: 'Week ' + worst.week + ' goes dark',
        text: worst.byes.length + ' starters are on bye: ' + worst.byes.map(bye => bye.name).join(', ') + '.'
      });
    }
    const holes = [];
    (source.weekSummaries || []).forEach(item => {
      item.byes.forEach(bye => {
        if (!bye.cover) holes.push('Week ' + item.week + ' ' + (bye.slot || bye.position || 'starter'));
      });
    });
    if (holes.length) {
      notes.push({tone: 'hard', title: 'Waiver weeks', text: 'Uncovered byes: ' + holes.join(', ') + '. The healthy, scheduled bench cannot cover every slot at once.'});
    } else if ((source.weekSummaries || []).some(item => item.byes.length)) {
      notes.push({tone: 'easy', title: 'Bench can cover', text: 'Each confirmed starter bye has a different healthy bench player with a posted game who fits the slot. Recheck injuries before kickoff.'});
    }
    return notes;
  }

  function worstCollision(reports) {
    let worst = null;
    (reports || []).forEach(item => {
      const summaries = item && item.report && item.report.weekSummaries || [];
      summaries.forEach(summary => {
        if (!summary.byes || summary.byes.length < 2) return;
        if (!worst || summary.byes.length > worst.count || (summary.byes.length === worst.count && summary.week < worst.week)) {
          worst = {rosterId: item.rosterId, name: item.name, week: summary.week, count: summary.byes.length};
        }
      });
    });
    return worst;
  }

  function comparePlayers(playerA, playerB, nfl, weeks) {
    const rows = (weeks || []).map(week => {
      const left = describeTeamWeek(playerA && playerA.team, nfl && nfl[week], week);
      const right = describeTeamWeek(playerB && playerB.team, nfl && nfl[week], week);
      let edge = null;
      if (left.status === 'play' && right.status === 'bye') edge = 'a';
      if (right.status === 'play' && left.status === 'bye') edge = 'b';
      return {week, a: left, b: right, edge};
    });
    return {rows, edges: rows.filter(row => row.edge)};
  }

  function duelInsights(comparison, playerA, playerB) {
    const left = playerA || {name: 'Player A'};
    const right = playerB || {name: 'Player B'};
    if (!comparison || !comparison.edges || !comparison.edges.length) {
      const unknown = comparison && comparison.rows && comparison.rows.some(row => row.a.status === 'unknown' || row.b.status === 'unknown');
      return [{
        tone: 'mid',
        title: unknown ? 'Availability incomplete' : 'No bye edge',
        text: unknown ? 'Some NFL games or player teams are not confirmed. There is no verified bye advantage in the posted games.' : left.name + ' and ' + right.name + ' have no play-versus-bye difference on this slice. This compares the calendar, not health, eligibility, or projected points.'
      }];
    }
    return comparison.edges.map(edge => {
      const start = edge.edge === 'a' ? left : right;
      const sit = edge.edge === 'a' ? right : left;
      const game = edge.edge === 'a' ? edge.a : edge.b;
      const where = game.home ? 'vs ' + game.opponent : '@ ' + game.opponent;
      return {
        tone: 'easy',
        title: 'Week ' + edge.week + ' calendar edge',
        text: start.name + ' has a scheduled game ' + where + '; ' + sit.name + ' is on bye. Check position eligibility and injury status before making a lineup decision.'
      };
    });
  }

  function pickupOptions(players, slate, slot, rosteredIds, limit) {
    const taken = rosteredIds instanceof Set ? rosteredIds : new Set(rosteredIds || []);
    const max = limit || 3;
    return Object.values(players || {}).filter(player => {
      if (!player || player.id == null || taken.has(String(player.id))) return false;
      if (isHardOut(player.injury)) return false;
      if (!eligibleForSlot(player.position, slot)) return false;
      const team = nflTeam(player.team);
      return !!(slate && slate[team]);
    }).sort((a, b) => (finite(b.projection, 0) - finite(a.projection, 0)) || String(a.name || '').localeCompare(String(b.name || '')))
      .slice(0, max)
      .map(player => {
        const team = nflTeam(player.team);
        const game = slate[team];
        return {
          id: String(player.id),
          name: player.name,
          position: player.position,
          team,
          opponent: game.opponent,
          home: !!game.home,
          projection: player.projection == null ? null : finite(player.projection, 0)
        };
      });
  }

  function ordinal(number) {
    const mod = number % 100;
    if (mod >= 11 && mod <= 13) return number + 'th';
    const last = number % 10;
    if (last === 1) return number + 'st';
    if (last === 2) return number + 'nd';
    if (last === 3) return number + 'rd';
    return number + 'th';
  }

  function cellSummary(cell) {
    if (!cell || cell.missing) return 'Week ' + (cell && cell.week) + ' is not posted.';
    if (cell.bye || !cell.opponentName) return 'Week ' + cell.week + ' has no opponent posted.';
    const bandWord = cell.band === 'hard' ? 'hard' : cell.band === 'easy' ? 'easy' : 'even';
    const bits = ['Week ' + cell.week + ' versus ' + cell.opponentName];
    if (cell.opponentRecord) bits.push(cell.opponentRecord);
    if (cell.opponentRank) bits.push(ordinal(cell.opponentRank));
    bits.push(bandWord + ' draw');
    if (cell.result && cell.points != null && cell.oppPoints != null) {
      const verdict = cell.result === 'W' ? 'win' : cell.result === 'L' ? 'loss' : 'tie';
      bits.push('final ' + verdict + ' ' + cell.points.toFixed(1) + ' to ' + cell.oppPoints.toFixed(1));
    } else if (cell.phase === 'live' && cell.points != null) {
      bits.push('live ' + cell.points.toFixed(1) + ' to ' + (cell.oppPoints == null ? '0.0' : cell.oppPoints.toFixed(1)));
    } else if (cell.phase === 'playoff') {
      bits.push('posted playoff slate, future pairings may change');
    }
    return bits.join(', ') + '.';
  }

  function node(tag, className, value) {
    const element = root.document.createElement(tag);
    if (className) element.className = className;
    if (value != null) element.textContent = String(value);
    return element;
  }

  function byeWindow(model) {
    const end = model.playoffWeeks.length ? model.playoffWeeks[model.playoffWeeks.length - 1] : model.regularSeasonWeeks;
    const start = Math.min(Math.max(model.currentWeek, model.completedThrough + 1), end);
    const weeks = [];
    for (let week = start; week <= end; week++) weeks.push(week);
    return weeks;
  }

  function orderedRosters(model, sort) {
    const rows = model.rosters.slice();
    if (sort === 'slate') {
      rows.sort((a, b) => {
        if (a.remaining.avgStrength == null && b.remaining.avgStrength == null) return a.name.localeCompare(b.name);
        if (a.remaining.avgStrength == null) return 1;
        if (b.remaining.avgStrength == null) return -1;
        return a.remaining.avgStrength - b.remaining.avgStrength || a.name.localeCompare(b.name);
      });
    }
    return rows;
  }

  function findRoster(model, rosterId) {
    return model.rosters.find(roster => roster.rosterId === Number(rosterId)) || null;
  }

  function avatarNode(name) {
    const wrap = node('span', 'av-wrap sched-av');
    const fallback = node('span', 'av-fb', (name && name[0] || '?').toUpperCase());
    wrap.appendChild(fallback);
    const src = root.LEAGUE && root.LEAGUE.avatars && root.LEAGUE.avatars[name];
    if (src) {
      const image = root.document.createElement('img');
      image.className = 'av';
      image.alt = '';
      image.src = src;
      image.addEventListener('error', () => image.remove());
      wrap.appendChild(image);
    }
    return wrap;
  }

  function notesNode(notes) {
    const list = node('div', 'sched-notes');
    (notes || []).forEach(note => {
      const card = node('article', 'sched-note ' + (note.tone || 'mid'));
      card.appendChild(node('strong', '', note.title));
      card.appendChild(node('p', '', note.text));
      list.appendChild(card);
    });
    return list;
  }

  function summaryStrip(model) {
    const strip = node('div', 'clarity-summary-strip');
    const soft = findRoster(model, model.softestId);
    const hard = findRoster(model, model.toughestId);
    const items = soft && hard
      ? [
          ['Softest road', soft.name, 'Index ' + soft.remaining.index + ' · ' + soft.remaining.label],
          ['Heaviest road', hard.name, 'Index ' + hard.remaining.index + ' · ' + hard.remaining.label],
          ['Weeks left', String(model.remainingWeeks.length), model.remainingWeeks.length ? 'Regular season' : 'Slate is final']
        ]
      : [
          ['Softest road', '—', 'Waiting on games'],
          ['Heaviest road', '—', 'Waiting on games'],
          ['Weeks left', String(model.remainingWeeks.length), 'Regular season']
        ];
    items.forEach(item => {
      const cell = node('div', 'clarity-summary-item');
      cell.appendChild(node('small', '', item[0]));
      cell.appendChild(node('strong', '', item[1]));
      cell.appendChild(node('span', 'sched-summary-meta', item[2]));
      strip.appendChild(cell);
    });
    return strip;
  }

  function viewTabs(state, onView) {
    const list = node('div', 'clarity-tabs sched-tabs');
    list.setAttribute('role', 'tablist');
    list.setAttribute('aria-label', 'Schedule desk views');
    [['heat', 'Heatmap'], ['h2h', 'Head-to-Head'], ['bye', 'Bye Radar'], ['odds', 'Playoff Odds'], ['fair', 'Fair Slate']].forEach(item => {
      const button = node('button', 'clarity-tab' + (state.view === item[0] ? ' active' : ''), item[1]);
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', state.view === item[0] ? 'true' : 'false');
      button.tabIndex = state.view === item[0] ? 0 : -1;
      button.id = 'sched-tab-' + item[0];
      button.setAttribute('aria-controls', 'sched-panel');
      button.dataset.schedFocus = 'tab-' + item[0];
      button.addEventListener('click', () => onView(item[0]));
      list.appendChild(button);
    });
    list.addEventListener('keydown', event => {
      const tabs = [...list.querySelectorAll('[role="tab"]')];
      const index = tabs.indexOf(root.document.activeElement);
      if (index < 0) return;
      let next = null;
      if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
      if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
      if (event.key === 'Home') next = tabs[0];
      if (event.key === 'End') next = tabs[tabs.length - 1];
      if (!next) return;
      event.preventDefault();
      next.click();
    });
    return list;
  }

  function legend() {
    const bar = node('div', 'sched-legend');
    [['easy', 'Easy draw'], ['mid', 'Even draw'], ['hard', 'Hard draw'], ['mark', 'Underline = run']].forEach(item => {
      const label = node('span', 'sched-legend-item');
      label.appendChild(node('i', 'sched-swatch ' + item[0]));
      label.appendChild(root.document.createTextNode(item[1]));
      bar.appendChild(label);
    });
    return bar;
  }

  function renderHeat(model, state, onSort, onCompare) {
    const panel = node('div', 'sched-panel');
    panel.appendChild(notesNode(leagueInsights(model)));
    const controls = node('div', 'sched-controls');
    const sort = node('div', 'clarity-tabs sched-sort');
    sort.setAttribute('role', 'group');
    sort.setAttribute('aria-label', 'Sort the heatmap');
    [['standings', 'By standings'], ['slate', 'Softest slate first']].forEach(item => {
      const button = node('button', 'clarity-tab' + (state.sort === item[0] ? ' active' : ''), item[1]);
      button.type = 'button';
      button.setAttribute('aria-pressed', state.sort === item[0] ? 'true' : 'false');
      button.dataset.schedFocus = 'sort-' + item[0];
      button.addEventListener('click', () => onSort(item[0]));
      sort.appendChild(button);
    });
    controls.appendChild(sort);
    panel.appendChild(controls);
    panel.appendChild(legend());
    const scroller = node('div', 'sched-scroll');
    const table = node('table', 'sched-heat');
    const caption = node('caption', '', 'Color is the opponent, not the result. Green is a soft draw, rust is a grind, and the underline marks a multi-week run. W and L are final. Gold-edged rows are in the playoff picture.');
    table.appendChild(caption);
    const head = node('thead');
    const group = node('tr');
    const managerHead = node('th', 'sched-sticky', 'Manager');
    managerHead.scope = 'col';
    managerHead.rowSpan = 2;
    const slateHead = node('th', '', 'Slate');
    slateHead.scope = 'col';
    slateHead.rowSpan = 2;
    group.append(managerHead, slateHead);
    const regularHead = node('th', 'sched-group', 'Regular season');
    regularHead.colSpan = model.regularWeeks.length;
    group.appendChild(regularHead);
    if (model.playoffWeeks.length) {
      const playoffHead = node('th', 'sched-group sched-playoff-group', 'Posted playoff slate');
      playoffHead.colSpan = model.playoffWeeks.length;
      group.appendChild(playoffHead);
    }
    const weeksRow = node('tr');
    model.regularWeeks.concat(model.playoffWeeks).forEach(week => {
      const cell = node('th', (model.playoffWeeks.includes(week) ? 'sched-playoff-col ' : '') + (week === model.currentWeek ? 'is-now' : ''), 'W' + week);
      cell.scope = 'col';
      if (week === model.currentWeek) cell.setAttribute('aria-current', 'date');
      weeksRow.appendChild(cell);
    });
    head.append(group, weeksRow);
    table.appendChild(head);
    const body = node('tbody');
    orderedRosters(model, state.sort).forEach(roster => {
      const row = node('tr', roster.inPlayoffPicture ? 'in-field' : '');
      const who = node('th', 'sched-sticky');
      who.scope = 'row';
      const identity = node('div', 'sched-manager');
      identity.appendChild(avatarNode(roster.name));
      const copy = node('div', 'sched-manager-copy');
      copy.appendChild(node('strong', '', roster.rank + '. ' + roster.name));
      copy.appendChild(node('small', '', formatOwn(roster) + (roster.inPlayoffPicture ? ' · in the field' : '')));
      identity.appendChild(copy);
      const compare = node('button', 'sched-compare', 'Compare');
      compare.type = 'button';
      compare.dataset.schedFocus = 'compare-' + roster.rosterId;
      compare.setAttribute('aria-label', 'Compare ' + roster.name + ' head to head');
      compare.addEventListener('click', () => onCompare(roster.rosterId));
      identity.appendChild(compare);
      who.appendChild(identity);
      row.appendChild(who);
      const slate = node('td', 'sched-slate ' + roster.remaining.label.toLowerCase());
      slate.appendChild(node('b', '', roster.remaining.index == null ? '—' : String(roster.remaining.index)));
      slate.appendChild(node('span', '', roster.remaining.label));
      row.appendChild(slate);
      const softWeeks = new Set((roster.stretches.soft && roster.stretches.soft.weeks) || []);
      const brutalWeeks = new Set((roster.stretches.brutal && roster.stretches.brutal.weeks) || []);
      roster.cells.forEach(cell => {
        const td = node('td', (model.playoffWeeks.includes(cell.week) ? 'sched-playoff-col' : '') + (cell.week === model.currentWeek ? ' is-now' : ''));
        if (cell.missing) {
          td.appendChild(node('span', 'sched-cell missing', '—'));
        } else {
          const classes = ['sched-cell', cell.band || 'none'];
          if (cell.result) classes.push('is-' + cell.result.toLowerCase());
          if (softWeeks.has(cell.week)) classes.push('in-soft');
          if (brutalWeeks.has(cell.week)) classes.push('in-brutal');
          if (cell.phase === 'live') classes.push('is-live');
          const link = node('a', classes.join(' '), cell.bye || !cell.opponentAbbrev ? 'BYE' : cell.opponentAbbrev);
          link.href = 'matchups.html#week-' + cell.week;
          link.title = cellSummary(cell);
          link.setAttribute('aria-label', cellSummary(cell));
          if (cell.result) link.appendChild(node('em', 'sched-mark ' + cell.result.toLowerCase(), cell.result));
          td.appendChild(link);
        }
        row.appendChild(td);
      });
      body.appendChild(row);
    });
    table.appendChild(body);
    scroller.appendChild(table);
    panel.appendChild(scroller);
    panel.appendChild(node('p', 'sched-scroll-hint', 'The slate index is the average difficulty of the games still left. Lower is softer.'));
    return panel;
  }

  function managerSelect(model, value, focusKey, label, onChange) {
    const field = node('label', 'sched-field');
    field.appendChild(node('span', '', label));
    const select = node('select');
    select.dataset.schedFocus = focusKey;
    model.rosters.forEach(roster => {
      const option = node('option', '', roster.rank + '. ' + roster.name + ' (' + formatOwn(roster) + ')');
      option.value = String(roster.rosterId);
      if (Number(value) === roster.rosterId) option.selected = true;
      select.appendChild(option);
    });
    select.addEventListener('change', () => onChange(Number(select.value)));
    field.appendChild(select);
    return field;
  }

  function renderHeadToHead(model, state, onSelect) {
    const panel = node('div', 'sched-panel');
    const controls = node('div', 'sched-controls');
    controls.appendChild(managerSelect(model, state.a, 'select-a', 'Manager A', id => onSelect('a', id)));
    controls.appendChild(managerSelect(model, state.b, 'select-b', 'Manager B', id => onSelect('b', id)));
    panel.appendChild(controls);
    const left = findRoster(model, state.a);
    const right = findRoster(model, state.b);
    if (!left || !right) return panel;
    if (left.rosterId === right.rosterId) {
      panel.appendChild(node('p', 'note', 'Pick two different managers to compare the road left.'));
      return panel;
    }
    panel.appendChild(notesNode(matchupInsights(model, left.rosterId, right.rosterId)));
    const heads = node('div', 'sched-duel-head');
    [left, right].forEach(roster => {
      const card = node('div', 'sched-scorecard ' + roster.remaining.label.toLowerCase());
      card.appendChild(avatarNode(roster.name));
      const copy = node('div', '');
      copy.appendChild(node('strong', '', roster.name));
      copy.appendChild(node('span', '', formatOwn(roster) + ' · ' + ordinal(roster.rank) + ' · ' + roster.remaining.vsPicture + ' left vs the playoff field'));
      card.appendChild(copy);
      const index = node('div', 'sched-manager-score');
      index.appendChild(node('b', '', roster.remaining.index == null ? '—' : String(roster.remaining.index)));
      index.appendChild(node('small', '', roster.remaining.label + ' slate'));
      card.appendChild(index);
      heads.appendChild(card);
    });
    panel.appendChild(heads);
    const weeks = left.cells.map(cell => cell.week);
    weeks.forEach(week => {
      const leftCell = left.cells.find(cell => cell.week === week);
      const rightCell = right.cells.find(cell => cell.week === week);
      const row = node('div', 'sched-week' + (week === model.currentWeek ? ' is-now' : '') + (model.playoffWeeks.includes(week) ? ' is-playoff' : ''));
      const label = node('div', 'sched-week-label', 'W' + week);
      if (model.playoffWeeks.includes(week)) label.appendChild(node('small', '', 'Playoff'));
      else if (week <= model.completedThrough) label.appendChild(node('small', '', 'Final'));
      else if (week === model.currentWeek) label.appendChild(node('small', '', 'Now'));
      else label.appendChild(node('small', '', 'Next'));
      row.appendChild(label);
      [leftCell, rightCell].forEach(cell => {
        const card = node('a', 'sched-opp ' + ((cell && cell.band) || 'none') + (cell && cell.opponentId && (cell.opponentId === left.rosterId || cell.opponentId === right.rosterId) ? ' is-meet' : ''));
        card.href = 'matchups.html#week-' + week;
        if (!cell || cell.missing) {
          card.appendChild(node('b', '', 'Unposted'));
        } else if (cell.bye || !cell.opponentName) {
          card.appendChild(node('b', '', 'Bye'));
        } else {
          card.appendChild(node('b', '', cell.opponentName));
          const meta = [cell.opponentRecord, cell.opponentRank ? ordinal(cell.opponentRank) : '', cell.band === 'mid' ? 'Even' : cell.band].filter(Boolean).join(' · ');
          card.appendChild(node('span', '', meta));
          if (cell.result) card.appendChild(node('em', 'sched-result ' + cell.result.toLowerCase(), cell.result + (cell.points != null ? ' ' + cell.points.toFixed(1) : '')));
        }
        row.appendChild(card);
      });
      panel.appendChild(row);
    });
    return panel;
  }

  function playerChoices(directories) {
    const seen = new Set();
    const groups = [];
    directories.forEach(dir => {
      const players = [];
      dir.starters.concat(dir.bench).forEach(player => {
        if (!player || !player.id || seen.has(player.id)) return;
        seen.add(player.id);
        players.push(player);
      });
      if (players.length) groups.push({name: dir.name, rosterId: dir.rosterId, players});
    });
    return groups;
  }

  function findPlayer(directories, id) {
    let found = null;
    (directories || []).forEach(dir => {
      dir.starters.concat(dir.bench).forEach(player => {
        if (!found && String(player.id) === String(id)) found = Object.assign({manager: dir.name, rosterId: dir.rosterId}, player);
      });
    });
    return found;
  }

  function suggestDuel(report) {
    const starters = report.starters || [];
    for (let i = 0; i < starters.length; i++) {
      for (let j = i + 1; j < starters.length; j++) {
        const left = starters[i];
        const right = starters[j];
        if (!left.position || left.position !== right.position) continue;
        const differs = left.weeks.some((week, index) => right.weeks[index] && week.status !== right.weeks[index].status);
        if (differs) return [left.id, right.id];
      }
    }
    if (starters[0] && starters[1]) return [starters[0].id, starters[1].id];
    if (starters[0] && report.bench && report.bench[0]) return [starters[0].id, report.bench[0].id];
    return [null, null];
  }

  function renderBye(bundle, state, onManager, onPlayers) {
    const panel = node('div', 'sched-panel');
    const weeks = byeWindow(bundle.model);
    if (bundle.playerFeed && bundle.playerFeed.source === 'unavailable') {
      panel.appendChild(node('p', 'note', 'Player teams are temporarily unavailable, so bye weeks cannot be mapped. The manager heatmap still works.'));
      return panel;
    }
    const reports = bundle.directories.map(dir => ({
      rosterId: dir.rosterId,
      name: dir.name,
      report: byeReport({starters: dir.starters, bench: dir.bench, weeks, nfl: bundle.nfl})
    }));
    const worst = worstCollision(reports);
    if (worst) {
      const callout = node('button', 'sched-callout', '');
      callout.type = 'button';
      callout.dataset.schedFocus = 'worst-bye';
      callout.appendChild(node('strong', '', 'Loudest bye week'));
      callout.appendChild(node('span', '', 'Week ' + worst.week + ' · ' + worst.name + ' has ' + worst.count + ' starters off. Open that roster.'));
      callout.addEventListener('click', () => onManager(worst.rosterId));
      panel.appendChild(callout);
    } else {
      const incomplete = reports.some(item => item.report.unknownWeeks.length);
      panel.appendChild(node('p', 'sched-callout static', incomplete ? 'No collision is confirmed. Some NFL schedules or player teams are unknown; those weeks are not treated as byes.' : 'No roster has two starters on bye in the same remaining week.'));
    }
    const dir = bundle.directories.find(item => item.rosterId === Number(state.byeId)) || bundle.directories[0];
    const controls = node('div', 'sched-controls');
    controls.appendChild(managerSelect(bundle.model, dir ? dir.rosterId : null, 'bye-manager', 'Roster', onManager));
    panel.appendChild(controls);
    if (!dir) return panel;
    const report = byeReport({starters: dir.starters, bench: dir.bench, weeks, nfl: bundle.nfl});
    panel.appendChild(notesNode(byeInsights(report)));
    if (!report.starters.length) return panel;
    const scroller = node('div', 'sched-scroll');
    const table = node('table', 'sched-heat sched-bye');
    table.appendChild(node('caption', '', 'Starters on ' + dir.name + ' from Week ' + weeks[0] + ' through Week ' + weeks[weeks.length - 1] + '. BYE is a dark week. @ marks an away game.'));
    const head = node('thead');
    const headRow = node('tr');
    headRow.appendChild(node('th', 'sched-sticky', 'Starter'));
    const collisionWeeks = new Set(report.weekSummaries.filter(item => item.byes.length >= 2).map(item => item.week));
    weeks.forEach(week => {
      const cell = node('th', (collisionWeeks.has(week) ? 'is-danger ' : '') + (bundle.model.playoffWeeks.includes(week) ? 'sched-playoff-col' : ''), 'W' + week);
      headRow.appendChild(cell);
    });
    head.appendChild(headRow);
    table.appendChild(head);
    const body = node('tbody');
    report.starters.forEach(player => {
      const row = node('tr');
      const who = node('th', 'sched-sticky');
      who.scope = 'row';
      const copy = node('div', 'sched-manager-copy');
      copy.appendChild(node('strong', '', player.name));
      copy.appendChild(node('small', '', [player.slot, player.team].filter(Boolean).join(' · ')));
      who.appendChild(copy);
      row.appendChild(who);
      player.weeks.forEach(week => {
        const td = node('td', collisionWeeks.has(week.week) ? 'is-danger' : '');
        td.appendChild(node('span', 'sched-cell ' + (week.status === 'bye' ? 'bye' : week.status === 'play' ? 'play' : 'missing'), week.label));
        row.appendChild(td);
      });
      body.appendChild(row);
    });
    table.appendChild(body);
    scroller.appendChild(table);
    panel.appendChild(scroller);

    if (report.weekSummaries.length) {
      const cards = node('div', 'sched-bye-cards');
      report.weekSummaries.forEach(summary => {
        const card = node('article', 'sched-bye-card' + (summary.byes.length >= 2 ? ' is-collision' : ''));
        card.appendChild(node('h3', '', 'Week ' + summary.week + (summary.byes.length >= 2 ? ' · collision' : '')));
        summary.byes.forEach(bye => {
          const line = node('div', 'sched-bye-line');
          line.appendChild(node('strong', '', (bye.slot || bye.position || 'Starter') + ' · ' + bye.name));
          if (bye.cover) {
            const cover = bye.cover;
            line.appendChild(node('p', '', 'Bench fit: ' + cover.name + ' (' + (cover.home ? 'vs ' : '@ ') + cover.opponent + '). Each bench player is counted once per week; recheck injuries before kickoff.'));
          } else {
            const cached = state.pickupCache.has(summary.week);
            const options = cached ? pickupOptions(state.pickupCache.get(summary.week), bundle.nfl[summary.week], bye.slot || bye.position, bundle.rostered) : [];
            if (!bundle.ownershipKnown) {
              line.appendChild(node('p', '', 'No separate healthy bench fit. Current league ownership is unavailable, so free-agent suggestions are withheld.'));
            } else if (!cached) {
              line.appendChild(node('p', '', 'No separate healthy bench fit. Checking unrostered ' + (bye.slot || bye.position || 'player') + ' options…'));
            } else if (!options.length) {
              line.appendChild(node('p', '', 'No separate healthy bench fit, and no eligible unrostered player with a posted game is in the Week ' + summary.week + ' projection feed.'));
            } else {
              line.appendChild(node('p', '', 'No bench cover. Unrostered options by Week ' + summary.week + ' projection:'));
              const list = node('ol', 'sched-pickups');
              options.forEach(option => {
                const item = node('li', '', option.name + ' · ' + option.team + ' ' + (option.home ? 'vs ' : '@ ') + option.opponent + (option.projection == null ? '' : ' · ' + option.projection.toFixed(1)));
                list.appendChild(item);
              });
              line.appendChild(list);
            }
          }
          card.appendChild(line);
        });
        cards.appendChild(card);
      });
      panel.appendChild(cards);
    }

    const suggestion = suggestDuel(report);
    if (!state.playerA) state.playerA = suggestion[0];
    if (!state.playerB) state.playerB = suggestion[1];
    const duel = node('section', 'sched-duel-block');
    duel.appendChild(node('h3', 'sched-duel-title', 'Who plays, who sits'));
    duel.appendChild(node('p', 'sched-duel-copy', 'Compare any two rostered players’ posted games and byes. Calendar availability is not a start/sit recommendation; check position eligibility and injuries.'));
    const picks = node('div', 'sched-controls');
    [['player-a', 'Player A', state.playerA, 'a'], ['player-b', 'Player B', state.playerB, 'b']].forEach(spec => {
      const field = node('label', 'sched-field');
      field.appendChild(node('span', '', spec[1]));
      const select = node('select');
      select.dataset.schedFocus = spec[0];
      playerChoices(bundle.directories).forEach(group => {
        const optgroup = root.document.createElement('optgroup');
        optgroup.label = group.name;
        group.players.forEach(player => {
          const option = node('option', '', player.name + ' · ' + (player.position || player.slot || 'BN'));
          option.value = String(player.id);
          if (String(spec[2]) === String(player.id)) option.selected = true;
          optgroup.appendChild(option);
        });
        select.appendChild(optgroup);
      });
      select.addEventListener('change', () => onPlayers(spec[3], select.value));
      field.appendChild(select);
      picks.appendChild(field);
    });
    duel.appendChild(picks);
    const playerA = findPlayer(bundle.directories, state.playerA);
    const playerB = findPlayer(bundle.directories, state.playerB);
    if (playerA && playerB && playerA.id !== playerB.id) {
      const comparison = comparePlayers(playerA, playerB, bundle.nfl, weeks);
      duel.appendChild(notesNode(duelInsights(comparison, playerA, playerB).slice(0, 4)));
      const grid = node('div', 'sched-scroll');
      const table = node('table', 'sched-heat sched-bye');
      const head = node('thead');
      const headRow = node('tr');
      headRow.appendChild(node('th', 'sched-sticky', 'Player'));
      weeks.forEach(week => headRow.appendChild(node('th', '', 'W' + week)));
      head.appendChild(headRow);
      table.appendChild(head);
      const body = node('tbody');
      [[playerA, 'a'], [playerB, 'b']].forEach(pair => {
        const row = node('tr');
        const who = node('th', 'sched-sticky');
        const copy = node('div', 'sched-manager-copy');
        copy.appendChild(node('strong', '', pair[0].name));
        copy.appendChild(node('small', '', pair[0].manager + (pair[0].team ? ' · ' + pair[0].team : '')));
        who.appendChild(copy);
        row.appendChild(who);
        comparison.rows.forEach(item => {
          const week = pair[1] === 'a' ? item.a : item.b;
          const edge = item.edge === pair[1];
          row.appendChild(node('td', '', '')).appendChild(node('span', 'sched-cell ' + (week.status === 'bye' ? 'bye' : week.status === 'play' ? 'play' : 'missing') + (edge ? ' is-edge' : ''), week.label));
        });
        body.appendChild(row);
      });
      table.appendChild(body);
      grid.appendChild(table);
      duel.appendChild(grid);
    } else if (playerA && playerB) {
      duel.appendChild(node('p', 'note', 'Pick two different players.'));
    }
    panel.appendChild(duel);
    return panel;
  }

  function holeWeeks(report) {
    const weeks = [];
    (report.weekSummaries || []).forEach(summary => {
      if (summary.byes.some(bye => !bye.cover) && !weeks.includes(summary.week)) weeks.push(summary.week);
    });
    return weeks;
  }

  function restoreFocus(container, key) {
    if (!container || !key) return;
    const target = container.querySelector('[data-sched-focus="' + key + '"]');
    if (target && typeof target.focus === 'function') target.focus({preventScroll: true});
  }

  function syncUrl(state, model) {
    if (!root.history || !root.location || !model) return;
    try {
      const params = new URLSearchParams(root.location.search || '');
      const left = findRoster(model, state.a);
      const right = findRoster(model, state.b);
      const bye = findRoster(model, state.byeId);
      if (left) params.set('a', left.name);
      if (right) params.set('b', right.name);
      if (bye) params.set('bye', bye.name);
      params.set('sort', state.sort);
      if (state.playerA) params.set('pa', state.playerA); else params.delete('pa');
      if (state.playerB) params.set('pb', state.playerB); else params.delete('pb');
      const query = params.toString();
      const hash = state.view === 'heat' ? 'heat' : state.view;
      root.history.replaceState(null, '', root.location.pathname + (query ? '?' + query : '') + '#' + hash);
    } catch (_err) {}
  }

  function readUrl(state) {
    try {
      const params = new URLSearchParams(root.location.search || '');
      state.pendingA = params.get('a');
      state.pendingB = params.get('b');
      state.pendingBye = params.get('bye');
      state.sort = params.get('sort') === 'slate' ? 'slate' : 'standings';
      state.playerA = /^[A-Za-z0-9_-]{1,24}$/.test(params.get('pa') || '') ? params.get('pa') : null;
      state.playerB = /^[A-Za-z0-9_-]{1,24}$/.test(params.get('pb') || '') ? params.get('pb') : null;
      const hash = String(root.location.hash || '').replace('#', '');
      state.view = ['h2h', 'bye', 'heat', 'odds', 'fair'].includes(hash) ? hash : 'heat';
    } catch (_err) {}
  }

  function resolveName(model, name) {
    if (!name) return null;
    const found = model.rosters.find(roster => roster.name === name);
    return found ? found.rosterId : null;
  }

  function fetchJSON(url) {
    const controller = typeof root.AbortController !== 'undefined' ? new root.AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 12000) : null;
    return root.fetch(url, {
      headers: {Accept: 'application/json'},
      cache: 'no-store',
      credentials: 'omit',
      signal: controller && controller.signal
    }).then(response => {
      if (!response.ok) throw new Error('Request failed (' + response.status + ').');
      return response.json();
    }).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }

  function directoryFor(roster, snapshot, playerFeed, ownership) {
    const current = (ownership || []).find(item => Number(item.roster_id) === roster.rosterId);
    const row = current ? {starters: current.starters || [], players: current.players || []} : (snapshot.matchups || []).find(item => item.rosterId === roster.rosterId) || {rosterId: roster.rosterId, starters: [], players: []};
    const lineup = root.FarmhoodLive.lineupFor(row, snapshot.rosterPositions, playerFeed);
    const starterIds = new Set(lineup.map(player => String(player.id)));
    const players = (playerFeed && playerFeed.players) || {};
    const starters = lineup.filter(player => player.id && player.id !== '0').map(player => ({
      id: String(player.id),
      name: player.name,
      position: player.position || '',
      slot: player.slot || player.position || '',
      team: player.team || (/^[A-Z]{2,4}$/.test(player.id) ? player.id : ''),
      injury: player.injury || ''
    }));
    const bench = (row.players || []).filter(id => id && id !== '0' && !starterIds.has(String(id))).map(id => {
      const info = players[id] || {};
      const defense = NFL_TEAMS.has(String(id));
      return {
        id: String(id),
        name: info.name || (defense ? id + ' D/ST' : 'Player ' + id),
        position: info.position || (defense ? 'DEF' : ''),
        slot: 'BN',
        team: info.team || (/^[A-Z]{2,4}$/.test(String(id)) ? String(id) : ''),
        injury: info.injury || ''
      };
    });
    return {rosterId: roster.rosterId, name: roster.name, starters, bench};
  }

  function loadBundle(force) {
    const live = root.FarmhoodLive;
    return live.load({force: !!force}).then(snapshot => {
      const shapePromise = fetchJSON('https://api.sleeper.app/v1/league/' + snapshot.leagueId).then(league => {
        const settings = (league && league.settings) || {};
        return {
          playoffStart: finite(settings.playoff_week_start, snapshot.regularSeasonWeeks + 1),
          playoffTeams: finite(settings.playoff_teams, 6),
          playoffReseed: null
        };
      }).catch(() => ({playoffStart: snapshot.regularSeasonWeeks + 1, playoffTeams: 6, playoffReseed: null}));
      const lastWeek = snapshot.regularSeasonWeeks + 3;
      const weekNumbers = [];
      for (let week = 1; week <= lastWeek; week++) weekNumbers.push(week);
      const weeksPromise = Promise.all(weekNumbers.map(week => week === snapshot.currentWeek
        ? Promise.resolve([week, snapshot.matchups || []])
        : live.loadWeek(week, {force: !!force && week >= snapshot.currentWeek - 1}).then(rows => [week, rows]).catch(() => [week, []])));
      const playersPromise = live.loadPlayers(snapshot, snapshot.currentWeek, {force: !!force}).catch(() => ({players: {}, source: 'unavailable'}));
      const ownershipPromise = fetchJSON('https://api.sleeper.app/v1/league/' + snapshot.leagueId + '/rosters').then(rows => {
        if (!Array.isArray(rows) || rows.length !== snapshot.rosters.length || !snapshot.rosters.every(roster => rows.some(row => Number(row.roster_id) === roster.rosterId && Array.isArray(row.players) && Array.isArray(row.starters)))) return null;
        return rows;
      }).catch(() => null);
      const nflFrom = Math.min(snapshot.currentWeek, snapshot.regularSeasonWeeks + 1);
      const nflNumbers = [];
      for (let week = nflFrom; week <= lastWeek; week++) nflNumbers.push(week);
      const nflPromise = fetchJSON('https://api.sleeper.app/schedule/nfl/regular/' + snapshot.season).then(rows => {
        const calendar = normalizeNflSeason(rows);
        if (!calendar) throw new Error('The NFL season calendar is incomplete.');
        return calendar;
      }).catch(() => Promise.all(nflNumbers.map(week => fetchJSON('https://api.sleeper.app/scores/nfl/regular/' + snapshot.season + '/' + week)
        .then(rows => [week, normalizeNflWeek(rows, week)])
        .catch(() => [week, null]))).then(entries => Object.fromEntries(entries)));
      return Promise.all([shapePromise, weeksPromise, playersPromise, nflPromise, ownershipPromise]).then(parts => {
        const shape = parts[0];
        const weeks = Object.fromEntries(parts[1]);
        const playerFeed = parts[2] || {players: {}, source: 'unavailable'};
        const games = snapshot.rosters.map(roster => finite(roster.wins, 0) + finite(roster.losses, 0) + finite(roster.ties, 0));
        const completedThrough = games.length ? Math.min(snapshot.regularSeasonWeeks, ...games) : 0;
        const model = analyze({
          rosters: snapshot.rosters,
          weeks,
          regularSeasonWeeks: snapshot.regularSeasonWeeks,
          playoffStart: shape.playoffStart,
          playoffTeams: shape.playoffTeams,
          completedThrough,
          currentWeek: snapshot.currentWeek
        });
        const ownership = parts[4];
        const directories = snapshot.rosters.map(roster => directoryFor(roster, snapshot, playerFeed, ownership));
        const rostered = new Set();
        (ownership || snapshot.matchups || []).forEach(row => [].concat(row.players || [], row.reserve || [], row.taxi || []).forEach(id => {
          if (id && id !== '0') rostered.add(String(id));
        }));
        return {snapshot, model, weeks, nfl: parts[3], directories, rostered, ownershipKnown: !!ownership, playerFeed, shape};
      });
    });
  }

  const METHOD = 'The slate index blends each remaining opponent\'s win percentage (62%) with their points-for rank (38%). Lower is a softer road; it is not a win probability. Future playoff pairings are not locked; bracket format is set by the league. Bye weeks use each player\'s current NFL team and a validated full-season NFL schedule; missing teams in partial calendars are unknown. Bench fits use current injury status and count each player once per week. Waiver names require current league ownership and are ranked by that week\'s Farmhood projection, not guaranteed points. No lineup changes are made.';

  function mount(target) {
    if (!root.document) return;
    const host = target || root.document.getElementById('app');
    if (!host) return;
    host.textContent = '';
    if (typeof root.header === 'function') {
      host.appendChild(root.header(
        'Schedule Desk',
        'The Gauntlet',
        'The season desk: remaining slates, bye weeks, playoff odds, and what the schedule has been worth.'
      ));
    }
    const status = node('div', 'sched-status');
    const body = node('div', 'sched-body');
    host.append(status, body);
    if (!root.FarmhoodLive) {
      status.appendChild(typeof root.liveError === 'function' ? root.liveError('The schedule desk needs the Sleeper feed.') : node('p', 'note', 'The schedule desk needs the Sleeper feed.'));
      return;
    }
    status.appendChild(typeof root.liveLoading === 'function' ? root.liveLoading('Loading every week on the slate…') : node('p', 'note', 'Loading every week on the slate…'));
    const state = {
      view: 'heat',
      sort: 'standings',
      a: null,
      b: null,
      byeId: null,
      playerA: null,
      playerB: null,
      focus: '',
      bundle: null,
      pickupCache: new Map(),
      pickupInflight: new Set()
    };
    let refreshVersion = 0;
    readUrl(state);

    function queuePickups() {
      const bundle = state.bundle;
      if (!bundle || !bundle.ownershipKnown || state.view !== 'bye') return;
      const dir = bundle.directories.find(item => item.rosterId === Number(state.byeId)) || bundle.directories[0];
      if (!dir) return;
      const report = byeReport({starters: dir.starters, bench: dir.bench, weeks: byeWindow(bundle.model), nfl: bundle.nfl});
      const missing = holeWeeks(report).filter(week => !state.pickupCache.has(week) && !state.pickupInflight.has(week)).slice(0, 3);
      if (!missing.length) return;
      missing.forEach(week => state.pickupInflight.add(week));
      Promise.all(missing.map(week => root.FarmhoodLive.loadPlayers(bundle.snapshot, week)
        .then(feed => [week, (feed && feed.players) || {}])
        .catch(() => [week, {}]))).then(entries => {
        if (state.bundle !== bundle) return;
        entries.forEach(entry => {
          state.pickupCache.set(entry[0], entry[1]);
          state.pickupInflight.delete(entry[0]);
        });
        if (state.view === 'bye') paint();
      });
    }

    function paint() {
      const bundle = state.bundle;
      if (!bundle) return;
      const active = root.document.activeElement;
      const focus = state.focus || (active && body.contains(active) && active.dataset && active.dataset.schedFocus) || '';
      state.focus = '';
      body.textContent = '';
      body.appendChild(summaryStrip(bundle.model));
      body.appendChild(viewTabs(state, view => {
        state.view = view;
        state.focus = 'tab-' + view;
        paint();
      }));
      const panel = node('div', 'sched-panel-host');
      panel.id = 'sched-panel';
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', 'sched-tab-' + state.view);
      if (state.view === 'h2h') {
        panel.appendChild(renderHeadToHead(bundle.model, state, (side, id) => {
          state[side] = id;
          state.focus = side === 'a' ? 'select-a' : 'select-b';
          paint();
        }));
      } else if (state.view === 'odds' && root.FarmhoodDesk) {
        panel.appendChild(root.FarmhoodDesk.renderOdds(bundle));
      } else if (state.view === 'fair' && root.FarmhoodDesk) {
        panel.appendChild(root.FarmhoodDesk.renderFair(bundle));
      } else if (state.view === 'odds' || state.view === 'fair') {
        panel.appendChild(node('p', 'note', 'This analysis is temporarily unavailable. Heatmap, Head-to-Head, and Bye Radar are still available.'));
      } else if (state.view === 'bye') {
        panel.appendChild(renderBye(bundle, state, id => {
          state.byeId = id;
          state.playerA = null;
          state.playerB = null;
          state.focus = 'bye-manager';
          paint();
        }, (side, id) => {
          if (side === 'a') state.playerA = id;
          else state.playerB = id;
          state.focus = side === 'a' ? 'player-a' : 'player-b';
          paint();
        }));
      } else {
        panel.appendChild(renderHeat(bundle.model, state, sort => {
          state.sort = sort;
          state.focus = 'sort-' + sort;
          paint();
        }, rosterId => {
          if (state.a === rosterId) {
            const other = bundle.model.rosters.find(roster => roster.rosterId !== rosterId);
            state.a = other ? other.rosterId : state.a;
          }
          state.b = rosterId;
          state.view = 'h2h';
          state.focus = 'select-b';
          paint();
        }));
      }
      body.appendChild(panel);
      if (typeof root.clarityDisclosure === 'function') {
        body.appendChild(root.clarityDisclosure('How to read the slate', 'Strength, playoff pencil marks, and bye weeks', node('p', 'sched-method', METHOD)));
      } else {
        body.appendChild(node('p', 'note', METHOD));
      }
      syncUrl(state, bundle.model);
      restoreFocus(body, focus);
      queuePickups();
    }

    function applyBundle(bundle) {
      if (state.bundle) {
        bundle.oddsUi = state.bundle.oddsUi;
        bundle.fairUi = state.bundle.fairUi;
      }
      state.bundle = bundle;
      const namedA = resolveName(bundle.model, state.pendingA);
      const namedB = resolveName(bundle.model, state.pendingB);
      const namedBye = resolveName(bundle.model, state.pendingBye);
      state.pendingA = null;
      state.pendingB = null;
      state.pendingBye = null;
      if (namedA) state.a = namedA;
      if (namedB) state.b = namedB;
      if (namedBye) state.byeId = namedBye;
      if (state.a == null || state.b == null) {
        const pair = defaultPair(bundle.model);
        if (state.a == null) state.a = pair[0];
        if (state.b == null) state.b = pair[1];
      }
      if (state.byeId == null) state.byeId = state.a;
      if (!findRoster(bundle.model, state.a)) state.a = defaultPair(bundle.model)[0];
      if (!findRoster(bundle.model, state.b)) state.b = defaultPair(bundle.model)[1];
      if (!findRoster(bundle.model, state.byeId)) state.byeId = state.a;
      if (!findPlayer(bundle.directories, state.playerA)) state.playerA = null;
      if (!findPlayer(bundle.directories, state.playerB)) state.playerB = null;
      state.pickupCache.clear();
      state.pickupInflight.clear();
      state.pickupCache.set(bundle.snapshot.currentWeek, (bundle.playerFeed && bundle.playerFeed.players) || {});
      status.textContent = '';
      if (typeof root.liveStatusBar === 'function') status.appendChild(root.liveStatusBar(bundle.snapshot, () => refresh(true)));
      paint();
    }

    function refresh(force) {
      const version = ++refreshVersion;
      return loadBundle(!!force).then(bundle => {
        if (version === refreshVersion) applyBundle(bundle);
      }).catch(() => {
        if (version !== refreshVersion) return;
        if (state.bundle) {
          status.appendChild(node('p', 'note', 'Refresh failed. The last loaded schedule is still shown; try refreshing again.'));
          return;
        }
        status.textContent = '';
        status.appendChild(typeof root.liveError === 'function'
          ? root.liveError('The schedule desk could not reach Sleeper. The rest of the record book is still available.')
          : node('p', 'note', 'The schedule desk could not reach Sleeper.'));
      });
    }

    if (typeof root.addEventListener === 'function') {
      const followUrl = () => {
        readUrl(state);
        if (!state.bundle) return;
        const model = state.bundle.model;
        state.a = resolveName(model, state.pendingA) || defaultPair(model)[0];
        state.b = resolveName(model, state.pendingB) || defaultPair(model)[1];
        state.byeId = resolveName(model, state.pendingBye) || state.a;
        state.pendingA = state.pendingB = state.pendingBye = null;
        if (!findPlayer(state.bundle.directories, state.playerA)) state.playerA = null;
        if (!findPlayer(state.bundle.directories, state.playerB)) state.playerB = null;
        paint();
      };
      root.addEventListener('hashchange', followUrl);
      root.addEventListener('popstate', followUrl);
    }

    refresh(false);
  }

  return {
    analyze,
    leagueInsights,
    matchupInsights,
    defaultPair,
    opponentStrength,
    abbreviateAll,
    eligibleForSlot,
    normalizeNflWeek,
    normalizeNflSeason,
    byeReport,
    byeInsights,
    worstCollision,
    comparePlayers,
    duelInsights,
    pickupOptions,
    cellSummary,
    loadBundle,
    mount
  };
});
