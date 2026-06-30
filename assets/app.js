/* Farmhood Fantasy — shared chrome + page renderers. Reads window.LEAGUE. */
const L = window.LEAGUE;
const $ = (s,r=document)=>r.querySelector(s);
const el = (t,c,h)=>{const e=document.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e;};
const f1 = n => n.toFixed(1);
const rings = n => n>0 ? '★'.repeat(n) : '';
const winPct = m => (m.wins/(m.wins+m.losses));
const pct = v => (v*100).toFixed(1)+'%';

const PAGES = [
  ['index.html','Home','home'],
  ['power-rankings.html','Power Rankings','power'],
  ['records.html','Records','records'],
  ['history.html','History','history'],
  ['story.html','The Story','story'],
  ['fun.html','Fun Stats','fun'],
  ['matchups.html','Matchups','matchups'],
];

function mountChrome(active){
  const nav = el('nav','nav');
  const inner = el('div','nav-inner');
  inner.appendChild(el('a','brand',
    `<span class="crest">F</span><span><b>Farmhood Fantasy</b><span>Est. 2019 · Private League</span></span>`)).href='index.html';
  const links = el('div','nav-links');
  PAGES.forEach(([href,label,key])=>{
    const a = el('a','link'+(key===active?' active':''),label); a.href=href; links.appendChild(a);
  });
  inner.appendChild(links); nav.appendChild(inner);
  document.body.prepend(nav);

  const foot = el('footer','',
    `<div>Farmhood Fantasy · 7 seasons (2019–2025) · Data from the Sleeper API</div>
     <div><span class="ok">✓ verified</span> · 596W=596L · sanitized</div>`);
  document.body.appendChild(foot);
}

function medalRank(i){
  const cls = i===0?'rank g1':i===1?'rank g2':i===2?'rank g3':'rank';
  return `<span class="${cls}">${i+1}</span>`;
}

