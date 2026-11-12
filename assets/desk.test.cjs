const assert = require('node:assert/strict');
const test = require('node:test');
const desk = require('./desk.js');

test('dollars ranks the high score, the position prize, and a rivalry', () => {
  const board = desk.dollarsOnTheTable({
    mode: 'actual',
    position: 'QB',
    rivalry: {a: 'Alpha', b: 'Bravo', labelA: 'Al', labelB: 'Be'},
    teams: [
      {name: 'Alpha', points: 120, starters: [{id: '1', name: 'QB A', slot: 'QB', position: 'QB', points: 22}]},
      {name: 'Bravo', points: 110, starters: [{id: '2', name: 'QB B', slot: 'QB', position: 'QB', points: 30}]},
      {name: 'Charlie', points: 120, starters: [{id: '3', name: 'QB C', slot: 'QB', position: 'QB', points: 10}]}
    ]
  });
  assert.equal(board.high[0].share, 15);
  assert.equal(board.high[1].share, 15);
  assert.equal(board.high[2].gap, 10);
  assert.equal(board.positionBoard[0].player, 'QB B');
  assert.equal(board.positionBoard[0].share, 10);
  assert.equal(board.rivalry.leader, 'Alpha');
  const missing = desk.dollarsOnTheTable({
    mode: 'projected',
    rivalry: {a: 'Alpha', b: 'Bravo', labelA: 'Al', labelB: 'Be'},
    teams: [
      {name: 'Alpha', projection: 98.3, starters: []},
      {name: 'Bravo', projection: null, starters: []}
    ]
  });
  assert.equal(missing.rivalry.leader, null);
  assert.equal(missing.rivalry.scoreB, null);
});

test('exposure separates a one-game manager from a settled one', () => {
  const report = desk.mondayExposure({
    started: true,
    teams: [
      {name: 'Alpha', starters: [
        {id: '1', name: 'Early', locked: true, gameStatus: 'final', gameDate: '2026-11-15', gameStartTime: 1, team: 'DAL'},
        {id: '2', name: 'Late', locked: false, gameStatus: 'pre_game', gameDate: '2026-11-16', gameStartTime: 2, team: 'KC', opponent: 'BUF'}
      ]},
      {name: 'Bravo', starters: [
        {id: '3', name: 'Done', locked: true, gameStatus: 'final', gameDate: '2026-11-15', gameStartTime: 1, team: 'NYG'}
      ]}
    ]
  });
  assert.equal(report.phase, 'live');
  assert.equal(report.oneGame.length, 1);
  assert.equal(report.oneGame[0].name, 'Alpha');
  assert.deepEqual(report.settled, ['Bravo']);
  assert.equal(report.latest, '2026-11-16');
});

test('playoff equity is deterministic and gives the title to the dominant seed', () => {
  const input = {
    sims: 40,
    seed: 7,
    playoffTeams: 2,
    games: [],
    teams: [
      {id: 1, name: 'Alpha', wins: 6, pf: 600, scores: [200]},
      {id: 2, name: 'Bravo', wins: 4, pf: 400, scores: [50]},
      {id: 3, name: 'Charlie', wins: 4, pf: 300, scores: [50]},
      {id: 4, name: 'Delta', wins: 0, pf: 100, scores: [50]}
    ]
  };
  const first = desk.playoffEquity(input);
  const second = desk.playoffEquity(input);
  assert.deepEqual(first, second);
  assert.equal(first.find(row => row.name === 'Alpha').titlePct, 1);
  assert.equal(first.find(row => row.name === 'Alpha').playoffPct, 1);
  assert.equal(first.find(row => row.name === 'Bravo').playoffPct, 1);
  assert.equal(first.find(row => row.name === 'Delta').playoffPct, 0);
  const playoffSum = first.reduce((sum, row) => sum + row.playoffPct, 0);
  const titleSum = first.reduce((sum, row) => sum + row.titlePct, 0);
  assert.ok(Math.abs(playoffSum - 2) < 0.001);
  assert.ok(Math.abs(titleSum - 1) < 0.001);
});

