/* Farmhood Fantasy — shared chrome + page renderers. Reads window.LEAGUE. */
const L = window.LEAGUE;
const $ = (s,r=document)=>r.querySelector(s);
const el = (t,c,h)=>{const e=document.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e;};
const f1 = n => n.toFixed(1);
const rings = n => n>0 ? '★'.repeat(n) : '';
const winPct = m => (m.wins/(m.wins+m.losses));
const pct = v => (v*100).toFixed(1)+'%';
// Championships span the full league history (Founders 2014-2018 + Sleeper 2019-2025)
const championsAll = () => Object.assign({}, L.foundersChampions||{}, L.championsByYear||{});
const titleCounts = () => { const c={}; Object.values(championsAll()).forEach(n=>{c[n]=(c[n]||0)+1;}); return c; };
const titlesOf = name => titleCounts()[name]||0;
const titleYearsOf = name => { const a=championsAll(); return Object.keys(a).filter(y=>a[y]===name).map(Number).sort((x,y)=>x-y); };

const PAGES = [
  ['index.html','Home','home'],
  ['managers.html','Managers','managers'],
  ['power-rankings.html','Power Rankings','power'],
  ['records.html','Records','records'],
  ['history.html','History','history'],
  ['story.html','The Story','story'],
  ['draft.html','Draft','draft'],
  ['trades.html','Trades','trades'],
  ['fun.html','Fun Stats','fun'],
  ['matchups.html','Matchups','matchups'],
];