/* ---------- HOME ---------- */
function renderHome(){
  const m=L.meta, app=$('#app');
  const champ=L.managers.find(x=>x.name===m.reigningChampion);
  app.appendChild(el('section','hero',
    `<span class="pill">🏈 ${m.scoring} · ${m.teams} teams</span>
     <h1>The <span class="gold">Farmhood Fantasy</span><br>record book.</h1>
     <p>Seven seasons of championships, collapses, and points left on the bench — every game verified against the Sleeper API.</p>`));

  const titleLeader=[...L.managers].sort((a,b)=>b.titles-a.titles)[0];
  const pfLeader=[...L.managers].sort((a,b)=>b.pf-a.pf)[0];
  const stats=el('div','stats');
  [['k gold',m.seasonsCompleted,'Seasons'],
   ['k', L.managers.length,'Managers'],
   ['k gold',titleLeader.titles+'×','Most titles ('+titleLeader.name+')'],
   ['k blue',Math.round(pfLeader.pf).toLocaleString(),'Most pts ('+pfLeader.name+')']
  ].forEach(([c,k,l])=>{const s=el('div','stat');s.appendChild(el('div',c,k));s.appendChild(el('div','l',l));stats.appendChild(s);});
  app.appendChild(stats);

  // reigning champ
  const sec1=el('section','section');
  sec1.appendChild(el('h2','h','<span class="bar"></span>Reigning Champion'));
  sec1.appendChild(el('div','champ-card',
    `<div class="trophy">🏆</div>
     <div style="flex:1">
       <div class="yr">2025 CHAMPION</div>
       <div class="who">${champ.name}</div>
       <div class="meta" style="color:var(--muted)">${champ.titles}× champion · ${champ.wins}-${champ.losses} all-time · ${rings(champ.titles)}</div>
     </div>`));
  app.appendChild(sec1);

  // title leaderboard
  const winners=L.managers.filter(x=>x.titles>0).sort((a,b)=>b.titles-a.titles||b.wins-a.wins);
  const sec2=el('section','section');
  sec2.appendChild(el('h2','h','<span class="bar"></span>Title Count'));
  const tc=el('div','tablecard'); const t=el('table','tbl');
  t.innerHTML='<thead><tr><th>Manager</th><th>Rings</th><th class="r">Years</th></tr></thead>';
  const tb=el('tbody');
  winners.forEach(w=>{
    tb.appendChild(el('tr','',
      `<td><span class="who-name">${w.name}</span></td>
       <td><span class="rings">${rings(w.titles)}</span></td>
       <td class="r mono" style="color:var(--muted)">${w.titleYears.join(', ')}</td>`));
  });
  t.appendChild(tb); tc.appendChild(t); sec2.appendChild(tc); app.appendChild(sec2);

  // all-time records strip (once backfill has run)
  if(L.allTime){
    const A=L.allTime, hw=A.highest_weeks[0], b=A.biggest_blowout, lk=A.luck[0], mo=motwLeaders(A);
    const secR=el('section','section');
    secR.appendChild(el('h2','h','<span class="bar"></span>League Records'));
    const gr=el('div','grid g2');
    [['📈 Highest week ever',`${hw.name} · ${hw.pts.toFixed(1)}`,`${hw.season}, Week ${hw.week}`],
     ['💥 Biggest blowout ever',`+${b.margin}`,`${b.winner} over ${b.loser}, ${b.season}`],
     ['🍀 Luckiest manager',`${lk.name} (+${lk.luck})`,'wins above expected, all-time'],
     ['🎯 Most weekly highs',`${mo.names}`,`${mo.count}× Manager of the Week`]
    ].forEach(([t,v,m])=>gr.appendChild(el('a','card hover',
      `<div class="meta" style="font-size:12px;font-weight:700;color:var(--blue-2)">${t}</div>
       <div class="big" style="font-size:22px;margin:5px 0 2px">${v}</div><div class="meta">${m}</div>`)).href='fun.html');
    secR.appendChild(gr);app.appendChild(secR);
  }

  // quick links
  const sec3=el('section','section');
  sec3.appendChild(el('h2','h','<span class="bar"></span>Explore'));
  const g=el('div','grid g3');
  [['power-rankings.html','📊 Power Rankings','All-time strength index, weighted by win %, rings & scoring.'],
   ['records.html','📚 Records','Every all-time leaderboard — wins, points, win %.'],
   ['history.html','🏆 History','Champion by champion, 2019 to today.'],
   ['fun.html','🎲 Fun Stats','Luck index, blowouts, manager of the week.'],
   ['matchups.html','📅 Matchups','Week-by-week scores from the latest season.'],
   ['#','🔮 2026 — coming','Draft pending. Weekly sync turns on at kickoff.']
  ].forEach(([h,ti,d])=>{
    const c=el('a','card hover',`<h3>${ti}</h3><div class="meta">${d}</div>`);c.href=h;g.appendChild(c);
  });
  sec3.appendChild(g); app.appendChild(sec3);
}

/* ---------- POWER RANKINGS ---------- */
function renderPower(){
  const app=$('#app');
  app.appendChild(header('All-Time Power Index','Power Rankings',
    'A single strength score across all 7 seasons — blending win %, championships and scoring rate. Not just who won, but who was good.'));
  const ms=L.managers.map(m=>{
    const g=m.wins+m.losses, ppg=m.pf/g, wp=winPct(m);
    return {...m,g,ppg,wp};
  });
  const avgPpg=ms.reduce((s,m)=>s+m.ppg,0)/ms.length;
  ms.forEach(m=>{ m.score = m.wp*100*0.55 + m.titles*7 + (m.ppg-avgPpg)*1.4; });
  ms.sort((a,b)=>b.score-a.score);
  const max=ms[0].score, min=ms[ms.length-1].score;
  const tc=el('div','tablecard');const t=el('table','tbl');
  t.innerHTML='<thead><tr><th>#</th><th>Manager</th><th class="r">Win %</th><th class="r">Pts/Gm</th><th class="r">Rings</th><th class="r">Power</th></tr></thead>';
  const tb=el('tbody');
  ms.forEach((m,i)=>{
    const w=((m.score-min)/(max-min))*100;
    tb.appendChild(el('tr','',
      `<td>${medalRank(i)}</td>
       <td><span class="who-name">${m.name}</span> ${m.titles?'<span class="rings">'+rings(m.titles)+'</span>':''}</td>
       <td class="r mono">${pct(m.wp)}</td>
       <td class="r mono">${f1(m.ppg)}</td>
       <td class="r mono" style="color:var(--muted)">${m.titles||'–'}</td>
       <td class="r"><div style="display:flex;align-items:center;gap:10px;justify-content:flex-end">
         <div class="bar-track" style="width:90px"><div class="bar-fill gold" style="width:${w.toFixed(0)}%"></div></div>
         <b class="mono" style="color:var(--gold);min-width:42px;display:inline-block">${m.score.toFixed(1)}</b></div></td>`));
  });
  t.appendChild(tb);tc.appendChild(t);app.appendChild(tc);
  app.appendChild(el('div','note',`Formula: <b>55%</b> career win-rate + <b>7 pts</b> per championship + scoring rate vs. league average. Pts/Gm normalizes the 13- and 14-game seasons.`)).style.marginTop='16px';
}