test('fair schedule credits all-play wins the head-to-head record missed', () => {
  const table = desk.fairSchedule([{
    week: 1,
    rows: [
      {id: 'Alpha', name: 'Alpha', matchupId: 1, points: 100},
      {id: 'Bravo', name: 'Bravo', matchupId: 1, points: 50},
      {id: 'Charlie', name: 'Charlie', matchupId: 2, points: 80},
      {id: 'Delta', name: 'Delta', matchupId: 2, points: 70}
    ]
  }]);
  const byName = Object.fromEntries(table.map(row => [row.name, row]));
  assert.equal(byName.Alpha.actual, 1);
  assert.equal(byName.Alpha.expected, 1);
  assert.equal(byName.Charlie.actual, 1);
  assert.equal(byName.Charlie.luck, 0.33);
  assert.equal(byName.Delta.luck, -0.33);
  assert.equal(byName.Bravo.actual, 0);
});

test('waiver autopsy separates hits, misses, and haunted drops', () => {
  const report = desk.waiverAutopsy({
    transactions: [
      {week: 2, manager: 'Alpha', adds: [{id: 'p1', name: 'Hero', position: 'WR'}], drops: [{id: 'p2', name: 'Ghost', position: 'RB'}]},
      {week: 2, manager: 'Bravo', adds: [{id: 'p3', name: 'Zero', position: 'TE'}], drops: []}
    ],
    weeks: [
      {week: 2, rosters: [
        {manager: 'Alpha', playerIds: ['p1'], starters: [{id: 'p1', points: 18}]},
        {manager: 'Bravo', playerIds: ['p2', 'p3'], starters: [{id: 'p2', points: 22}]}
      ]},
      {week: 3, rosters: [
        {manager: 'Alpha', playerIds: ['p1'], starters: []},
        {manager: 'Bravo', playerIds: ['p2'], starters: [{id: 'p2', points: 4}]}
      ]}
    ]
  });
  assert.equal(report.hits[0].name, 'Hero');
  assert.equal(report.hits[0].points, 18);
  assert.equal(report.misses[0].name, 'Zero');
  assert.equal(report.heists[0].name, 'Ghost');
  assert.equal(report.heists[0].points, 26);
  assert.equal(report.heists[0].scoredFor, 'Bravo');
});

test('draft graveyard marks kept, moved, and gone picks', () => {
  const report = desk.draftGraveyard({
    picks: [
      {playerId: '1', name: 'Kept', position: 'RB', round: 1, pick: 1, rosterId: 1, manager: 'Alpha'},
      {playerId: '2', name: 'Moved', position: 'WR', round: 2, pick: 14, rosterId: 1, manager: 'Alpha'},
      {playerId: '3', name: 'Gone', position: 'QB', round: 3, pick: 25, rosterId: 1, manager: 'Alpha'},
      {playerId: '4', name: 'Late', position: 'WR', round: 10, pick: 110, rosterId: 2, manager: 'Bravo'}
    ],
    rosters: [
      {rosterId: 1, manager: 'Alpha', playerIds: ['1']},
      {rosterId: 2, manager: 'Bravo', playerIds: ['2', '4']}
    ],
    starterIds: ['4']
  });
  assert.equal(report.kept, 2);
  assert.equal(report.moved, 1);
  assert.equal(report.gone, 1);
  assert.equal(report.earlyGone[0].name, 'Gone');
  assert.equal(report.lateKept[0].name, 'Late');
});

test('rivalry series joins the all-time record to this year\'s purse', () => {
  const series = desk.rivalrySeries({
    paid: [{id: 'martin-dom', week: 10, a: 'martinch94', b: 'cuch', labelA: 'Martin', labelB: 'Dom'}],
    allTime: [{a: 'cuch', b: 'martinch94', aWins: 4, bWins: 6, games: 10}],
    results: [{id: 'martin-dom', week: 10, a: 'martinch94', b: 'cuch', scoreA: 140, scoreB: 100, status: 'final'}],
    amount: 50
  });
  assert.equal(series[0].aWins, 6);
  assert.equal(series[0].bWins, 4);
  assert.equal(series[0].leader, 'martinch94');
  assert.equal(series[0].season.winner, 'martinch94');
  assert.equal(series[0].amount, 50);
});