function mountChrome(active){
  // favicon (SVG logo), injected once
  if(document.head && typeof document.createElement==='function'){
    const l=document.createElement('link');l.rel='icon';l.type='image/jpeg';l.href='assets/logo.jpg';document.head.appendChild(l);
  }
  const nav = el('nav','nav');
  const inner = el('div','nav-inner');
  inner.appendChild(el('a','brand',
    `<img class="crest-img" src="assets/logo.jpg" alt="Farmwood"><span><b>Farmhood Fantasy</b><span>Est. 2014 · Private League</span></span>`)).href='index.html';
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
  easterEgg();
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

  const titleLeader=[...L.managers].sort((a,b)=>titlesOf(b.name)-titlesOf(a.name))[0];
  const pfLeader=[...L.managers].sort((a,b)=>b.pf-a.pf)[0];
  const totalSeasons=Object.keys(championsAll()).length;
  const cu=(n,suf)=>`<span class="countup" data-to="${n}"${suf?` data-suffix="${suf}"`:''}>0</span>`;
  const stats=el('div','stats');
  [['k gold',cu(totalSeasons),'Seasons (since 2014)'],
   ['k', cu(L.managers.length),'Managers'],
   ['k gold',cu(titlesOf(titleLeader.name),'×'),'Most titles ('+titleLeader.name+')'],
   ['k blue',cu(Math.round(pfLeader.pf)),'Most pts ('+pfLeader.name+')']
  ].forEach(([c,k,l])=>{const s=el('div','stat');s.appendChild(el('div',c,k));s.appendChild(el('div','l',l));stats.appendChild(s);});
  app.appendChild(stats);

  // Stat of the Day
  const sod=statOfTheDay();
  app.appendChild(el('div','sotd',`<span class="sotd-tag">📅 Stat of the Day</span><span class="sotd-txt">${sod}</span>`)).style.marginTop='16px';

  // reigning champ
  const sec1=el('section','section');
  sec1.appendChild(el('h2','h','<span class="bar"></span>Reigning Champion'));
  sec1.appendChild(el('div','champ-card',
    `${avatarImg(champ.name,58)}
     <div style="flex:1">
       <div class="yr">2025 CHAMPION 🏆</div>
       <div class="who">${champ.name}</div>
       <div class="meta" style="color:var(--muted)">${titlesOf(champ.name)}× champion · ${champ.wins}-${champ.losses} all-time · ${rings(titlesOf(champ.name))}</div>
     </div>`));
  app.appendChild(sec1);

  // title leaderboard
  const tcnt=titleCounts();
  const winners=Object.keys(tcnt).sort((a,b)=>tcnt[b]-tcnt[a]||titleYearsOf(a)[0]-titleYearsOf(b)[0]);
  const sec2=el('section','section');
  sec2.appendChild(el('h2','h','<span class="bar"></span>Title Count <span class="badge muted" style="font-weight:600">since 2014</span>'));
  const tc=el('div','tablecard'); const t=el('table','tbl');
  t.innerHTML='<thead><tr><th>Manager</th><th>Rings</th><th class="r">Years</th></tr></thead>';
  const tb=el('tbody');
  winners.forEach(w=>{
    const former=(L.formerChampions||[]).includes(w);
    tb.appendChild(el('tr','',
      `<td>${avatarImg(w,24)} <span class="who-name">${w}</span> ${former?'<span class="badge muted" style="font-weight:600">Founders Era</span>':''}</td>
       <td><span class="rings">${rings(tcnt[w])}</span></td>
       <td class="r mono" style="color:var(--muted)">${titleYearsOf(w).join(', ')}</td>`));
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
  animateCounts();
}

/* ---------- PLAYFUL POLISH ---------- */
function statOfTheDay(){
  const A=L.allTime, f=[
    "martinch94 owns 3 of the last 6 titles — the league's only dynasty.",
    "maco71 has the 2nd-most points in league history and zero championships.",
    "vpitello34 has the best all-time win % (.558) and has never won it all.",
    "Four straight years the best regular-season team failed to win the title.",
    "pgorny is the all-time points leader AND a back-to-back champion (2022–23).",
    "Blumbo won the very first season (2019) going 11-2 wire-to-wire.",
    "akaaashh is tied for the most Manager-of-the-Week honors in league history.",
    "turi70 once won the closest game ever (0.18) and lost the biggest blowout ever — same season.",
    "Archibaldo is the unluckiest manager ever by expected wins, despite scoring like a contender."
  ];
  if(A){
    if(A.highest_weeks&&A.highest_weeks[0]) f.push(`The highest single week ever: ${A.highest_weeks[0].name} dropped ${A.highest_weeks[0].pts.toFixed(1)} in ${A.highest_weeks[0].season}.`);
    if(A.biggest_blowout) f.push(`The biggest blowout ever: ${A.biggest_blowout.winner} beat ${A.biggest_blowout.loser} by ${A.biggest_blowout.margin} in ${A.biggest_blowout.season}.`);
  }
  const d=new Date(), doy=Math.floor((d-new Date(d.getFullYear(),0,0))/864e5);
  return f[doy%f.length];
}
function animateCounts(){
  if(typeof document.querySelectorAll!=='function'||typeof requestAnimationFrame==='undefined')return;
  document.querySelectorAll('.countup').forEach(node=>{
    const to=+node.getAttribute('data-to'), suf=node.getAttribute('data-suffix')||'', t0=performance.now(), dur=950;
    (function step(t){const p=Math.min(1,(t-t0)/dur), e=1-Math.pow(1-p,3);
      node.textContent=Math.round(to*e).toLocaleString()+suf;
      if(p<1)requestAnimationFrame(step);})(t0);
  });
}
function easterEgg(){
  if(typeof document.addEventListener!=='function')return;
  const seq=['arrowup','arrowup','arrowdown','arrowdown','arrowleft','arrowright','arrowleft','arrowright','b','a'];let i=0;
  document.addEventListener('keydown',e=>{
    i = (e.key&&e.key.toLowerCase()===seq[i]) ? i+1 : 0;
    if(i===seq.length){i=0;showToast('🏆 DYNASTY MODE UNLOCKED — martinch94 nods approvingly');}
  });
}
function showToast(msg){
  if(typeof document.createElement!=='function'||!document.body)return;
  const t=document.createElement('div');t.className='toast';t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>{if(t.parentNode)t.parentNode.removeChild(t);},3200);
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
  ms.forEach(m=>{ m.score = m.wp*100*0.55 + titlesOf(m.name)*7 + (m.ppg-avgPpg)*1.4; });
  ms.sort((a,b)=>b.score-a.score);
  const max=ms[0].score, min=ms[ms.length-1].score;
  const tc=el('div','tablecard');const t=el('table','tbl');
  t.innerHTML='<thead><tr><th>#</th><th>Manager</th><th class="r">Win %</th><th class="r">Pts/Gm</th><th class="r">Rings</th><th class="r">Power</th></tr></thead>';
  const tb=el('tbody');
  ms.forEach((m,i)=>{
    const w=((m.score-min)/(max-min))*100;
    tb.appendChild(el('tr','',
      `<td>${medalRank(i)}</td>
       <td><span class="who-name">${m.name}</span> ${titlesOf(m.name)?'<span class="rings">'+rings(titlesOf(m.name))+'</span>':''}</td>
       <td class="r mono">${pct(m.wp)}</td>
       <td class="r mono">${f1(m.ppg)}</td>
       <td class="r mono" style="color:var(--muted)">${titlesOf(m.name)||'–'}</td>
       <td class="r"><div style="display:flex;align-items:center;gap:10px;justify-content:flex-end">
         <div class="bar-track" style="width:90px"><div class="bar-fill gold" style="width:${w.toFixed(0)}%"></div></div>
         <b class="mono" style="color:var(--gold);min-width:42px;display:inline-block">${m.score.toFixed(1)}</b></div></td>`));
  });
  t.appendChild(tb);tc.appendChild(t);app.appendChild(tc);

  // power index chart — gold = has a ring, blue = ringless
  drawBar(chartCanvas(app,'Power Index, Visualized',380),
    ms.map(m=>m.name), ms.map(m=>+m.score.toFixed(1)),
    ms.map(m=>m.titles>0?'#F2C24B':'#3D6BFF'), true);
  app.appendChild(el('div','note',`<span style="color:var(--gold)">●</span> champion &nbsp; <span style="color:var(--blue-2)">●</span> ringless &nbsp;·&nbsp; Formula: <b>55%</b> career win-rate + <b>7 pts</b> per championship + scoring rate vs. league average. Pts/Gm normalizes the 13- and 14-game seasons.`)).style.marginTop='16px';
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
       <td class="r"><span class="rings">${rings(titlesOf(m.name))||'<span style=color:var(--muted-2)>–</span>'}</span></td>`));
  });
  t.appendChild(tb);tc.appendChild(t);sec.appendChild(tc);app.appendChild(sec);

  // record cards
  const wins=ms[0], pf=[...ms].sort((a,b)=>b.pf-a.pf)[0],
        wp=[...ms].sort((a,b)=>winPct(b)-winPct(a))[0],
        titles=[...ms].sort((a,b)=>titlesOf(b.name)-titlesOf(a.name))[0];
  const sec2=el('section','section');
  sec2.appendChild(el('h2','h','<span class="bar"></span>Record Holders'));
  const g=el('div','grid g2');
  [['Most Wins',wins.name,wins.wins+' career wins','gold'],
   ['Most Points',pf.name,Math.round(pf.pf).toLocaleString()+' all-time','blue'],
   ['Best Win %',wp.name,pct(winPct(wp))+(titlesOf(wp.name)?'':' · still ringless'),'gold'],
   ['Most Titles',titles.name,titlesOf(titles.name)+' championships','blue']
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
  [['Best record','Blumbo 11-2','2019 · Sleeper era'],
   ['Most points (season)','maco71 1,827','2025'],
   ['Highest single week',`${hw.name} ${(+hw.pts).toFixed(1)}`,`${hw.season} · Week ${hw.week}`],
   ['Worst record','turi70 2-12','2025'],
   ['Lowest single week',`${lw.name} ${(+lw.pts).toFixed(1)}`,`${lw.season} · Week ${lw.week}`],
   ['Biggest blowout',`+${bl.margin}`,`${bl.winner} over ${bl.loser}, ${bl.season}`]
  ].forEach(([t1,v,m])=>{
    g3.appendChild(el('div','card',`<h3>${t1}</h3><div class="big" style="font-size:24px;margin:4px 0">${v}</div><div class="meta">${m}</div>`));
  });
  sec3.appendChild(g3);app.appendChild(sec3);

  // all-time points-for chart
  const pfRank=[...L.managers].sort((a,b)=>b.pf-a.pf);
  drawBar(chartCanvas(app,'All-Time Points For',380),
    pfRank.map(m=>m.name), pfRank.map(m=>Math.round(m.pf)),
    pfRank.map(()=>'#F2C24B'), true);

  app.appendChild(el('div','note', A
    ? `Marks span all 7 seasons (2019–2025). Two managers from the 14-team 2019–2020 era are omitted from the active leaderboard.`
    : `Two managers played only the 14-team 2019–2020 era and are omitted. Single-week marks reflect 2025 until <b>scripts/backfill.py</b> pulls older weekly data.`)).style.marginTop='16px';
}

/* ---------- HISTORY ---------- */
function renderHistory(){
  const app=$('#app');
  app.appendChild(header('League History','History','A decade of Farmhood — the Founders Era (2014–2018) and the Sleeper Era (2019–present).'));
  const years=Object.keys(L.seasonResults).map(Number).sort((a,b)=>b-a);
  const sec=el('section','section');
  sec.appendChild(el('h2','h','<span class="bar"></span>Sleeper Era <span class="badge muted" style="font-weight:600">2019–present · full stats</span>'));
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

  // Founders Era — champions only
  const fsec=el('section','section');
  fsec.appendChild(el('h2','h','<span class="bar"></span>Founders Era <span class="badge muted" style="font-weight:600">2014–2018 · NFL.com · champions only</span>'));
  Object.keys(L.foundersChampions||{}).map(Number).sort((a,b)=>b-a).forEach(y=>{
    const champ=L.foundersChampions[y], former=(L.formerChampions||[]).includes(champ);
    const c=el('div','champ-card');c.style.marginBottom='14px';
    c.innerHTML=`${avatarImg(champ,44)}
      <div style="flex:1"><div class="yr">${y} CHAMPION 🏆</div>
      <div class="who">${champ}</div>
      <div class="meta" style="color:var(--muted);margin-top:3px">${former?'Founders-era champion — no longer in the league':'Won it in the NFL.com era'}</div></div>`;
    fsec.appendChild(c);
  });
  fsec.appendChild(el('div','note','The league began in 2014 on the NFL.com app and moved to Sleeper in 2019. Only champions carried over from the Founders Era — detailed stats start in 2019.'));
  app.appendChild(fsec);

  // full champions timeline (2014–present)
  const sec2=el('section','section');
  sec2.appendChild(el('h2','h','<span class="bar"></span>Champions Timeline <span class="badge muted" style="font-weight:600">since 2014</span>'));
  const tl=el('div','tablecard');const t=el('table','tbl');
  t.innerHTML='<thead><tr><th>Year</th><th>Champion</th><th class="r">Title #</th></tr></thead>';
  const tb=el('tbody');const seen={};const allC=championsAll();
  Object.keys(allC).map(Number).sort((a,b)=>a-b).forEach(y=>{
    const c=allC[y]; seen[c]=(seen[c]||0)+1;
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

  // luck chart (diverging)
  const lkSorted=[...A.luck].sort((a,b)=>a.luck-b.luck);
  drawBar(chartCanvas(app,'Luck, Visualized',380),
    lkSorted.map(x=>x.name), lkSorted.map(x=>x.luck),
    lkSorted.map(x=>x.luck>=0?'#3FD18C':'#FF6B6B'), true);

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

/* ---------- MANAGERS / PROFILES ---------- */
function avatarImg(name,size){
  size=size||44;const u=(L.avatars||{})[name]||'';const i=(name[0]||'?').toUpperCase();
  const fb=`<span class="av-fb" style="font-size:${Math.round(size*0.42)}px">${i}</span>`;
  return `<span class="av-wrap" style="width:${size}px;height:${size}px">${fb}`+
    (u?`<img class="av" src="${u}" alt="" loading="lazy" onerror="this.style.display='none'">`:'')+`</span>`;
}
function badgesFor(name){
  const m=L.managers.find(x=>x.name===name),A=L.allTime,out=[],t=titlesOf(name);
  if(t>=3) out.push(['👑','Dynasty']);
  if(t>0) out.push(['🏆',`${t}× Champion`]);
  const byWP=[...L.managers].sort((a,b)=>winPct(b)-winPct(a));
  const byPF=[...L.managers].sort((a,b)=>b.pf-a.pf);
  if(byWP[0].name===name) out.push(['🎖️','Best Win %']);
  if(byPF[0].name===name) out.push(['💰','Points King']);
  if(byWP[byWP.length-1].name===name) out.push(['🪑','Cellar Dweller']);
  if(A){
    if(A.luck[0].name===name) out.push(['🍀','Luckiest Ever']);
    if(A.luck[A.luck.length-1].name===name) out.push(['☠️','Unluckiest Ever']);
    if(motwLeaders(A).names.split(' & ').includes(name)) out.push(['🎯','Iron Manager']);
    if(A.highest_weeks[0].name===name) out.push(['📈','Highest Week Ever']);
    if(A.biggest_blowout.winner===name) out.push(['💥','Biggest Blowout']);
  }
  if(t===0 && winPct(m)>=0.5) out.push(['🥈','Bridesmaid']);
  return out;
}
function renderMoneyBoard(app){
  if(!L.winnings)return;
  const rows=Object.entries(L.winnings).sort((a,b)=>b[1]-a[1]);
  const max=rows[0][1], total=rows.reduce((s,r)=>s+r[1],0);
  const sec=el('section','section');
  sec.appendChild(el('h2','h',`<span class="bar"></span>💰 The Money Board <span class="badge" style="font-weight:600;background:rgba(63,209,140,.14);color:#5be6a8">$${total.toLocaleString()} paid out</span>`));
  const tc=el('div','tablecard');const t=el('table','tbl');
  t.innerHTML='<thead><tr><th>#</th><th>Manager</th><th class="r">All-Time Winnings</th></tr></thead>';
  const tb=el('tbody');
  rows.forEach(([n,v],i)=>{
    const mgr=L.managers.find(x=>x.name===n);
    tb.appendChild(el('tr','',
      `<td>${medalRank(i)}</td>
       <td>${avatarImg(n,28)} <span class="who-name">${n}</span> ${titlesOf(n)?'<span class="rings">'+rings(titlesOf(n))+'</span>':''}</td>
       <td class="r"><div style="display:flex;align-items:center;gap:12px;justify-content:flex-end">
         <div class="bar-track" style="width:110px"><div class="bar-fill" style="width:${(v/max*100).toFixed(0)}%;background:linear-gradient(90deg,#2f9e6a,#5be6a8)"></div></div>
         <b class="mono" style="color:#5be6a8;min-width:58px;display:inline-block">$${v.toLocaleString()}</b></div></td>`));
  });
  t.appendChild(tb);tc.appendChild(t);sec.appendChild(tc);app.appendChild(sec);
  app.appendChild(el('div','note','4-season payout totals. Pat (pgorny) leads the league\'s all-time bankroll.')).style.marginTop='14px';
}
function renderManagers(){
  const app=$('#app');
  app.appendChild(header('The Managers','Managers','Twelve managers, seven seasons. The money board, then tap anyone for their full résumé, rivalries, badges, and winnings.'));
  renderMoneyBoard(app);
  const g0=el('h2','h','<span class="bar"></span>All Managers');app.appendChild(g0);
  const ms=[...L.managers].sort((a,b)=>titlesOf(b.name)-titlesOf(a.name)||b.wins-a.wins);
  const g=el('div','mgr-grid');
  ms.forEach(m=>{
    const c=el('button','mgr-card');
    const w=(L.winnings||{})[m.name];
    c.innerHTML=`${avatarImg(m.name,68)}
      <div class="mgr-nm">${m.name}</div>
      <div class="mgr-rec">${m.wins}-${m.losses} · ${pct(winPct(m))}</div>
      <div class="rings">${rings(titlesOf(m.name))||'<span style="color:var(--muted-2);font-size:11px">no rings</span>'}</div>
      ${w!=null?`<div class="mgr-win">$${w.toLocaleString()}</div>`:''}`;
    c.onclick=()=>openProfile(m.name);
    g.appendChild(c);
  });
  app.appendChild(g);
  app.appendChild(el('div','note','Tap a manager for their full card. Avatars come straight from each owner\'s Sleeper profile.')).style.marginTop='18px';
}
function openProfile(name){
  const m=L.managers.find(x=>x.name===name),A=L.allTime;
  const win=(L.winnings||{})[name];
  const winTotal=Object.keys(L.winnings||{}).length;
  const winRank=win!=null?Object.values(L.winnings).filter(v=>v>win).length+1:null;
  const luck=A&&A.luck.find(x=>x.name===name);
  const motw=A&&A.motw_counts[name];
  const rivs=A?(A.rivalries||[]).filter(r=>r.a===name||r.b===name):[];
  const badges=badgesFor(name).map(([e,l])=>`<span class="pill-badge">${e} ${l}</span>`).join('');
  const rivRows=rivs.map(r=>{const opp=r.a===name?r.b:r.a,w=r.a===name?r.a_wins:r.b_wins,l=r.a===name?r.b_wins:r.a_wins;
    return `<tr><td>${avatarImg(opp,26)} <span class="who-name">${opp}</span></td>
      <td class="r mono ${w>l?'pos':w<l?'neg':''}">${w}–${l}</td></tr>`;}).join('');
  const ov=el('div','modal-ov');
  const box=el('div','modal');
  box.innerHTML=
    `<button class="modal-x" aria-label="Close">✕</button>
     <div class="prof-head">${avatarImg(name,86)}
       <div><div class="prof-nm">${name}</div>
         <div class="rings" style="font-size:16px">${rings(titlesOf(name))}</div>
         <div class="meta">${titlesOf(name)?titleYearsOf(name).join(', ')+' champion':'Chasing a first ring'}</div></div></div>
     ${win!=null?`<div class="winnings">
       <div><span class="win-label">💰 All-Time Winnings</span><span class="win-cap">4-season total</span></div>
       <div class="win-right"><span class="win-amt">$${win.toLocaleString()}</span><span class="win-rank">#${winRank} of ${winTotal}</span></div></div>`:''}
     <div class="prof-stats">
       <div><b>${m.wins}-${m.losses}</b><span>Record</span></div>
       <div><b>${pct(winPct(m))}</b><span>Win %</span></div>
       <div><b>${Math.round(m.pf).toLocaleString()}</b><span>Points</span></div>
       <div><b class="${luck&&luck.luck>0?'pos':luck&&luck.luck<0?'neg':''}">${luck?(luck.luck>0?'+':'')+luck.luck:'–'}</b><span>Luck</span></div>
       <div><b>${motw||'–'}</b><span>Wk Highs</span></div>
     </div>
     ${badges?`<div class="prof-badges">${badges}</div>`:''}
     ${rivs.length?`<div class="prof-sec">All-Time Rivalries</div><div class="tablecard"><table class="tbl"><tbody>${rivRows}</tbody></table></div>`:''}`;
  ov.appendChild(box);
  ov.addEventListener('click',e=>{if(e.target===ov||e.target.classList.contains('modal-x'))document.body.removeChild(ov);});
  document.body.appendChild(ov);
}

/* ---------- DRAFT ---------- */
function renderDraft(){
  const app=$('#app');
  app.appendChild(header('Draft Steals & Busts','The Draft','Where championships were stolen in the double-digit rounds — and where first-round picks went to die. Ranked by season fantasy points vs. draft slot.'));
  const E=L.extra;
  if(!E){app.appendChild(el('div','note','🔓 Run <b>scripts/extras.py</b> to pull draft data (picks + player scoring). This page lights up once it finishes.')).style.marginTop='8px';return;}
  const tbl=(title,rows,ptsColor)=>{
    const sec=el('section','section');
    sec.appendChild(el('h2','h',`<span class="bar"></span>${title}`));
    const tc=el('div','tablecard');let h='<table class="tbl"><thead><tr><th>Player</th><th>Drafted</th><th class="r">Season Pts</th><th>Manager</th><th class="r">Yr</th></tr></thead><tbody>';
    rows.forEach(p=>h+=`<tr><td class="who-name">${p.player}</td>
      <td class="mono" style="color:var(--muted)">R${p.round} · #${p.pick}</td>
      <td class="r mono" style="color:${ptsColor};font-weight:700">${p.pts.toFixed(1)}</td>
      <td>${avatarImg(p.by,24)} ${p.by}</td>
      <td class="r mono" style="color:var(--muted)">${p.season}</td></tr>`);
    tc.innerHTML=h+'</tbody></table>';sec.appendChild(tc);app.appendChild(sec);
  };
  tbl('💎 Biggest Steals <span class="badge muted" style="font-weight:600">round 7+</span>', E.steals, 'var(--gold)');
  tbl('🪦 Biggest Busts <span class="badge muted" style="font-weight:600">rounds 1–2</span>', E.busts, 'var(--loss)');
}

/* ---------- TRADES ---------- */
function renderTrades(){
  const app=$('#app');
  app.appendChild(header('Trade Tracker','Trades','Every deal in league history — the wheelers, the dealers, and the heists.'));
  const E=L.extra;
  if(!E){app.appendChild(el('div','note','🔓 Run <b>scripts/extras.py</b> to pull the trade history. This page lights up once it finishes.')).style.marginTop='8px';return;}
  const topTrader=Object.entries(E.trader_counts)[0]||['—',0];
  const bt=E.biggest_trade;
  const stats=el('div','stats');
  [['k gold',E.trades_total,'Total Trades'],
   ['k',topTrader[0],'Most Active ('+topTrader[1]+')'],
   ['k blue',bt?bt.assets:'–','Biggest Trade (assets)']
  ].forEach(([c,k,l])=>{const s=el('div','stat');s.appendChild(el('div',c,k));s.appendChild(el('div','l',l));stats.appendChild(s);});
  stats.style.gridTemplateColumns='repeat(3,1fr)';app.appendChild(stats);

  // recent trades
  const sec=el('section','section');
  sec.appendChild(el('h2','h','<span class="bar"></span>Recent Trades'));
  E.recent_trades.forEach(t=>{
    const card=el('div','trade-card');
    const sides=t.sides.map(s=>`<div class="trade-side">
        <div class="trade-mgr">${avatarImg(s.manager,26)} <b>${s.manager}</b> <span class="meta">got</span></div>
        <div class="trade-got">${s.got.length?s.got.map(g=>`<span class="asset">${g}</span>`).join(''):'<span class="meta">—</span>'}</div>
      </div>`).join('<div class="trade-swap">⇄</div>');
    card.innerHTML=`<div class="trade-hd"><span class="badge blue">${t.season} · Wk ${t.week}</span></div><div class="trade-body">${sides}</div>`;
    sec.appendChild(card);
  });
  app.appendChild(sec);

  // trader leaderboard
  const sec2=el('section','section');
  sec2.appendChild(el('h2','h','<span class="bar"></span>Most Active Traders'));
  const tc=el('div','tablecard');let h='<table class="tbl"><thead><tr><th>Manager</th><th class="r">Trades</th></tr></thead><tbody>';
  Object.entries(E.trader_counts).forEach(([n,c])=>h+=`<tr><td>${avatarImg(n,26)} <span class="who-name">${n}</span></td><td class="r"><div style="display:flex;align-items:center;gap:10px;justify-content:flex-end"><div class="bar-track" style="width:${Math.min(120,c*14)}px"><div class="bar-fill gold" style="width:100%"></div></div><b class="mono">${c}</b></div></td></tr>`);
  tc.innerHTML=h+'</tbody></table>';sec2.appendChild(tc);app.appendChild(sec2);
}

/* ---------- CHARTS (Chart.js, guarded so headless/no-CDN still renders) ---------- */
function chartCanvas(app,title,height){
  const sec=el('section','section');
  sec.appendChild(el('h2','h',`<span class="bar"></span>${title}`));
  const wrap=el('div','chart-wrap');wrap.style.height=(height||340)+'px';
  const cv=document.createElement('canvas');wrap.appendChild(cv);
  sec.appendChild(wrap);app.appendChild(sec);
  return cv;
}
function drawBar(cv,labels,data,colors,horizontal){
  if(typeof Chart==='undefined'||!cv||!cv.getContext)return;
  new Chart(cv,{type:'bar',
    data:{labels,datasets:[{data,backgroundColor:colors,borderRadius:6,borderWidth:0,maxBarThickness:30}]},
    options:{indexAxis:horizontal?'y':'x',responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{backgroundColor:'#0E1320',borderColor:'rgba(255,255,255,.1)',borderWidth:1,titleColor:'#EAEDF5',bodyColor:'#cfd6e6',padding:10}},
      scales:{x:{grid:{color:'rgba(255,255,255,.06)'},ticks:{color:'#8A93A8'}},
              y:{grid:{display:false},ticks:{color:'#cfd6e6',font:{weight:'600'}}}}}});
}

function header(title,eyebrow,sub){
  const s=el('section','');
  s.innerHTML=`<div class="eyebrow">${eyebrow}</div><h1 class="title">${title}</h1><p class="sub">${sub}</p>`;
  return s;
}