/* ---------- RECORDS ---------- */
function renderRecords(){
  const app=$('#app');
  app.appendChild(header('All-Time Records','Records',
    'The complete ledger across 2019–2025. Sortable, head-to-head verified (596 wins = 596 losses).'));
  // main standings
  const ms=[...L.managers].sort((a,b)=>b.wins-a.wins||b.pf-a.pf);
  const sec=el('section','');
  const tc=el('div','tablecard');const t=el('table','tbl');
  t.innerHTML='<thead><tr><th>#</th><th>Manager</th><th class="r">W</th><th class="r">L</th><th class="r">Win %</th><th class="r">Points For</th><th class="r">Titles</th></tr></thead>';
  const tb=el('tbody');
  ms.forEach((m,i)=>{
    tb.appendChild(el('tr','',
      `<td>${medalRank(i)}</td>
       <td><span class="who-name">${m.name}</span></td>
       <td class="r mono pos">${m.wins}</td>
       <td class="r mono" style="color:var(--muted)">${m.losses}</td>
       <td class="r mono">${pct(winPct(m))}</td>
       <td class="r mono">${m.pf.toLocaleString(undefined,{minimumFractionDigits:1,maximumFractionDigits:1})}</td>
       <td class="r"><span class="rings">${rings(m.titles)||'<span style=color:var(--muted-2)>–</span>'}</span></td>`));
  });
  t.appendChild(tb);tc.appendChild(t);sec.appendChild(tc);app.appendChild(sec);

  // record cards
  const wins=ms[0], pf=[...ms].sort((a,b)=>b.pf-a.pf)[0],
        wp=[...ms].sort((a,b)=>winPct(b)-winPct(a))[0],
        titles=[...ms].sort((a,b)=>b.titles-a.titles)[0];
  const sec2=el('section','section');
  sec2.appendChild(el('h2','h','<span class="bar"></span>Record Holders'));
  const g=el('div','grid g2');
  [['Most Wins',wins.name,wins.wins+' career wins','gold'],
   ['Most Points',pf.name,Math.round(pf.pf).toLocaleString()+' all-time','blue'],
   ['Best Win %',wp.name,pct(winPct(wp))+' · still ringless','gold'],
   ['Most Titles',titles.name,titles.titles+' championships','blue']
  ].forEach(([t1,who,meta,col])=>{
    g.appendChild(el('div','card',
      `<div class="meta" style="text-transform:uppercase;letter-spacing:1px;font-size:11px;font-weight:700;color:var(--${col==='gold'?'gold':'blue-2'})">${t1}</div>
       <div class="big" style="margin:6px 0 2px">${who}</div>
       <div class="meta">${meta}</div>`));
  });
  sec2.appendChild(g);app.appendChild(sec2);

  // single-season notes
  const sec3=el('section','section');
  const A=L.allTime;
  sec3.appendChild(el('h2','h',`<span class="bar"></span>${A?'All-Time':'Single-Season'} Marks`));
  const g3=el('div','grid g3');
  const hw=A?A.highest_weeks[0]:{name:'maco71',pts:177.1,season:2025,week:8};
  const lw=A?A.lowest_weeks[0]:{name:'Siccboi',pts:57.6,season:2025,week:7};
  const bl=A?A.biggest_blowout:{winner:'maco71',loser:'cuch',margin:90.8,season:2025};
  [['Best record','Blumbo 11-2','2019 (inaugural)'],
   ['Most points (season)','maco71 1,827','2025'],
   ['Highest single week',`${hw.name} ${(+hw.pts).toFixed(1)}`,`${hw.season} · Week ${hw.week}`],
   ['Worst record','turi70 2-12','2025'],
   ['Lowest single week',`${lw.name} ${(+lw.pts).toFixed(1)}`,`${lw.season} · Week ${lw.week}`],
   ['Biggest blowout',`+${bl.margin}`,`${bl.winner} over ${bl.loser}, ${bl.season}`]
  ].forEach(([t1,v,m])=>{
    g3.appendChild(el('div','card',`<h3>${t1}</h3><div class="big" style="font-size:24px;margin:4px 0">${v}</div><div class="meta">${m}</div>`));
  });
  sec3.appendChild(g3);app.appendChild(sec3);
  app.appendChild(el('div','note', A
    ? `Marks span all 7 seasons (2019–2025). Two managers from the 14-team 2019–2020 era are omitted from the active leaderboard.`
    : `Two managers played only the 14-team 2019–2020 era and are omitted. Single-week marks reflect 2025 until <b>scripts/backfill.py</b> pulls older weekly data.`)).style.marginTop='16px';
}