test('fingerprints name a swing manager and a steady one', () => {
  const rows = desk.fingerprints({
    managers: [{name: 'Wild'}, {name: 'Calm'}],
    weeks: [1, 2, 3, 4].map(week => ({
      week,
      rows: [
        {name: 'Wild', matchupId: week, points: week % 2 ? 150 : 60},
        {name: 'Calm', matchupId: week, points: 108 + week}
      ]
    }))
  });
  const wild = rows.find(row => row.name === 'Wild');
  const calm = rows.find(row => row.name === 'Calm');
  assert.equal(wild.label, 'Swing');
  assert.equal(calm.label, 'Steady');
  assert.match(wild.summary, /Swing/);
});

test('weekly prize gaps retain cent precision instead of rounding away a close race', () => {
  const board = desk.dollarsOnTheTable({teams: [{name: 'Alpha', points: 128.07}, {name: 'Bravo', points: 121.31}]});
  assert.equal(board.high[1].gap, 6.76);
});

test('position purses use one individual, actual position, and occupied FLEX slots', () => {
  const teams = [
    {name:'Alpha', points:100, starters:[
      {id:'1', name:'Runner one', slot:'RB', position:'RB', points:20},
      {id:'2', name:'Runner two', slot:'FLEX', position:'RB', points:21},
      {id:'3', name:'Not an RB', slot:'RB', position:'WR', points:99}
    ]},
    {name:'Bravo', points:100, starters:[{id:'4', name:'Best runner', slot:'FLEX', position:'RB', points:30}]}
  ];
  const rb = desk.dollarsOnTheTable({teams, position:'RB'});
  assert.equal(rb.positionBoard[0].player, 'Best runner');
  assert.equal(rb.positionBoard[1].score, 21);
  const flex = desk.dollarsOnTheTable({teams, position:'FLEX'});
  assert.equal(flex.positionBoard[1].player, 'Runner two');
});

test('money handles missing scores and splits exact cents among tied owners', () => {
  const board = desk.dollarsOnTheTable({position:'QB', teams:[
    {name:'Missing', points:null, starters:[]},
    {name:'Blank', points:' ', starters:[]},
    ...['C','A','B'].map(name => ({name, ownerId:name, points:0, starters:[{id:name, name, slot:'QB', position:'QB', points:10}]}))
  ]});
  assert.equal(board.high.length, 3);
  assert.deepEqual(board.positionBoard.map(row => row.share), [3.34,3.33,3.33]);
  assert.equal(board.positionBoard.reduce((sum,row) => sum + Math.round(row.share*100),0), 1000);
  assert.deepEqual(board.high.map(row => row.rank), [1,1,1]);
});

test('exposure keeps locked live players and distinguishes games sharing kickoff', () => {
  const report = desk.mondayExposure({started:true, teams:[
    {name:'Two games', starters:[
      {id:'a', locked:true, gameStatus:'live', gameDate:'2026-11-15', gameStartTime:10, team:'KC', opponent:'BUF'},
      {id:'b', locked:true, gameStatus:'live', gameDate:'2026-11-15', gameStartTime:10, team:'DAL', opponent:'NYG'}
    ]},
    {name:'One game', starters:[
      {id:'c', locked:true, gameStatus:'live', gameDate:'2026-11-15', gameStartTime:10, team:'KC', opponent:'BUF'},
      {id:'d', locked:false, gameStatus:'pre_game', gameDate:'2026-11-15', gameStartTime:10, team:'BUF', opponent:'KC'}
    ]},
    {name:'Unknown', starters:[{id:'e', locked:true}]}
  ]});
  assert.equal(report.phase, 'live');
  assert.deepEqual(report.settled, []);
  assert.deepEqual(report.oneGame.map(row => row.name), ['One game']);
  assert.deepEqual(report.unknown, ['Unknown']);
});

