/* Farmhood Playoff Machine: local what-ifs, never writes to Sleeper. */
(function(root, factory) {
  const api = factory(root);
  root.FarmhoodPlayoffs = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function(root) {
  'use strict';
  const names = {Blumbo:'Albert',akaaashh:'Akash',Archibaldo:'Sasha',jwislek_20:'Jimmy',cuch:'Dom',martinch94:'Martin',turi70:'Sal',Siccboi:'Ian',maco71:'Marco',pgorny:'Pat',sidjunlee:'Sid',vpitello34:'Vince'};
  const short = team => names[team.name] || team.name;
  const record = team => team.wins + '–' + team.losses + (team.ties ? '–' + team.ties : '');
  function node(tag, cls, text) { const item = root.document.createElement(tag); if (cls) item.className = cls; if (text != null) item.textContent = String(text); return item; }
  function button(label, action, cls) { const item = node('button', cls || 'pm-button', label); item.type = 'button'; item.dataset.pmFocus=label.toLowerCase().replace(/[^a-z0-9]+/g,'-'); item.addEventListener('click', action); return item; }
  async function fetchLeague(id) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await root.fetch('https://api.sleeper.app/v1/league/' + id, {signal:controller.signal, credentials:'omit', headers:{Accept:'application/json'}});
      if (!response.ok) throw new Error('League settings could not be loaded.');
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  async function load(options) {
    const force = !!(options && options.force);
    const snapshot = await root.FarmhoodLive.load({force});
    const league = await fetchLeague(snapshot.leagueId);
    if (String(league.league_id) !== String(snapshot.leagueId) || Number(league.season) !== snapshot.season || !league.settings) throw new Error('Sleeper returned mismatched league settings.');
    const regular = snapshot.regularSeasonWeeks;
    if (Number(league.settings.playoff_week_start) !== regular + 1) throw new Error('The league playoff-start setting has changed. The machine needs a rules update before making scenarios.');
    const completed = Math.min(regular, ...snapshot.rosters.map(team => team.wins + team.losses + team.ties));
    const entries = await Promise.all(Array.from({length:Math.max(0, regular - completed)}, (_, index) => completed + index + 1).map(async week => {
      try { return [week, week === snapshot.currentWeek ? snapshot.matchups : await root.FarmhoodLive.loadWeek(week, {force})]; }
      catch (_error) { return [week, []]; }
    }));
    const settings = {...league.settings};
    if (Object.keys(league.metadata || {}).some(key => /^division_\d/.test(key))) settings.divisions = Math.max(1, Number(settings.divisions || 0));
    return {snapshot, weeks:Object.fromEntries(entries), model:{completedThrough:completed, regularSeasonWeeks:regular, playoffTeams:Number(settings.playoff_teams)}, shape:{leagueSettings:settings}};
  }
  function encodeScenario(model, picks, scores) {
    return JSON.stringify({v:1, league:model.leagueId, season:model.season, through:model.completedThrough, picks, scores,fixtures:Object.fromEntries(model.games.map(game=>[game.key,[game.a,game.b]]))});
  }
  function decodeScenario(text, model) {
    if (!text) return {picks:{},scores:{},notice:''};
    try {
      if (text.length > 12000) throw new Error('too large');
      const parsed = JSON.parse(text);
      if (parsed.v !== 1 || parsed.league !== model.leagueId || parsed.season !== model.season || !Number.isInteger(parsed.through) || parsed.through > model.completedThrough || parsed.through < 0) throw new Error('wrong scenario');
      if(!parsed.fixtures||typeof parsed.fixtures!=='object'||Array.isArray(parsed.fixtures))throw new Error('missing fixture identities');
      const available = new Set(model.games.filter(game=>Array.isArray(parsed.fixtures[game.key])&&parsed.fixtures[game.key][0]===game.a&&parsed.fixtures[game.key][1]===game.b).map(game => game.key));
      const filter = values => Object.fromEntries(Object.entries(values && typeof values === 'object' && !Array.isArray(values) ? values : {}).filter(([key]) => available.has(key)));
      const clean = root.FarmhoodPlayoffModel.sanitizeScenario(model, filter(parsed.picks), filter(parsed.scores));
      const changedFixtures=model.games.some(game=>parsed.fixtures[game.key]&&!available.has(game.key));
      return {picks:clean.picks,scores:clean.scores,notice:clean.errors.length ? 'Some invalid saved choices were ignored.' : changedFixtures ? 'Some matchups changed. Outdated choices were ignored.' : parsed.through < model.completedThrough ? 'New final results replaced older picks. Your remaining choices were retained.' : 'Shared scenario loaded. These are hypothetical choices.'};
    } catch (_error) { return {picks:{},scores:{},notice:'This saved scenario could not be used with the current league data. No choices were applied.'}; }
  }
  const historyCache=new Map();
  async function loadHistory(bundle,through) {
    const key=bundle.snapshot.leagueId+':'+bundle.snapshot.season+':'+through;
    if(historyCache.has(key)&&historyCache.get(key).expires>Date.now())return historyCache.get(key).pending;
    const pending=Promise.all(Array.from({length:through},(_,index)=>index+1).map(week=>root.FarmhoodLive.loadWeek(week))).then(slates=>{
      const history={};
      slates.forEach(rows=>{
        if(!Array.isArray(rows)||rows.length!==bundle.snapshot.rosters.length)throw new Error('Scoring history incomplete');
        const ids=new Set(rows.map(row=>row.rosterId));
        if(ids.size!==bundle.snapshot.rosters.length||bundle.snapshot.rosters.some(team=>!ids.has(team.rosterId)))throw new Error('History identities incomplete');
        rows.forEach(row=>{if(!history[row.rosterId])history[row.rosterId]=[];const value=root.FarmhoodPlayoffModel.number(row.points);if(value==null)throw new Error('Score missing');history[row.rosterId].push(value);});
      });return history;
    }).catch(error=>{historyCache.delete(key);throw error;});
    historyCache.set(key,{pending,expires:Date.now()+300000});return pending;
  }

  function render(bundle, previous, hooks) {
    const api = root.FarmhoodPlayoffModel, model = api.createModel(bundle);
    const state = previous || {picks:{},scores:{},week:null,view:'standings'};
    if(!state.openScores)state.openScores={};
    const settings = hooks || {};
    const host = node('div','pm-machine');
    if(model.unsupported.length){
      model.unsupported.forEach(text=>host.appendChild(node('p','pm-warning',text)));
      host.appendChild(node('p','pm-note','No scenario was applied. Review the league rules before using this machine.'));
      return {element:host,model,state,result:api.evaluateScenario(model,{},{})};
    }
    if(Number(bundle.snapshot.currentWeek)>model.regularSeasonWeeks){
      host.appendChild(node('p','pm-callout','The regular-season scenario machine is closed for the postseason. Remaining playoff results and commissioner-adjusted seeds are not inferred from regular-season standings.'));
      const link=node('a','','Open the live playoff matchups →');link.href='matchups.html';host.appendChild(link);
      return {element:host,model,state,result:api.evaluateScenario(model,{},{})};
    }
    const actions = node('div','pm-actions');
    const liveNotice = node('p','pm-action-notice'); liveNotice.setAttribute('role','status');
    const progress = node('div','pm-progress'); progress.setAttribute('aria-live','polite');
    const warning = node('div','pm-warnings');
    const layout = node('div','pm-layout');
    const left = node('section','pm-picker'); left.setAttribute('aria-label','Choose remaining game winners');
    const right = node('section','pm-results'); right.setAttribute('aria-label','Full league scenario standings');
    left.id='pm-picks';right.id='pm-field';
    const weekTabs = node('div','pm-week-tabs'); weekTabs.setAttribute('role','group'); weekTabs.setAttribute('aria-label','Remaining regular-season week');
    const gamesHost = node('div','pm-games');
    const resultTabs = node('div','pm-result-tabs');
    const results = node('div','pm-results-body');
    const byId = new Map(model.teams.map(team => [team.rosterId,team]));
    const weeks = [...new Set(model.games.map(game => game.week))];
    if (!weeks.includes(Number(state.week))) state.week = weeks[0] || null;
    let evaluation, inputNodes = new Map(), estimate=null;
    const hypothetical = node('p','pm-readonly','WHAT-IF ONLY · Your picks stay in this browser. Real league results and Sleeper lineups never change.');
    host.append(hypothetical,actions,liveNotice,progress,warning,layout);
    left.append(node('h2','','Pick the remaining winners'), node('p','pm-note','Choose a team or Tie. Click the same choice again to leave a game undecided.'), weekTabs,gamesHost);
    const jump=node('a','pm-mobile-jump','View the whole field ↓');jump.href='#pm-field';left.insertBefore(jump,weekTabs);
    const back=node('a','pm-mobile-jump','Back to winner picks ↑');back.href='#pm-picks';
    right.append(node('h2','','The whole playoff field'),back,resultTabs,results);
    layout.append(left,right);

    function announce(text) { liveNotice.textContent = text; }
    function scenarioActive(){return evaluation.picksMade>0||Object.keys(evaluation.scores).length>0;}
    function changed() {
      estimate=null;
      evaluation = api.evaluateScenario(model,state.picks,state.scores);
      progress.textContent = evaluation.picksMade + ' of ' + evaluation.totalGames + (model.missingWeeks.length?' verified games picked · Fixture list incomplete':' remaining games picked') + ' · Final standings through Week ' + model.completedThrough;
      warning.textContent = '';
      evaluation.issues.forEach(text => warning.appendChild(node('p','pm-warning',text)));
      if (evaluation.provisionalTieBreaks && scenarioActive()) warning.appendChild(node('p','pm-warning','Some seeds can still change on points. Winner-only picks hold current points totals fixed; enter optional final scores to explore the tiebreaker. ? marks a provisional seed—not a clinch.'));
      weekTabs.querySelectorAll('button').forEach(item => {
        item.setAttribute('aria-pressed',Number(item.dataset.week)===Number(state.week)?'true':'false');
        const selected = model.games.filter(game => game.week === Number(item.dataset.week) && evaluation.picks[game.key] != null).length;
        item.textContent = 'Week ' + item.dataset.week + ' · ' + selected + '/' + model.games.filter(game => game.week === Number(item.dataset.week)).length;
      });
      gamesHost.querySelectorAll('button[data-pick]').forEach(item => item.setAttribute('aria-pressed',String(evaluation.picks[item.dataset.game]) === item.dataset.pick?'true':'false'));
      gamesHost.querySelectorAll('[data-game-error]').forEach(item => {
        const errors = evaluation.errors.filter(error => error.key===item.dataset.gameError);
        item.textContent = errors.map(error=>error.message).join(' ');
        item.hidden = !errors.length;
      });
      gamesHost.querySelectorAll('input[data-game]').forEach(input=>input.setAttribute('aria-invalid',evaluation.errors.some(error=>error.key===input.dataset.game)?'true':'false'));
      paintResults();
      if (settings.onChange) settings.onChange(state, evaluation);
    }
    function paintGames() {
      gamesHost.textContent = ''; inputNodes = new Map();
      if (model.unsupported.length) { gamesHost.appendChild(node('p','pm-note','Scenario controls are unavailable for these league rules. Current standings remain visible.')); return; }
      if (!model.games.length) { gamesHost.appendChild(node('p','pm-note',model.completedThrough >= model.regularSeasonWeeks?'The regular season is complete. The standings below are the final regular-season record, not the official playoff bracket.':'No complete remaining matchup pairs are available.')); return; }
      model.games.filter(game => game.week === Number(state.week)).forEach(game => {
        const a=byId.get(game.a),b=byId.get(game.b);
        const card = node('article','pm-game'); card.setAttribute('aria-label','Week '+game.week+': '+short(a)+' versus '+short(b));
        card.appendChild(node('p','pm-game-status',game.status==='live'?'LIVE POINTS · week not final':'SCHEDULED · no outcome assumed'));
        const choices = node('div','pm-game-choices'); choices.setAttribute('role','group'); choices.setAttribute('aria-label','Week '+game.week+' winner: '+a.name+' or '+b.name);
        [[game.a,a,game.scoreA],['tie',null,null],[game.b,b,game.scoreB]].forEach(([pick,team,score]) => {
          const choice = button('',()=>{
            const same = String(evaluation.picks[game.key]) === String(pick);
            if (same) delete state.picks[game.key]; else state.picks[game.key]=pick;
            delete state.scores[game.key];
            (inputNodes.get(game.key)||[]).forEach(input=>{input.value='';});
            changed(); announce(same?'Choice cleared.':(pick==='tie'?'Tie':short(team)+' wins')+' selected for Week '+game.week+'. Optional score estimates for this game were cleared.');
          },'pm-pick'+(pick==='tie'?' pm-tie':''));
          choice.dataset.pick=String(pick); choice.dataset.game=game.key;
          choice.dataset.pmFocus='pick-'+game.key+'-'+pick;
          choice.setAttribute('aria-label',pick==='tie'?'Pick a tie for '+a.name+' versus '+b.name:'Pick '+team.name+' to beat '+(team===a?b.name:a.name)+' in Week '+game.week);
          choice.appendChild(node('strong','',team?short(team):'Tie'));
          if(team) {choice.appendChild(node('span','pm-handle',team.name));choice.appendChild(node('span','pm-live-points',game.status==='live'&&score!=null?score.toFixed(2)+' actual pts':record(team)+' actual record'));}
          choices.appendChild(choice);
        });
        card.appendChild(choices);
        const scores = node('details','pm-score-options');
        scores.open=!!state.openScores[game.key];
        scores.addEventListener('toggle',()=>{if(scores.isConnected)state.openScores[game.key]=scores.open;});
        scores.appendChild(node('summary','','Optional predicted final scores'));
        scores.appendChild(node('p','pm-note','Hypothetical totals for the whole fantasy week—not points still to come. Both scores can determine the winner and update PF / PA.'));
        const fields=node('div','pm-score-fields');const inputs=[];
        [['a',a],['b',b]].forEach(([side,team])=>{
          const label=node('label','pm-field');label.appendChild(node('span','',short(team)+' final-score estimate'));
          const input=node('input');input.type='number';input.step='0.01';input.min='-10000';input.max='10000';input.inputMode='decimal';input.value=state.scores[game.key]&&state.scores[game.key][side]!=null?String(state.scores[game.key][side]):'';input.placeholder='No estimate';
          input.dataset.pmFocus='score-'+game.key+'-'+side;
          input.dataset.game=game.key;input.setAttribute('aria-describedby','pm-error-'+game.key);
          input.addEventListener('input',()=>{if(!state.scores[game.key])state.scores[game.key]={};if(input.value.trim()==='')delete state.scores[game.key][side];else state.scores[game.key][side]=input.value;changed();});
          label.appendChild(input);fields.appendChild(label);inputs.push(input);
        });
        inputNodes.set(game.key,inputs);scores.appendChild(fields);card.appendChild(scores);
        const error=node('p','pm-game-error');error.id='pm-error-'+game.key;error.dataset.gameError=game.key;error.setAttribute('role','alert');error.hidden=true;card.appendChild(error);
        gamesHost.appendChild(card);
      });
    }
    function standings() {
      const wrap = node('div','');
      wrap.appendChild(node('p','pm-note',!scenarioActive()?'Current standings. No future outcomes have been assumed.':evaluation.complete?'All remaining winners selected. This is your scenario—not official league seeding.':'Partial scenario: records include only selected results, and PF / PA include any entered score estimates. This is not a completed season.'));
      const table=node('table','pm-standings');table.appendChild(node('caption','','Actual records vs your scenario'));
      const head=node('tr');['Seed','Manager','Actual','Scenario','Unpicked'].forEach(text=>{const th=node('th','',text);th.scope='col';head.appendChild(th);});const thead=node('thead');thead.appendChild(head);table.appendChild(thead);
      const tbody=node('tbody');
      evaluation.rows.forEach((row,index)=>{
        const tr=node('tr',(row.inPlayoffField?'pm-in-field':'pm-out-field')+(index===model.playoffTeams-1?' pm-cutline':''));
        tr.appendChild(node('td','pm-seed',row.rank+((row.tentativeSeed&&scenarioActive())||row.tieBreakUnresolved?'?':'')));
        const who=node('th','pm-standing-name');who.scope='row';who.title=row.name;who.append(node('strong','',short(row)),node('small','',row.name));tr.appendChild(who);
        const actual=model.teams.find(team=>team.rosterId===row.rosterId);tr.append(node('td','',record(actual)),node('td','pm-record',record(row)),node('td','',row.remainingGames));tbody.appendChild(tr);
      });table.appendChild(tbody);wrap.appendChild(table);
      wrap.appendChild(node('p','pm-note','Seeds 1–'+model.playoffTeams+' are the displayed field. '+(model.playoffTeams===6?'Top 2 receive a bye in the illustrative bracket. ':'')+'No clinch or elimination claim is made here.'));
      const detail=node('details','pm-rule-details');detail.appendChild(node('summary','','Points and tiebreaker totals'));
      evaluation.rows.forEach(row=>detail.appendChild(node('p','pm-tiebreak-row',short(row)+': PF '+row.pf.toFixed(2)+' · PA '+row.pa.toFixed(2)+(row.unknownPointsGames||row.unknownAgainstGames?' · future points not fully estimated':' · scenario score inputs included'))));
      wrap.appendChild(detail);return wrap;
    }
    function bracket() {
      const wrap=node('div','pm-bracket');
      if(evaluation.incompleteSchedule){wrap.appendChild(node('p','pm-callout','The league rules or remaining fixtures are not fully verified. A scenario bracket is unavailable until that data is complete.'));return wrap;}
      if(evaluation.errors.length){wrap.appendChild(node('p','pm-callout','Resolve conflicting score estimates and winner picks before viewing the bracket.'));return wrap;}
      if(!evaluation.complete){wrap.appendChild(node('p','pm-callout','Finish all '+evaluation.totalGames+' remaining picks without errors to show a complete scenario bracket.'));return wrap;}
      wrap.appendChild(node('p','pm-callout',evaluation.provisionalTieBreaks?'Provisional bracket: teams tied on record may move as future points change.':'Scenario bracket · not an official Sleeper bracket'));
      if(model.playoffTeams!==6){wrap.appendChild(node('p','pm-note','This league uses '+model.playoffTeams+' playoff spots. The scenario field is shown in Standings; this bracket illustration supports the standard six-team format.'));return wrap;}
      const b=evaluation.bracket;
      const byes=node('section','pm-bracket-round');byes.appendChild(node('h3','','First-round byes'));b.byes.forEach(row=>byes.appendChild(node('div','pm-bracket-game','#'+row.seed+' '+short(row))));
      const opening=node('section','pm-bracket-round');opening.appendChild(node('h3','','Opening round'));b.matchups.forEach(pair=>opening.appendChild(node('div','pm-bracket-game','#'+pair.a.seed+' '+short(pair.a)+' vs #'+pair.b.seed+' '+short(pair.b))));
      const semi=node('section','pm-bracket-round');semi.appendChild(node('h3','','Then the semifinals'));semi.append(node('div','pm-bracket-game','#1 vs winner of #4 / #5'),node('div','pm-bracket-game','#2 vs winner of #3 / #6'));
      wrap.append(byes,opening,semi,node('p','pm-note','Illustrates a standard fixed-seed, single-week six-team bracket. Commissioner seed overrides, alternate reseeding and multi-week rounds are not applied. A playoff scoring tie advances the higher seed.'));return wrap;
    }
    function odds() {
      const wrap=node('div','pm-odds');
      if(!estimate){wrap.appendChild(node('p','pm-note','Run “Estimate playoff odds” to explore your current picks. Re-run after changing a choice or score.'));return wrap;}
      if(estimate.status!=='ready'){wrap.appendChild(node('p','pm-note',estimate.message));return wrap;}
      const percent=value=>value===0?'0%':value===1?'100%':value<0.01?'<1%':value>0.99?'>99%':Math.round(value*100)+'%';
      wrap.appendChild(node('p','pm-callout',estimate.samples+' simulated finishes constrained by your picks. Percentages are model frequencies—not mathematical clinches or eliminations.'));
      const table=node('table','pm-standings');table.appendChild(node('caption','','Scenario-aware simulation estimates'));
      const h=node('tr');['Manager','Playoff field','Top-two bye'].forEach(text=>{const th=node('th','',text);th.scope='col';h.appendChild(th);});const head=node('thead');head.appendChild(h);table.appendChild(head);
      const body=node('tbody');estimate.rows.slice().sort((a,b)=>b.playoffPct-a.playoffPct||b.byePct-a.byePct).forEach(row=>{const tr=node('tr');const name=node('th','pm-standing-name',short(row));name.scope='row';tr.append(name,node('td','pm-record',percent(row.playoffPct)),node('td','',percent(row.byePct)));body.appendChild(tr);});table.appendChild(body);wrap.appendChild(table);
      wrap.appendChild(node('p','pm-note',estimate.method));return wrap;
    }
    function paintResults() {
      resultTabs.querySelectorAll('button').forEach(item=>item.setAttribute('aria-pressed',item.dataset.view===state.view?'true':'false'));
      results.textContent='';results.appendChild(state.view==='bracket'?bracket():state.view==='odds'?odds():standings());
    }
    weeks.forEach(week=>{const item=button('Week '+week,()=>{state.week=week;paintGames();changed();},'pm-week-button');item.dataset.week=String(week);weekTabs.appendChild(item);});
    [['standings','Standings'],['bracket','Scenario bracket'],['odds','Estimated odds']].forEach(([value,label])=>{const item=button(label,()=>{state.view=value;paintResults();},'pm-view-button');item.dataset.view=value;resultTabs.appendChild(item);});
    actions.appendChild(button('Fill: higher current seed wins',()=>{
      const ranks=new Map(api.evaluateScenario(model,{},{}).rows.map(row=>[row.rosterId,row.rank]));
      model.games.forEach(game=>{state.picks[game.key]=ranks.get(game.a)<ranks.get(game.b)?game.a:game.b;});state.scores={};paintGames();changed();announce('Filled all remaining games by current standing. This is a hypothetical shortcut, not a forecast.');
    }));
    actions.appendChild(button('Clear my picks',()=>{state.picks={};state.scores={};paintGames();changed();announce('All scenario choices cleared. Actual standings were not changed.');}));
    const estimateButton=button('Estimate playoff odds',async()=>{
      estimateButton.disabled=true;estimateButton.textContent='Estimating…';results.setAttribute('aria-busy','true');announce('Loading finalized scoring history. No AI API is used.');
      try{const history=await loadHistory(bundle,model.completedThrough);estimate=api.simulateScenario(model,state.picks,state.scores,history,{sims:2000});state.view='odds';paintResults();announce('Scenario estimates updated.');}
      catch(_error){announce('Scoring history could not be loaded. No scores or odds were invented. Try again.');}
      finally{estimateButton.disabled=false;estimateButton.textContent='Estimate playoff odds';results.setAttribute('aria-busy','false');}
    });actions.appendChild(estimateButton);
    actions.appendChild(button('Copy scenario link',async()=>{
      try {
        const url=new URL(root.location.href);url.searchParams.set('scenario',encodeScenario(model,state.picks,state.scores));
        if(root.navigator&&root.navigator.clipboard&&root.navigator.clipboard.writeText){await root.navigator.clipboard.writeText(url.href);announce('Scenario link copied.');}
        else {const input=node('input','pm-share-fallback');input.readOnly=true;input.value=url.href;input.setAttribute('aria-label','Scenario link to copy');liveNotice.textContent='Copy this scenario link:';liveNotice.appendChild(input);input.focus();input.select();}
      }catch(_error){announce('The link could not be copied. Your picks are still available in this page.');}
    }));
    const assumptions=node('details','pm-assumptions');assumptions.appendChild(node('summary','','How this machine works'));
    assumptions.appendChild(node('p','pm-note','Official Sleeper standings through Week '+model.completedThrough+' are the starting point. Only remaining regular-season games are changed. Ranking uses winning percentage, then points for, then higher points against. Exact ties beyond that require a commissioner decision / coin flip; roster ID only keeps unresolved rows in a stable display order. Future PF / PA stay at current totals unless you enter final-score estimates. Partial scores and unfinished picks are never official results.'));
    assumptions.appendChild(node('p','pm-note','Sleeper allows commissioner-customized seeds. The shown playoff bracket is illustrative; a posted future matchup row is not proof of a playoff pairing. All calculations are local and free of AI-token charges.'));
    const sourceLink=node('a','','Sleeper’s official seeding and tiebreaker rules');sourceLink.href='https://support.sleeper.com/en/articles/4238872-can-i-set-tiebreakers';sourceLink.target='_blank';sourceLink.rel='noopener noreferrer';assumptions.appendChild(sourceLink);
    host.appendChild(assumptions);paintGames();changed();
    return {element:host,model,state,get result(){return evaluation;}};
  }
  function mount(target) {
    const host=target||root.document.getElementById('app');if(!host)return;
    host.textContent='';host.appendChild(root.header('Playoff Machine','The Race to Six','Pick the remaining winners. See every manager’s path through the same playoff field.'));
    const links=node('div','pm-page-links');const compare=node('a','','Compare everyone’s schedules →');compare.href='schedule.html#compare';const odds=node('a','','Historical playoff odds →');odds.href='schedule.html#odds';links.append(compare,odds);host.appendChild(links);
    const status=node('div','pm-status'),content=node('div','pm-content');host.append(status,content);
    let state=null,previousModel=null,version=0;
    async function refresh(force) {
      const request=++version;
      try {
        if(!state)status.textContent='Loading official standings and remaining matchups…';
        const bundle=await load({force});if(request!==version)return;
        const active=root.document.activeElement;
        if(active&&content.contains(active)&&active.tagName==='INPUT') return; // Never interrupt someone typing a score.
        const focus=active&&content.contains(active)&&active.dataset?active.dataset.pmFocus:null;
        const model=root.FarmhoodPlayoffModel.createModel(bundle);
        if(previousModel&&model.completedThrough<previousModel.completedThrough)throw new Error('Older feed');
        let notice='';
        if(!state){let saved='';try{saved=new URLSearchParams(root.location.search).get('scenario')||'';}catch(_error){}const restored=decodeScenario(saved,model);state={picks:restored.picks,scores:restored.scores,week:null,view:'standings'};notice=restored.notice;}
        else {
          const restored=decodeScenario(encodeScenario(previousModel,state.picks,state.scores),model);state.picks=restored.picks;state.scores=restored.scores;
          if(restored.notice!=='Shared scenario loaded. These are hypothetical choices.')notice=restored.notice;
        }
        previousModel=model;
        const view=render(bundle,state);content.textContent='';content.appendChild(view.element);
        if(focus){const next=content.querySelector('[data-pm-focus="'+focus+'"]');if(next)next.focus({preventScroll:true});}
        if(notice)view.element.querySelector('.pm-action-notice').textContent=notice;
        status.textContent='';status.appendChild(root.liveStatusBar(bundle.snapshot,()=>refresh(true)));
      } catch(_error) { if(request!==version)return;status.textContent='Could not refresh verified league data. '+(state?'Your current scenario is still shown.':'No estimated standings have been substituted.');const retry=button('Try again',()=>refresh(true));status.appendChild(retry); }
    }
    refresh(false);
    if(typeof root.startLivePolling==='function')root.startLivePolling(()=>refresh(true));
  }
  return {load,render,mount,encodeScenario,decodeScenario};
});