/* ---------- HISTORY ---------- */
function renderHistory(){
  const app=$('#app');
  app.appendChild(header('League History','History','Champion by champion, from the 2019 inaugural season to today.'));
  const years=Object.keys(L.seasonResults).map(Number).sort((a,b)=>b-a);
  const sec=el('section','');
  years.forEach(y=>{
    const s=L.seasonResults[y]; const champ=s.champion;
    const c=el('div','champ-card');c.style.marginBottom='14px';
    c.innerHTML=`<div class="trophy">🏆</div>
      <div style="flex:1">
        <div class="yr">${y} · ${s.teams} TEAMS · ${s.games} GAMES</div>
        <div class="who">${champ}</div>
        <div class="meta" style="color:var(--muted);margin-top:3px">${s.runnerNote}</div>
      </div>
      <div style="text-align:right" class="mono">
        <div class="badge blue" style="margin-bottom:6px">Top: ${s.topRecord}</div><br>
        <span class="meta" style="color:var(--muted)">Most pts: ${s.mostPoints}</span>
      </div>`;
    sec.appendChild(c);
  });
  app.appendChild(sec);

  // dynasty timeline
  const sec2=el('section','section');
  sec2.appendChild(el('h2','h','<span class="bar"></span>Champions Timeline'));
  const tl=el('div','tablecard');const t=el('table','tbl');
  t.innerHTML='<thead><tr><th>Year</th><th>Champion</th><th class="r">Title #</th></tr></thead>';
  const tb=el('tbody');const seen={};
  years.slice().sort((a,b)=>a-b).forEach(y=>{
    const c=L.championsByYear[y]; seen[c]=(seen[c]||0)+1;
    tb.appendChild(el('tr','',
      `<td class="mono"><b>${y}</b></td>
       <td><span class="who-name">${c}</span> <span class="rings">${'★'.repeat(seen[c])}</span></td>
       <td class="r mono" style="color:var(--muted)">${seen[c]}${seen[c]===1?'st':seen[c]===2?'nd':seen[c]===3?'rd':'th'} ring</td>`));
  });
  t.appendChild(tb);tl.appendChild(t);sec2.appendChild(tl);app.appendChild(sec2);
}