test('exposure latest window uses kickoff rather than every game on the last date', () => {
  const report = desk.mondayExposure({teams:[{name:'Alpha', starters:[
    {id:'1', gameDate:'2026-11-15', gameStartTime:10, team:'DAL'},
    {id:'2', gameDate:'2026-11-15', gameStartTime:20, team:'KC'}
  ]}]});
  assert.deepEqual(report.latestWindow[0].players.map(player => player.id), ['2']);
  assert.equal(report.latestStartTime, 20);
  assert.notEqual(desk.mondayExposure({started:true, teams:[]}).phase, 'complete');
});

test('odds return no invented forecast without observations and tolerate empty inputs', () => {
  assert.deepEqual(desk.playoffEquity({teams:[]}), []);
  const result = desk.playoffEquity({teams:[{id:1, scores:[null,'',false,Infinity]}]});
  assert.equal(result[0].status, 'insufficient-data');
  assert.equal(result[0].titlePct, null);
  assert.equal(result[0].samples, 0);
});

test('odds bound integer simulations, dedupe games, expose seed mass and sampling intervals', () => {
  const teams = [
    {id:1, name:'A', scores:[80,120], wins:2, pf:200},
    {id:2, name:'B', scores:[90,110], wins:1, pf:190},
    {id:3, name:'C', scores:[], wins:0, pf:100}
  ];
  const input = {teams, games:[{week:3,a:1,b:2},{week:3,a:2,b:1},{week:4,a:1,b:1},{week:4,a:1,b:999}], sims:39.8, seed:2, playoffTeams:2};
  const rows = desk.playoffEquity(input);
  assert.deepEqual(rows, desk.playoffEquity(input));
  rows.forEach(row => {
    assert.equal(row.samples, 39);
    assert.ok(Math.abs(row.seedPct.reduce((sum,value) => sum+value,0)-1)<1e-10);
    assert.ok(row.playoffInterval[0] <= row.playoffPct && row.playoffInterval[1] >= row.playoffPct);
    assert.ok(row.titleInterval[0] <= row.titlePct && row.titleInterval[1] >= row.titlePct);
    assert.ok(row.winsRange[0] <= row.medianWins && row.medianWins <= row.winsRange[1]);
  });
  assert.equal(rows.find(row=>row.id===3).sampleWeeks,0);
  assert.equal(rows.find(row=>row.id===3).poolSamples,4);
  assert.equal(rows.find(row=>row.id===3).samplingSource,'league');
  assert.ok(Math.abs(rows.reduce((sum,row)=>sum+row.playoffPct,0)-2)<1e-10);
  assert.ok(Math.abs(rows.reduce((sum,row)=>sum+row.titlePct,0)-1)<1e-10);
  for(let seed=0;seed<3;seed++) assert.ok(Math.abs(rows.reduce((sum,row)=>sum+row.seedPct[seed],0)-1)<1e-10);
  assert.deepEqual(rows,desk.playoffEquity({...input,games:[input.games[0]]}));
  assert.equal(desk.playoffEquity({...input,sims:0})[0].samples,1);
});

test('odds sensitivity scales future observations only and clamps unsafe multipliers', () => {
  const input={sims:100,seed:9,playoffTeams:1,teams:[{id:1,name:'A',wins:0,pf:0,scores:[100]},{id:2,name:'B',wins:0,pf:0,scores:[105]}],games:[{week:1,a:1,b:2}]};
  assert.equal(desk.playoffEquity(input).find(row=>row.id===1).playoffPct,0);
  const better=desk.playoffEquity({...input,adjustments:{1:1.1}}).find(row=>row.id===1);
  assert.equal(better.playoffPct,1);
  assert.equal(better.meanWins,1);
  assert.equal(desk.playoffEquity({...input,adjustments:{1:99}}).find(row=>row.id===1).multiplier,1.5);
  assert.equal(desk.playoffEquity({...input,adjustments:false}).find(row=>row.id===1).multiplier,1);
  assert.deepEqual(input.teams[0].scores,[100]);
});

