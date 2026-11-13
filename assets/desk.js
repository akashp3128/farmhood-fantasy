/* Farmhood season desk computations and the small surfaces that host them.
   Live money and exposure, playoff odds, fair-slate replay, draft graveyard,
   waiver autopsy, rivalry series, and manager fingerprints. */
(function(root, factory) {
  const api = factory(root);
  root.FarmhoodDesk = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function(root) {
  'use strict';

  const PRIZES = {high: 30, position: 10, rivalry: 50};
  const NFL_TEAMS = new Set('ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LAC LAR LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS'.split(' '));
  const POSITION_BY_WEEK = {1:'RB',2:'WR',3:'DEF',4:'QB',5:'RB',6:'TE',7:'WR',8:'K',9:'DEF',10:'FLEX',11:'QB',12:'RB',13:'FLEX',14:'QB'};
  const RIVALRIES = [
    {id:'ian-sal', week:1, a:'Siccboi', b:'turi70', labelA:'Ian', labelB:'Sal'},
    {id:'sasha-sid', week:2, a:'Archibaldo', b:'sidjunlee', labelA:'Sasha', labelB:'Sid'},
    {id:'akash-vince', week:4, a:'akaaashh', b:'vpitello34', labelA:'Akash', labelB:'Vince'},
    {id:'jimmy-marco', week:5, a:'jwislek_20', b:'maco71', labelA:'Jimmy', labelB:'Marco'},
    {id:'albert-pat', week:8, a:'Blumbo', b:'pgorny', labelA:'Albert', labelB:'Pat'},
    {id:'martin-dom', week:10, a:'martinch94', b:'cuch', labelA:'Martin', labelB:'Dom'}
  ];

  function finite(value, fallback) {
    const number = scoreOf(value);
    return number == null ? fallback : number;
  }
  function scoreOf(value) {
    if (value == null || typeof value === 'boolean' || (typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  function mean(values) {
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }
  function sd(values) {
    if (values.length < 2) return 0;
    const avg = mean(values);
    return Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1));
  }
  function mulberry32(seed) {
    let state = seed >>> 0;
    return function() {
      state = (state + 0x6D2B79F5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function sample(rng, values) {
    return values[Math.floor(rng() * values.length)];
  }
  function money(amount) {
    const number = finite(amount, 0);
    return '$' + (Math.abs(number - Math.round(number)) < 0.001 ? String(Math.round(number)) : number.toFixed(2));
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

  function rankedBoard(rows, amount) {
    const scored = rows.filter(row => scoreOf(row.score) != null).map(row => Object.assign({}, row, {score: Math.round(Number(row.score) * 100) / 100}))
      .sort((a, b) => b.score - a.score || String(a.ownerId || a.name).localeCompare(String(b.ownerId || b.name)));
    if (!scored.length) return [];
    const top = scored[0].score;
    let tied = 0;
    while (tied < scored.length && Math.abs(scored[tied].score - top) <= 0.001) tied += 1;
    const cents = Math.max(0, Math.round(finite(amount, 0) * 100));
    const shareCents = Math.floor(cents / tied);
    return scored.map((row, index) => ({
      name: row.name,
      player: row.player || '',
      score: row.score,
      gap: Math.round((top - row.score) * 100) / 100,
      rank: index < tied ? 1 : index + 1,
      leading: index < tied,
      share: index < tied ? (shareCents + (index < cents % tied ? 1 : 0)) / 100 : 0
    }));
  }

  function positionScore(team, position, mode) {
    let best = null;
    (team.starters || []).forEach(player => {
      if (!player || player.id === '0') return;
      const eligible = position === 'FLEX' ? player.slot === 'FLEX' : player.position === position;
      if (!eligible) return;
      const score = scoreOf(mode === 'projected' ? player.projection : player.points);
      if (score == null) return;
      if (!best || score > best.score) best = {name: team.name, ownerId: team.ownerId, player: player.name, score};
    });
    return best;
  }

  function dollarsOnTheTable(input) {
    const source = input || {};
    const mode = source.mode === 'projected' ? 'projected' : 'actual';
    const prizes = Object.assign({}, PRIZES, source.prizes || {});
    const position = source.position || '';
    const teams = source.teams || [];
    const high = rankedBoard(teams.map(team => ({
      name: team.name,
      ownerId: team.ownerId,
      score: scoreOf(mode === 'projected' ? team.projection : team.points)
    })).filter(row => row.score != null), prizes.high);
    const positionRows = teams.map(team => positionScore(team, position, mode)).filter(Boolean);
    const positionBoard = rankedBoard(positionRows, prizes.position);
    let rivalry = null;
    if (source.rivalry && source.rivalry.a && source.rivalry.b) {
      const left = teams.find(team => team.name === source.rivalry.a);
      const right = teams.find(team => team.name === source.rivalry.b);
      if (left && right) {
        const leftScore = scoreOf(mode === 'projected' ? left.projection : left.points);
        const rightScore = scoreOf(mode === 'projected' ? right.projection : right.points);
        let leader = null;
        if (leftScore != null && rightScore != null) {
          if (Math.abs(leftScore - rightScore) <= 0.001) leader = 'tie';
          else leader = leftScore > rightScore ? left.name : right.name;
        }
        rivalry = {
          a: left.name, b: right.name,
          labelA: source.rivalry.labelA || left.name,
          labelB: source.rivalry.labelB || right.name,
          scoreA: leftScore, scoreB: rightScore,
          amount: prizes.rivalry, leader
        };
      }
    }
    return {mode, position, high, positionBoard, rivalry, prizes};
  }

  function gameKey(player) {
    if (player.gameId) return 'id:' + player.gameId;
    const date = player.gameDate || player.gameStartTime;
    if (date && player.team && player.opponent) return date + ':' + [player.team, player.opponent].map(team => String(team).toUpperCase()).sort().join('-');
    // Kickoff alone is a window, not a game: several NFL games share it.
    if (date && player.team) return date + ':' + String(player.team).toUpperCase();
    return '';
  }

  function mondayExposure(input) {
    const source = input || {};
    const started = !!source.started;
    const rows = (source.teams || []).map(team => {
      const starters = (team.starters || []).filter(player => player && player.id && player.id !== '0');
      const remaining = starters.filter(player => !['final', 'complete', 'post_game'].includes(String(player.gameStatus || '').toLowerCase()));
      const keys = [...new Set(remaining.map(gameKey).filter(Boolean))];
      return {name: team.name, starters, remaining, keys, settled: starters.length > 0 && remaining.length === 0};
    });
    const dates = [];
    rows.forEach(row => row.remaining.forEach(player => { if (player.gameDate) dates.push(player.gameDate); }));
    const latest = dates.slice().sort().pop() || '';
    const starts = rows.flatMap(row => row.remaining).map(player => scoreOf(player.gameStartTime)).filter(time => time != null && time > 0);
    const latestStartTime = starts.length ? Math.max(...starts) : null;
    const oneGame = rows.filter(row => row.remaining.length && row.keys.length === 1 && row.remaining.every(player => gameKey(player))).map(row => ({
      name: row.name,
      players: row.remaining,
      when: row.remaining[0].gameDate || '',
      opponent: row.remaining[0].opponent || row.remaining[0].team || ''
    }));
    const latestWindow = rows.map(row => ({
      name: row.name,
      players: row.remaining.filter(player => latestStartTime != null ? Number(player.gameStartTime) === latestStartTime : latest && player.gameDate === latest)
    })).filter(row => row.players.length);
    const phase = !started ? 'pregame' : (rows.length && rows.every(row => row.settled) ? 'complete' : 'live');
    const unknown = rows.filter(row => row.remaining.some(player => !gameKey(player))).map(row => row.name);
    return {phase, latest, latestStartTime, oneGame, latestWindow, unknown, settled: rows.filter(row => row.settled).map(row => row.name)};
  }

  function nextPow2(number) {
    let size = 1;
    while (size < number) size *= 2;
    return size;
  }

  function playoffEquity(input) {
    const source = input || {};
    const sims = Math.min(20000, Math.max(1, Math.floor(scoreOf(source.sims) == null ? 2000 : Number(source.sims))));
    const seed = Math.trunc(finite(source.seed, 202611)) >>> 0;
    const rng = mulberry32(seed);
    const identities = new Set();
    const base = (Array.isArray(source.teams) ? source.teams : []).filter(team => {
      if (!team || team.id == null || String(team.id) === '' || identities.has(String(team.id))) return false;
      identities.add(String(team.id));
      return true;
    }).map(team => ({
      id: team.id, name: String(team.name || team.id),
      wins: Math.max(0, finite(team.wins, 0)), pf: finite(team.pf, 0),
      scores: (Array.isArray(team.scores) ? team.scores : []).map(scoreOf).filter(score => score != null)
    }));
    if (!base.length) return [];
    const leagueScores = base.flatMap(team => team.scores);
    const spots = Math.min(Math.max(1, Math.floor(finite(source.playoffTeams, 6))), base.length);
    // A made-up league average would produce precise-looking odds from no evidence.
    if (!leagueScores.length) return base.map(team => ({
      id: team.id, name: team.name, wins: team.wins, status: 'insufficient-data',
      playoffPct: null, titlePct: null, meanWins: null, medianWins: null, winsRange: null,
      seedPct: Array(base.length).fill(null), playoffInterval: null, titleInterval: null,
      sampleWeeks: 0, poolSamples: 0, samples: 0, seed, samplingSource: 'unavailable'
    }));
    base.forEach(team => {
      team.pool = team.scores.length ? team.scores : leagueScores;
      const adjustment = source.adjustments && typeof source.adjustments === 'object' ? scoreOf(source.adjustments[String(team.id)]) : null;
      team.multiplier = adjustment == null ? 1 : Math.min(1.5, Math.max(0.5, adjustment));
    });
    const validIds = new Set(base.map(team => String(team.id)));
    const seenGames = new Set();
    const games = (Array.isArray(source.games) ? source.games : []).filter((game, index) => {
      if (!game || !validIds.has(String(game.a)) || !validIds.has(String(game.b)) || String(game.a) === String(game.b)) return false;
      const key = String(game.week == null ? 'entry-' + index : game.week) + ':' + [String(game.a), String(game.b)].sort().join(':');
      if (seenGames.has(key)) return false;
      seenGames.add(key);
      return true;
    });
    const playoffCounts = new Map(base.map(team => [team.id, 0]));
    const titleCounts = new Map(base.map(team => [team.id, 0]));
    const winTotals = new Map(base.map(team => [team.id, 0]));
    const winSamples = new Map(base.map(team => [team.id, []]));
    const seedCounts = new Map(base.map(team => [team.id, Array(base.length).fill(0)]));

    function sampleScore(team) { return Math.round(sample(rng, team.pool) * team.multiplier * 100) / 100; }
    function winnerOf(left, right) {
      if (!left) return right;
      if (!right) return left;
      const leftScore = sampleScore(left.team), rightScore = sampleScore(right.team);
      // The higher seed advances playoff scoring ties; regular-season ties split a win.
      return leftScore === rightScore ? (left.seed < right.seed ? left : right) : (leftScore > rightScore ? left : right);
    }
    function championOf(field) {
      const bracketSize = nextPow2(field.length);
      let seedOrder = [1];
      for (let size = 2; size <= bracketSize; size *= 2) seedOrder = seedOrder.flatMap(value => [value, size + 1 - value]);
      let round = seedOrder.map(seedNumber => field[seedNumber - 1] ? {team: field[seedNumber - 1], seed: seedNumber} : null);
      while (round.length > 1) {
        const winners = [];
        for (let index = 0; index < round.length; index += 2) winners.push(winnerOf(round[index], round[index + 1]));
        if (source.playoffReseed && winners.length > 2) {
          const ordered = winners.filter(Boolean).sort((a, b) => a.seed - b.seed);
          round = [];
          while (ordered.length) {
            round.push(ordered.shift());
            if (ordered.length) round.push(ordered.pop());
          }
        } else {
          round = winners;
        }
      }
      return round[0].team;
    }

    for (let sim = 0; sim < sims; sim++) {
      const table = base.map(team => Object.assign({}, team, {points: team.pf, tiebreak: rng()}));
      const byId = new Map(table.map(team => [String(team.id), team]));
      games.forEach(game => {
        const left = byId.get(String(game.a)), right = byId.get(String(game.b));
        const leftScore = sampleScore(left), rightScore = sampleScore(right);
        left.points += leftScore;
        right.points += rightScore;
        if (leftScore === rightScore) { left.wins += 0.5; right.wins += 0.5; }
        else if (leftScore > rightScore) left.wins += 1;
        else right.wins += 1;
      });
      const ordered = table.slice().sort((a, b) => b.wins - a.wins || b.points - a.points || a.tiebreak - b.tiebreak);
      ordered.forEach((team, index) => {
        winTotals.set(team.id, winTotals.get(team.id) + team.wins);
        winSamples.get(team.id).push(team.wins);
        seedCounts.get(team.id)[index] += 1;
      });
      const field = ordered.slice(0, spots);
      field.forEach(team => playoffCounts.set(team.id, playoffCounts.get(team.id) + 1));
      const winner = championOf(field);
      titleCounts.set(winner.id, titleCounts.get(winner.id) + 1);
    }
    const quantile = (values, fraction) => {
      const ordered = values.slice().sort((a, b) => a - b), index = (ordered.length - 1) * fraction;
      const lower = Math.floor(index), upper = Math.ceil(index);
      return ordered[lower] + (ordered[upper] - ordered[lower]) * (index - lower);
    };
    const interval = count => {
      const z = 1.96, p = count / sims, denominator = 1 + z * z / sims;
      const center = (p + z * z / (2 * sims)) / denominator;
      const radius = z * Math.sqrt(p * (1 - p) / sims + z * z / (4 * sims * sims)) / denominator;
      return [Math.max(0, center - radius), Math.min(1, center + radius)];
    };
    return base.map(team => ({
      id: team.id,
      name: team.name,
      wins: team.wins, status: 'modeled', sampleWeeks: team.scores.length, poolSamples: team.pool.length,
      samples: sims, seed, samplingSource: team.scores.length ? 'manager' : 'league', multiplier: team.multiplier,
      playoffPct: playoffCounts.get(team.id) / sims,
      titlePct: titleCounts.get(team.id) / sims,
      seedPct: seedCounts.get(team.id).map(count => count / sims),
      playoffInterval: interval(playoffCounts.get(team.id)), titleInterval: interval(titleCounts.get(team.id)),
      meanWins: Math.round((winTotals.get(team.id) / sims) * 100) / 100,
      medianWins: quantile(winSamples.get(team.id), 0.5),
      winsRange: [quantile(winSamples.get(team.id), 0.05), quantile(winSamples.get(team.id), 0.95)]
    })).sort((a, b) => b.titlePct - a.titlePct || b.playoffPct - a.playoffPct || a.name.localeCompare(b.name));
  }

  function fairSchedule(weeks) {
    const totals = new Map();
    let omittedRows = 0;
    let replayWeeks = 0;
    (weeks || []).forEach(week => {
      if (!week || week.final === false || ['live', 'scheduled', 'pending'].includes(String(week.status || week.phase || '').toLowerCase())) return;
      const seen = new Set();
      const available = (week.rows || []).filter(row => {
        if (!row || row.id == null || scoreOf(row.points) == null || seen.has(String(row.id))) { omittedRows += 1; return false; }
        seen.add(String(row.id));
        return true;
      });
      const groups = new Map();
      available.forEach(row => {
        if (row.matchupId == null || scoreOf(row.matchupId) == null || Number(row.matchupId) <= 0) return;
        const key = String(row.matchupId);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
      });
      const rows = [...groups.values()].filter(sides => sides.length === 2).flat();
      omittedRows += available.length - rows.length;
      if (!rows.length) return;
      replayWeeks += 1;
      rows.forEach(row => {
        const key = String(row.id);
        if (!totals.has(key)) totals.set(key, {id: row.id, name: row.name || String(row.id), actual: 0, expected: 0, points: 0, games: 0, weekly: []});
        const team = totals.get(key);
        team.points += Number(row.points);
        team.games += 1;
      });
      rows.forEach(row => {
        const team = totals.get(String(row.id));
        let beaten = 0;
        let comparisons = 0;
        rows.forEach(other => {
          if (String(other.id) === String(row.id)) return;
          comparisons += 1;
          if (Math.abs(Number(row.points) - Number(other.points)) <= 0.001) beaten += 0.5;
          else if (Number(row.points) > Number(other.points)) beaten += 1;
        });
        const expected = comparisons ? beaten / comparisons : 0;
        team.expected += expected;
        const opponent = rows.find(other => String(other.matchupId) === String(row.matchupId) && String(other.id) !== String(row.id));
        const actual = Math.abs(Number(row.points) - Number(opponent.points)) <= 0.001 ? 0.5 : (Number(row.points) > Number(opponent.points) ? 1 : 0);
        team.actual += actual;
        team.weekly.push({week: week.week, actual, expected, points: Number(row.points), opponent: opponent.name || String(opponent.id), opponentsCompared: comparisons});
      });
    });
    const result = [...totals.values()].map(team => ({
      id: team.id,
      name: team.name,
      actual: Math.round(team.actual * 100) / 100,
      expected: Math.round(team.expected * 100) / 100,
      luck: Math.round((team.actual - team.expected) * 100) / 100,
      points: Math.round(team.points * 100) / 100,
      games: team.games,
      weekly: team.weekly
    })).sort((a, b) => b.luck - a.luck || b.expected - a.expected || a.name.localeCompare(b.name));
    result.omittedRows = omittedRows;
    result.replayWeeks = replayWeeks;
    return result;
  }

  // Counterfactuals reuse observed weekly scores, never projections. A malformed
  // pair is unavailable, not a bye, zero-point score, or automatic victory.
  function replaySlates(weeks) {
    const counts = new Map();
    (weeks || []).forEach(week => { if (week) counts.set(Number(week.week), (counts.get(Number(week.week)) || 0) + 1); });
    return (weeks || []).filter(week => week && Number.isInteger(Number(week.week)) && Number(week.week) > 0
      && week.final !== false && !['live', 'scheduled', 'pending'].includes(String(week.status || week.phase || '').toLowerCase()))
      .sort((a, b) => Number(a.week) - Number(b.week)).map(week => {
        const rows = Array.isArray(week.rows) ? week.rows : [];
        const ids = new Map();
        rows.forEach(row => { if (row && row.id != null) ids.set(String(row.id), (ids.get(String(row.id)) || 0) + 1); });
        const byId = new Map(rows.filter(row => row && row.id != null && String(row.id) && ids.get(String(row.id)) === 1).map(row => [String(row.id), row]));
        const pair = id => {
          if (counts.get(Number(week.week)) !== 1) return null;
          const row = byId.get(String(id));
          if (!row || scoreOf(row.matchupId) == null || Number(row.matchupId) <= 0 || scoreOf(row.points) == null) return null;
          const sides = rows.filter(other => other && String(other.matchupId) === String(row.matchupId));
          if (sides.length !== 2 || sides.some(other => !byId.has(String(other.id)) || scoreOf(other.points) == null)) return null;
          const opponent = sides.find(other => String(other.id) !== String(row.id));
          return opponent ? {row, opponent} : null;
        };
        return {week: Number(week.week), rows: [...byId.values()], pair, complete: counts.get(Number(week.week)) === 1 && byId.size === rows.length && rows.length >= 2 && rows.every(row => row && pair(row.id))};
      }).filter((slate, index, all) => all.findIndex(other => other.week === slate.week) === index);
  }
  function resultOf(points, against) {
    const difference = Math.round(Number(points) * 100) - Math.round(Number(against) * 100);
    return difference === 0 ? 'T' : difference > 0 ? 'W' : 'L';
  }
  function recordOf(results) {
    const wins = results.filter(value => value === 'W').length;
    const losses = results.filter(value => value === 'L').length;
    const ties = results.filter(value => value === 'T').length;
    return {wins, losses, ties, games: wins + losses + ties, equivalentWins: wins + ties * 0.5};
  }
  function median(values) {
    if (!values.length) return null;
    const ordered = values.slice().sort((a, b) => a - b);
    return (ordered[Math.floor((ordered.length - 1) / 2)] + ordered[Math.ceil((ordered.length - 1) / 2)]) / 2;
  }
  function scheduleReplay(input) {
    const source = input || {};
    const teamId = String(source.teamId == null ? '' : source.teamId);
    const scheduleId = String(source.scheduleId == null ? '' : source.scheduleId);
    const method = source.selfMatch === 'swap' ? 'swap' : 'skip';
    const slates = replaySlates(source.weeks);
    const actualFull = [];
    let teamName = teamId, scheduleName = scheduleId;
    const rows = slates.map(slate => {
      const own = slate.pair(teamId), borrowed = slate.pair(scheduleId);
      const name = id => (slate.rows.find(row => String(row.id) === id) || {}).name || id;
      teamName = name(teamId); scheduleName = name(scheduleId);
      const actualResult = own ? resultOf(own.row.points, own.opponent.points) : null;
      if (actualResult) actualFull.push(actualResult);
      const row = {week: slate.week, points: own ? Number(own.row.points) : null, originalOpponent: own ? own.opponent.name || String(own.opponent.id) : '', originalPointsAgainst: own ? Number(own.opponent.points) : null,
        actualResult, opponent: borrowed ? borrowed.opponent.name || String(borrowed.opponent.id) : '', opponentPoints: null, replayResult: null, swapped: false, changed: false, status: 'missing', reason: 'Missing or ambiguous final matchup / score'};
      if (!own || !borrowed) return row;
      let opponent = borrowed.opponent;
      if (teamId !== scheduleId && String(opponent.id) === teamId) {
        if (method === 'skip') return Object.assign(row, {status: 'self', reason: 'Self-matchup excluded from both compared records'});
        opponent = borrowed.row;
        row.swapped = true;
      }
      row.opponent = opponent.name || String(opponent.id);
      row.opponentPoints = Number(opponent.points);
      row.replayResult = resultOf(row.points, row.opponentPoints);
      row.changed = row.actualResult !== row.replayResult;
      row.status = 'played'; row.reason = '';
      return row;
    });
    const eligible = rows.filter(row => row.status === 'played');
    const actual = recordOf(eligible.map(row => row.actualResult));
    const replay = recordOf(eligible.map(row => row.replayResult));
    return {teamId, scheduleId, teamName, scheduleName, method, rows, games: eligible.length, skippedWeeks: rows.length - eligible.length,
      fullActual: recordOf(actualFull), actual, replay, winsDelta: replay.equivalentWins - actual.equivalentWins,
      actualOpponentMean: mean(eligible.map(row => row.originalPointsAgainst)), replayOpponentMean: mean(eligible.map(row => row.opponentPoints))};
  }
  function seasonStrength(weeks) {
    const slates = replaySlates(weeks);
    const profiles = new Map();
    slates.forEach(slate => slate.rows.forEach(row => {
      const pair = slate.pair(row.id);
      if (!pair) return;
      const id = String(row.id);
      if (!profiles.has(id)) profiles.set(id, {id, name: row.name || id, scores: [], opponents: [], results: [], allPlay: []});
      const profile = profiles.get(id);
      profile.scores.push(Number(row.points)); profile.opponents.push(Number(pair.opponent.points));
      profile.results.push(resultOf(row.points, pair.opponent.points));
      if (slate.complete) profile.allPlay.push(slate.rows.filter(other => String(other.id) !== id).reduce((sum, other) => {
        const result = resultOf(row.points, other.points); return sum + (result === 'W' ? 1 : result === 'T' ? 0.5 : 0);
      }, 0) / (slate.rows.length - 1));
    }));
    return [...profiles.values()].map(profile => Object.assign(profile, {record: recordOf(profile.results), games: profile.scores.length,
      points: Math.round(profile.scores.reduce((sum, score) => sum + score, 0) * 100) / 100,
      ppg: mean(profile.scores), median: median(profile.scores), opponentPPG: mean(profile.opponents), opponentMedian: median(profile.opponents),
      allPlayPct: mean(profile.allPlay), allPlayWeeks: profile.allPlay.length})).sort((a, b) => b.ppg - a.ppg || a.name.localeCompare(b.name));
  }

  function waiverAutopsy(input) {
    const source = input || {};
    const weeks = (source.weeks || []).filter(week => week && week.final !== false && !['live', 'scheduled', 'pending'].includes(String(week.status || '').toLowerCase())).slice().sort((a, b) => a.week - b.week);
    const latest = weeks.length ? weeks[weeks.length - 1].week : 0;
    const dealKeys = new Set();
    const transactionTime = deal => typeof deal.completedAt === 'number' ? deal.completedAt : (Date.parse(deal.completedAt) || 0);
    const transactions = (source.transactions || []).filter(deal => {
      if (!deal || !deal.manager || !Number.isInteger(Number(deal.week)) || Number(deal.week) < 1 || (deal.status && deal.status !== 'complete')) return false;
      const identifier = deal.transactionId || deal.id;
      const key = identifier ? String(identifier) + ':' + deal.manager : JSON.stringify([deal.manager, deal.week, deal.completedAt || '', (deal.adds || []).map(player => String(player.id)).sort(), (deal.drops || []).map(player => String(player.id)).sort()]);
      if (dealKeys.has(key)) return false;
      dealKeys.add(key);
      return true;
    }).map((deal, index) => Object.assign({}, deal, {week: Number(deal.week), sequence: index}))
      .sort((a, b) => a.week - b.week || transactionTime(a) - transactionTime(b) || a.sequence - b.sequence);
    const owns = (roster, playerId) => (roster.playerIds || []).map(String).includes(String(playerId));
    const rosterAt = (week, playerId) => {
      const slate = weeks.find(item => item.week === week);
      if (!slate) return null;
      return (slate.rosters || []).find(roster => owns(roster, playerId)) || null;
    };
    const includesPlayer = (players, id) => (players || []).some(player => String(player.id) === String(id));
    const nextBoundary = (dealIndex, playerId, kind, manager) => {
      for (let index = dealIndex + 1; index < transactions.length; index++) {
        const next = transactions[index];
        if (kind === 'add' && (includesPlayer(next.adds, playerId) || (next.manager === manager && includesPlayer(next.drops, playerId)))) return next.week;
        if (kind === 'drop' && (includesPlayer(next.drops, playerId) || (next.manager === manager && includesPlayer(next.adds, playerId)))) return next.week;
      }
      return Infinity;
    };
    const addClaims = new Set(), dropClaims = new Set();
    const starts = (fromWeek, toWeek, playerId, manager, kind) => {
      let points = 0;
      let count = 0;
      let best = null;
      let observedWeeks = 0;
      let missingWeeks = 0;
      let exited = false;
      const claims = kind === 'add' ? addClaims : dropClaims;
      weeks.forEach(slate => {
        if (slate.week < fromWeek || slate.week >= toWeek || exited) return;
        const rosters = slate.rosters || [];
        if (!rosters.length || slate.complete === false) { missingWeeks += 1; return; }
        const home = rosterAt(slate.week, playerId);
        if (kind === 'add') {
          const owner = rosters.find(roster => roster.manager === manager);
          if (!owner) { missingWeeks += 1; return; }
          // A later weekly roster exit ends this acquisition's tenure, even if a
          // missing trade log would otherwise make a later reacquisition look continuous.
          if (!owns(owner, playerId) || (home && home.manager !== manager)) { exited = true; return; }
        }
        observedWeeks += 1;
        (slate.rosters || []).forEach(roster => {
          if (kind === 'add' ? roster.manager !== manager : roster.manager === manager) return;
          if (!owns(roster, playerId)) return;
          (roster.starters || []).forEach(starter => {
            if (String(starter.id) !== String(playerId)) return;
            const value = scoreOf(starter.points);
            const key = [slate.week, playerId, roster.manager].join(':');
            if (value == null) { missingWeeks += 1; return; }
            if (claims.has(key)) return;
            claims.add(key);
            points += value;
            count += 1;
            if (!best || value > best.points) best = {week: slate.week, points: value, manager: roster.manager};
          });
        });
      });
      return {points: Math.round(points * 100) / 100, count, best, observedWeeks, missingWeeks};
    };
    const hits = [];
    const misses = [];
    const heists = [];
    const unknown = [];
    transactions.forEach((deal, dealIndex) => {
      const fromWeek = deal.week + (source.includeAcquisitionWeek === false ? 1 : 0);
      (deal.adds || []).forEach(add => {
        const throughWeek = nextBoundary(dealIndex, add.id, 'add', deal.manager);
        const result = starts(fromWeek, throughWeek, add.id, deal.manager, 'add');
        const home = rosterAt(latest, add.id);
        const row = {
          id: String(add.id), name: add.name, position: add.position || '', manager: deal.manager, week: deal.week,
          transactionId: deal.transactionId || deal.id || '', completedAt: deal.completedAt || '',
          type: deal.type || deal.transactionType || 'waiver',
          points: result.points, starts: result.count,
          observedWeeks: result.observedWeeks, missingWeeks: result.missingWeeks,
          fromWeek, throughWeek: Number.isFinite(throughWeek) ? throughWeek - 1 : latest,
          status: !result.observedWeeks || (result.missingWeeks && !result.count) ? 'unobserved' : 'observed',
          stillThere: !!(home && home.manager === deal.manager),
          currentManager: home ? home.manager : ''
        };
        if (row.status === 'unobserved') unknown.push(row);
        else if (result.points > 0) hits.push(row);
        else misses.push(row);
      });
      (deal.drops || []).forEach(drop => {
        const result = starts(fromWeek, nextBoundary(dealIndex, drop.id, 'drop', deal.manager), drop.id, deal.manager, 'drop');
        if (result.points <= 0) return;
        heists.push({
          id: String(drop.id), name: drop.name, position: drop.position || '', manager: deal.manager, week: deal.week,
          type: deal.type || deal.transactionType || 'waiver', transactionId: deal.transactionId || deal.id || '',
          points: result.points, starts: result.count,
          observedWeeks: result.observedWeeks, missingWeeks: result.missingWeeks,
          scoredFor: result.best ? result.best.manager : ''
        });
      });
    });
    hits.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
    misses.sort((a, b) => a.week - b.week || a.name.localeCompare(b.name));
    heists.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
    return {hits, misses, heists, unknown, transactions: transactions.length, throughWeek: latest, includeAcquisitionWeek: source.includeAcquisitionWeek !== false};
  }

  function draftGraveyard(input) {
    const source = input || {};
    const rosters = source.rosters || [];
    const holder = new Map();
    const ambiguous = new Set();
    const starters = new Set((source.starterIds || []).map(String));
    rosters.forEach(roster => (roster.playerIds || []).forEach(id => {
      const key = String(id), previous = holder.get(key);
      if (previous && String(previous.rosterId) !== String(roster.rosterId)) ambiguous.add(key);
      holder.set(key, roster);
    }));
    const picks = (source.picks || []).map(pick => {
      const home = holder.get(String(pick.playerId));
      let status = source.ownershipComplete === false || !rosters.length ? 'unknown' : 'gone';
      if (home && String(home.rosterId) === String(pick.rosterId)) status = 'kept';
      else if (home) status = 'moved';
      if (ambiguous.has(String(pick.playerId))) status = 'unknown';
      return {
        playerId: String(pick.playerId),
        name: pick.name,
        position: pick.position || '',
        round: pick.round,
        pick: pick.pick,
        manager: pick.manager,
        keeper: !!pick.keeper,
        status,
        holder: home ? home.manager : '',
        starting: starters.has(String(pick.playerId))
      };
    });
    const count = status => picks.filter(pick => pick.status === status).length;
    return {
      picks,
      kept: count('kept'),
      moved: count('moved'),
      gone: count('gone'),
      unknown: count('unknown'),
      earlyGone: picks.filter(pick => pick.status === 'gone' && pick.round <= 5),
      lateKept: picks.filter(pick => pick.status === 'kept' && pick.round >= 8 && pick.starting)
    };
  }

  function rivalrySeries(input) {
    const source = input || {};
    const archive = source.allTime || [];
    const results = source.results || [];
    return (source.paid || RIVALRIES).map(series => {
      const history = archive.find(row => (row.a === series.a && row.b === series.b) || (row.a === series.b && row.b === series.a));
      let aWins = 0;
      let bWins = 0;
      let games = 0;
      if (history) {
        aWins = Math.max(0, finite(history.a === series.a ? history.aWins : history.bWins, 0));
        bWins = Math.max(0, finite(history.a === series.a ? history.bWins : history.aWins, 0));
        games = Math.max(0, finite(history.games, 0));
      }
      const result = results.find(row => row &&
        ((row.a === series.a && row.b === series.b) || (row.a === series.b && row.b === series.a)) &&
        (row.week == null ? row.id === series.id : Number(row.week) === Number(series.week)) &&
        (!row.id || row.id === series.id));
      let season = null;
      if (result && scoreOf(result.scoreA) != null && scoreOf(result.scoreB) != null) {
        const left = scoreOf(result.a === series.a ? result.scoreA : result.scoreB);
        const right = scoreOf(result.a === series.a ? result.scoreB : result.scoreA);
        const leader = Math.abs(left - right) <= 0.001 ? 'tie' : (left > right ? series.a : series.b);
        const status = result.status || 'provisional';
        season = {
          scoreA: left, scoreB: right,
          leader, winner: status === 'final' ? leader : null,
          settled: status === 'final', status
        };
      }
      const leader = aWins === bWins ? 'tied' : (aWins > bWins ? series.a : series.b);
      return Object.assign({}, series, {aWins, bWins, games, leader, season, amount: Math.max(0, finite(source.amount, PRIZES.rivalry))});
    });
  }

  function shapeLabel(row) {
    if (row.games < 4) return 'Small sample';
    if (row.games >= 6 && row.late != null && row.early != null && row.late - row.early >= 10) return 'Finisher';
    if (row.games >= 6 && row.late != null && row.early != null && row.early - row.late >= 10) return 'Fader';
    if (row.closeGames >= 3 && row.closeRate >= 0.65) return 'Closer';
    if (row.cv != null && row.cv >= 0.18) return 'Swing';
    if (row.cv != null && row.cv <= 0.08) return 'Steady';
    return 'Balanced';
  }

  function fingerprints(input) {
    const source = input || {};
    const weeks = (source.weeks || []).filter(week => week && week.final !== false && !['live', 'scheduled', 'pending'].includes(String(week.status || '').toLowerCase()));
    const meta = source.meta || {};
    const names = new Set((source.managers || []).map(manager => manager.name));
    weeks.forEach(week => (week.rows || []).forEach(row => { if (row && row.name) names.add(row.name); }));
    const profiles = [...names].filter(Boolean).map(name => {
      const scores = [];
      let closeWins = 0;
      let closeLosses = 0;
      let closeTies = 0;
      const seenWeeks = new Set();
      weeks.forEach(week => {
        const row = (week.rows || []).find(item => item.name === name);
        if (!row || scoreOf(row.points) == null || seenWeeks.has(String(week.week))) return;
        seenWeeks.add(String(week.week));
        scores.push({week: week.week, points: Number(row.points), matchupId: row.matchupId});
      });
      scores.forEach(row => {
        const foe = weeks.find(week => week.week === row.week);
        if (row.matchupId == null || scoreOf(row.matchupId) == null || Number(row.matchupId) <= 0) return;
        const pair = foe && (foe.rows || []).filter(item => String(item.matchupId) === String(row.matchupId));
        if (!pair || pair.length !== 2) return;
        const other = pair.find(item => item.name !== name);
        if (!other || scoreOf(other.points) == null) return;
        const margin = Math.abs(row.points - Number(other.points));
        if (margin > 10.001) return;
        if (margin <= 0.001) closeTies += 1;
        else if (row.points > Number(other.points)) closeWins += 1;
        else closeLosses += 1;
      });
      const values = scores.map(row => row.points);
      const avg = mean(values);
      const spread = sd(values);
      const ordered = scores.slice().sort((a, b) => a.week - b.week);
      const earlyValues = ordered.slice(0, Math.max(0, ordered.length - 3)).map(row => row.points);
      const lateValues = ordered.slice(-3).map(row => row.points);
      const early = ordered.length >= 6 ? mean(earlyValues) : null;
      const late = ordered.length >= 6 ? mean(lateValues) : null;
      const closeGames = closeWins + closeLosses + closeTies;
      const sorted = values.slice().sort((a, b) => a - b);
      const profile = {
        name,
        games: values.length,
        mean: avg == null ? null : Math.round(avg * 10) / 10,
        median: sorted.length ? (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2 : null,
        sd: values.length >= 2 ? Math.round(spread * 10) / 10 : null,
        cv: values.length >= 2 && avg > 0 ? spread / avg : null,
        high: values.length ? Math.max(...values) : null,
        low: values.length ? Math.min(...values) : null,
        closeWins, closeLosses, closeTies, closeGames,
        closeRate: closeGames ? (closeWins + 0.5 * closeTies) / closeGames : null,
        early: early == null ? null : Math.round(early * 10) / 10,
        late: late == null ? null : Math.round(late * 10) / 10,
        luck: meta.luck ? scoreOf(meta.luck[name]) : null,
        titles: meta.titles && meta.titles[name] ? meta.titles[name] : 0,
        draftSlot: meta.draftSlot && meta.draftSlot[name] ? meta.draftSlot[name] : null
      };
      profile.label = values.length ? shapeLabel(profile) : 'Unscored';
      const swing = profile.cv != null ? Math.round(profile.cv * 100) + '%' : 'unavailable';
      profile.summary = profile.label + ' (' + profile.games + ' scored weeks). Weekly swing ' + swing + '. Close games ' + closeWins + '-' + closeLosses + (closeTies ? '-' + closeTies : '') + '.'
        + (profile.late != null && profile.early != null ? ' Late weeks ' + profile.late.toFixed(1) + ' versus early ' + profile.early.toFixed(1) + '.' : '');
      return profile;
    });
    const percentile = (value, cohort) => {
      if (value == null || !cohort.length) return null;
      const below = cohort.filter(other => other < value).length;
      const tied = cohort.filter(other => other === value).length;
      return (below + tied * 0.5) / cohort.length;
    };
    const scoring = profiles.filter(row => row.games >= 4 && row.mean != null).map(row => row.mean);
    const swing = profiles.filter(row => row.games >= 4 && row.cv != null).map(row => row.cv);
    const close = profiles.filter(row => row.closeGames >= 3).map(row => row.closeRate);
    const finishing = profiles.filter(row => row.early != null && row.late != null).map(row => row.late - row.early);
    profiles.forEach(row => {
      row.percentiles = {
        scoring: row.games >= 4 ? percentile(row.mean, scoring) : null,
        consistency: row.games >= 4 && row.cv != null ? 1 - percentile(row.cv, swing) : null,
        close: row.closeGames >= 3 ? percentile(row.closeRate, close) : null,
        finish: row.early != null && row.late != null ? percentile(row.late - row.early, finishing) : null
      };
      row.percentileCohorts = {scoring: scoring.length, consistency: swing.length, close: close.length, finish: finishing.length};
    });
    return profiles.sort((a, b) => (b.cv == null ? -1 : b.cv) - (a.cv == null ? -1 : a.cv) || a.name.localeCompare(b.name));
  }

  let fingerprintMap = new Map();
  function fingerprintFor(name) { return fingerprintMap.get(name) || null; }

  function node(tag, className, value) {
    const element = root.document.createElement(tag);
    if (className) element.className = className;
    if (value != null) element.textContent = String(value);
    return element;
  }
  function disclosure(title, description, content) {
    if (typeof root.clarityDisclosure === 'function') return root.clarityDisclosure(title, description, content);
    const details = node('details', 'clarity-disclosure');
    const summary = node('summary', '');
    summary.appendChild(node('strong', '', title));
    if (description) summary.appendChild(node('span', '', description));
    const body = node('div', 'clarity-disclosure-body');
    body.appendChild(content);
    details.append(summary, body);
    return details;
  }
  function pct(value) { return value == null ? '—' : Math.round(value * 100) + '%'; }
  function field(label, choices, value, change) {
    const wrap = node('label', 'desk-field');
    wrap.appendChild(node('span', '', label));
    const select = node('select', '');
    choices.forEach(choice => {
      const option = node('option', '', choice[1]);
      option.value = String(choice[0]);
      select.appendChild(option);
    });
    select.value = String(value);
    select.addEventListener('change', () => change(select.value));
    wrap.appendChild(select);
    return wrap;
  }
  function table(headers, rows, caption) {
    const scroll = node('div', 'desk-table-scroll');
    scroll.tabIndex = 0;
    scroll.setAttribute('role', 'region');
    scroll.setAttribute('aria-label', caption);
    const element = node('table', 'desk-table');
    element.appendChild(node('caption', '', caption));
    const head = node('tr', '');
    headers.forEach(label => { const cell = node('th', '', label); cell.scope = 'col'; head.appendChild(cell); });
    const thead = node('thead', '');
    thead.appendChild(head);
    const tbody = node('tbody', '');
    rows.forEach(values => {
      const row = node('tr', '');
      values.forEach((value, index) => {
        const cell = node(index === 0 ? 'th' : 'td', '');
        if (index === 0) cell.scope = 'row';
        if (value && typeof value === 'object' && value.nodeType) cell.appendChild(value);
        else cell.textContent = value == null ? '—' : String(value);
        row.appendChild(cell);
      });
      tbody.appendChild(row);
    });
    element.append(thead, tbody);
    scroll.appendChild(element);
    return scroll;
  }
  function optionsFor(values, allLabel) {
    return [['all', allLabel]].concat([...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b))).map(value => [value, value]));
  }
  function lazyDetails(parent, title, description, loader) {
    const body = node('div', 'desk-panel');
    body.appendChild(node('p', 'desk-note', 'Open to load the latest league data.'));
    const details = disclosure(title, description, body);
    let pending = false;
    let loaded = false;
    async function load() {
      if (pending || loaded) return;
      pending = true;
      body.setAttribute('aria-busy', 'true');
      body.textContent = 'Loading league data…';
      try { await loader(body); loaded = true; }
      catch (_error) {
        body.textContent = '';
        body.appendChild(node('p', 'desk-note', 'This data could not be reached. Nothing has been replaced with an estimate.'));
        const retry = node('button', 'desk-button', 'Try again');
        retry.type = 'button';
        retry.addEventListener('click', load);
        body.appendChild(retry);
      } finally { pending = false; body.setAttribute('aria-busy', 'false'); }
    }
    details.addEventListener('toggle', () => { if (details.open) load(); });
    parent.appendChild(details);
    return details;
  }

  let payoutConfig = null;
  let payoutRequest = null;
  function loadPayoutConfig() {
    if (!payoutRequest) payoutRequest = fetchJson('content/payouts/2026-config.json').then(config => {
      payoutConfig = config;
      return config;
    }).catch(error => { payoutRequest = null; throw error; });
    return payoutRequest;
  }

  let matchupUi = {tab: 'money', open: null};
  const matchupScoreModes = new Map();

  function mountMatchup(host, ctx) {
    if (!host || !root.document || !root.FarmhoodLive) return;
    // Do not let an older asynchronous config request repaint a newer live week.
    host._deskContext = ctx;
    if (!payoutConfig) {
      host.textContent = 'Loading weekly stakes…';
      loadPayoutConfig().then(() => { if (host._deskContext === ctx && host.isConnected) mountMatchup(host, ctx); }).catch(() => {
        if (host._deskContext === ctx) host.textContent = 'Weekly stakes are unavailable. Official awards remain on the Payouts page.';
      });
      return;
    }
    const teams = (ctx.rows || []).map(row => {
      const roster = (ctx.snapshot.rosters || []).find(item => item.rosterId === row.rosterId);
      const lineup = root.FarmhoodLive.lineupFor(row, ctx.snapshot.rosterPositions, ctx.playerFeed || {});
      const watch = ((ctx.forecast && ctx.forecast.teams) || []).find(team => Number(team.rosterId) === Number(row.rosterId));
      return {
        name: roster ? roster.name : ('Roster ' + row.rosterId),
        ownerId: roster ? roster.ownerId : null,
        points: scoreOf(row.points),
        projection: watch ? scoreOf(watch.pregameProjection) : null,
        starters: lineup.filter(player => player.id && player.id !== '0').map(player => ({
          id: player.id, name: player.name, slot: player.slot, position: player.position,
          points: player.points, projection: player.projection, locked: !!player.locked,
          gameStatus: player.gameStatus || '', gameDate: player.gameDate || '',
          gameStartTime: player.gameStartTime || null, team: player.team || '', opponent: player.opponent || '',
          gameId: (((ctx.playerFeed || {}).games || {})[player.team] || {}).gameId || ''
        }))
      };
    });
    const week = ctx.selectedWeek;
    if (week > payoutConfig.regularSeasonWeeks || week < 1) {
      host.textContent = '';
      return;
    }
    const configuredRivalry = (payoutConfig.rivalries || []).find(series => series.week === week);
    const rivalry = configuredRivalry ? Object.assign({}, configuredRivalry, {a: configuredRivalry.managerA, b: configuredRivalry.managerB}) : null;
    const position = payoutConfig.positionSchedule[week] || '';
    const prizes = {high: payoutConfig.weeklyPrizes.highestScore, position: payoutConfig.weeklyPrizes.positionLeader, rivalry: payoutConfig.rivalryPrize};
    const scoreKey = ctx.snapshot.season + ':' + week;
    const scoreMode = matchupScoreModes.get(scoreKey) || 'actual';
    const dollars = dollarsOnTheTable({
      teams, mode: scoreMode, position, rivalry,
      prizes
    });
    dollars.teamCount = teams.length;
    const exposure = mondayExposure({teams, started: ctx.weekState === 'Live' || ctx.weekState === 'Final'});
    host.textContent = '';
    const body = node('div', 'desk-live-body');
    const tabs = node('div', 'clarity-tabs');
    tabs.setAttribute('aria-label', 'This week beyond the score');
    [['money', 'Dollars'], ['exposure', 'Still playing']].forEach(item => {
      const button = node('button', 'clarity-tab' + (matchupUi.tab === item[0] ? ' active' : ''), item[1]);
      button.type = 'button';
      button.setAttribute('aria-pressed', matchupUi.tab === item[0] ? 'true' : 'false');
      button.dataset.deskView = item[0];
      button.addEventListener('click', () => {
        matchupUi.tab = item[0]; mountMatchup(host, ctx);
        const active = host.querySelector('[data-desk-view="' + item[0] + '"]');
        if (active) active.focus({preventScroll: true});
      });
      tabs.appendChild(button);
    });
    body.appendChild(tabs);
    if (matchupUi.tab === 'exposure') body.appendChild(renderExposure(exposure, ctx.weekState));
    else {
      const modes = node('div', 'clarity-tabs desk-score-modes');
      modes.setAttribute('role', 'group'); modes.setAttribute('aria-label', 'Choose actual points or projections');
      [['actual', 'Actual points'], ['projected', 'Projections · EST']].forEach(item => {
        const button = node('button', 'clarity-tab' + (scoreMode === item[0] ? ' active' : ''), item[1]); button.type = 'button';
        button.dataset.deskScoreMode = item[0]; button.setAttribute('aria-pressed', scoreMode === item[0] ? 'true' : 'false');
        button.addEventListener('click', () => {
          matchupScoreModes.set(scoreKey, item[0]); matchupUi.open = true; mountMatchup(host, ctx);
          const active = host.querySelector('[data-desk-score-mode="' + item[0] + '"]'); if (active) active.focus({preventScroll: true});
        }); modes.appendChild(button);
      });
      body.append(modes, renderDollars(dollars, ctx.weekState, week, position));
    }
    const open = matchupUi.open == null ? false : matchupUi.open;
    const details = disclosure('This week, off the scoreboard', 'Unofficial prize race · starters still playing', body);
    details.open = open;
    details.addEventListener('toggle', () => { matchupUi.open = details.open; });
    host.appendChild(details);
  }

  function renderDollars(board, weekState, week, position) {
    const projected = board.mode === 'projected';
    const pregame = weekState === 'Scheduled';
    const wrap = node('div', 'desk-money' + (projected ? ' is-projected' : ' is-actual'));
    wrap.appendChild(node('p', 'desk-data-label', projected ? 'ESTIMATES ONLY · PROJ · NOT ACTUAL POINTS' : 'ACTUAL POINTS · PTS · ' + (pregame ? 'NOT STARTED' : weekState === 'Final' ? 'FINAL SCORES' : 'LIVE / PROVISIONAL')));
    wrap.appendChild(node('p', 'desk-kicker', projected
      ? 'Week ' + week + ' full-lineup estimates. Not actual points or earned payouts.'
      : pregame ? 'Week ' + week + ' has not started. No leader or prize has been earned. Use Projections to see estimates separately.'
        : 'Week ' + week + ' actual scoring. ' + (weekState === 'Final' ? 'Highest scores are shown below; this panel does not certify awards.' : 'Scores and leaders can change until games are final.')));
    const awardLink = node('a', 'desk-note', 'Official awards → Payouts'); awardLink.href = 'payouts.html'; wrap.appendChild(awardLink);
    if (board.mode === 'projected' && board.high.length < board.teamCount) wrap.appendChild(node('p', 'desk-projection-warning', 'Incomplete forecast: ' + board.high.length + '/' + board.teamCount + ' totals available. Missing projections are excluded.'));
    const grid = node('div', 'desk-money-grid');
    grid.appendChild(prizeColumn(projected ? 'Projected high score' : 'Actual high score', money(board.prizes.high), !projected && pregame ? [] : board.high, row => row.name, {projected, pregame}));
    grid.appendChild(prizeColumn((projected ? 'Projected ' : 'Actual ') + position + ' starter', money(board.prizes.position), !projected && pregame ? [] : board.positionBoard, row => row.player + ' · ' + row.name, {projected, pregame}));
    const rivalry = node('section', 'desk-prize');
    rivalry.appendChild(node('h3', '', board.rivalry ? 'Rivalry ' + money(board.prizes.rivalry) : 'Rivalry'));
    if (!board.rivalry) rivalry.appendChild(node('p', '', 'No rivalry purse this week.'));
    else {
    let lead = projected ? 'Forecast unavailable' : 'Scores unavailable';
    if (!projected && pregame) lead = 'Not started · no leader';
    else if (board.rivalry.leader === 'tie') lead = projected ? 'Projected tie · EST' : 'Tied on actual points';
    else if (board.rivalry.leader) lead = (board.rivalry.leader === board.rivalry.a ? board.rivalry.labelA : board.rivalry.labelB) + (projected ? ' · projected edge (EST)' : ' · higher actual score');
    rivalry.appendChild(node('p', 'desk-prize-lead', lead));
      rivalry.appendChild(node('p', '', board.rivalry.labelA + ' ' + (board.rivalry.scoreA == null ? '—' : board.rivalry.scoreA.toFixed(2)) + (projected ? ' Proj' : ' Pts') + ' · ' + board.rivalry.labelB + ' ' + (board.rivalry.scoreB == null ? '—' : board.rivalry.scoreB.toFixed(2)) + (projected ? ' Proj' : ' Pts')));
    }
    grid.appendChild(rivalry);
    wrap.appendChild(grid);
    const rules = node('div', '');
    rules.appendChild(node('p', 'desk-note', 'Prizes reconcile on Tuesdays in Central time. The position prize is for one eligible starting player, not a position-group total. Forecasts are full-lineup projections from the current feed—not frozen original predictions. They can change with lineups, injuries and new data, and never certify a payout.'));
    wrap.appendChild(disclosure('About points and awards', 'Projection source, starter eligibility, and Tuesday reconciliation', rules));
    return wrap;
  }

  function prizeColumn(title, amount, rows, label, options) {
    const projected = options && options.projected;
    const pregame = options && options.pregame && !projected;
    const column = node('section', 'desk-prize');
    column.appendChild(node('h3', '', title));
    column.appendChild(node('p', 'desk-prize-amount', amount));
    const more = node('details', 'desk-drilldown');
    more.appendChild(node('summary', '', 'Show all ' + (rows || []).length + ' managers'));
    (rows || []).forEach((row, index) => {
      const line = node('div', 'desk-prize-row' + (row.leading && !pregame ? ' is-leading' : ''));
      line.appendChild(node('span', '', label(row)));
      line.appendChild(node('b', projected ? 'desk-projected-value' : 'desk-actual-value', row.score.toFixed(2) + (projected ? ' Proj · EST' : ' Pts')
        + (pregame ? ' · not started' : projected ? (row.leading ? ' · projected top' : ' · ' + row.gap.toFixed(2) + ' projected gap') : row.leading ? ' · highest actual' : ' · ' + row.gap.toFixed(2) + ' actual gap')));
      (index < 4 ? column : more).appendChild(line);
    });
    if (rows && rows.length > 4) column.appendChild(more);
    if (!projected && !pregame && rows && rows[0] && rows.filter(row => row.leading).length > 1) column.appendChild(node('p', 'desk-note', 'Tied actual scores. Official shares appear in Payouts after reconciliation.'));
    if (!rows || !rows.length) column.appendChild(node('p', '', projected ? 'Projection unavailable.' : pregame ? 'Not started · no actual points yet.' : 'Actual points unavailable.'));
    return column;
  }

  function renderExposure(report, weekState) {
    const wrap = node('div', 'desk-exposure');
    if (weekState === 'Final') {
      wrap.appendChild(node('p', 'desk-kicker', 'This fantasy week is final. There is no remaining scoring window. This does not imply that every starter took the field.'));
      return wrap;
    }
    if ((report.unknown || []).length) wrap.appendChild(node('p', 'desk-note', 'Game timing is incomplete for ' + report.unknown.join(', ') + '. Those starters are not treated as finished.'));
    if (weekState === 'Scheduled' || report.phase === 'pregame') {
      const latest = report.latestStartTime ? new Intl.DateTimeFormat('en-US', {weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago', timeZoneName: 'short'}).format(new Date(report.latestStartTime)) : report.latest || 'time not confirmed';
      wrap.appendChild(node('p', 'desk-kicker', 'Kickoff has not split the slate. Starters in the latest confirmed kickoff window: ' + latest + '.'));
      report.latestWindow.forEach(row => wrap.appendChild(exposureRow(row.name, row.players)));
      if (!report.latestWindow.length) wrap.appendChild(node('p', '', 'Game times are not posted yet.'));
      return wrap;
    }
    if (report.phase === 'complete') {
      wrap.appendChild(node('p', 'desk-kicker', 'Every listed starter’s NFL game is final. No confirmed scoring window remains.'));
      return wrap;
    }
    wrap.appendChild(node('p', 'desk-kicker', report.oneGame.length ? 'Managers down to a single remaining game.' : 'The slate is still spread across more than one game.'));
    const focus = report.oneGame.length ? report.oneGame : report.latestWindow;
    focus.forEach(row => wrap.appendChild(exposureRow(row.name, row.players)));
    if (report.settled.length) wrap.appendChild(node('p', 'desk-note', 'Already done: ' + report.settled.join(', ') + '.'));
    return wrap;
  }

  function exposureRow(name, players) {
    const row = node('div', 'desk-exposure-row');
    row.appendChild(node('strong', '', name));
    row.appendChild(node('span', '', (players || []).map(player => player.name + (player.opponent ? ' vs ' + player.opponent : (player.team ? ' · ' + player.team : ''))).join(' · ') || 'No one left'));
    return row;
  }

  function renderOdds(bundle) {
    const wrap = node('div', 'desk-panel');
    if (!bundle || !bundle.model) {
      wrap.appendChild(node('p', '', 'The live slate is still loading.'));
      return wrap;
    }
    const model = bundle.model;
    if (bundle.snapshot && bundle.snapshot.currentWeek > model.regularSeasonWeeks) {
      wrap.appendChild(node('p', 'desk-note', 'The regular-season simulator is closed for the postseason. Actual playoff eliminations are not modeled here; follow the bracket on Matchups.'));
      const link = node('a', '', 'Open playoff matchups'); link.href = 'matchups.html'; wrap.appendChild(link);
      return wrap;
    }
    const ui = bundle.oddsUi || (bundle.oddsUi = {window: 'all', metric: 'playoffPct', manager: 'all', adjustment: '1'});
    const teams = model.rosters.map(roster => {
      const scores = [];
      Object.keys(bundle.weeks || {}).forEach(key => {
        const week = Number(key);
        if (week > model.completedThrough || week > model.regularSeasonWeeks || (ui.window === 'recent' && week <= model.completedThrough - 3)) return;
        const row = (bundle.weeks[key] || []).find(item => item.rosterId === roster.rosterId);
        if (!row || row.points == null || !Number.isFinite(Number(row.points))) return;
        scores.push(Number(row.points));
      });
      return {id: roster.rosterId, name: roster.name, wins: roster.wins + finite(roster.ties, 0) * 0.5, pf: roster.pf, scores};
    });
    const seen = new Set();
    const games = [];
    model.rosters.forEach(roster => (roster.cells || []).forEach(cell => {
      if (!cell.remaining || cell.opponentId == null) return;
      const key = cell.week + ':' + Math.min(roster.rosterId, cell.opponentId) + ':' + Math.max(roster.rosterId, cell.opponentId);
      if (seen.has(key)) return;
      seen.add(key);
      games.push({week: cell.week, a: roster.rosterId, b: cell.opponentId});
    }));
    const controls = node('div', 'desk-controls');
    const holder = node('div', '');
    const modelOptions = {teams, games, playoffTeams: model.playoffTeams, sims: 2000, seed: 202611, playoffReseed: !!(bundle.shape && bundle.shape.playoffReseed)};
    const baseline = playoffEquity(modelOptions);
    let result = baseline;
    function calculate() {
      result = ui.manager !== 'all' && ui.adjustment !== '1'
        ? playoffEquity(Object.assign({}, modelOptions, {adjustments: {[ui.manager]: Number(ui.adjustment)}}))
        : baseline;
      paint();
    }
    function paint() {
      holder.textContent = '';
      const metricName = ui.metric === 'titlePct' ? 'Title' : 'Playoffs';
      const scenario = ui.manager !== 'all' && ui.adjustment !== '1';
      holder.appendChild(node('p', 'desk-callout', scenario
        ? 'What-if only: ' + (teams.find(team => String(team.id) === ui.manager) || {}).name + ' scores ' + (ui.adjustment === '1.1' ? '10% more' : '10% less') + ' in future simulated games. Actual standings are unchanged.'
        : 'Baseline estimate · ' + model.playoffTeams + ' playoff spots · ' + games.length + ' posted remaining matchups'));
      const missing = model.rosters.flatMap(roster => (roster.cells || []).filter(cell => cell.week > model.completedThrough && cell.week <= model.regularSeasonWeeks && (cell.missing || (cell.opponentId == null && !cell.bye))));
      if (missing.length || (model.incompleteWeeks || []).length) {
        holder.appendChild(node('p', 'desk-note', 'Odds unavailable: the remaining schedule is incomplete. Open Remaining Slate to inspect the missing weeks.'));
        return;
      }
      if (!result.length || result.every(row => row.playoffPct == null)) {
        holder.appendChild(node('p', 'desk-note', 'No finalized scoring samples yet. Odds will appear when observed scores are available; we do not substitute invented scores.'));
        return;
      }
      result.slice().sort((a, b) => finite(b[ui.metric], -1) - finite(a[ui.metric], -1) || a.name.localeCompare(b.name)).forEach(row => {
        const original = baseline.find(item => item.id === row.id);
        const detail = node('details', 'desk-drilldown');
        const summary = node('summary', 'desk-odds-summary');
        const copy = node('span', 'desk-odd-copy');
        copy.append(node('strong', '', row.name), node('span', '', 'Playoffs ' + pct(row.playoffPct) + ' · title ' + pct(row.titlePct) + ' · ' + (row.meanWins == null ? '—' : row.meanWins.toFixed(1)) + ' expected wins'));
        const bar = node('span', 'desk-bar');
        bar.setAttribute('aria-hidden', 'true');
        const fill = node('i', 'desk-bar-fill');
        fill.style.width = pct(row[ui.metric]);
        bar.appendChild(fill);
        summary.append(copy, bar, node('b', '', metricName + ' ' + pct(row[ui.metric])));
        detail.appendChild(summary);
        const inside = node('div', 'desk-drilldown-body');
        const interval = ui.metric === 'titlePct' ? row.titleInterval : row.playoffInterval;
        inside.appendChild(node('p', 'desk-note', row.sampleWeeks + ' observed weeks · ' + row.samples + ' simulations · ' + (row.samplingSource === 'league' ? 'league scoring pool (manager history unavailable)' : 'own scoring history') + '.'));
        if (scenario && original) inside.appendChild(node('p', '', 'Baseline ' + metricName.toLowerCase() + ' ' + pct(original[ui.metric]) + ' → scenario ' + pct(row[ui.metric]) + '.'));
        if (row.winsRange) inside.appendChild(node('p', '', 'Median wins ' + row.medianWins.toFixed(1) + ' · middle 90% of simulated finishes: ' + row.winsRange[0] + '–' + row.winsRange[1] + ' wins.'));
        if (interval) inside.appendChild(node('p', 'desk-note', 'Simulation sampling interval: ' + pct(interval[0]) + '–' + pct(interval[1]) + '. This measures Monte Carlo noise only, not real-world forecast uncertainty.'));
        if (row.seedPct) inside.appendChild(table(['Seed', 'Simulated frequency'], row.seedPct.map((probability, index) => [ordinal(index + 1), pct(probability)]), row.name + ' seed distribution'));
        detail.appendChild(inside);
        holder.appendChild(detail);
      });
      holder.appendChild(node('p', 'desk-note', '0% and 100% mean none or all of these simulations, not a mathematical elimination or clinch. Expand a manager for the seed distribution and sample size.'));
    }
    controls.appendChild(field('Score sample', [['all', 'All final regular-season weeks'], ['recent', 'Last 3 final weeks']], ui.window, value => { ui.window = value; replace(); }));
    controls.appendChild(field('Rank by', [['playoffPct', 'Playoff chance'], ['titlePct', 'Title chance']], ui.metric, value => { ui.metric = value; paint(); }));
    controls.appendChild(field('What-if manager', [['all', 'None · baseline']].concat(teams.map(team => [team.id, team.name])), ui.manager, value => { ui.manager = value; calculate(); }));
    controls.appendChild(field('Future scoring', [['0.9', '−10%'], ['1', 'No adjustment'], ['1.1', '+10%']], ui.adjustment, value => { ui.adjustment = value; calculate(); }));
    function replace() {
      const index = [...controls.children].findIndex(child => child.contains(root.document.activeElement));
      const replacement = renderOdds(bundle);
      wrap.replaceWith(replacement);
      const selected = replacement.querySelectorAll('select')[index];
      if (selected) selected.focus({preventScroll: true});
    }
    wrap.append(controls, node('p', 'desk-kicker', '2,000 repeatable simulations, using finalized regular-season scores through Week ' + model.completedThrough + '. Read-only sensitivity tools; no AI calls.'), holder);
    const methodology = node('div', '');
    methodology.appendChild(node('p', 'desk-note', 'Each remaining week independently resamples a manager’s observed weekly scores. Missing individual history uses the league pool. Standings break ties by points for; exact ties are randomized. The illustrative single-week playoff bracket ' + (modelOptions.playoffReseed ? 'reseeds' : 'uses fixed seeds') + ' with top-seed byes where needed; playoff score ties go to the higher seed. Current live points, injuries, divisions, custom tiebreakers, multi-week rounds, roster changes and correlations are not modeled. Treat title odds as an illustrative bracket estimate, not official Sleeper odds.'));
    wrap.appendChild(disclosure('Model assumptions', 'What these estimates include—and leave out', methodology));
    calculate();
    return wrap;
  }

  function weeksFromBundle(bundle) {
    const model = bundle.model;
    const weeks = [];
    Object.keys(bundle.weeks || {}).forEach(key => {
      const week = Number(key);
      if (week > model.completedThrough || week > model.regularSeasonWeeks) return;
      const rows = (bundle.weeks[key] || []).map(row => {
        const roster = model.rosters.find(item => item.rosterId === row.rosterId);
        return roster ? {id: roster.name, name: roster.name, matchupId: row.matchupId, points: row.points} : null;
      }).filter(row => row && scoreOf(row.points) != null);
      if (rows.length === model.rosters.length && new Set(rows.map(row => row.id)).size === rows.length
        && fairSchedule([{week, rows}]).length === model.rosters.length) weeks.push({week, rows});
    });
    return weeks.sort((a, b) => a.week - b.week);
  }

  function weeks2025() {
    const league = root.LEAGUE || {};
    const names = league.names2025 || {};
    return Object.keys(league.weekly2025 || {}).map(Number).filter(week => week >= 1 && week <= 14).sort((a, b) => a - b).map(week => ({
      week,
      rows: league.weekly2025[week].map(row => ({id: names[row[0]] || ('Roster ' + row[0]), name: names[row[0]] || ('Roster ' + row[0]), matchupId: row[1], points: row[2]}))
    }));
  }

  function renderFair(bundle) {
    const wrap = node('div', 'desk-panel');
    const liveWeeks = bundle ? weeksFromBundle(bundle) : [];
    const archive = weeks2025();
    const ui = bundle ? (bundle.fairUi || (bundle.fairUi = {season: '2026', through: 'all', sort: 'luck', manager: 'all'})) : {season: '2025', through: 'all', sort: 'luck', manager: 'all'};
    if (!ui.replayInitialized) {
      ui.view = 'replay'; ui.selfMatch = 'skip';
      try {
        const params = new URLSearchParams(root.location.search);
        ui.replayTeam = params.get('replayTeam') || params.get('a');
        ui.replayOwner = params.get('replayOwner') || params.get('b');
        ui.selfMatch = params.get('replayMethod') === 'swap' ? 'swap' : 'skip';
        if (['2025', '2026'].includes(params.get('replaySeason'))) ui.season = params.get('replaySeason');
        ui.through = /^[1-9]\d?$/.test(params.get('replayWeek') || '') && Number(params.get('replayWeek')) <= 14 ? params.get('replayWeek') : 'all';
      } catch (_error) {}
      ui.replayInitialized = true;
    }
    const allWeeks = ui.season === '2026' ? liveWeeks : archive;
    if (ui.through !== 'all' && !allWeeks.some(week => week.week === Number(ui.through))) ui.through = 'all';
    const names = [...new Set(allWeeks.flatMap(week => week.rows.map(row => row.name)))].sort((a, b) => a.localeCompare(b));
    if (!names.includes(ui.replayTeam)) ui.replayTeam = names[0] || '';
    if (!names.includes(ui.replayOwner)) ui.replayOwner = names.find(name => name !== ui.replayTeam) || names[0] || '';
    const record = value => value.wins + '–' + value.losses + '–' + value.ties;
    const number = value => value == null ? '—' : value.toFixed(2);
    const controls = node('div', 'desk-controls');
    const switches = node('div', 'clarity-tabs desk-view-switch');
    switches.setAttribute('aria-label', 'Season comparison views');
    const replayControls = node('div', 'desk-controls');
    const allPlayControls = node('div', 'desk-controls');
    const holder = node('div', '');
    function syncReplayUrl() {
      try {
        if (!root.history || !root.location) return;
        const params = new URLSearchParams(root.location.search);
        params.set('replayTeam', ui.replayTeam); params.set('replayOwner', ui.replayOwner); params.set('replayMethod', ui.selfMatch);
        params.set('replaySeason', ui.season); params.set('replayWeek', ui.through);
        root.history.replaceState(null, '', root.location.pathname + '?' + params + '#fair');
      } catch (_error) {}
    }
    const paint = () => {
      holder.textContent = '';
      replayControls.hidden = ui.view !== 'replay'; allPlayControls.hidden = ui.view !== 'allplay';
      [...switches.children].forEach(button => {
        const selected = button.dataset.fairView === ui.view;
        button.className = 'clarity-tab' + (selected ? ' active' : '');
        button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });
      const weeks = (ui.season === '2026' ? liveWeeks : archive).filter(week => ui.through === 'all' || week.week <= Number(ui.through));
      const result = fairSchedule(weeks).sort((a, b) => b[ui.sort] - a[ui.sort] || a.name.localeCompare(b.name));
      holder.appendChild(node('p', 'desk-data-label', 'ACTUAL RESULTS · ' + ui.season + ' · ' + weeks.length + ' complete regular-season weeks · no projected scores'));
      const expectedThrough = ui.through === 'all' ? (ui.season === '2026' && bundle ? bundle.model.completedThrough : 14) : Number(ui.through);
      const missingWeeks = Array.from({length: expectedThrough}, (_, index) => index + 1).filter(week => !weeks.some(slate => slate.week === week));
      if (missingWeeks.length) holder.appendChild(node('p', 'desk-note', 'Final data unavailable for Week ' + missingWeeks.join(', ') + '. Those weeks are excluded from every comparison; displayed records are not the complete season.'));
      if (!result.length) {
        holder.appendChild(node('p', '', 'No final weeks to replay yet.'));
        return;
      }
      if (ui.view === 'replay') {
        const report = scheduleReplay({weeks, teamId: ui.replayTeam, scheduleId: ui.replayOwner, selfMatch: ui.selfMatch});
        holder.appendChild(node('h3', 'desk-replay-title', report.teamName + ' on ' + report.scheduleName + '’s schedule'));
        const strip = node('div', 'desk-strip');
        const delta = (report.winsDelta > 0 ? '+' : '') + report.winsDelta;
        [['Actual · same weeks', record(report.actual)], ['Replayed record', record(report.replay)], ['Win-equivalent change', delta]].forEach(item => {
          const cell = node('div', 'desk-strip-item'); cell.append(node('b', '', item[1]), node('span', '', item[0])); strip.appendChild(cell);
        });
        holder.appendChild(strip);
        holder.appendChild(node('p', 'desk-callout', report.games + ' paired weeks compared · ' + report.skippedWeeks + ' excluded. Your full available actual record: ' + record(report.fullActual) + '. A tie counts as half a win for the change above.'));
        holder.appendChild(node('p', 'desk-note', ui.selfMatch === 'skip'
          ? 'Exact borrowed opponents. A matchup against your own score is N/A and excluded from BOTH compared records—never an automatic win or tie.'
          : 'Two-way schedule swap. If the borrowed opponent would be you, you face the schedule owner instead; the original head-to-head stays intact.'));
        holder.appendChild(node('p', 'desk-note', 'Keep your real weekly score and compare it with the borrowed opponent’s real score from that same week. No roster, scoring, or standings changes are made.'));
        holder.appendChild(table(['Week', 'Your pts', 'Actual opponent', 'Actual result', 'Borrowed opponent', 'Opponent pts', 'Replayed result'], report.rows.map(row => {
          const outcome = node('span', row.status !== 'played' ? 'desk-result na' : 'desk-result ' + row.replayResult.toLowerCase(), row.status === 'played' ? row.replayResult + (row.changed ? ' · changed' : ' · same') : 'N/A');
          outcome.title = row.reason || (row.swapped ? 'Self-match avoided by swapping manager positions' : 'Same-week actual-score replay');
          return [row.week, number(row.points), row.originalOpponent || 'Unavailable', row.actualResult || 'N/A', row.opponent + (row.swapped ? ' · swapped' : '') || 'Unavailable', number(row.opponentPoints), outcome];
        }), 'Week-by-week schedule replay'));
        const exclusions = report.rows.filter(row => row.status !== 'played');
        if (exclusions.length) holder.appendChild(node('p', 'desk-note', exclusions.map(row => 'Week ' + row.week + ': ' + row.reason).join('. ') + '.'));
        holder.appendChild(node('p', 'desk-note', 'Opponent scoring faced on these same weeks: actual ' + number(report.actualOpponentMean) + ' PPG → borrowed ' + number(report.replayOpponentMean) + ' PPG. Higher means a tougher scoring slate, not a forecast.'));
        const alternatives = names.map(name => scheduleReplay({weeks, teamId: ui.replayTeam, scheduleId: name, selfMatch: ui.selfMatch}));
        const allSchedules = node('div', '');
        allSchedules.appendChild(node('p', 'desk-note', 'With N/A self-matchups excluded, game counts can differ by schedule. Compare paired records and counts, not raw win totals alone.'));
        allSchedules.appendChild(table(['Schedule owner', 'Weeks compared', 'Actual · same weeks', 'Replayed W–L–T', 'Win change'], alternatives.map(row => [row.scheduleName, row.games, record(row.actual), record(row.replay), (row.winsDelta > 0 ? '+' : '') + row.winsDelta]), 'Your record on every manager’s schedule'));
        holder.appendChild(disclosure('Try every schedule', 'All schedule owners, with matched-week records', allSchedules));
        syncReplayUrl();
        return;
      }
      if (ui.view === 'strength') {
        holder.appendChild(node('h3', 'desk-replay-title', 'Separate team scoring from the schedule you faced'));
        holder.appendChild(node('p', 'desk-note', 'Team strength uses your actual PPG, median, and all-play rate. Schedule strength uses opponents’ actual same-week scoring; higher opponent PPG means a tougher scoring slate. These are retrospective descriptions—not pregame projections or proof of causation.'));
        holder.appendChild(table(['Manager', 'Actual W–L–T', 'Avg. pts', 'Median pts', 'All-play rate', 'Opp. avg. pts', 'Opp. median pts'], seasonStrength(weeks).map(row => [row.name, record(row.record), number(row.ppg), number(row.median), pct(row.allPlayPct), number(row.opponentPPG), number(row.opponentMedian)]), ui.season + ' team strength vs schedule strength'));
        return;
      }
      holder.appendChild(node('p', 'desk-kicker', 'Expected wins = share of the league you outscored each week (ties count half). Schedule edge = actual wins minus that expectation. This all-play baseline is not the same as borrowing one manager’s schedule.'));
      const visible = result.filter(row => ui.manager === 'all' || row.name === ui.manager);
      holder.appendChild(table(['Manager', 'Games', 'Actual wins', 'All-play expected', 'Schedule edge', 'Points'], visible.map(row => [row.name, row.games, row.actual.toFixed(2), row.expected.toFixed(2), (row.luck > 0 ? '+' : '') + row.luck.toFixed(2), row.points.toFixed(2)]), ui.season + ' fair-slate replay'));
      if (ui.manager !== 'all') {
        holder.appendChild(table(['Week', 'Actual wins', 'Expected wins', 'Edge', 'Points'], weeks.flatMap(week => {
          const row = fairSchedule([week]).find(item => item.name === ui.manager);
          return row ? [[week.week, row.actual.toFixed(2), row.expected.toFixed(2), (row.luck > 0 ? '+' : '') + row.luck.toFixed(2), row.points.toFixed(2)]] : [];
        }), ui.manager + ' week-by-week schedule impact'));
      }
    };
    controls.appendChild(field('Season', [['2026', '2026 · current season'], ['2025', '2025 · archive']], ui.season, value => {
      ui.season = value; ui.through = 'all'; ui.manager = 'all';
      const replacement = renderFair(bundle); wrap.replaceWith(replacement); replacement.querySelector('select').focus({preventScroll: true});
    }));
    controls.appendChild(field('Through week', [['all', 'All final weeks']].concat(allWeeks.map(week => [week.week, 'Week ' + week.week])), ui.through, value => { ui.through = value; paint(); }));
    [['replay', 'Schedule replay'], ['strength', 'Season strength'], ['allplay', 'All-play baseline']].forEach(item => {
      const button = node('button', 'clarity-tab', item[1]); button.type = 'button'; button.dataset.fairView = item[0];
      button.addEventListener('click', () => { ui.view = item[0]; paint(); }); switches.appendChild(button);
    });
    replayControls.appendChild(field('Your team', names.map(name => [name, name]), ui.replayTeam, value => { ui.replayTeam = value; paint(); }));
    replayControls.appendChild(field('Borrow this schedule', names.map(name => [name, name]), ui.replayOwner, value => { ui.replayOwner = value; paint(); }));
    replayControls.appendChild(field('Self-matchup rule', [['skip', 'Skip self-matchups · N/A'], ['swap', 'Swap the two managers']], ui.selfMatch, value => { ui.selfMatch = value; paint(); }));
    allPlayControls.appendChild(field('Sort by', [['luck', 'Schedule edge'], ['expected', 'All-play wins'], ['actual', 'Actual wins'], ['points', 'Points scored']], ui.sort, value => { ui.sort = value; paint(); }));
    allPlayControls.appendChild(field('Manager detail', optionsFor(allWeeks.flatMap(week => week.rows.map(row => row.name)), 'All managers'), ui.manager, value => { ui.manager = value; paint(); }));
    wrap.append(controls, switches, replayControls, allPlayControls);
    wrap.appendChild(holder);
    paint();
    return wrap;
  }

  function mountDraft(parent) {
    if (!parent || !root.document) return;
    const league = (root.LEAGUE && root.LEAGUE.live2026) || {};
    const draftId = root.LEAGUE && root.LEAGUE.draft2026 && root.LEAGUE.draft2026.draftId;
    if (!draftId || !root.FarmhoodLive) return;
    lazyDetails(parent, '2026 draft tracker', 'Explore every pick by manager, position, and current roster status', async body => {
      const parts = await Promise.all([
        fetchJson('https://api.sleeper.app/v1/draft/' + draftId + '/picks'),
        root.FarmhoodLive.load(),
        fetchJson('https://api.sleeper.app/v1/league/' + league.leagueId + '/rosters')
      ]);
      const picks = (parts[0] || []).map(pick => {
        const meta = pick.metadata || {};
        const rosterId = Number(pick.roster_id);
        const manager = (league.rosterNames && league.rosterNames[String(rosterId)]) || ('Roster ' + rosterId);
        return {
          playerId: String(pick.player_id || ''),
          name: ((meta.first_name || '') + ' ' + (meta.last_name || '')).trim() || ('Player ' + pick.player_id),
          position: meta.position || '',
          round: Number(pick.round),
          pick: Number(pick.pick_no),
          rosterId,
          manager
        };
      });
      const snapshot = parts[1];
      const rawRosters = parts[2];
      if (!Array.isArray(rawRosters) || rawRosters.length !== snapshot.rosters.length || !picks.length
        || snapshot.rosters.some(roster => !rawRosters.some(raw => Number(raw.roster_id) === roster.rosterId && Array.isArray(raw.players)))) throw new Error('Incomplete ownership');
      const rosters = rawRosters.map(row => ({
        rosterId: Number(row.roster_id),
        manager: snapshot.rosters.find(roster => roster.rosterId === Number(row.roster_id)).name,
        playerIds: [...(row.players || []), ...(row.reserve || []), ...(row.taxi || [])]
      }));
      const starterIds = rawRosters.flatMap(row => row.starters || []);
      paintGraveyard(body, draftGraveyard({picks, rosters, starterIds}));
    });
  }

  function paintGraveyard(body, report) {
    body.textContent = '';
    const strip = node('div', 'desk-strip');
    [['Kept', report.kept], ['Moved', report.moved], ['Gone', report.gone]].forEach(item => {
      const cell = node('div', 'desk-strip-item');
      cell.appendChild(node('b', '', String(item[1])));
      cell.appendChild(node('span', '', item[0]));
      strip.appendChild(cell);
    });
    body.appendChild(strip);
    body.appendChild(node('p', 'desk-note', 'League-wide totals above. Kept = original drafting roster; moved = another roster; gone = currently unrostered. IR and taxi players still count as rostered. Starting reflects the current lineup, not every past week.'));
    const ui = {manager: 'all', status: 'all', position: 'all', query: ''};
    const controls = node('div', 'desk-controls');
    const holder = node('div', '');
    const paint = () => {
      holder.textContent = '';
      const rows = report.picks.filter(pick => (ui.manager === 'all' || pick.manager === ui.manager)
        && (ui.status === 'all' || (ui.status === 'starting' ? pick.starting : pick.status === ui.status))
        && (ui.position === 'all' || pick.position === ui.position)
        && (!ui.query || (pick.name + ' ' + pick.manager + ' ' + pick.holder).toLowerCase().includes(ui.query)));
      holder.appendChild(node('p', 'desk-note', rows.length + ' of ' + report.picks.length + ' picks match.'));
      if (!rows.length) { holder.appendChild(node('p', '', 'No picks match these filters.')); return; }
      holder.appendChild(table(['Pick', 'Player', 'Pos.', 'Drafted by', 'Status', 'Current manager', 'Starting'], rows.slice().sort((a, b) => a.pick - b.pick).map(pick => [pick.pick + ' · R' + pick.round, pick.name, pick.position, pick.manager, pick.status, pick.holder || 'Unrostered', pick.starting ? 'Yes' : 'No']), '2026 draft picks · current ownership'));
    };
    controls.appendChild(field('Drafted by', optionsFor(report.picks.map(pick => pick.manager), 'All managers'), ui.manager, value => { ui.manager = value; paint(); }));
    controls.appendChild(field('Roster status', [['all', 'All picks'], ['kept', 'Kept'], ['moved', 'Moved'], ['gone', 'Unrostered'], ['starting', 'Currently starting']], ui.status, value => { ui.status = value; paint(); }));
    controls.appendChild(field('Position', optionsFor(report.picks.map(pick => pick.position), 'All positions'), ui.position, value => { ui.position = value; paint(); }));
    const search = node('label', 'desk-field');
    search.appendChild(node('span', '', 'Find a player or manager'));
    const input = node('input', '');
    input.type = 'search'; input.placeholder = 'Search draft picks';
    input.addEventListener('input', () => { ui.query = input.value.trim().toLowerCase(); paint(); });
    search.appendChild(input); controls.appendChild(search);
    body.append(controls, holder); paint();
  }

  function graveRow(pick) {
    const row = node('div', 'desk-fair-row');
    row.appendChild(node('strong', '', pick.name));
    row.appendChild(node('span', '', 'R' + pick.round + ' · ' + pick.manager));
    row.appendChild(node('b', '', pick.status === 'gone' ? 'Gone' : (pick.holder && pick.holder !== pick.manager ? 'Now ' + pick.holder : 'Kept')));
    return row;
  }

  function mountHistory(parent) {
    if (!parent || !root.document) return;
    lazyDetails(parent, 'Paid rivalry series', 'Six $50 showdowns · official awards beside the archived series', async body => {
      const [config, ledger] = await Promise.all([loadPayoutConfig(), fetchJson('content/payouts/2026.json')]);
      const results = ((ledger && ledger.weekly) || []).filter(week => week.rivalry && week.rivalry.scores && week.rivalry.scores.length === 2).map(week => ({
        id: week.rivalry.id,
        week: week.week,
        a: week.rivalry.scores[0].manager,
        b: week.rivalry.scores[1].manager,
        scoreA: week.rivalry.scores[0].score,
        scoreB: week.rivalry.scores[1].score,
        status: week.rivalry.status
      }));
      paintRivalries(body, rivalrySeries({
        paid: config.rivalries.map(row => Object.assign({}, row, {a: row.managerA, b: row.managerB})),
        amount: config.rivalryPrize,
        allTime: ((root.LEAGUE && root.LEAGUE.allTime && root.LEAGUE.allTime.rivalries) || []).map(row => ({a: row.a, b: row.b, aWins: row.a_wins, bWins: row.b_wins, games: row.games})),
        results
      }));
    });
    const leagueId = root.LEAGUE && root.LEAGUE.live2026 && root.LEAGUE.live2026.leagueId;
    if (!leagueId || !root.FarmhoodLive) return;
    const names = (root.LEAGUE.live2026 && root.LEAGUE.live2026.rosterNames) || {};
    lazyDetails(parent, 'Waiver outcomes', 'Inspect adds, unplayed pickups, and productive drops by manager', async body => {
      const snapshot = await root.FarmhoodLive.load();
      const through = completedWeek(snapshot);
      if (!through) { body.textContent = 'No finalized regular-season weeks yet.'; return; }
      const [slates, events, feed] = await Promise.all([
        Promise.all(Array.from({length: through}, (_, index) => index + 1).map(week => fetchJson('https://api.sleeper.app/v1/league/' + leagueId + '/matchups/' + week).then(rows => ({week, rows})))),
        Promise.all(Array.from({length: through}, (_, index) => index + 1).map(week => fetchJson('https://api.sleeper.app/v1/league/' + leagueId + '/transactions/' + week).then(rows => ({week, rows})))),
        root.FarmhoodLive.loadPlayers(snapshot, snapshot.currentWeek)
      ]);
      // A partial history must not make a pickup look unproductive.
      if (slates.some(slate => !Array.isArray(slate.rows) || slate.rows.length !== snapshot.rosters.length)
        || events.some(slate => !Array.isArray(slate.rows))) throw new Error('Incomplete history');
      const player = id => ({id: String(id), name: (feed.players[id] || {}).name || (NFL_TEAMS.has(id) ? id + ' D/ST' : 'Player ' + id), position: (feed.players[id] || {}).position || (NFL_TEAMS.has(id) ? 'DEF' : '')});
      const transactions = events.flatMap(slate => slate.rows.filter(deal => deal.status === 'complete' && ['waiver', 'free_agent', 'trade'].includes(deal.type)).flatMap(deal => {
        const owners = new Set([...Object.values(deal.adds || {}), ...Object.values(deal.drops || {})].map(Number));
        return [...owners].map(rosterId => ({
          transactionId: String(deal.transaction_id) + ':' + rosterId,
          week: slate.week, manager: names[rosterId] || ('Roster ' + rosterId), rosterId,
          type: deal.type, completedAt: deal.status_updated || deal.created,
          adds: Object.keys(deal.adds || {}).filter(id => Number(deal.adds[id]) === rosterId).map(player),
          drops: Object.keys(deal.drops || {}).filter(id => Number(deal.drops[id]) === rosterId).map(player)
        }));
      }));
      const weeks = slates.map(slate => ({
          week: slate.week,
          rosters: (slate.rows || []).map(row => ({
            rosterId: row.roster_id,
            manager: names[String(row.roster_id)] || ('Roster ' + row.roster_id),
            playerIds: row.players || [],
            starters: (row.starters || []).map((id, index) => ({id, points: (row.starters_points || [])[index]}))
          }))
        }));
      const report = waiverAutopsy({transactions, weeks, includeAcquisitionWeek: false});
      paintAutopsy(body, report, {through, transactions});
    });
  }

  function paintRivalries(body, series) {
    body.textContent = '';
    const holder = node('div', '');
    let manager = 'all';
    body.appendChild(field('Manager', optionsFor(series.flatMap(row => [row.a, row.b]), 'All rivalries'), manager, value => { manager = value; paint(); }));
    function paint() {
      holder.textContent = '';
      series.filter(row => manager === 'all' || row.a === manager || row.b === manager).forEach(row => {
      const card = node('article', 'desk-rival');
      card.appendChild(node('h3', '', row.labelA + ' vs ' + row.labelB));
      const allTime = row.games ? (row.aWins + '-' + row.bWins + ' in the archive through 2025, ' + (row.leader === 'tied' ? 'level' : row.leader + ' leads')) : 'No archived series';
      card.appendChild(node('p', '', allTime + ' · Week ' + row.week + ' purse ' + money(row.amount)));
      if (row.season) card.appendChild(node('p', 'desk-note', '2026: ' + row.season.scoreA.toFixed(2) + '–' + row.season.scoreB.toFixed(2) + (row.season.status === 'final' ? (row.season.winner === 'tie' ? ' · official split' : ' · official winner: ' + row.season.winner) : ' · provisional; not an official award') + '.'));
      else card.appendChild(node('p', 'desk-note', 'This year\'s showdown has not been reconciled.'));
      holder.appendChild(card);
      });
    }
    body.appendChild(holder); paint();
  }

  function paintAutopsy(body, report, coverage) {
    body.textContent = '';
    const ui = {manager: 'all', pile: 'hits', week: 'all'};
    const controls = node('div', 'desk-controls');
    const holder = node('div', '');
    const all = [...report.hits, ...report.misses, ...report.heists, ...(report.unknown || [])].filter(row => row.type !== 'trade');
    controls.appendChild(field('Manager', optionsFor(all.map(row => row.manager), 'All managers'), ui.manager, value => { ui.manager = value; paint(); }));
    controls.appendChild(field('Outcome', [['hits', 'Scoring pickups'], ['misses', 'No later starter points'], ['heists', 'Productive drops'], ['unknown', 'Awaiting evidence']], ui.pile, value => { ui.pile = value; paint(); }));
    controls.appendChild(field('Transaction week', [['all', 'All weeks']].concat([...new Set(all.map(row => row.week))].sort((a, b) => a - b).map(week => [week, 'Week ' + week])), ui.week, value => { ui.week = value; paint(); }));
    function paint() {
      holder.textContent = '';
      const rows = (report[ui.pile] || []).filter(row => row.type !== 'trade' && (ui.manager === 'all' || row.manager === ui.manager) && (ui.week === 'all' || row.week === Number(ui.week)));
      holder.appendChild(node('p', 'desk-note', rows.length + ' matching player moves · finalized scores through Week ' + coverage.through + '.'));
      if (!rows.length) { holder.appendChild(node('p', '', 'No moves match this view. Try another outcome or manager.')); return; }
      holder.appendChild(table(['Player', 'Position', ui.pile === 'heists' ? 'Dropped by' : 'Added by', 'Move week', 'Later starts', 'Later points', ui.pile === 'heists' ? 'Best later scorer for' : 'Latest final roster'], rows.map(row => [row.name, row.position, row.manager, row.week, row.starts == null ? '—' : row.starts, row.points == null ? '—' : row.points.toFixed(2), ui.pile === 'heists' ? (row.scoredFor || '—') : (row.currentManager || 'Unrostered / unknown')]), 'Waiver and free-agent outcomes'));
    }
    body.append(controls, holder);
    body.appendChild(node('p', 'desk-note', 'Weekly ownership proxy, not exact return on investment. Counts subsequent finalized weeks only; the transaction week is excluded because pickups can happen after kickoff. Add production stays with that manager’s ownership stint and is not credited after a transfer. Trade events bound ownership but are not shown as waiver wins. Missing evidence is not a failed pickup.'));
    paint();
  }

  function completedWeek(snapshot) {
    const rosters = snapshot.rosters || [];
    if (!rosters.length) return 0;
    const totals = rosters.map(roster => ['wins', 'losses', 'ties'].reduce((sum, key) => sum + finite(roster[key], 0), 0));
    return Math.max(0, Math.floor(Math.min(snapshot.regularSeasonWeeks || 14, ...totals)));
  }

  function mountManagers(parent) {
    if (!parent || !root.document || !root.LEAGUE) return;
    const league = root.LEAGUE;
    const luck = {};
    ((league.allTime && league.allTime.luck) || []).forEach(row => { luck[row.name] = row.luck; });
    const titles = {};
    Object.values(Object.assign({}, league.foundersChampions || {}, league.championsByYear || {})).forEach(name => { titles[name] = (titles[name] || 0) + 1; });
    const draftSlot = {};
    ((league.draft2026 && league.draft2026.order) || []).forEach((name, index) => { draftSlot[name] = index + 1; });
    const archive = weeks2025();
    const profiles = weeks => fingerprints({managers: league.managers || [], weeks, meta: {luck, titles, draftSlot}});
    fingerprintMap = new Map(profiles(archive).map(row => [row.name, Object.assign(row, {season: 2025})]));
    lazyDetails(parent, 'Manager fingerprints', 'Compare weekly scoring, consistency, close games, and recent form', async body => {
      body.textContent = '';
      const ui = {season: '2026', sort: 'mean', manager: 'all', compare: 'none'};
      const controls = node('div', 'desk-controls');
      const holder = node('div', '');
      const names = (league.managers || []).map(row => row.name);
      let liveWeeks = null;
      let pending = false;
      let failed = false;
      async function loadLive() {
        if (pending || liveWeeks) return;
        pending = true; failed = false; paint();
        try {
          if (!root.FarmhoodLive) throw new Error('Unavailable');
          const snapshot = await root.FarmhoodLive.load();
          const through = completedWeek(snapshot);
          const entries = await Promise.all(Array.from({length: through}, (_, index) => index + 1).map(week => root.FarmhoodLive.loadWeek(week).then(rows => [week, rows])));
          liveWeeks = weeksFromBundle({model: {rosters: snapshot.rosters, completedThrough: through, regularSeasonWeeks: snapshot.regularSeasonWeeks}, weeks: Object.fromEntries(entries)});
          if (liveWeeks.length !== through) throw new Error('Incomplete final weeks');
        } catch (_error) { failed = true; liveWeeks = null; }
        finally { pending = false; paint(); }
      }
      function paint() {
        holder.textContent = '';
        holder.setAttribute('aria-busy', pending && ui.season === '2026' ? 'true' : 'false');
        if (ui.season === '2026' && !liveWeeks) {
          holder.appendChild(node('p', 'desk-note', failed ? '2026 final weeks could not be loaded. Retry or switch to the labeled 2025 archive.' : 'Loading finalized 2026 weeks…'));
          if (failed) {
            const retry = node('button', 'desk-button', 'Retry current season'); retry.type = 'button';
            retry.addEventListener('click', loadLive); holder.appendChild(retry);
          }
          return;
        }
        const weeks = ui.season === '2026' ? liveWeeks : archive;
        const rows = profiles(weeks).map(row => Object.assign(row, {season: Number(ui.season)}));
        if (ui.season === '2026') fingerprintMap = new Map(rows.map(row => [row.name, row]));
        const selected = rows.filter(row => ui.manager === 'all' || row.name === ui.manager || row.name === ui.compare)
          .sort((a, b) => finite(b[ui.sort], -Infinity) - finite(a[ui.sort], -Infinity) || a.name.localeCompare(b.name));
        holder.appendChild(node('p', 'desk-kicker', ui.season + ' · ' + weeks.length + ' finalized regular-season weeks. Swing = weekly standard deviation ÷ average; lower means steadier scoring, not necessarily a better team.'));
        holder.appendChild(table(['Manager', 'Shape', 'Games', 'Avg.', 'Low', 'High', 'Swing', 'Close W–L–T', 'Recent 3 avg.'], selected.map(row => [row.name, row.label, row.games, row.mean == null ? '—' : row.mean.toFixed(1), row.low, row.high, row.games < 4 || row.cv == null ? 'Small sample' : Math.round(row.cv * 100) + '%', row.closeWins + '–' + row.closeLosses + '–' + row.closeTies, row.late == null ? '—' : row.late.toFixed(1)]), ui.season + ' manager scoring profiles'));
        if (ui.manager !== 'all') {
          const compare = ui.compare !== 'none' && ui.compare !== ui.manager;
          holder.appendChild(table(['Week', ui.manager].concat(compare ? [ui.compare] : []), weeks.map(week => [week.week, ...[ui.manager].concat(compare ? [ui.compare] : []).map(name => {
            const row = week.rows.find(item => item.name === name); return row && scoreOf(row.points) != null ? Number(row.points).toFixed(2) : '—';
          })]), ui.season + ' weekly scoring comparison'));
        }
        holder.appendChild(node('p', 'desk-note', 'Close games finish within 10 points; ties count as half a win for the close-game rate. Shape labels are descriptive, not permanent manager ratings. Current live games and postseason scores are excluded.'));
      }
      controls.appendChild(field('Season', [['2026', '2026 · current season'], ['2025', '2025 · archive']], ui.season, value => { ui.season = value; paint(); if (value === '2026' && !failed) loadLive(); }));
      controls.appendChild(field('Sort by', [['mean', 'Average points'], ['cv', 'Largest weekly swing'], ['late', 'Recent form'], ['closeRate', 'Close-game win rate']], ui.sort, value => { ui.sort = value; paint(); }));
      controls.appendChild(field('Manager detail', optionsFor(names, 'All managers'), ui.manager, value => {
        ui.manager = value;
        compareField.querySelector('select').disabled = value === 'all';
        if (value === 'all') { ui.compare = 'none'; compareField.querySelector('select').value = 'none'; }
        paint();
      }));
      const compareField = field('Compare with', [['none', 'Choose a manager first']].concat(names.slice().sort().map(name => [name, name])), ui.compare, value => { ui.compare = value; paint(); });
      compareField.querySelector('select').disabled = true;
      controls.appendChild(compareField);
      body.append(controls, holder); await loadLive();
    });
  }

  const pendingJson = new Map();
  function fetchJson(url) {
    if (pendingJson.has(url)) return pendingJson.get(url);
    const controller = typeof root.AbortController === 'function' ? new root.AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 15000) : null;
    const request = root.fetch(url, {headers: {Accept: 'application/json'}, cache: 'no-store', credentials: 'omit', signal: controller ? controller.signal : undefined}).then(response => {
      if (!response.ok) throw new Error('Request failed');
      return response.json();
    }).finally(() => { if (timer) clearTimeout(timer); pendingJson.delete(url); });
    pendingJson.set(url, request);
    return request;
  }

  return {
    dollarsOnTheTable, mondayExposure, playoffEquity, fairSchedule, scheduleReplay, seasonStrength, waiverAutopsy, draftGraveyard, rivalrySeries, fingerprints, fingerprintFor,
    renderOdds, renderFair, mountMatchup, mountDraft, mountHistory, mountManagers,
    PRIZES, RIVALRIES, POSITION_BY_WEEK
  };
});