/* ---------- FUN ---------- */
function renderFun(){
  const app=$('#app');
  app.appendChild(header('Fun Stats — 2025','Fun Stats',
    'Luck, blowouts and bench heartbreak from the 2025 season. Every number reconciles to the official scores.'));

  // the curse callout
  app.appendChild(el('section','','')).appendChild(el('div','callout',
    `<div class="lead">The <span class="gold">maco71</span> Curse 📉</div>
     <div class="meta" style="color:var(--muted)">Most points scored, most Manager-of-the-Week honors (4), the single highest week (177.1) — and an 8-6 finish with no title. The unluckiest team in the league by expected wins (−1.8).</div>`));

  // luck index
  const sec=el('section','section');
  sec.appendChild(el('h2','h','<span class="bar"></span>Luck Index <span class="badge muted" style="font-weight:600">actual − expected wins</span>'));
  const tc=el('div','tablecard');const t=el('table','tbl');
  t.innerHTML='<thead><tr><th>Manager</th><th class="r">Actual W</th><th class="r">Expected W</th><th class="r">Luck</th></tr></thead>';
  const tb=el('tbody');
  L.fun2025.luckIndex.forEach(x=>{
    const cls=x.luck>0.05?'pos':x.luck<-0.05?'neg':'';
    const sign=x.luck>0?'+':'';
    tb.appendChild(el('tr','',
      `<td><span class="who-name">${x.name}</span></td>
       <td class="r mono">${x.actual}</td>
       <td class="r mono" style="color:var(--muted)">${x.expected.toFixed(2)}</td>
       <td class="r mono ${cls}">${sign}${x.luck.toFixed(2)}</td>`));
  });
  t.appendChild(tb);tc.appendChild(t);sec.appendChild(tc);app.appendChild(sec);

  // blowout + closest
  const sec2=el('section','section');const g=el('div','grid g2');
  const b=L.fun2025.biggestBlowout, c=L.fun2025.closestGame;
  g.appendChild(el('div','card',
    `<div class="meta" style="text-transform:uppercase;letter-spacing:1px;font-size:11px;font-weight:700;color:var(--gold)">Biggest Blowout</div>
     <div class="big" style="margin:6px 0 2px">+${b.margin}</div>
     <div class="meta"><b>${b.winner}</b> ${b.score} over ${b.loser} · Week ${b.week}</div>`));
  g.appendChild(el('div','card',
    `<div class="meta" style="text-transform:uppercase;letter-spacing:1px;font-size:11px;font-weight:700;color:var(--blue-2)">Closest Game</div>
     <div class="big" style="margin:6px 0 2px">${c.margin}</div>
     <div class="meta"><b>${c.winner}</b> ${c.score} over ${c.loser} · Week ${c.week}</div>`));
  sec2.appendChild(g);app.appendChild(sec2);

  // highest weeks + MOTW
  const sec3=el('section','section');const g3=el('div','grid g2');
  const hi=el('div','tablecard');let h='<table class="tbl"><thead><tr><th>Top Weeks</th><th class="r">Pts</th><th class="r">Wk</th></tr></thead><tbody>';
  L.fun2025.highestWeeks.forEach(x=>h+=`<tr><td class="who-name">${x.name}</td><td class="r mono" style="color:var(--gold);font-weight:700">${x.pts.toFixed(1)}</td><td class="r mono" style="color:var(--muted)">${x.week}</td></tr>`);
  hi.innerHTML=h+'</tbody></table>';
  const mo=el('div','tablecard');let mh='<table class="tbl"><thead><tr><th>Manager of the Week</th><th class="r">Wins</th></tr></thead><tbody>';
  Object.entries(L.fun2025.motwCounts).sort((a,b)=>b[1]-a[1]).forEach(([n,c])=>{
    mh+=`<tr><td class="who-name">${n}</td><td class="r"><div style="display:flex;align-items:center;gap:10px;justify-content:flex-end"><div class="bar-track" style="width:${c*22}px"><div class="bar-fill gold" style="width:100%"></div></div><b class="mono">${c}</b></div></td></tr>`;
  });
  mo.innerHTML=mh+'</tbody></table>';
  g3.appendChild(hi);g3.appendChild(mo);sec3.appendChild(g3);
  sec3.insertBefore(el('h2','h','<span class="bar"></span>Weekly Highs & Honors'),g3);
  app.appendChild(sec3);

  if (L.allTime) renderAllTimeFun(app);
  else app.appendChild(el('div','note','🔓 All-time fun stats (2019–2025) unlock after running <b>scripts/backfill.py</b>. Showing 2025 for now.')).style.marginTop='22px';
}