test('exact standings ties use seeded random resolution rather than alphabetical certainty', () => {
  const rows=desk.playoffEquity({sims:500,seed:4,playoffTeams:1,teams:[{id:1,name:'Alpha',scores:[100]},{id:2,name:'Zulu',scores:[100]}]});
  rows.forEach(row=>assert.ok(row.playoffPct>0.3&&row.playoffPct<0.7));
});

test('Fair Slate preserves final zero scores, splits ties, and excludes unpaired or unfinished rows', () => {
  const result=desk.fairSchedule([
    {week:1,rows:[{id:1,name:'A',matchupId:1,points:0},{id:2,name:'B',matchupId:1,points:0},{id:3,name:'Unpaired',matchupId:2,points:100}]},
    {week:2,status:'live',rows:[{id:1,matchupId:1,points:100},{id:2,matchupId:1,points:0}]},
    {week:3,rows:[{id:1,matchupId:1,points:20},{id:2,matchupId:1,points:null}]}
  ]);
  assert.equal(result.length,2);
  result.forEach(row=>{assert.equal(row.games,1);assert.equal(row.actual,0.5);assert.equal(row.expected,0.5);assert.equal(row.points,0);assert.equal(row.weekly.length,1);});
  assert.equal(result.omittedRows,3);
  assert.equal(result.replayWeeks,1);
});

test('waiver acquisition points belong only to that owner and end at a roster exit', () => {
  const roster=(manager,ids,points)=>({manager,playerIds:ids,starters:points==null?[]:[{id:'p',points}]});
  const result=desk.waiverAutopsy({transactions:[{transactionId:'one',week:2,manager:'A',adds:[{id:'p',name:'Player'}]}],weeks:[
    {week:2,rosters:[roster('A',['p'],10),roster('B',[],null)]},
    {week:3,rosters:[roster('A',[],null),roster('B',['p'],80)]},
    {week:4,rosters:[roster('A',['p'],90),roster('B',[],null)]}
  ]});
  assert.equal(result.hits[0].points,10);
  assert.equal(result.hits[0].starts,1);
});

test('waiver re-additions, trades and duplicate records cannot double-count acquisition production', () => {
  const result=desk.waiverAutopsy({transactions:[
    {transactionId:'one',week:2,manager:'A',adds:[{id:'p',name:'Player'}]},
    {transactionId:'one',week:2,manager:'A',adds:[{id:'p',name:'Player'}]},
    {transactionId:'two',week:3,manager:'A',drops:[{id:'p',name:'Player'}]},
    {transactionId:'three',week:4,manager:'A',adds:[{id:'p',name:'Player'}],type:'trade'}
  ],weeks:[2,3,4,5].map(week=>({week,rosters:[{manager:'A',playerIds:week===3?[]:['p'],starters:week===3?[]:[{id:'p',points:week*10}]}]}))});
  assert.equal(result.transactions,3);
  assert.deepEqual(result.hits.map(row=>row.points).sort((a,b)=>a-b),[20,90]);
  assert.equal(result.hits.find(row=>row.week===4).type,'trade');
  assert.equal(result.hits.reduce((sum,row)=>sum+row.starts,0),3);
});

test('waiver subsequent-week mode excludes post-game acquisition week and unknown is not a miss', () => {
  const transactions=[{week:2,manager:'A',adds:[{id:'p',name:'Player'}]}];
  const weeks=[{week:2,rosters:[{manager:'A',playerIds:['p'],starters:[{id:'p',points:90}]}]},{week:3,rosters:[{manager:'A',playerIds:['p'],starters:[{id:'p',points:7}]}]}];
  const result=desk.waiverAutopsy({transactions,weeks,includeAcquisitionWeek:false});
  assert.equal(result.hits[0].points,7);
  assert.equal(result.hits[0].fromWeek,3);
  const unknown=desk.waiverAutopsy({transactions,weeks:[weeks[0]],includeAcquisitionWeek:false});
  assert.equal(unknown.misses.length,0);
  assert.equal(unknown.unknown.length,1);
});

