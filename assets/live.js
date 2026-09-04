/* Farmhood Fantasy — sanitized 2026 Sleeper feed + pure ranking helpers. */
(function(root,factory){
  const api=factory(root);
  root.FarmhoodLive=api;
  if(typeof module==='object'&&module.exports) module.exports=api;
})(typeof window!=='undefined'?window:globalThis,function(root){
  'use strict';

  const API='https://api.sleeper.app/v1';
  const API_ROOT='https://api.sleeper.app';
  const SCHEMA=2;
  const BASE_TTL=60000;
  const CACHE_MAX_AGE=24*60*60*1000;
  const PLAYER_TTL=10*60*1000;
  const PLAYER_CACHE_MAX_AGE=7*24*60*60*1000;
  const weekCache=new Map();
  const playerCache=new Map();
  let currentSnapshot=null;
  let pendingBase=null;
  let baseExpiresAt=0;
  let lastCurrentWeek=null;
  let requestVersion=0;
  let appliedVersion=0;

  const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

  function normalizeConfig(input){
    const c=input||{};
    return {
      season:finite(c.season,2026),
      leagueId:String(c.leagueId||''),
      regularSeasonWeeks:finite(c.regularSeasonWeeks,14),
      refreshMs:Math.max(30000,finite(c.refreshMs,60000)),
      owners:Object.assign({},c.owners||{}),
      rosterNames:Object.assign({},c.rosterNames||{})
    };
  }

  function config(){
    return normalizeConfig(root.LEAGUE&&root.LEAGUE.live2026);
  }

  function scoreOf(row){
    if(!row) return null;
    const value=row.custom_points!=null?row.custom_points:row.points;
    return value!=null&&Number.isFinite(Number(value))?Number(value):null;
  }

  function seasonPoints(settings,prefix){
    const s=settings||{}, key=prefix||'fpts';
    const whole=finite(s[key],0), decimal=Math.abs(finite(s[key+'_decimal'],0))/100;
    return whole<0?whole-decimal:whole+decimal;
  }

  function safeManagerName(roster,cfg){
    const ids=[roster&&roster.owner_id].concat((roster&&roster.co_owners)||[]).filter(Boolean);
    for(const id of ids){
      const known=cfg.owners[String(id)];
      if(known) return known;
    }
    return cfg.rosterNames[String(roster&&roster.roster_id)]||`Roster ${finite(roster&&roster.roster_id,'?')}`;
  }

  function normalizeMatchups(rows){
    return (Array.isArray(rows)?rows:[]).map(row=>{
      const starters=Array.isArray(row&&row.starters)?row.starters.map(id=>String(id||'0')):[];
      const starterPoints=Array.isArray(row&&row.starters_points)?row.starters_points.map(value=>value!=null&&Number.isFinite(Number(value))?Number(value):null):[];
      const playerPoints={};
      Object.entries(row&&row.players_points||{}).forEach(([id,value])=>{
        if(/^[A-Za-z0-9_-]{1,24}$/.test(id)&&value!=null&&Number.isFinite(Number(value)))playerPoints[id]=Number(value);
      });
      return {
        rosterId:finite(row&&row.roster_id,-1),
        matchupId:row&&row.matchup_id!=null?finite(row.matchup_id,-1):null,
        points:scoreOf(row),
        starters,
        starterPoints,
        playerPoints
      };
    }).filter(row=>row.rosterId>0);
  }

  function normalizeBundle(bundle,cfgInput){
    const cfg=normalizeConfig(cfgInput), state=bundle&&bundle.state||{}, league=bundle&&bundle.league||{};
    const leagueId=String(league.league_id||'');
    const season=finite(league.season,-1);
    if(!cfg.leagueId||leagueId!==cfg.leagueId) throw new Error('Sleeper returned the wrong league.');
    if(season!==cfg.season) throw new Error('Sleeper returned the wrong season.');
    if(!Array.isArray(bundle.rosters)||bundle.rosters.length!==12) throw new Error('The live roster list is incomplete.');

    const rosterIds=new Set();
    const rosters=bundle.rosters.map(roster=>{
      const rosterId=finite(roster&&roster.roster_id,-1), settings=roster&&roster.settings||{};
      if(rosterId<1||rosterIds.has(rosterId)) throw new Error('The live roster identities are invalid.');
      rosterIds.add(rosterId);
      return {
        rosterId,
        ownerId:String(roster.owner_id||''),
        name:safeManagerName(roster,cfg),
        wins:finite(settings.wins,0),
        losses:finite(settings.losses,0),
        ties:finite(settings.ties,0),
        pf:seasonPoints(settings,'fpts'),
        pa:seasonPoints(settings,'fpts_against')
      };
    });

    const leagueWeek=finite(league.settings&&league.settings.leg,0);
    const stateWeek=finite(state.leg,finite(state.week,1));
    const currentWeek=clamp(leagueWeek||stateWeek||1,1,18);
    const allowedStatus=['pre_draft','drafting','in_season','complete'];
    const allowedType=['pre','regular','post'];
    const status=allowedStatus.includes(league.status)?league.status:'in_season';
    const seasonType=allowedType.includes(state.season_type)?state.season_type:(currentWeek>cfg.regularSeasonWeeks?'post':'regular');
    const startDate=/^\d{4}-\d{2}-\d{2}$/.test(String(state.season_start_date||''))?state.season_start_date:'';
    const matchups=normalizeMatchups(bundle.matchups);
    const allowedPositions=new Set(['QB','RB','WR','TE','FLEX','K','DEF','DL','LB','DB','IDP','SUPER_FLEX','REC_FLEX']);
    const rosterPositions=(Array.isArray(league.roster_positions)?league.roster_positions:[])
      .map(value=>String(value||'').toUpperCase()).filter(value=>allowedPositions.has(value));
    const scoringSettings={};
    Object.entries(league.scoring_settings||{}).forEach(([key,value])=>{
      if(/^[a-z0-9_]{1,48}$/i.test(key)&&Number.isFinite(Number(value)))scoringSettings[key]=Number(value);
    });

    return {
      schema:SCHEMA,
      leagueId:cfg.leagueId,
      season:cfg.season,
      status,
      seasonType,
      currentWeek,
      regularSeasonWeeks:cfg.regularSeasonWeeks,
      startDate,
      rosterPositions,
      scoringSettings,
      rosters,
      matchups,
      fetchedAt:Date.now(),
      source:'live',
      stale:false
    };
  }

  function validSnapshot(value,cfg){
    if(!value||value.schema!==SCHEMA||value.leagueId!==cfg.leagueId||value.season!==cfg.season) return false;
    if(!Array.isArray(value.rosters)||value.rosters.length!==12||!Array.isArray(value.matchups)||
      !Array.isArray(value.rosterPositions)||!value.rosterPositions.length||!value.scoringSettings) return false;
    const ids=new Set(value.rosters.map(row=>row.rosterId));
    return ids.size===12&&finite(value.fetchedAt,0)>Date.now()-CACHE_MAX_AGE;
  }

  function cacheKey(cfg){return `farmhood-live:${SCHEMA}:${cfg.leagueId}:${cfg.season}`;}
  function readStored(cfg){
    try{
      const parsed=JSON.parse(root.localStorage.getItem(cacheKey(cfg))||'null');
      if(validSnapshot(parsed,cfg)) return Object.assign({},parsed,{source:'cache',stale:true});
    }catch(_err){}
    return null;
  }
  function writeStored(snapshot,cfg){
    try{root.localStorage.setItem(cacheKey(cfg),JSON.stringify(snapshot));}catch(_err){}
  }

  async function fetchJSON(path,timeoutMs){
    const controller=typeof AbortController!=='undefined'?new AbortController():null;
    const timer=controller?setTimeout(()=>controller.abort(),timeoutMs||9000):null;
    try{
      const url=/^https:\/\//.test(path)?path:API+path;
      const response=await root.fetch(url,{headers:{Accept:'application/json'},cache:'no-store',credentials:'omit',signal:controller&&controller.signal});
      if(!response.ok) throw new Error(`Sleeper request failed (${response.status}).`);
      return await response.json();
    }finally{if(timer)clearTimeout(timer);}
  }

  async function requestBase(cfg){
    const [state,league,rosters]=await Promise.all([
      fetchJSON('/state/nfl'),
      fetchJSON(`/league/${cfg.leagueId}`),
      fetchJSON(`/league/${cfg.leagueId}/rosters`)
    ]);
    const week=clamp(finite(league&&league.settings&&league.settings.leg,finite(state&&state.leg,1)),1,18);
    const matchups=await fetchJSON(`/league/${cfg.leagueId}/matchups/${week}`);
    return normalizeBundle({state,league,rosters,matchups},cfg);
  }

  function load(options){
    const opts=options||{}, cfg=config(), now=Date.now();
    if(!opts.force&&currentSnapshot&&now<baseExpiresAt) return Promise.resolve(currentSnapshot);
    if(!opts.force&&pendingBase) return pendingBase;
    const version=++requestVersion;
    const request=requestBase(cfg).then(snapshot=>{
      if(version<appliedVersion)return currentSnapshot||snapshot;
      appliedVersion=version;
      if(lastCurrentWeek!=null&&lastCurrentWeek!==snapshot.currentWeek)weekCache.delete(lastCurrentWeek);
      lastCurrentWeek=snapshot.currentWeek;
      currentSnapshot=snapshot;
      baseExpiresAt=Date.now()+BASE_TTL;
      weekCache.set(snapshot.currentWeek,snapshot.matchups);
      writeStored(snapshot,cfg);
      return snapshot;
    }).catch(error=>{
      const stored=currentSnapshot||readStored(cfg);
      if(stored) return Object.assign({},stored,{source:stored.source==='live'?'cache':stored.source,stale:true,error:error.message});
      throw error;
    }).finally(()=>{if(pendingBase===request)pendingBase=null;});
    pendingBase=request;
    return request;
  }

  async function loadWeek(week,options){
    const opts=options||{}, cfg=config(), w=clamp(finite(week,1),1,18);
    if(!opts.force&&weekCache.has(w)) return weekCache.get(w);
    const rows=normalizeMatchups(await fetchJSON(`/league/${cfg.leagueId}/matchups/${w}`));
    weekCache.set(w,rows);
    return rows;
  }

  async function loadSeasonWeeks(snapshot,options){
    const opts=options||{}, last=Math.min(snapshot.currentWeek,snapshot.regularSeasonWeeks);
    const pairs=await Promise.all(Array.from({length:last},(_,i)=>i+1).map(async week=>{
      if(week===snapshot.currentWeek) return [week,snapshot.matchups];
      return [week,await loadWeek(week,{force:false})];
    }));
    if(opts.forceCurrent&&snapshot.currentWeek<=snapshot.regularSeasonWeeks){
      const fresh=await loadWeek(snapshot.currentWeek,{force:true});
      const item=pairs.find(pair=>pair[0]===snapshot.currentWeek);
      if(item)item[1]=fresh;
    }
    return Object.fromEntries(pairs);
  }

  function hasScoring(rows){
    return (rows||[]).some(row=>row.points!=null&&Math.abs(row.points)>0.0001);
  }

  function phase(snapshot){
    if(snapshot.status==='pre_draft'||snapshot.status==='drafting') return {key:'preseason',label:snapshot.status==='drafting'?'Draft in progress':'Preseason'};
    if(snapshot.status==='complete') return {key:'final',label:`${snapshot.season} final`};
    const games=Math.max(0,...snapshot.rosters.map(row=>row.wins+row.losses+row.ties));
    const started=hasScoring(snapshot.matchups);
    if(snapshot.currentWeek>snapshot.regularSeasonWeeks){
      return {key:started?'live':'postseason',label:`Postseason · Week ${snapshot.currentWeek}${started?' live':''}`};
    }
    if(started&&games<snapshot.currentWeek) return {key:'live',label:`Week ${snapshot.currentWeek} · Live`};
    if(games>=snapshot.currentWeek) return {key:'final',label:`Week ${snapshot.currentWeek} · Final`};
    return {key:'scheduled',label:`Week ${snapshot.currentWeek} · Awaiting kickoff`};
  }

  function standings(snapshot){
    return snapshot.rosters.map(row=>Object.assign({},row,{games:row.wins+row.losses+row.ties,
      winPct:(row.wins+row.ties*.5)/Math.max(1,row.wins+row.losses+row.ties)}))
      .sort((a,b)=>b.winPct-a.winPct||b.wins-a.wins||b.pf-a.pf||a.name.localeCompare(b.name));
  }

  function groupMatchups(rows,rosters){
    const names=new Map((rosters||[]).map(row=>[row.rosterId,row.name]));
    const groups=new Map();
    (rows||[]).forEach(row=>{
      const key=row.matchupId==null||row.matchupId<0?`bye-${row.rosterId}`:String(row.matchupId);
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push({
        rosterId:row.rosterId,
        name:names.get(row.rosterId)||`Roster ${row.rosterId}`,
        points:row.points,
        starters:Array.isArray(row.starters)?row.starters:[],
        starterPoints:Array.isArray(row.starterPoints)?row.starterPoints:[],
        playerPoints:row.playerPoints||{}
      });
    });
    return [...groups.entries()].sort((a,b)=>{
      const an=Number(a[0]),bn=Number(b[0]);
      return Number.isFinite(an)&&Number.isFinite(bn)?an-bn:String(a[0]).localeCompare(String(b[0]));
    }).map(([id,sides])=>({id,sides:sides.sort((a,b)=>a.rosterId-b.rosterId)}));
  }

  function projectedPoints(stats,scoringSettings){
    let total=0,matched=false;
    Object.entries(scoringSettings||{}).forEach(([key,weight])=>{
      if(Number(weight)!==0&&stats&&stats[key]!=null&&Number.isFinite(Number(stats[key]))){total+=Number(stats[key])*Number(weight);matched=true;}
    });
    if(matched)return Math.round(total*100)/100;
    return stats&&stats.pts_half_ppr!=null&&Number.isFinite(Number(stats.pts_half_ppr))?Number(stats.pts_half_ppr):null;
  }

  function normalizeProjections(rows,scoringSettings){
    const players={};
    (Array.isArray(rows)?rows:[]).forEach(row=>{
      const id=String(row&&row.player_id||'');
      if(!/^[A-Za-z0-9_-]{1,24}$/.test(id))return;
      const player=row.player||{},stats=row.stats||{};
      const first=String(player.first_name||'').trim(),last=String(player.last_name||'').trim();
      const name=(first+' '+last).trim()||(/^[A-Z]{2,4}$/.test(id)?id+' Defense':'Player '+id);
      const position=String(player.position||'').toUpperCase();
      const team=String(player.team||row.team||'').toUpperCase();
      const opponent=String(row.opponent||'').toUpperCase();
      players[id]={
        id,
        name:name.slice(0,80),
        position:/^[A-Z_]{1,12}$/.test(position)?position:'',
        team:/^[A-Z]{2,4}$/.test(team)?team:'',
        opponent:/^[A-Z]{2,4}$/.test(opponent)?opponent:'',
        projection:projectedPoints(stats,scoringSettings),
        injury:String(player.injury_status||'').slice(0,32),
        date:/^\d{4}-\d{2}-\d{2}$/.test(String(row.date||''))?row.date:''
      };
    });
    return players;
  }

  function playerStorageKey(){return `farmhood-player-feed:${SCHEMA}`;}
  function validPlayerFeed(feed,season,week){
    return !!feed&&feed.schema===SCHEMA&&feed.season===season&&feed.week===week&&
      feed.players&&typeof feed.players==='object'&&finite(feed.fetchedAt,0)>Date.now()-PLAYER_CACHE_MAX_AGE;
  }
  function readStoredPlayers(season,week){
    try{
      const feed=JSON.parse(root.localStorage.getItem(playerStorageKey())||'null');
      if(validPlayerFeed(feed,season,week))return Object.assign({},feed,{source:'cache',stale:true});
    }catch(_err){}
    return null;
  }
  function writeStoredPlayers(feed){
    try{root.localStorage.setItem(playerStorageKey(),JSON.stringify(feed));}catch(_err){}
  }

  async function loadPlayers(snapshot,week,options){
    const opts=options||{},season=snapshot.season,w=clamp(finite(week,snapshot.currentWeek),1,18),key=season+':'+w;
    const cached=playerCache.get(key),ttl=w<snapshot.currentWeek?PLAYER_CACHE_MAX_AGE:PLAYER_TTL;
    if(!opts.force&&cached&&cached.fetchedAt>Date.now()-ttl)return cached;
    const query='season_type=regular&position%5B%5D=QB&position%5B%5D=RB&position%5B%5D=WR&position%5B%5D=TE&position%5B%5D=K&position%5B%5D=DEF';
    try{
      const rows=await fetchJSON(`${API_ROOT}/projections/nfl/${season}/${w}?${query}`,18000);
      const players=normalizeProjections(rows,snapshot.scoringSettings);
      if(Object.keys(players).length<50)throw new Error('Sleeper player projections are not ready.');
      const feed={schema:SCHEMA,season,week,players,fetchedAt:Date.now(),source:'live',stale:false};
      playerCache.set(key,feed);writeStoredPlayers(feed);return feed;
    }catch(error){
      const fallback=cached||readStoredPlayers(season,w);
      if(fallback)return Object.assign({},fallback,{source:'cache',stale:true,error:error.message});
      return {schema:SCHEMA,season,week,players:{},fetchedAt:Date.now(),source:'unavailable',stale:true,error:error.message};
    }
  }

  function playerImage(id,position){
    const playerId=String(id||''),pos=String(position||'').toUpperCase();
    if(!playerId||playerId==='0'||!/^[A-Za-z0-9_-]{1,24}$/.test(playerId))return '';
    if(pos==='DEF'||/^[A-Z]{2,4}$/.test(playerId))return `https://sleepercdn.com/images/team_logos/nfl/${playerId.toLowerCase()}.png`;
    return `https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`;
  }

  function lineupFor(side,rosterPositions,playerFeed){
    const slots=(Array.isArray(rosterPositions)?rosterPositions:[]).filter(slot=>slot!=='BN');
    const starters=Array.isArray(side&&side.starters)?side.starters:[];
    const points=Array.isArray(side&&side.starterPoints)?side.starterPoints:[];
    const playerPoints=side&&side.playerPoints||{},players=playerFeed&&playerFeed.players||{};
    const length=Math.max(slots.length,starters.length);
    return Array.from({length},(_,index)=>{
      const id=String(starters[index]||'0'),info=players[id]||{};
      const actual=id==='0'?null:playerPoints[id]!=null&&Number.isFinite(Number(playerPoints[id]))?Number(playerPoints[id]):
        points[index]!=null&&Number.isFinite(Number(points[index]))?Number(points[index]):null;
      const position=info.position||slots[index]||'';
      return {
        id,
        slot:slots[index]||position||'FLEX',
        name:id==='0'?'Empty slot':(info.name||`Player ${id}`),
        position,
        team:info.team||(/^[A-Z]{2,4}$/.test(id)?id:''),
        opponent:info.opponent||'',
        projection:info.projection!=null&&Number.isFinite(Number(info.projection))?Number(info.projection):null,
        points:actual,
        injury:info.injury||'',
        image:playerImage(id,position)
      };
    });
  }

  function percentile(value,values){
    if(values.length<2)return .5;
    const less=values.filter(v=>v<value-0.0001).length;
    const equal=values.filter(v=>Math.abs(v-value)<=0.0001).length;
    return (less+Math.max(0,equal-1)*.5)/(values.length-1);
  }

  function buildPower(snapshot,weeks,history,titleMap,playerFeed){
    const historical=Array.isArray(history)?history:[], titles=titleMap||{};
    const avgCareer=historical.reduce((sum,m)=>sum+(m.pf/Math.max(1,m.wins+m.losses)),0)/Math.max(1,historical.length);
    const legacy=historical.map(m=>{
      const games=Math.max(1,m.wins+m.losses),ppg=m.pf/games;
      return {name:m.name,raw:(m.wins/games)*55+finite(titles[m.name],0)*7+(ppg-avgCareer)*1.4};
    });
    const legacyMin=Math.min(...legacy.map(row=>row.raw)),legacyMax=Math.max(...legacy.map(row=>row.raw));
    const legacyIndex=new Map(legacy.map(row=>[row.name,legacyMax===legacyMin?70:55+30*(row.raw-legacyMin)/(legacyMax-legacyMin)]));
    const currentRows=(weeks&&weeks[snapshot.currentWeek])||snapshot.matchups||[];
    const lineupByRoster=new Map(),slotValues=new Map();
    let knownProjections=0,populatedStarters=0;
    currentRows.forEach(row=>{
      const lineup=lineupFor(row,snapshot.rosterPositions,playerFeed);lineupByRoster.set(row.rosterId,lineup);
      lineup.forEach(player=>{
        if(player.id==='0')return;
        populatedStarters+=1;
        if(player.projection!=null){
          knownProjections+=1;
          if(!slotValues.has(player.slot))slotValues.set(player.slot,[]);
          slotValues.get(player.slot).push(player.projection);
        }
      });
    });
    const median=values=>{const sorted=[...values].sort((a,b)=>a-b),mid=Math.floor(sorted.length/2);return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;};
    const projectionCoverage=populatedStarters?knownProjections/populatedStarters:0;
    const projectionTotals=new Map();
    currentRows.forEach(row=>{
      const lineup=lineupByRoster.get(row.rosterId)||[],values=lineup.map(player=>{
        if(player.id==='0')return 0;
        if(player.projection!=null)return player.projection;
        const peers=slotValues.get(player.slot)||[];return peers.length?median(peers):null;
      });
      projectionTotals.set(row.rosterId,projectionCoverage>=.8&&values.length&&values.every(value=>value!=null)?values.reduce((sum,value)=>sum+value,0):null);
    });
    const availableProjections=[...projectionTotals.values()].filter(value=>value!=null);
    const projectionPct=new Map(snapshot.rosters.map(roster=>{
      const value=projectionTotals.get(roster.rosterId);
      return [roster.rosterId,value==null?.5:percentile(value,availableProjections)];
    }));

    const scoredWeekRows=Object.keys(weeks||{}).map(Number).sort((a,b)=>a-b).map(week=>({
      week,
      rows:(weeks[week]||[]).filter(row=>snapshot.rosters.some(roster=>roster.rosterId===row.rosterId)&&row.points!=null)
    })).filter(item=>item.rows.length&&hasScoring(item.rows));

    const compute=(weekCount,completedForBlend,useOfficialRecord)=>{
      const selected=scoredWeekRows.slice(0,weekCount);
      const metrics=new Map(snapshot.rosters.map(row=>[row.rosterId,{scores:[],weekly:[],allPlay:0,allPlayGames:0,expectedWins:0,wins:0,ties:0,games:0}]));
      selected.forEach(item=>{
        const values=item.rows.map(row=>row.points);
        item.rows.forEach(row=>{
          const metric=metrics.get(row.rosterId);if(!metric)return;
          metric.scores.push(row.points);metric.weekly.push(percentile(row.points,values));
          let weeklyAllPlay=0;
          item.rows.forEach(other=>{if(other.rosterId===row.rosterId)return;
            metric.allPlayGames+=1;
            const result=row.points>other.points?1:Math.abs(row.points-other.points)<=0.0001?.5:0;
            metric.allPlay+=result;weeklyAllPlay+=result;
          });
          if(item.week<=completedForBlend)metric.expectedWins+=weeklyAllPlay/Math.max(1,item.rows.length-1);
        });
        groupMatchups(item.rows,snapshot.rosters).forEach(group=>{
          if(group.sides.length!==2||!hasScoring(group.sides))return;
          const [a,b]=group.sides,am=metrics.get(a.rosterId),bm=metrics.get(b.rosterId);
          if(!am||!bm)return;
          am.games+=1;bm.games+=1;
          if(Math.abs(a.points-b.points)<=0.0001){am.ties+=1;bm.ties+=1;}
          else if(a.points>b.points)am.wins+=1;else bm.wins+=1;
        });
      });

      const rows=snapshot.rosters.map(roster=>{
        const metric=metrics.get(roster.rosterId),ppg=metric.scores.length?metric.scores.reduce((sum,value)=>sum+value,0)/metric.scores.length:0;
        const recent=metric.weekly.length?metric.weekly.slice(-3).reduce((sum,value)=>sum+value,0)/Math.min(3,metric.weekly.length):.5;
        const current=currentRows.find(row=>row.rosterId===roster.rosterId);
        const officialGames=roster.wins+roster.losses+roster.ties;
        return Object.assign({},roster,{
          ppg,
          recordPct:useOfficialRecord?(officialGames?(roster.wins+roster.ties*.5)/officialGames:.5):(metric.games?(metric.wins+metric.ties*.5)/metric.games:.5),
          derivedWins:metric.wins,
          derivedTies:metric.ties,
          derivedGames:metric.games,
          allPlayPct:metric.allPlayGames?metric.allPlay/metric.allPlayGames:.5,
          allPlayWins:metric.allPlay,
          allPlayGames:metric.allPlayGames,
          expectedWins:metric.expectedWins,
          recentForm:recent,
          projected:projectionTotals.get(roster.rosterId),
          projectionPct:projectionPct.get(roster.rosterId),
          currentPoints:current&&current.points!=null?current.points:null,
          baseline:legacyIndex.get(roster.name)||55
        });
      });
      const ppgValues=rows.map(row=>row.ppg);
      const hasSeasonSignal=weekCount>0||availableProjections.length>=6;
      const seasonWeight=hasSeasonSignal?Math.min(1,.2*(Math.min(4,completedForBlend)+1)):0;
      const historyWeight=1-seasonWeight;
      rows.forEach(row=>{
        row.scoringPct=weekCount?percentile(row.ppg,ppgValues):.5;
        const composite=row.allPlayPct*.30+row.scoringPct*.25+row.recordPct*.20+row.projectionPct*.15+row.recentForm*.10;
        row.seasonIndex=weekCount===0?55+30*row.projectionPct:55+30*composite;
        row.power=row.baseline*historyWeight+row.seasonIndex*seasonWeight;
        row.historyWeight=historyWeight;
        row.luckPct=row.recordPct-row.allPlayPct;
        row.luckWins=(useOfficialRecord?(row.wins+row.ties*.5):(row.derivedWins+row.derivedTies*.5))-row.expectedWins;
        row.factors=weekCount===0
          ? [
              {key:'history',label:'All-time foundation',value:row.baseline/100,weight:historyWeight},
              {key:'lineup',label:'Starting lineup',value:row.projectionPct,weight:seasonWeight}
            ]
          : [
              {key:'allPlay',label:'All-play',value:row.allPlayPct,weight:.30*seasonWeight},
              {key:'scoring',label:'Scoring',value:row.scoringPct,weight:.25*seasonWeight},
              {key:'record',label:'Record',value:row.recordPct,weight:.20*seasonWeight},
              {key:'lineup',label:'Starting lineup',value:row.projectionPct,weight:.15*seasonWeight},
              {key:'form',label:'Recent form',value:row.recentForm,weight:.10*seasonWeight},
              ...(historyWeight?[{key:'history',label:'History',value:row.baseline/100,weight:historyWeight}]:[])
            ];
      });
      rows.sort((a,b)=>b.power-a.power||b.allPlayPct-a.allPlayPct||b.ppg-a.ppg||a.name.localeCompare(b.name));
      rows.forEach((row,index)=>{row.rank=index+1;});
      return {rows,historyWeight};
    };

    const rosterGames=snapshot.rosters.map(row=>row.wins+row.losses+row.ties);
    const completedWeeks=Math.min(snapshot.regularSeasonWeeks,...rosterGames);
    const finalized=scoredWeekRows.filter(item=>item.week<=completedWeeks);
    const snapshots=[compute(0,0,false),...finalized.map((_item,index)=>compute(index+1,index+1,false))];
    const currentComputed=compute(scoredWeekRows.length,completedWeeks,true);
    const hasProvisional=scoredWeekRows.length>finalized.length;
    if(hasProvisional)snapshots.push(currentComputed);
    else snapshots[snapshots.length-1]=currentComputed;
    const current=snapshots[snapshots.length-1],previous=snapshots[Math.max(0,snapshots.length-2)];
    const previousRanks=new Map(previous.rows.map(row=>[row.name,row.rank]));
    const trend={};
    snapshot.rosters.forEach(roster=>{trend[roster.name]=snapshots.map(item=>item.rows.find(row=>row.name===roster.name).rank);});
    current.rows.forEach(row=>{
      row.previousRank=previousRanks.get(row.name)||row.rank;
      row.movement=row.previousRank-row.rank;
      if(!scoredWeekRows.length){
        if(row.rank===1)row.tag={label:'Preseason Favorite',tone:'gold'};
        else if(row.projectionPct>=.82)row.tag={label:'Loaded Lineup',tone:'blue'};
        else if(row.baseline>=80)row.tag={label:'Proven Power',tone:'green'};
        else row.tag={label:'Fresh Slate',tone:'muted'};
      }else if(row.rank===1)row.tag={label:'Top of the Food Chain',tone:'gold'};
      else if(row.movement>=3)row.tag={label:'Rocket Fuel',tone:'green'};
      else if(row.wins+row.losses+row.ties>=4&&row.recordPct>=.625&&row.allPlayPct<=.45&&row.luckWins>=1)row.tag={label:'Fraud Alert',tone:'red'};
      else if(row.wins+row.losses+row.ties>=4&&row.luckWins>=1.25)row.tag={label:'Schedule Merchant',tone:'red'};
      else if(row.wins+row.losses+row.ties>=4&&row.luckWins<=-1.25&&row.allPlayPct>=.5)row.tag={label:'Better Than Their Record',tone:'blue'};
      else if(scoredWeekRows.length>=4&&row.recentForm>=.8&&row.recentForm-row.scoringPct>=.15)row.tag={label:'On Fire',tone:'green'};
      else if(scoredWeekRows.length>=4&&row.recentForm<=.2&&row.scoringPct-row.recentForm>=.15)row.tag={label:'Ice Cold',tone:'red'};
      else if(row.rank<=3&&row.allPlayPct>=.6)row.tag={label:'Powerhouse',tone:'gold'};
      else if(row.projectionPct>=.82)row.tag={label:'Loaded Lineup',tone:'blue'};
      else row.tag={label:'In the Mix',tone:'muted'};
      const ordered=[...row.factors].sort((a,b)=>b.value-a.value),driver=ordered[0],drag=ordered[ordered.length-1];
      row.reason=`${driver.label} is the biggest lift at ${Math.round(driver.value*100)}%. ${drag.label} is the main drag at ${Math.round(drag.value*100)}%.`;
    });
    const confidence=scoredWeekRows.length===0?'Preseason':scoredWeekRows.length<=3?'Early Sample':'Established';
    const historyWeight=current.historyWeight,seasonWeight=1-historyWeight;
    return {
      rows:current.rows,
      scoredWeeks:scoredWeekRows.length,
      scoredWeekNumbers:scoredWeekRows.map(item=>item.week),
      historyWeight,
      seasonWeight,
      confidence:snapshot.currentWeek>snapshot.regularSeasonWeeks||scoredWeekRows.length>=12?'Playoff Form':confidence,
      provisional:phase(snapshot).key==='live',
      movementContext:scoredWeekRows.length?'vs previous checkpoint':'vs preseason',
      projectionCoverage,
      trendLabels:['Pre',...finalized.map(item=>'W'+item.week),...(hasProvisional?[`W${scoredWeekRows[scoredWeekRows.length-1].week} Live`]:[])],
      trend
    };
  }

  function clearMemory(){
    currentSnapshot=null;pendingBase=null;baseExpiresAt=0;lastCurrentWeek=null;requestVersion=0;appliedVersion=0;weekCache.clear();playerCache.clear();
  }

  return {
    load,
    loadWeek,
    loadSeasonWeeks,
    loadPlayers,
    normalizeConfig,
    normalizeBundle,
    normalizeMatchups,
    seasonPoints,
    scoreOf,
    hasScoring,
    phase,
    standings,
    groupMatchups,
    normalizeProjections,
    projectedPoints,
    playerImage,
    lineupFor,
    buildPower,
    clearMemory,
    get refreshMs(){return config().refreshMs;}
  };
});