function motwLeaders(A){const m=A.motw_counts;const mx=Math.max(...Object.values(m));
  return {names:Object.keys(m).filter(k=>m[k]===mx).join(' & '),count:mx};}
function mostLopsided(A){let best=null;(A.rivalries||[]).forEach(r=>{const d=Math.abs(r.a_wins-r.b_wins);
  if(!best||d>best.d||(d===best.d&&r.games<best.g))best={...r,d,g:r.games};});
  if(!best)return null;const aw=best.a_wins>best.b_wins;
  return {w:aw?best.a:best.b,l:aw?best.b:best.a,ww:Math.max(best.a_wins,best.b_wins),ll:Math.min(best.a_wins,best.b_wins)};}

function renderSuperlatives(app,A){
  const sec=el('section','section');
  sec.appendChild(el('h2','h','<span class="bar"></span>All-Time Superlatives'));
  const lk=A.luck[0],ul=A.luck[A.luck.length-1],hw=A.highest_weeks[0],
        b=A.biggest_blowout,c=A.closest_game,mo=motwLeaders(A),rv=(A.rivalries||[])[0],ml=mostLopsided(A);
  const cards=[
    ['🍀','Luckiest Ever',lk.name,`+${lk.luck} wins vs expected`],
    ['☠️','Unluckiest Ever',ul.name,`${ul.luck} wins vs expected`],
    ['🎯','Most Consistent',mo.names,`${mo.count}× Manager of the Week`],
    ['📈','Highest Week Ever',`${hw.name} · ${hw.pts.toFixed(1)}`,`${hw.season} · Week ${hw.week}`],
    ['💥','Biggest Blowout',`+${b.margin}`,`${b.winner} over ${b.loser} · ${b.season}`],
    ['🔪','Closest Game',`${c.margin} pts`,`${c.winner} edged ${c.loser} · ${c.season}`]
  ];
  if(rv) cards.push(['⚔️','Biggest Rivalry',`${rv.a} vs ${rv.b}`,`${rv.games} meetings`]);
  if(ml) cards.push(['🥊','Most Lopsided',`${ml.w} ${ml.ww}–${ml.ll} ${ml.l}`,'all-time head-to-head']);
  const g=el('div','grid g3');
  cards.forEach(([ic,lab,val,sub])=>g.appendChild(el('div','card hover',
    `<div style="font-size:22px">${ic}</div>
     <div class="meta" style="text-transform:uppercase;letter-spacing:1px;font-size:10.5px;font-weight:700;color:var(--gold);margin-top:7px">${lab}</div>
     <div class="big" style="font-size:19px;margin:3px 0;letter-spacing:-.2px">${val}</div>
     <div class="meta">${sub}</div>`)));
  sec.appendChild(g);app.appendChild(sec);
}