test('waiver same-week drop and re-add ambiguity does not credit the earlier tenure', () => {
  const result=desk.waiverAutopsy({transactions:[
    {transactionId:'1',week:2,manager:'A',completedAt:10,adds:[{id:'p',name:'P'}]},
    {transactionId:'2',week:2,manager:'A',completedAt:20,drops:[{id:'p',name:'P'}]},
    {transactionId:'3',week:2,manager:'A',completedAt:30,adds:[{id:'p',name:'P'}]}
  ],weeks:[{week:2,rosters:[{manager:'A',playerIds:['p'],starters:[{id:'p',points:18}]}]}]});
  assert.equal(result.hits.length,1);
  assert.equal(result.hits[0].points,18);
  assert.equal(result.unknown.length,1);
});

test('draft ownership compares roster IDs safely and never interprets missing rosters as gone', () => {
  const picks=[{playerId:'1',rosterId:1,name:'Keeper',keeper:true,round:1,manager:'A'},{playerId:'2',rosterId:1,name:'Unknown',round:2,manager:'A'}];
  assert.equal(desk.draftGraveyard({picks,rosters:[]}).gone,0);
  assert.equal(desk.draftGraveyard({picks,rosters:[]}).unknown,2);
  const partial=desk.draftGraveyard({picks,rosters:[{rosterId:'1',manager:'A',playerIds:['1']}],ownershipComplete:false});
  assert.equal(partial.kept,1);
  assert.equal(partial.unknown,1);
  assert.equal(partial.picks[0].keeper,true);
  const conflict=desk.draftGraveyard({picks,rosters:[{rosterId:1,playerIds:['1']},{rosterId:2,playerIds:['1']}]});
  assert.equal(conflict.picks[0].status,'unknown');
});

test('rivalry joins exact identities and only final results declare a purse winner', () => {
  const paid=[{id:'pair',week:2,a:'A',b:'B'}];
  const wrong=desk.rivalrySeries({paid,results:[{id:'pair',week:2,a:'C',b:'D',scoreA:90,scoreB:80,status:'final'}]});
  assert.equal(wrong[0].season,null);
  const live=desk.rivalrySeries({paid,results:[{id:'pair',week:2,a:'B',b:'A',scoreA:'80',scoreB:'90',status:'provisional'}]});
  assert.equal(live[0].season.leader,'A');
  assert.equal(live[0].season.winner,null);
  assert.equal(live[0].season.settled,false);
});

test('fingerprints reject non-finite data, small-sample certainty and unpaired close games', () => {
  const rows=desk.fingerprints({managers:[{name:'Empty'},{name:'One'},{name:'Bad'},{name:'Zero'}],weeks:[
    {week:1,rows:[{name:'One',points:100,matchupId:null},{name:'Bad',points:'broken',matchupId:null},{name:'Zero',points:0,matchupId:null}]},
    {week:2,rows:[{name:'Bad',points:Infinity},{name:'Zero',points:0}]}
  ]});
  const byName=Object.fromEntries(rows.map(row=>[row.name,row]));
  assert.equal(byName.Empty.label,'Unscored');
  assert.equal(byName.One.label,'Small sample');
  assert.equal(byName.One.sd,null);
  assert.equal(byName.One.cv,null);
  assert.equal(byName.One.closeGames,0);
  assert.equal(byName.Bad.games,0);
  assert.equal(byName.Zero.cv,null);
  assert.equal(byName.Zero.mean,0);
  assert.equal(byName.One.percentiles.scoring,null);
});

test('fingerprint percentiles preserve equal profiles and close-game ties honestly', () => {
  const rows=desk.fingerprints({weeks:Array.from({length:6},(_,index)=>({week:index+1,rows:[{name:'A',matchupId:1,points:100},{name:'B',matchupId:1,points:100}]}))});
  rows.forEach(row=>{
    assert.equal(row.label,'Steady');
    assert.equal(row.cv,0);
    assert.equal(row.closeTies,6);
    assert.equal(row.closeRate,0.5);
    assert.equal(row.percentiles.scoring,0.5);
    assert.equal(row.percentiles.consistency,0.5);
    assert.equal(row.percentiles.finish,0.5);
    assert.equal(row.percentileCohorts.scoring,2);
    assert.match(row.summary,/Weekly swing 0%/);
  });
});
