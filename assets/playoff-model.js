/* Read-only, deterministic regular-season scenarios. Never official seeding. */
(function(root, factory) {
  const api = factory();
  root.FarmhoodPlayoffModel = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function() {
  'use strict';
  const number = value => value == null || String(value).trim() === '' || !Number.isFinite(Number(value)) ? null : Number(value);
  const cents = value => Math.round(value * 100) / 100;
  const keyFor = (week, matchupId) => week + ':' + matchupId;
  const outcome = (a, b) => Math.round(a * 100) === Math.round(b * 100) ? 'tie' : a > b ? 'a' : 'b';
  const gamesPlayed = team => team.wins + team.losses + team.ties;
  const winPct = team => gamesPlayed(team) ? (team.wins + team.ties * 0.5) / gamesPlayed(team) : 0;
  const compare = (a, b) => winPct(b) - winPct(a) || b.pf - a.pf || b.pa - a.pa;

  function createModel(bundle) {
    const snapshot = bundle && bundle.snapshot || {};
    const source = bundle && bundle.model || {};
    const settings = bundle && bundle.shape && bundle.shape.leagueSettings;
    const issues = [], unsupported = [];
    const ids = new Set();
    const teams = (snapshot.rosters || []).filter(team => {
      const id = Number(team.rosterId);
      if (!Number.isInteger(id) || id < 1 || ids.has(id)) { issues.push('A roster identity is missing or duplicated.'); return false; }
      ids.add(id); return true;
    }).map(team => {
      const values = ['wins', 'losses', 'ties', 'pf', 'pa'].map(key => number(team[key]));
      if (values.some(value => value == null) || values.slice(0, 3).some(value => !Number.isInteger(value) || value < 0)) issues.push('Standings totals are unavailable for ' + String(team.name || team.rosterId) + '.');
      return {rosterId: Number(team.rosterId), id: Number(team.rosterId), name: String(team.name || 'Roster ' + team.rosterId),
        wins: values[0] || 0, losses: values[1] || 0, ties: values[2] || 0, pf: cents(values[3] || 0), pa: cents(values[4] || 0)};
    });
    if (!teams.length) issues.push('No official standings are available.');
    if (!settings) unsupported.push('Verified league settings are required before creating a playoff scenario.');
    if (settings && Number(settings.league_average_match || 0)) unsupported.push('League-median bonus games are not supported by this machine.');
    if (settings && Number(settings.divisions || 0)) unsupported.push('Division-based seeding is not supported by this machine.');
    const regularValue=number(source.regularSeasonWeeks!=null?source.regularSeasonWeeks:snapshot.regularSeasonWeeks);
    if(regularValue==null||!Number.isInteger(regularValue)||regularValue<1||regularValue>18)issues.push('The regular-season length is invalid.');
    const regularSeasonWeeks = regularValue!=null&&Number.isInteger(regularValue)&&regularValue>=1&&regularValue<=18?regularValue:14;
    const spotsValue=number(settings&&settings.playoff_teams);
    if(spotsValue==null||!Number.isInteger(spotsValue)||spotsValue<1||spotsValue>teams.length)unsupported.push('The verified playoff field size is invalid.');
    const playoffTeams=spotsValue!=null&&Number.isInteger(spotsValue)&&spotsValue>=1&&spotsValue<=teams.length?spotsValue:Math.min(6,teams.length);
    if(settings&&Number(settings.playoff_week_start)!==regularSeasonWeeks+1)unsupported.push('The playoff start does not match the regular-season length.');
    const counts = teams.map(gamesPlayed);
    const reported = number(settings && settings.last_scored_leg);
    const completedThrough = Math.min(regularSeasonWeeks, counts.length ? Math.min(...counts) : 0);
    if (new Set(counts).size > 1 || (reported != null && Math.min(reported,regularSeasonWeeks) !== completedThrough)) issues.push('Official standings and the final-week marker are not synchronized. Refresh after Sleeper reconciles the week.');
    const games = [], missingWeeks = [];
    for (let week = completedThrough + 1; week <= regularSeasonWeeks; week++) {
      const rows = bundle && bundle.weeks && bundle.weeks[week];
      if (!Array.isArray(rows) || rows.length !== teams.length) { missingWeeks.push(week); continue; }
      const seen = new Set(), groups = new Map(); let valid = true;
      rows.forEach(row => {
        const id = Number(row && row.rosterId), match = number(row && row.matchupId);
        if (!ids.has(id) || seen.has(id) || match == null || !Number.isInteger(match) || match < 1) { valid = false; return; }
        seen.add(id);
        if (!groups.has(match)) groups.set(match, []);
        groups.get(match).push(row);
      });
      if (!valid || seen.size !== teams.length || [...groups.values()].some(pair => pair.length !== 2)) { missingWeeks.push(week); continue; }
      groups.forEach((pair, matchupId) => {
        const [a, b] = pair.slice().sort((x, y) => Number(x.rosterId) - Number(y.rosterId));
        const live = week === Number(snapshot.currentWeek) && rows.some(row => number(row.points) != null && Math.abs(Number(row.points)) > 0.001);
        games.push({key: keyFor(week, matchupId), week, matchupId, a: Number(a.rosterId), b: Number(b.rosterId),
          status: live ? 'live' : 'scheduled', scoreA: number(a.points), scoreB: number(b.points)});
      });
    }
    if (missingWeeks.length) issues.push('Complete opponent pairings are unavailable for Week ' + missingWeeks.join(', ') + '.');
    return {leagueId: String(snapshot.leagueId || ''), season: Number(snapshot.season || 2026), teams,
      games: games.sort((a, b) => a.week - b.week || a.matchupId - b.matchupId), regularSeasonWeeks, playoffTeams,
      completedThrough, missingWeeks, issues, unsupported, currentWeek: Number(snapshot.currentWeek), fetchedAt: snapshot.fetchedAt};
  }

  function sanitizeScenario(model, picksInput, scoresInput) {
    const picks = {}, scores = {}, errors = [];
    const games = new Map(model.games.map(game => [game.key, game]));
    const inputPicks = picksInput && typeof picksInput === 'object' && !Array.isArray(picksInput) ? picksInput : {};
    const inputScores = scoresInput && typeof scoresInput === 'object' && !Array.isArray(scoresInput) ? scoresInput : {};
    Object.keys(inputPicks).slice(0, 200).forEach(key => {
      const game = games.get(key), value = inputPicks[key];
      if (!game || (value !== 'tie' && Number(value) !== game.a && Number(value) !== game.b)) { errors.push({key, field: 'pick', message: 'A saved winner is not part of this remaining matchup.'}); return; }
      picks[key] = value === 'tie' ? 'tie' : Number(value);
    });
    Object.keys(inputScores).slice(0, 200).forEach(key => {
      const game = games.get(key), entry = inputScores[key];
      if (!game || !entry || typeof entry !== 'object' || Array.isArray(entry)) { errors.push({key, field: 'scores', message: 'A saved score does not belong to a remaining matchup.'}); return; }
      const pair = {};
      ['a', 'b'].forEach(side => {
        if (entry[side] == null || String(entry[side]).trim() === '') return;
        const value = number(entry[side]);
        if (value == null || Math.abs(value) > 10000) errors.push({key, field: side, message: 'Enter a finite predicted final score between −10,000 and 10,000.'});
        else pair[side] = cents(value);
      });
      if (Object.keys(pair).length) scores[key] = pair;
    });
    return {picks, scores, errors};
  }

  function bracketFor(rows, spots) {
    const field = rows.slice(0, spots);
    if (field.length !== 6) return {byes: [], matchups: [], field, illustrative: true};
    return {byes: field.slice(0, 2), matchups: [{key: 'qf-3-6', a: field[2], b: field[5]}, {key: 'qf-4-5', a: field[3], b: field[4]}], field, illustrative: true};
  }

  function evaluateScenario(model, inputPicks, inputScores) {
    const sanitized = sanitizeScenario(model, model.unsupported.length?{}:inputPicks, model.unsupported.length?{}:inputScores);
    const errors = sanitized.errors.slice(), picks = {...sanitized.picks}, scores = sanitized.scores;
    const rows = model.teams.map(team => ({...team, actualWins: team.wins, actualLosses: team.losses, actualTies: team.ties,
      remainingGames: model.missingWeeks.length, unknownPointsGames: model.missingWeeks.length, unknownAgainstGames: model.missingWeeks.length, scenarioPoints: 0, scenarioAgainst: 0}));
    const byId = new Map(rows.map(row => [row.rosterId, row]));
    const inferredPicks = {}, appliedPicks = {};
    model.games.forEach(game => {
      const a = byId.get(game.a), b = byId.get(game.b), pair = scores[game.key] || {};
      let pick = picks[game.key];
      if (pair.a != null && pair.b != null) {
        const result = outcome(pair.a, pair.b);
        const inferred = result === 'tie' ? 'tie' : result === 'a' ? game.a : game.b;
        if (pick != null && pick !== inferred) errors.push({key: game.key, field: 'scores', message: 'Predicted final scores conflict with the selected winner. Change the scores or the pick.'});
        else if (pick == null) { pick = inferred; inferredPicks[game.key] = inferred; }
      }
      const invalid = errors.some(error => error.key === game.key);
      if (invalid) pick = null;
      if (pick == null) { a.remainingGames++; b.remainingGames++; }
      else {
        appliedPicks[game.key] = pick;
        if (pick === 'tie') { a.ties++; b.ties++; }
        else if (pick === game.a) { a.wins++; b.losses++; }
        else { b.wins++; a.losses++; }
      }
      if (!invalid && pair.a != null) { a.pf = cents(a.pf + pair.a); b.pa = cents(b.pa + pair.a); a.scenarioPoints += pair.a; b.scenarioAgainst += pair.a; }
      else { a.unknownPointsGames++; b.unknownAgainstGames++; }
      if (!invalid && pair.b != null) { b.pf = cents(b.pf + pair.b); a.pa = cents(a.pa + pair.b); b.scenarioPoints += pair.b; a.scenarioAgainst += pair.b; }
      else { b.unknownPointsGames++; a.unknownAgainstGames++; }
    });
    rows.sort((a, b) => compare(a, b) || a.rosterId - b.rosterId);
    const tieGroups = [];
    rows.forEach((row, index) => {
      const group = rows.filter(other => Math.abs(winPct(other) - winPct(row)) < 1e-12);
      const unresolved = group.length > 1 && group.some(other => other !== row && Math.abs(other.pf - row.pf) < 0.001 && Math.abs(other.pa - row.pa) < 0.001);
      const uncertain = group.length > 1 && (group.some(other => other.unknownPointsGames > 0 || other.unknownAgainstGames > 0) || unresolved);
      if (uncertain && !tieGroups.some(item => item.ids.includes(row.rosterId))) tieGroups.push({ids: group.map(other => other.rosterId), unresolved});
      Object.assign(row, {rank: index + 1, seed: index + 1, winPct: winPct(row), minWins: row.wins, maxWins: row.wins + row.remainingGames,
        tentativeSeed: uncertain, tieBreakUnresolved: unresolved, inPlayoffField: index < model.playoffTeams, bye: model.playoffTeams === 6 && index < 2});
    });
    const picksMade = Object.keys(appliedPicks).length;
    const incompleteSchedule = model.issues.length > 0 || model.unsupported.length > 0;
    const complete = picksMade === model.games.length && !incompleteSchedule && !errors.length;
    return {rows, picksMade, totalGames: model.games.length, complete, incompleteSchedule, errors,
      issues: model.issues.concat(model.unsupported), provisionalTieBreaks: tieGroups.length > 0, tieGroups,
      inferredPicks, picks: appliedPicks, scores, bracket: bracketFor(rows, model.playoffTeams)};
  }
  function simulateScenario(model, picks, scores, history, options) {
    const base = evaluateScenario(model,picks,scores);
    if (base.incompleteSchedule || base.errors.length) return {status:'unavailable',message:'Fix incomplete league data or conflicting picks before estimating odds.',rows:[]};
    const settings=options||{}, simulations=Math.max(1,Math.min(5000,Math.floor(number(settings.sims)||2000)));
    let seed=(number(settings.seed)||20261123)>>>0;
    function rng(){seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;}
    const pools=new Map(model.teams.map(team=>[team.rosterId,((history||{})[team.rosterId]||[]).map(number).filter(value=>value!=null)]));
    const all=[...pools.values()].flat();
    if(!all.length)return {status:'unavailable',message:'Finalized scoring history is unavailable. No synthetic scores have been substituted.',rows:[]};
    const counts=new Map(model.teams.map(team=>[team.rosterId,{playoffs:0,bye:0,seeds:Array(model.teams.length).fill(0)}]));
    const pickScore=id=>{const pool=pools.get(id).length?pools.get(id):all;return cents(pool[Math.floor(rng()*pool.length)]);};
    for(let simulation=0;simulation<simulations;simulation++){
      const rows=model.teams.map(team=>({...team,tieOrder:rng()})),byId=new Map(rows.map(team=>[team.rosterId,team]));
      model.games.forEach(game=>{
        const entered=base.scores[game.key]||{}, fixedA=entered.a!=null, fixedB=entered.b!=null;
        let a=fixedA?entered.a:pickScore(game.a),b=fixedB?entered.b:pickScore(game.b);
        const choice=base.picks[game.key];
        if(choice==='tie'){
          const total=fixedA?a:fixedB?b:cents((a+b)/2);a=total;b=total;
        } else if(choice!=null && (choice===game.a ? a<=b : b<=a)){
          if(choice===game.a){if(fixedA)b=cents(a-0.01);else if(fixedB)a=cents(b+0.01);else {const low=Math.min(a,b),high=Math.max(a,b);a=high;b=low;if(a===b)a=cents(a+0.01);}}
          else {if(fixedB)a=cents(b-0.01);else if(fixedA)b=cents(a+0.01);else{const low=Math.min(a,b),high=Math.max(a,b);a=low;b=high;if(a===b)b=cents(b+0.01);}}
        }
        const left=byId.get(game.a),right=byId.get(game.b);
        left.pf=cents(left.pf+a);right.pa=cents(right.pa+a);right.pf=cents(right.pf+b);left.pa=cents(left.pa+b);
        const winner=choice!=null?choice:outcome(a,b)==='tie'?'tie':a>b?game.a:game.b;
        if(winner==='tie'){left.ties++;right.ties++;}else if(winner===game.a){left.wins++;right.losses++;}else{right.wins++;left.losses++;}
      });
      rows.sort((a,b)=>compare(a,b)||a.tieOrder-b.tieOrder);
      rows.forEach((row,index)=>{const tally=counts.get(row.rosterId);tally.seeds[index]++;if(index<model.playoffTeams)tally.playoffs++;if(model.playoffTeams===6&&index<2)tally.bye++;});
    }
    return {status:'ready',samples:simulations,rows:model.teams.map(team=>{const tally=counts.get(team.rosterId);return {rosterId:team.rosterId,name:team.name,playoffPct:tally.playoffs/simulations,byePct:tally.bye/simulations,seedPct:tally.seeds.map(value=>value/simulations),sampleWeeks:pools.get(team.rosterId).length};}),
      method:'Empirical weekly-score resampling. Teams without individual history use the league score pool. Selected winners are held fixed and sampled score ordering is adjusted to honor the pick. Entered final scores are preserved. This is an illustrative sensitivity estimate, not a calibrated forecast; live NFL points, injuries and future roster changes are not conditioned.'};
  }
  return {createModel, sanitizeScenario, evaluateScenario, evaluate: evaluateScenario, bracketFor, gameKey: keyFor, compare, winPct, number, simulateScenario};
});