function renderAllTimeFun(app){
  const A=L.allTime;
  renderSuperlatives(app,A);
  const sec=el('section','section');
  sec.appendChild(el('h2','h',`<span class="bar"></span>All-Time <span class="badge gold" style="font-weight:600">${A.seasons[0]}–${A.seasons[A.seasons.length-1]}</span>`));

  // records-ever cards
  const g=el('div','grid g3');
  const hw=A.highest_weeks[0], lw=A.lowest_weeks[0], b=A.biggest_blowout;
  [['Highest week ever',`${hw.name} ${hw.pts.toFixed(1)}`,`${hw.season} · Week ${hw.week}`,'gold'],
   ['Biggest blowout ever',`+${b.margin}`,`${b.winner} over ${b.loser} · ${b.season}`,'gold'],
   ['Lowest week ever',`${lw.name} ${lw.pts.toFixed(1)}`,`${lw.season} · Week ${lw.week}`,'blue']
  ].forEach(([t,v,m,c])=>g.appendChild(el('div','card',
    `<div class="meta" style="text-transform:uppercase;letter-spacing:1px;font-size:11px;font-weight:700;color:var(--${c==='gold'?'gold':'blue-2'})">${t}</div>
     <div class="big" style="font-size:24px;margin:6px 0 2px">${v}</div><div class="meta">${m}</div>`)));
  sec.appendChild(g);app.appendChild(sec);

  // all-time luck
  const sec2=el('section','section');
  sec2.appendChild(el('h2','h','<span class="bar"></span>All-Time Luck Index'));
  const tc=el('div','tablecard');let h='<table class="tbl"><thead><tr><th>Manager</th><th class="r">Wins</th><th class="r">Expected</th><th class="r">Luck</th></tr></thead><tbody>';
  A.luck.forEach(x=>{const cls=x.luck>0.5?'pos':x.luck<-0.5?'neg':'';const s=x.luck>0?'+':'';
    h+=`<tr><td class="who-name">${x.name}</td><td class="r mono">${x.actual}</td><td class="r mono" style="color:var(--muted)">${x.expected.toFixed(1)}</td><td class="r mono ${cls}">${s}${x.luck.toFixed(1)}</td></tr>`;});
  tc.innerHTML=h+'</tbody></table>';sec2.appendChild(tc);app.appendChild(sec2);

  // rivalries
  if(A.rivalries&&A.rivalries.length){
    const sec3=el('section','section');
    sec3.appendChild(el('h2','h','<span class="bar"></span>Biggest Rivalries <span class="badge muted" style="font-weight:600">most meetings</span>'));
    const tc3=el('div','tablecard');let r='<table class="tbl"><thead><tr><th>Matchup</th><th class="r">Series</th><th class="r">Games</th></tr></thead><tbody>';
    A.rivalries.slice(0,10).forEach(x=>{
      const lead=x.a_wins===x.b_wins?'even':(x.a_wins>x.b_wins?x.a:x.b);
      r+=`<tr><td class="who-name">${x.a} <span style="color:var(--muted-2)">vs</span> ${x.b}</td>
          <td class="r mono">${x.a_wins}–${x.b_wins} <span style="color:var(--muted)">${lead==='even'?'(even)':''}</span></td>
          <td class="r mono" style="color:var(--muted)">${x.games}</td></tr>`;});
    tc3.innerHTML=r+'</tbody></table>';sec3.appendChild(tc3);app.appendChild(sec3);
  }
  app.appendChild(el('div','note','All-time fun stats are derived from weekly scores. Older seasons can differ from the official record by about a game — Sleeper retroactively corrects old player scores, which occasionally flips a close result.')).style.marginTop='16px';
}

