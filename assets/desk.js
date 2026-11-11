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
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }
  function scoreOf(value) {
    if (value == null || value === '') return null;
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
    const scored = rows.filter(row => row.score != null).sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name)));
    if (!scored.length) return [];
    const top = scored[0].score;
    let tied = 0;
    while (tied < scored.length && Math.abs(scored[tied].score - top) <= 0.001) tied += 1;
    const share = amount / tied;
    return scored.map((row, index) => ({
      name: row.name,
      player: row.player || '',
      score: row.score,
      gap: Math.round((top - row.score) * 10) / 10,
      rank: index + 1,
      leading: index < tied,
      share: index < tied ? share : 0
    }));
  }

  function positionScore(team, position, mode) {
    let best = null;
    (team.starters || []).forEach(player => {
      if (!player || player.id === '0') return;
      const eligible = position === 'FLEX' ? player.slot === 'FLEX' : (player.slot === position || player.position === position);
      if (!eligible) return;
      const score = scoreOf(mode === 'projected' ? player.projection : player.points);
      if (score == null) return;
      if (!best || score > best.score) best = {name: team.name, player: player.name, score};
    });
    return best;
  }

  function dollarsOnTheTable(input) {
    const source = input || {};
    const mode = source.mode === 'projected' ? 'projected' : 'actual';
    const prizes = source.prizes || PRIZES;
    const position = source.position || '';
    const teams = source.teams || [];
    const high = rankedBoard(teams.map(team => ({
      name: team.name,
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
    if (player.gameStartTime) return 't:' + player.gameStartTime;
    if (player.gameDate && player.team) return player.gameDate + ':' + player.team;
    if (player.gameDate) return player.gameDate;
    return '';
  }

  function mondayExposure(input) {
    const source = input || {};
    const started = !!source.started;
    const rows = (source.teams || []).map(team => {
      const starters = (team.starters || []).filter(player => player && player.id && player.id !== '0');
      const remaining = starters.filter(player => !player.locked && player.gameStatus !== 'final');
      const keys = [...new Set(remaining.map(gameKey).filter(Boolean))];
      return {name: team.name, starters, remaining, keys, settled: starters.length > 0 && remaining.length === 0};
    });
    const dates = [];
    rows.forEach(row => row.remaining.forEach(player => { if (player.gameDate) dates.push(player.gameDate); }));
    const latest = dates.slice().sort().pop() || '';
    const oneGame = rows.filter(row => row.remaining.length && row.keys.length === 1).map(row => ({
      name: row.name,
      players: row.remaining,
      when: row.remaining[0].gameDate || '',
      opponent: row.remaining[0].opponent || row.remaining[0].team || ''
    }));
    const latestWindow = rows.map(row => ({
      name: row.name,
      players: row.remaining.filter(player => player.gameDate === latest)
    })).filter(row => row.players.length);
    const phase = !started ? 'pregame' : (rows.every(row => row.settled) ? 'complete' : 'live');
    return {phase, latest, oneGame, latestWindow, settled: rows.filter(row => row.settled).map(row => row.name)};
  }

  function nextPow2(number) {
    let size = 1;
    while (size < number) size *= 2;
    return size;
  }

  function playoffEquity(input) {
    const source = input || {};
    const sims = Math.max(1, finite(source.sims, 2000));
    const rng = mulberry32(finite(source.seed, 202611));
    const base = (source.teams || []).map(team => ({
      id: team.id,
      name: String(team.name || team.id),
      wins: finite(team.wins, 0),
      pf: finite(team.pf, 0),
      scores: (team.scores || []).map(Number).filter(score => Number.isFinite(score))
    }));
    const leagueScores = base.flatMap(team => team.scores);
    const fallback = leagueScores.length ? leagueScores : [100];
    base.forEach(team => { team.pool = team.scores.length ? team.scores : fallback; });
    const games = source.games || [];
    const spots = Math.min(Math.max(1, finite(source.playoffTeams, 6)), Math.max(1, base.length));
    const playoffCounts = new Map(base.map(team => [team.id, 0]));
    const titleCounts = new Map(base.map(team => [team.id, 0]));
    const winTotals = new Map(base.map(team => [team.id, 0]));

    function sampleScore(team) { return sample(rng, team.pool); }
    function championOf(field) {
      let round = field.map((team, index) => ({team, seed: index}));
      while (round.length > 1) {
        const byes = nextPow2(round.length) - round.length;
        const winners = round.slice(0, byes);
        const rest = round.slice(byes);
        if (rest.length % 2 === 1) winners.push(rest.pop());
        for (let index = 0; index < rest.length / 2; index++) {
          const left = rest[index];
          const right = rest[rest.length - 1 - index];
          const leftScore = sampleScore(left.team);
          const rightScore = sampleScore(right.team);
          let winner = left;
          if (Math.abs(leftScore - rightScore) <= 0.05) winner = rng() < 0.5 ? left : right;
          else winner = leftScore > rightScore ? left : right;
          winners.push(winner);
        }
        winners.sort((a, b) => a.seed - b.seed);
        round = winners;
      }
      return round[0].team;
    }

    for (let sim = 0; sim < sims; sim++) {
      const table = base.map(team => ({id: team.id, name: team.name, wins: team.wins, points: team.pf, pool: team.pool}));
      const byId = new Map(table.map(team => [team.id, team]));
      games.forEach(game => {
        const left = byId.get(game.a);
        const right = byId.get(game.b);
        if (!left || !right) return;
        const leftScore = sample(rng, left.pool);
        const rightScore = sample(rng, right.pool);
        left.points += leftScore;
        right.points += rightScore;
        if (Math.abs(leftScore - rightScore) <= 0.05) { left.wins += 0.5; right.wins += 0.5; }
        else if (leftScore > rightScore) left.wins += 1;
        else right.wins += 1;
      });
      const ordered = table.slice().sort((a, b) => b.wins - a.wins || b.points - a.points || a.name.localeCompare(b.name));
      ordered.forEach(team => winTotals.set(team.id, winTotals.get(team.id) + team.wins));
      const field = ordered.slice(0, spots);
      field.forEach(team => playoffCounts.set(team.id, playoffCounts.get(team.id) + 1));
      const winner = championOf(field);
      titleCounts.set(winner.id, titleCounts.get(winner.id) + 1);
    }
    return base.map(team => ({
      id: team.id,
      name: team.name,
      wins: team.wins,
      playoffPct: playoffCounts.get(team.id) / sims,
      titlePct: titleCounts.get(team.id) / sims,
      medianWins: Math.round((winTotals.get(team.id) / sims) * 10) / 10
    })).sort((a, b) => b.titlePct - a.titlePct || b.playoffPct - a.playoffPct || a.name.localeCompare(b.name));
  }

  function fairSchedule(weeks) {
    const totals = new Map();
    (weeks || []).forEach(week => {
      const rows = (week.rows || []).filter(row => row && row.points != null && Number.isFinite(Number(row.points)));
      rows.forEach(row => {
        if (!totals.has(row.id)) totals.set(row.id, {id: row.id, name: row.name || String(row.id), actual: 0, expected: 0, points: 0, games: 0});
        const team = totals.get(row.id);
        team.points += Number(row.points);
        team.games += 1;
      });
      rows.forEach(row => {
        const team = totals.get(row.id);
        let beaten = 0;
        let comparisons = 0;
        rows.forEach(other => {
          if (other.id === row.id) return;
          comparisons += 1;
          if (Number(row.points) > Number(other.points)) beaten += 1;
          else if (Math.abs(Number(row.points) - Number(other.points)) <= 0.001) beaten += 0.5;
        });
        if (comparisons) team.expected += beaten / comparisons;
      });
      const groups = new Map();
      rows.forEach(row => {
        const key = row.matchupId == null ? 'bye-' + row.id : String(row.matchupId);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
      });
      groups.forEach(sides => {
        if (sides.length !== 2) return;
        const left = totals.get(sides[0].id);
        const right = totals.get(sides[1].id);
        const lp = Number(sides[0].points);
        const rp = Number(sides[1].points);
        if (Math.abs(lp - rp) <= 0.001) { left.actual += 0.5; right.actual += 0.5; }
        else if (lp > rp) left.actual += 1;
        else right.actual += 1;
      });
    });
    return [...totals.values()].map(team => ({
      id: team.id,
      name: team.name,
      actual: Math.round(team.actual * 100) / 100,
      expected: Math.round(team.expected * 100) / 100,
      luck: Math.round((team.actual - team.expected) * 100) / 100,
      points: Math.round(team.points * 10) / 10,
      games: team.games
    })).sort((a, b) => b.luck - a.luck || b.expected - a.expected || a.name.localeCompare(b.name));
  }

  function waiverAutopsy(input) {
    const source = input || {};
    const weeks = (source.weeks || []).slice().sort((a, b) => a.week - b.week);
    const latest = weeks.length ? weeks[weeks.length - 1].week : 0;
    const rosterAt = (week, playerId) => {
      const slate = weeks.find(item => item.week === week);
      if (!slate) return null;
      return (slate.rosters || []).find(roster => (roster.playerIds || []).map(String).includes(String(playerId))) || null;
    };
    const starts = (fromWeek, playerId, excludeManager) => {
      let points = 0;
      let count = 0;
      let best = null;
      weeks.forEach(slate => {
        if (slate.week < fromWeek) return;
        (slate.rosters || []).forEach(roster => {
          if (excludeManager && roster.manager === excludeManager) return;
          (roster.starters || []).forEach(starter => {
            if (String(starter.id) !== String(playerId)) return;
            const value = scoreOf(starter.points);
            if (value == null) return;
            points += value;
            count += 1;
            if (!best || value > best.points) best = {week: slate.week, points: value, manager: roster.manager};
          });
        });
      });
      return {points: Math.round(points * 10) / 10, count, best};
    };
    const hits = [];
    const misses = [];
    const heists = [];
    (source.transactions || []).forEach(deal => {
      (deal.adds || []).forEach(add => {
        const result = starts(deal.week, add.id);
        const home = rosterAt(latest, add.id);
        const row = {
          name: add.name, position: add.position || '', manager: deal.manager, week: deal.week,
          points: result.points, starts: result.count,
          stillThere: !!(home && home.manager === deal.manager),
          currentManager: home ? home.manager : ''
        };
        if (result.points > 0) hits.push(row);
        else misses.push(row);
      });
      (deal.drops || []).forEach(drop => {
        const result = starts(deal.week, drop.id, deal.manager);
        if (result.points <= 0) return;
        heists.push({
          name: drop.name, position: drop.position || '', manager: deal.manager, week: deal.week,
          points: result.points, starts: result.count,
          scoredFor: result.best ? result.best.manager : ''
        });
      });
    });
    hits.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
    misses.sort((a, b) => a.week - b.week || a.name.localeCompare(b.name));
    heists.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
    return {hits, misses, heists};
  }

  function draftGraveyard(input) {
    const source = input || {};
    const rosters = source.rosters || [];
    const holder = new Map();
    const starters = new Set((source.starterIds || []).map(String));
    rosters.forEach(roster => (roster.playerIds || []).forEach(id => holder.set(String(id), roster)));
    const picks = (source.picks || []).map(pick => {
      const home = holder.get(String(pick.playerId));
      let status = 'gone';
      if (home && home.rosterId === pick.rosterId) status = 'kept';
      else if (home) status = 'moved';
      return {
        playerId: String(pick.playerId),
        name: pick.name,
        position: pick.position || '',
        round: pick.round,
        pick: pick.pick,
        manager: pick.manager,
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
        aWins = history.a === series.a ? history.aWins : history.bWins;
        bWins = history.a === series.a ? history.bWins : history.aWins;
        games = history.games;
      }
      const result = results.find(row => row.week === series.week || row.id === series.id);
      let season = null;
      if (result && result.scoreA != null && result.scoreB != null) {
        const left = result.a === series.a ? result.scoreA : result.scoreB;
        const right = result.a === series.a ? result.scoreB : result.scoreA;
        season = {
          scoreA: left, scoreB: right,
          winner: Math.abs(left - right) <= 0.001 ? 'tie' : (left > right ? series.a : series.b),
          status: result.status || 'final'
        };
      }
      const leader = aWins === bWins ? 'tied' : (aWins > bWins ? series.a : series.b);
      return Object.assign({}, series, {aWins, bWins, games, leader, season, amount: source.amount || PRIZES.rivalry});
    });
  }

  function shapeLabel(row) {
    if (row.games >= 6 && row.late != null && row.early != null && row.late - row.early >= 10) return 'Finisher';
    if (row.games >= 6 && row.late != null && row.early != null && row.early - row.late >= 10) return 'Fader';
    if (row.closeGames >= 3 && row.closeRate >= 0.65) return 'Closer';
    if (row.cv >= 0.18) return 'Swing';
    if (row.cv <= 0.08) return 'Steady';
    return 'Balanced';
  }

  function fingerprints(input) {
    const source = input || {};
    const weeks = source.weeks || [];
    const meta = source.meta || {};
    const names = new Set((source.managers || []).map(manager => manager.name));
    weeks.forEach(week => (week.rows || []).forEach(row => names.add(row.name)));
    return [...names].map(name => {
      const scores = [];
      let closeWins = 0;
      let closeLosses = 0;
      weeks.forEach(week => {
        const row = (week.rows || []).find(item => item.name === name);
        if (!row || row.points == null) return;
        scores.push({week: week.week, points: Number(row.points), matchupId: row.matchupId});
      });
      scores.forEach(row => {
        const foe = weeks.find(week => week.week === row.week);
        const other = foe && (foe.rows || []).find(item => item.matchupId === row.matchupId && item.name !== name);
        if (!other || other.points == null) return;
        const margin = Math.abs(row.points - Number(other.points));
        if (margin > 10.001) return;
        if (row.points > Number(other.points)) closeWins += 1;
        else if (row.points < Number(other.points)) closeLosses += 1;
      });
      const values = scores.map(row => row.points);
      const avg = mean(values);
      const spread = sd(values);
      const ordered = scores.slice().sort((a, b) => a.week - b.week);
      const earlyValues = ordered.slice(0, Math.max(0, ordered.length - 3)).map(row => row.points);
      const lateValues = ordered.slice(-3).map(row => row.points);
      const early = mean(earlyValues);
      const late = ordered.length >= 4 ? mean(lateValues) : null;
      const closeGames = closeWins + closeLosses;
      const profile = {
        name,
        games: values.length,
        mean: avg == null ? null : Math.round(avg * 10) / 10,
        sd: Math.round(spread * 10) / 10,
        cv: avg ? spread / avg : 0,
        high: values.length ? Math.max(...values) : null,
        low: values.length ? Math.min(...values) : null,
        closeWins, closeLosses, closeGames,
        closeRate: closeGames ? closeWins / closeGames : 0,
        early: early == null ? null : Math.round(early * 10) / 10,
        late: late == null ? null : Math.round(late * 10) / 10,
        luck: meta.luck && meta.luck[name] != null ? meta.luck[name] : null,
        titles: meta.titles && meta.titles[name] ? meta.titles[name] : 0,
        draftSlot: meta.draftSlot && meta.draftSlot[name] ? meta.draftSlot[name] : null
      };
      profile.label = values.length ? shapeLabel(profile) : 'Unscored';
      const swing = profile.cv ? Math.round(profile.cv * 100) + '%' : '—';
      profile.summary = profile.label + '. Weekly swing ' + swing + '. Close games ' + closeWins + '-' + closeLosses + '.'
        + (profile.late != null && profile.early != null ? ' Late weeks ' + profile.late.toFixed(1) + ' versus early ' + profile.early.toFixed(1) + '.' : '');
      return profile;
    }).sort((a, b) => b.cv - a.cv || a.name.localeCompare(b.name));
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
  function pct(value) { return Math.round(finite(value, 0) * 100) + '%'; }

  let matchupUi = {tab: 'money', open: null};

  function mountMatchup(host, ctx) {
    if (!host || !root.document || !root.FarmhoodLive) return;
    const teams = (ctx.rows || []).map(row => {
      const roster = (ctx.snapshot.rosters || []).find(item => item.rosterId === row.rosterId);
      const lineup = root.FarmhoodLive.lineupFor(row, ctx.snapshot.rosterPositions, ctx.playerFeed || {});
      const watch = ((ctx.forecast && ctx.forecast.teams) || []).find(team => Number(team.rosterId) === Number(row.rosterId));
      return {
        name: roster ? roster.name : ('Roster ' + row.rosterId),
        points: finite(row.points, 0),
        projection: watch && watch.pregameProjection != null ? watch.pregameProjection : (watch ? watch.projection : null),
        starters: lineup.filter(player => player.id && player.id !== '0').map(player => ({
          id: player.id, name: player.name, slot: player.slot, position: player.position,
          points: player.points, projection: player.projection, locked: !!player.locked,
          gameStatus: player.gameStatus || '', gameDate: player.gameDate || '',
          gameStartTime: player.gameStartTime || null, team: player.team || '', opponent: player.opponent || ''
        }))
      };
    });
    const week = ctx.selectedWeek;
    const rivalry = RIVALRIES.find(series => series.week === week) || null;
    const position = POSITION_BY_WEEK[week] || '';
    const scheduled = ctx.weekState === 'Scheduled';
    const dollars = dollarsOnTheTable({
      teams, mode: scheduled ? 'projected' : 'actual', position, rivalry,
      prizes: PRIZES
    });
    const exposure = mondayExposure({teams, started: ctx.weekState === 'Live' || ctx.weekState === 'Final'});
    host.textContent = '';
    const body = node('div', 'desk-live-body');
    const tabs = node('div', 'clarity-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'This week beyond the score');
    [['money', 'Dollars'], ['exposure', 'Still playing']].forEach(item => {
      const button = node('button', 'clarity-tab' + (matchupUi.tab === item[0] ? ' active' : ''), item[1]);
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', matchupUi.tab === item[0] ? 'true' : 'false');
      button.addEventListener('click', () => { matchupUi.tab = item[0]; mountMatchup(host, ctx); });
      tabs.appendChild(button);
    });
    body.appendChild(tabs);
    if (matchupUi.tab === 'exposure') body.appendChild(renderExposure(exposure, ctx.weekState));
    else body.appendChild(renderDollars(dollars, ctx.weekState, week, position));
    const open = matchupUi.open == null ? ctx.weekState !== 'Final' : matchupUi.open;
    const details = disclosure('This week, off the scoreboard', (ctx.weekState === 'Final' ? 'Settled stakes' : 'Money still live') + ' · who is down to one game', body);
    details.open = open;
    details.addEventListener('toggle', () => { matchupUi.open = details.open; });
    host.appendChild(details);
  }

  function renderDollars(board, weekState, week, position) {
    const wrap = node('div', 'desk-money');
    const verb = weekState === 'Final' ? 'settled' : (board.mode === 'projected' ? 'projected' : 'in progress');
    wrap.appendChild(node('p', 'desk-kicker', 'Week ' + week + ' ' + verb + '. High score ' + money(PRIZES.high) + ' · ' + (position || 'position') + ' starter ' + money(PRIZES.position) + (board.rivalry ? ' · rivalry ' + money(PRIZES.rivalry) : '')));
    const grid = node('div', 'desk-money-grid');
    grid.appendChild(prizeColumn('High score', money(PRIZES.high), board.high, row => row.name));
    grid.appendChild(prizeColumn(position + ' starter', money(PRIZES.position), board.positionBoard, row => row.player + ' · ' + row.name));
    const rivalry = node('section', 'desk-prize');
    rivalry.appendChild(node('h3', '', board.rivalry ? 'Rivalry ' + money(PRIZES.rivalry) : 'Rivalry'));
    if (!board.rivalry) rivalry.appendChild(node('p', '', 'No rivalry purse this week.'));
    else {
    let lead = 'Waiting on both projections';
    if (board.rivalry.scoreA == null && board.rivalry.scoreB != null) lead = board.rivalry.labelA + ' is not projected yet';
    else if (board.rivalry.scoreB == null && board.rivalry.scoreA != null) lead = board.rivalry.labelB + ' is not projected yet';
    else if (board.rivalry.leader === 'tie') lead = 'Tied';
    else if (board.rivalry.leader === board.rivalry.a) lead = board.rivalry.labelA + ' leads';
    else if (board.rivalry.leader === board.rivalry.b) lead = board.rivalry.labelB + ' leads';
    rivalry.appendChild(node('p', 'desk-prize-lead', lead));
      rivalry.appendChild(node('p', '', board.rivalry.labelA + ' ' + (board.rivalry.scoreA == null ? '—' : board.rivalry.scoreA.toFixed(1)) + ' · ' + board.rivalry.labelB + ' ' + (board.rivalry.scoreB == null ? '—' : board.rivalry.scoreB.toFixed(1))));
    }
    grid.appendChild(rivalry);
    wrap.appendChild(grid);
    return wrap;
  }

  function prizeColumn(title, amount, rows, label) {
    const column = node('section', 'desk-prize');
    column.appendChild(node('h3', '', title));
    column.appendChild(node('p', 'desk-prize-amount', amount));
    (rows || []).slice(0, 4).forEach(row => {
      const line = node('div', 'desk-prize-row' + (row.leading ? ' is-leading' : ''));
      line.appendChild(node('span', '', label(row)));
      line.appendChild(node('b', '', row.score.toFixed(1) + (row.leading ? '' : ' · ' + row.gap.toFixed(1) + ' back')));
      column.appendChild(line);
    });
    if (rows && rows[0] && rows.filter(row => row.leading).length > 1) column.appendChild(node('p', 'desk-note', 'The lead is a split.'));
    if (!rows || !rows.length) column.appendChild(node('p', '', 'No score yet.'));
    return column;
  }

  function renderExposure(report, weekState) {
    const wrap = node('div', 'desk-exposure');
    if (weekState === 'Scheduled' || report.phase === 'pregame') {
      wrap.appendChild(node('p', 'desk-kicker', 'Kickoff has not split the slate. These are the starters parked on the latest window, ' + (report.latest || 'the final date') + '.'));
      report.latestWindow.forEach(row => wrap.appendChild(exposureRow(row.name, row.players)));
      if (!report.latestWindow.length) wrap.appendChild(node('p', '', 'Game times are not posted yet.'));
      return wrap;
    }
    if (report.phase === 'complete') {
      wrap.appendChild(node('p', 'desk-kicker', 'Every starter on the board has played. Nobody is still holding a Monday.'));
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
    const teams = model.rosters.map(roster => {
      const scores = [];
      Object.keys(bundle.weeks || {}).forEach(key => {
        const week = Number(key);
        if (week > model.completedThrough || week > model.regularSeasonWeeks) return;
        const row = (bundle.weeks[key] || []).find(item => item.rosterId === roster.rosterId);
        if (!row || row.points == null || !Number.isFinite(Number(row.points))) return;
        if (Math.abs(Number(row.points)) < 0.001 && model.completedThrough < week) return;
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
    const result = playoffEquity({teams, games, playoffTeams: model.playoffTeams, sims: 2000, seed: 202611});
    wrap.appendChild(node('p', 'desk-kicker', 'Two thousand simulated finishes. Each week draws from that manager\'s own scores, then a ' + model.playoffTeams + '-team bracket. The top seeds bye the first round.'));
    result.forEach(row => {
      const line = node('div', 'desk-odd');
      const copy = node('div', 'desk-odd-copy');
      copy.appendChild(node('strong', '', row.name));
      copy.appendChild(node('span', '', 'Playoffs ' + pct(row.playoffPct) + ' · title ' + pct(row.titlePct)));
      const bar = node('div', 'desk-bar');
      const fill = node('i', 'desk-bar-fill');
      fill.style.width = pct(row.playoffPct);
      bar.appendChild(fill);
      line.append(copy, bar, node('b', '', pct(row.titlePct)));
      wrap.appendChild(line);
    });
    wrap.appendChild(node('p', 'desk-note', 'The bar is the chance of reaching the playoff field. The percent at the right is the title.'));
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
      }).filter(row => row && row.points != null && Math.abs(Number(row.points)) > 0.001);
      if (rows.length) weeks.push({week, rows});
    });
    return weeks.sort((a, b) => a.week - b.week);
  }

  function weeks2025() {
    const league = root.LEAGUE || {};
    const names = league.names2025 || {};
    return Object.keys(league.weekly2025 || {}).map(Number).sort((a, b) => a - b).map(week => ({
      week,
      rows: league.weekly2025[week].map(row => ({id: names[row[0]] || ('Roster ' + row[0]), name: names[row[0]] || ('Roster ' + row[0]), matchupId: row[1], points: row[2]}))
    }));
  }

  function renderFair(bundle) {
    const wrap = node('div', 'desk-panel');
    const liveWeeks = bundle ? weeksFromBundle(bundle) : [];
    const archive = weeks2025();
    let which = liveWeeks.length ? '2026' : '2025';
    const holder = node('div', '');
    const paint = () => {
      holder.textContent = '';
      const table = fairSchedule(which === '2026' ? liveWeeks : archive);
      holder.appendChild(node('p', 'desk-kicker', (which === '2026' ? '2026 through the last final week' : 'The 2025 regular season') + '. Expected wins are all-play. Luck is the actual record minus that expectation.'));
      if (!table.length) {
        holder.appendChild(node('p', '', 'No final weeks to replay yet.'));
        return;
      }
      const carried = table[0];
      const robbed = table[table.length - 1];
      holder.appendChild(node('p', 'desk-callout', carried.luck > 0.2 ? carried.name + ' has been carried by ' + carried.luck.toFixed(2) + ' wins. ' + robbed.name + ' is ' + robbed.luck.toFixed(2) + ' against the slate.' : 'The slate and the standings are still close.'));
      table.forEach(row => {
        const line = node('div', 'desk-fair-row');
        line.appendChild(node('strong', '', row.name));
        line.appendChild(node('span', '', row.actual.toFixed(2) + ' actual'));
        line.appendChild(node('span', '', row.expected.toFixed(2) + ' expected'));
        line.appendChild(node('b', row.luck >= 0 ? 'pos' : 'neg', (row.luck > 0 ? '+' : '') + row.luck.toFixed(2)));
        holder.appendChild(line);
      });
    };
    const tabs = node('div', 'clarity-tabs');
    [['2026', 'This season'], ['2025', '2025 replay']].forEach(item => {
      const button = node('button', 'clarity-tab' + (which === item[0] ? ' active' : ''), item[1]);
      button.type = 'button';
      button.addEventListener('click', () => {
        which = item[0];
        [...tabs.children].forEach(child => { child.classList.toggle('active', child === button); child.setAttribute('aria-selected', child === button ? 'true' : 'false'); });
        paint();
      });
      button.setAttribute('aria-selected', which === item[0] ? 'true' : 'false');
      tabs.appendChild(button);
    });
    wrap.appendChild(tabs);
    wrap.appendChild(holder);
    paint();
    return wrap;
  }

  function mountDraft(parent) {
    if (!parent || !root.document) return;
    const body = node('div', 'desk-panel');
    body.appendChild(node('p', 'desk-kicker', 'Checking which 2026 picks are still on the roster that drafted them.'));
    parent.appendChild(disclosure('2026 draft graveyard', 'Kept, moved, or gone', body));
    const league = (root.LEAGUE && root.LEAGUE.live2026) || {};
    const draftId = root.LEAGUE && root.LEAGUE.draft2026 && root.LEAGUE.draft2026.draftId;
    if (!draftId || !root.FarmhoodLive) return;
    Promise.all([
      fetchJson('https://api.sleeper.app/v1/draft/' + draftId + '/picks'),
      root.FarmhoodLive.load()
    ]).then(parts => {
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
      const rosters = (snapshot.rosters || []).map(roster => {
        const row = (snapshot.matchups || []).find(item => item.rosterId === roster.rosterId) || {};
        return {rosterId: roster.rosterId, manager: roster.name, playerIds: row.players || []};
      });
      const starterIds = (snapshot.matchups || []).flatMap(row => row.starters || []);
      paintGraveyard(body, draftGraveyard({picks, rosters, starterIds}));
    }).catch(() => {
      body.textContent = '';
      body.appendChild(node('p', '', 'The draft board could not be reached just now.'));
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
    body.appendChild(node('h3', 'desk-sub', 'Early picks no longer rostered'));
    const early = report.earlyGone.slice(0, 8);
    if (!early.length) body.appendChild(node('p', '', 'Every pick from the first five rounds is still on a roster.'));
    early.forEach(pick => body.appendChild(graveRow(pick)));
    body.appendChild(node('h3', 'desk-sub', 'Late picks still starting'));
    const late = report.lateKept.slice(0, 8);
    if (!late.length) body.appendChild(node('p', '', 'No round-8-or-later pick is both kept and in the current starting lineup.'));
    late.forEach(pick => body.appendChild(graveRow(pick)));
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
    const rivalryBody = node('div', 'desk-panel');
    const waiverBody = node('div', 'desk-panel');
    rivalryBody.appendChild(node('p', 'desk-kicker', 'Loading the six purses.'));
    waiverBody.appendChild(node('p', 'desk-kicker', 'The autopsy opens from the saved waiver weeks and the Sleeper starter log.'));
    parent.appendChild(disclosure('Paid rivalry series', 'Six $50 showdowns, with the all-time series beside this year', rivalryBody));
    parent.appendChild(disclosure('Waiver autopsy', 'Adds that scored, adds that vanished, drops that came back', waiverBody));
    paintRivalries(rivalryBody, rivalrySeries({
      allTime: ((root.LEAGUE && root.LEAGUE.allTime && root.LEAGUE.allTime.rivalries) || []).map(row => ({a: row.a, b: row.b, aWins: row.a_wins, bWins: row.b_wins, games: row.games}))
    }));
    fetchJson('content/payouts/2026.json').then(ledger => {
      const results = ((ledger && ledger.weekly) || []).filter(week => week.rivalry && week.rivalry.scores && week.rivalry.scores.length === 2).map(week => ({
        id: week.rivalry.id,
        week: week.week,
        a: week.rivalry.scores[0].manager,
        b: week.rivalry.scores[1].manager,
        scoreA: week.rivalry.scores[0].score,
        scoreB: week.rivalry.scores[1].score,
        status: week.rivalry.status
      }));
      paintRivalries(rivalryBody, rivalrySeries({
        allTime: ((root.LEAGUE && root.LEAGUE.allTime && root.LEAGUE.allTime.rivalries) || []).map(row => ({a: row.a, b: row.b, aWins: row.a_wins, bWins: row.b_wins, games: row.games})),
        results
      }));
    }).catch(() => {});
    const leagueId = root.LEAGUE && root.LEAGUE.live2026 && root.LEAGUE.live2026.leagueId;
    if (!leagueId) return;
    const names = (root.LEAGUE.live2026 && root.LEAGUE.live2026.rosterNames) || {};
    Promise.all([3, 4, 5].map(week => fetchJson('content/transactions/2026/week-0' + week + '.json').catch(() => null)))
      .then(files => {
        const transactions = files.filter(Boolean).flatMap(file => (file.transactions || []).map(deal => ({
          week: deal.week, manager: deal.manager, rosterId: deal.rosterId,
          adds: (deal.adds || []).map(add => ({id: add.playerId, name: add.name, position: add.position})),
          drops: (deal.drops || []).map(drop => ({id: drop.playerId, name: drop.name, position: drop.position}))
        })));
        const through = 9;
        return Promise.all(Array.from({length: through}, (_, index) => index + 1).map(week => fetchJson('https://api.sleeper.app/v1/league/' + leagueId + '/matchups/' + week).then(rows => ({week, rows})).catch(() => ({week, rows: []}))))
          .then(slates => ({transactions, slates}));
      })
      .then(pack => {
        const weeks = pack.slates.map(slate => ({
          week: slate.week,
          rosters: (slate.rows || []).map(row => ({
            rosterId: row.roster_id,
            manager: names[String(row.roster_id)] || ('Roster ' + row.roster_id),
            playerIds: row.players || [],
            starters: (row.starters || []).map((id, index) => ({id, points: (row.starters_points || [])[index]}))
          }))
        }));
        paintAutopsy(waiverBody, waiverAutopsy({transactions: pack.transactions, weeks}));
      })
      .catch(() => {
        waiverBody.textContent = '';
        waiverBody.appendChild(node('p', '', 'The waiver log could not be read just now.'));
      });
  }

  function paintRivalries(body, series) {
    body.textContent = '';
    series.forEach(row => {
      const card = node('article', 'desk-rival');
      card.appendChild(node('h3', '', row.labelA + ' vs ' + row.labelB));
      const allTime = row.games ? (row.aWins + '-' + row.bWins + ' all-time, ' + (row.leader === 'tied' ? 'level' : row.leader + ' leads')) : 'No archived series';
      card.appendChild(node('p', '', allTime + ' · Week ' + row.week + ' purse ' + money(row.amount)));
      if (row.season) card.appendChild(node('p', 'desk-note', 'This year: ' + row.season.scoreA.toFixed(1) + '–' + row.season.scoreB.toFixed(1) + (row.season.winner === 'tie' ? ', split' : ', ' + row.season.winner + ' took it') + '.'));
      else card.appendChild(node('p', 'desk-note', 'This year\'s showdown has not been reconciled.'));
      body.appendChild(card);
    });
  }

  function paintAutopsy(body, report) {
    body.textContent = '';
    const grid = node('div', 'desk-money-grid');
    [['Hits', report.hits.slice(0, 5), row => row.name + ' · ' + row.manager + ' · ' + row.points.toFixed(1) + ' as a starter'],
     ['Misses', report.misses.slice(0, 5), row => row.name + ' · ' + row.manager + ' · Week ' + row.week],
     ['Haunted drops', report.heists.slice(0, 5), row => row.name + ' · cut by ' + row.manager + ' · ' + row.points.toFixed(1) + ' later']
    ].forEach(column => {
      const card = node('section', 'desk-prize');
      card.appendChild(node('h3', '', column[0]));
      if (!column[1].length) card.appendChild(node('p', '', 'Nothing in this pile.'));
      column[1].forEach(row => card.appendChild(node('p', 'desk-prize-row', column[2](row))));
      grid.appendChild(card);
    });
    body.appendChild(grid);
    body.appendChild(node('p', 'desk-note', 'Hits and misses use starter points from the week of the add onward. Haunted drops scored later for somebody else.'));
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
    const weeks = Object.keys(league.weekly2025 || {}).map(Number).sort((a, b) => a - b).map(week => ({
      week,
      rows: league.weekly2025[week].map(row => ({name: (league.names2025 || {})[row[0]] || ('Roster ' + row[0]), matchupId: row[1], points: row[2]}))
    }));
    const rows = fingerprints({managers: league.managers || [], weeks, meta: {luck, titles, draftSlot}});
    fingerprintMap = new Map(rows.map(row => [row.name, row]));
    const body = node('div', 'desk-panel');
    body.appendChild(node('p', 'desk-kicker', 'The shape of the 2025 season: weekly swing, close games, and whether they finished hotter than they started. Luck is the career number.'));
    rows.forEach(row => {
      const line = node('div', 'desk-fair-row desk-fp');
      line.appendChild(node('strong', '', row.name));
      line.appendChild(node('span', 'desk-label', row.label));
      line.appendChild(node('span', '', 'Swing ' + Math.round(row.cv * 100) + '%'));
      line.appendChild(node('span', '', 'Close ' + row.closeWins + '-' + row.closeLosses));
      line.appendChild(node('b', row.luck == null ? '' : (row.luck >= 0 ? 'pos' : 'neg'), row.luck == null ? '—' : ((row.luck > 0 ? '+' : '') + row.luck)));
      body.appendChild(line);
    });
    parent.appendChild(disclosure('Manager fingerprints', 'Swing, steady, closer, finisher — from the 2025 weeks', body));
  }

  function fetchJson(url) {
    return root.fetch(url, {headers: {Accept: 'application/json'}, cache: 'no-store', credentials: 'omit'}).then(response => {
      if (!response.ok) throw new Error('Request failed');
      return response.json();
    });
  }

  return {
    dollarsOnTheTable, mondayExposure, playoffEquity, fairSchedule, waiverAutopsy, draftGraveyard, rivalrySeries, fingerprints, fingerprintFor,
    renderOdds, renderFair, mountMatchup, mountDraft, mountHistory, mountManagers,
    PRIZES, RIVALRIES, POSITION_BY_WEEK
  };
});
