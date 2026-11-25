const assert=require('node:assert/strict');
const test=require('node:test');
const api=require('./playoff-model.js');
function bundle(){
 const teams=Array.from({length:8},(_,i)=>({rosterId:i+1,name:'Team '+(i+1),wins:i<4?1:0,losses:i<4?0:1,ties:0,pf:120-i*5,pa:80+i*5}));
 const slate=(pairs,points)=>pairs.flatMap((pair,i)=>pair.map(id=>({rosterId:id,matchupId:i+1,points:points?id*2:0})));
 return {snapshot:{leagueId:'league',season:2026,currentWeek:2,regularSeasonWeeks:3,rosters:teams},model:{completedThrough:1,regularSeasonWeeks:3,playoffTeams:6},shape:{leagueSettings:{playoff_teams:6,playoff_week_start:4,last_scored_leg:1,league_average_match:0}},weeks:{1:slate([[1,2],[3,4],[5,6],[7,8]],true),2:slate([[1,5],[2,6],[3,7],[4,8]],true),3:slate([[1,2],[3,4],[5,6],[7,8]],false)}};
}
test('anchors official standings once, keeps the current scored week live, and excludes past weeks',()=>{
 const model=api.createModel(bundle()),actual=api.evaluate(model,{},{});
 assert.equal(model.completedThrough,1);assert.equal(model.games.length,8);assert.ok(model.games.every(g=>g.week>1));
 assert.ok(model.games.filter(g=>g.week===2).every(g=>g.status==='live'));
 assert.equal(actual.rows.find(r=>r.id===1).pf,120);assert.equal(actual.picksMade,0);assert.equal(actual.complete,false);
 assert.equal(actual.rows.find(r=>r.id===1).remainingGames,2);
});
test('choosing a winner or tie changes both teams without mutating official data',()=>{
 const model=api.createModel(bundle()),snapshot=JSON.stringify(model);
 let result=api.evaluate(model,{'2:1':1},{});
 assert.equal(result.rows.find(r=>r.id===1).wins,2);assert.equal(result.rows.find(r=>r.id===5).losses,2);assert.equal(result.picksMade,1);
 result=api.evaluate(model,{'2:1':'tie'},{});
 assert.equal(result.rows.find(r=>r.id===1).ties,1);assert.equal(result.rows.find(r=>r.id===5).ties,1);
 assert.equal(result.rows.find(r=>r.id===1).winPct,0.75);assert.equal(JSON.stringify(model),snapshot);
});
test('score estimates infer results, preserve zero/negative scores and add PF and PA to the right teams',()=>{
 const result=api.evaluate(api.createModel(bundle()),{}, {'2:1':{a:0,b:-1}});
 assert.equal(result.inferredPicks['2:1'],1);assert.equal(result.picksMade,1);
 const a=result.rows.find(r=>r.id===1),b=result.rows.find(r=>r.id===5);
 assert.equal(a.pf,120);assert.equal(a.pa,79);assert.equal(b.pf,99);assert.equal(b.pa,100);
});
test('a contradictory pick and score applies neither result nor points and returns a local error',()=>{
 const result=api.evaluate(api.createModel(bundle()),{'2:1':1},{'2:1':{a:50,b:100}});
 assert.equal(result.picksMade,0);assert.equal(result.rows.find(r=>r.id===1).pf,120);
 assert.match(result.errors[0].message,/conflict/);
});
test('partial score inputs remain labeled unknown and never become a fabricated zero opponent score',()=>{
 const result=api.evaluate(api.createModel(bundle()),{'2:1':1},{'2:1':{a:110}});
 assert.equal(result.rows.find(r=>r.id===1).pf,230);
 assert.equal(result.rows.find(r=>r.id===5).pf,100);
 assert.equal(result.rows.find(r=>r.id===1).unknownAgainstGames,2);
 assert.ok(result.provisionalTieBreaks);
});
test('seeding uses winning percentage, PF, then higher PA, with exact ties explicitly unresolved',()=>{
 const b=bundle();b.model.regularSeasonWeeks=1;b.snapshot.regularSeasonWeeks=1;b.shape.leagueSettings.playoff_week_start=2;
 b.snapshot.rosters.forEach(t=>{t.wins=1;t.losses=0;t.pf=100;t.pa=100;});b.snapshot.rosters[1].pa=120;b.snapshot.rosters[2].pf=101;
 const result=api.evaluate(api.createModel(b),{},{});
 assert.equal(result.rows[0].id,3);assert.equal(result.rows[1].id,2);
 assert.ok(result.rows.find(r=>r.id===1).tieBreakUnresolved);assert.ok(result.provisionalTieBreaks);
});
test('bad identities, one-sided games and missing whole weeks fail closed rather than making byes',()=>{
 for(const mutate of [b=>{b.weeks[2]=b.weeks[2].slice(1);},b=>{b.weeks[2][0].rosterId=2;},b=>{b.weeks[2][0].matchupId=null;},b=>{b.weeks[2]=[];}]){
  const b=bundle();mutate(b);const model=api.createModel(b),result=api.evaluate(model,{},{});
  assert.ok(model.missingWeeks.includes(2));assert.equal(result.incompleteSchedule,true);assert.equal(result.complete,false);assert.equal(result.rows[0].remainingGames,2);
 }
});
test('settings changes, bonus games, divisions and out-of-sync final markers are not silently assumed supported',()=>{
 for(const mutate of [b=>{delete b.shape.leagueSettings;},b=>{b.shape.leagueSettings.league_average_match=1;},b=>{b.shape.leagueSettings.divisions=2;},b=>{b.shape.leagueSettings.playoff_teams=4.5;},b=>{b.shape.leagueSettings.last_scored_leg=0;}]){
  const b=bundle();mutate(b);assert.equal(api.evaluate(api.createModel(b),{},{}).incompleteSchedule,true);
 }
});
test('foreign picks, non-finite scores and oversized values are rejected',()=>{
 const model=api.createModel(bundle());
 const result=api.evaluate(model,{'2:1':999,'9:9':1},{'2:2':{a:Infinity},'3:1':{a:10001}});
 assert.equal(result.picksMade,0);assert.ok(result.errors.length>=4);
});
test('unsupported seeding rules cannot apply imported picks or score estimates',()=>{
 const b=bundle();b.shape.leagueSettings.league_average_match=1;
 const result=api.evaluate(api.createModel(b),{'2:1':1},{'2:1':{a:200,b:100}});
 assert.equal(result.picksMade,0);assert.equal(result.rows.find(r=>r.id===1).wins,1);assert.equal(result.rows.find(r=>r.id===1).pf,120);
});
test('a complete six-team scenario gives top-two byes and standard 3v6/4v5 opening games',()=>{
 const model=api.createModel(bundle()),picks=Object.fromEntries(model.games.map(g=>[g.key,g.a]));
 const result=api.evaluate(model,picks,{});
 assert.equal(result.complete,true);assert.equal(result.bracket.byes.length,2);
 assert.deepEqual(result.bracket.matchups.map(g=>[g.a.seed,g.b.seed]),[[3,6],[4,5]]);
 assert.equal(result.rows.filter(r=>r.inPlayoffField).length,6);
});
test('simulations are repeatable, bounded and conserve playoff/seed probability mass',()=>{
 const model=api.createModel(bundle()),history=Object.fromEntries(model.teams.map(t=>[t.id,[80+t.id,110+t.id,130+t.id]]));
 const result=api.simulateScenario(model,{}, {},history,{sims:100.9,seed:7});
 assert.deepEqual(result,api.simulateScenario(model,{}, {},history,{sims:100.9,seed:7}));
 assert.equal(result.samples,100);assert.ok(Math.abs(result.rows.reduce((sum,r)=>sum+r.playoffPct,0)-6)<1e-9);
 assert.ok(Math.abs(result.rows.reduce((sum,r)=>sum+r.byePct,0)-2)<1e-9);
 assert.ok(result.rows.every(r=>Math.abs(r.seedPct.reduce((a,b)=>a+b,0)-1)<1e-9));
});
test('scenario simulations honor fixed outcomes and final-score inputs, and refuse missing history/conflicts',()=>{
 const model=api.createModel(bundle()),history=Object.fromEntries(model.teams.map(t=>[t.id,[90,110,130]]));
 const all=Object.fromEntries(model.games.map(g=>[g.key,g.a]));
 const winning=api.simulateScenario(model,all,{},history,{sims:100,seed:9});
 all['2:1']=5;all['3:1']=2;
 const losing=api.simulateScenario(model,all,{},history,{sims:100,seed:9});
 assert.ok(winning.rows.find(r=>r.rosterId===1).byePct>losing.rows.find(r=>r.rosterId===1).byePct);
 assert.equal(api.simulateScenario(model,{}, {},{},{}).status,'unavailable');
 assert.equal(api.simulateScenario(model,{'2:1':1},{'2:1':{a:10,b:20}},history,{}).status,'unavailable');
});