/* ---------- MATCHUPS ---------- */
function renderMatchups(){
  const app=$('#app');
  app.appendChild(header('Weekly Matchups','Matchups',
    'Week-by-week scores. The 2026 season is pre-draft — showing the full 2025 season below.'));
  app.appendChild(el('div','note','🔮 2026 hasn’t kicked off yet (pre-draft). Live weekly sync turns on automatically at Week 1. Showing 2025 results.')).style.marginBottom='20px';

  const sel=el('div','weeksel');
  const board=el('div','');
  const weeks=Object.keys(L.weekly2025).map(Number).sort((a,b)=>a-b);
  weeks.forEach(w=>{const b=el('button',w===14?'on':'',w);b.onclick=()=>{[...sel.children].forEach(x=>x.classList.remove('on'));b.classList.add('on');drawWeek(w,board);};sel.appendChild(b);});
  app.appendChild(sel);app.appendChild(board);
  drawWeek(14,board);

  // final standings
  const sec=el('section','section');
  sec.appendChild(el('h2','h','<span class="bar"></span>2025 Final Standings'));
  const tc=el('div','tablecard');const t=el('table','tbl');
  t.innerHTML='<thead><tr><th>#</th><th>Manager</th><th class="r">W-L</th><th class="r">Points For</th></tr></thead>';
  const tb=el('tbody');
  L.standings2025.forEach((s,i)=>{
    tb.appendChild(el('tr','',
      `<td>${medalRank(i)}</td>
       <td><span class="who-name">${s.name}</span> ${s.champ?'<span class="badge gold">🏆 Champ</span>':''}</td>
       <td class="r mono">${s.w}-${s.l}</td>
       <td class="r mono">${s.pf.toFixed(1)}</td>`));
  });
  t.appendChild(tb);tc.appendChild(t);sec.appendChild(tc);app.appendChild(sec);
}
function drawWeek(w,board){
  board.innerHTML='';
  const rows=L.weekly2025[w], names=L.names2025;
  const by={};rows.forEach(([r,m,p])=>{(by[m]=by[m]||[]).push([r,p]);});
  board.appendChild(el('h2','h',`<span class="bar"></span>Week ${w}`));
  Object.values(by).forEach(([[ra,pa],[rb,pb]])=>{
    const aw=pa>pb;
    const row=el('div','mw');
    row.innerHTML=
      `<div class="side ${aw?'w':'l'}"><span class="nm">${names[ra]}</span><span class="sc">${pa.toFixed(1)}</span></div>
       <span class="vs">VS</span>
       <div class="side right ${!aw?'w':'l'}"><span class="nm">${names[rb]}</span><span class="sc">${pb.toFixed(1)}</span></div>`;
    board.appendChild(row);
  });
}

/* ---------- STORY ---------- */
function renderStory(){
  const app=$('#app');
  app.appendChild(header('The Story of Farmhood Fantasy','The Story',
    'Seven seasons of dynasties, collapses, and the cruelest rule in fantasy: the best team rarely wins. Every storyline below is drawn from the verified record.'));

  const tl=el('section','section');
  L.stories.forEach((s,i)=>{
    const champ=L.managers.find(m=>m.name===s.champion);
    const ringTxt = champ && champ.titles>1 ? `${rings(champ.titles)} (career)` : 'Champion';
    const card=el('article','storycard');
    card.innerHTML=
      `<div class="story-rail"><span class="story-year">${s.year}</span>
         <span class="story-dot"></span></div>
       <div class="story-body">
         <div class="story-meta">
           <span class="badge gold">🏆 ${s.champion}</span>
           <span class="badge muted">${s.teams} teams</span>
           ${s.tags.map(t=>`<span class="badge blue">${t}</span>`).join('')}
         </div>
         <h3 class="story-head">${s.headline}</h3>
         <p class="story-text">${s.body}</p>
       </div>`;
    tl.appendChild(card);
  });
  app.appendChild(tl);

  const sec=el('section','section');
  sec.appendChild(el('h2','h','<span class="bar"></span>Recurring Storylines'));
  const g=el('div','grid g2');
  L.throughlines.forEach(t=>{
    g.appendChild(el('div','card',
      `<div style="font-size:26px;margin-bottom:8px">${t.icon}</div>
       <h3 style="font-size:17px;color:var(--gold);margin-bottom:6px">${t.title}</h3>
       <div class="meta" style="color:var(--muted);line-height:1.6">${t.text}</div>`));
  });
  sec.appendChild(g);app.appendChild(sec);

  if(L.oddities){
    const so=el('section','section');
    so.appendChild(el('h2','h','<span class="bar"></span>All-Time Oddities'));
    const go=el('div','grid g2');
    L.oddities.forEach(o=>go.appendChild(el('div','card',
      `<div style="font-size:26px;margin-bottom:8px">${o.icon}</div>
       <h3 style="font-size:17px;color:var(--gold);margin-bottom:6px">${o.title}</h3>
       <div class="meta" style="color:var(--muted);line-height:1.6">${o.text}</div>`)));
    so.appendChild(go);app.appendChild(so);
  }
}

function header(title,eyebrow,sub){
  const s=el('section','');
  s.innerHTML=`<div class="eyebrow">${eyebrow}</div><h1 class="title">${title}</h1><p class="sub">${sub}</p>`;
  return s;
}
