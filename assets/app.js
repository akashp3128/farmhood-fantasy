/* Farmhood Fantasy — shared chrome + page renderers. Reads window.LEAGUE. */
const L = window.LEAGUE;
// Analytics: set GC_CODE to your GoatCounter code (the subdomain you pick at goatcounter.com).
// e.g. GC_CODE="farmhood" -> reports to https://farmhood.goatcounter.com. Empty = disabled.
const GC_CODE = "";
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
  // analytics (GoatCounter) — only if a code is configured
  if(GC_CODE && document.head && typeof document.createElement==='function'){
    const s=document.createElement('script');s.async=true;s.src='//gc.zgo.at/count.js';
    s.setAttribute('data-goatcounter','https://'+GC_CODE+'.goatcounter.com/count');
    document.head.appendChild(s);
  }
  const nav = el('nav','nav');
  const inner = el('div','nav-inner');
  inner.appendChild(el('a','brand',
    `<img class="crest-img" src="assets/logo.jpg" alt="Farmwood"><span><b>Farmhood Fantasy</b><span>The Official Record Book · Est. 2014</span></span>`)).href='index.html';
  inner.appendChild(el('span','vol','Vol. XIII — The 2026 Season'));
  const links = el('div','nav-links');
  PAGES.forEach(([href,label,key])=>{
    const a = el('a','link'+(key===active?' active':''),label); a.href=href; links.appendChild(a);
  });
  inner.appendChild(links); nav.appendChild(inner);
  document.body.prepend(nav);

  const foot = el('footer','',
    `<div>Farmhood Fantasy · Founded 2014 · Data from the Sleeper API</div>
     <div>Built by <b style="color:var(--gold)">Akash Patel</b> · <span class="ok">✓ verified</span> · sanitized</div>`);
  document.body.appendChild(foot);
  easterEgg();
  /* chat assistant removed — Almanac redesign */
}

function medalRank(i){
  const cls = i===0?'rank g1':i===1?'rank g2':i===2?'rank g3':'rank';
  return `<span class="${cls}">${i+1}</span>`;
}

/* ---------- HOME ---------- */
function renderHome(){
  const m=L.meta, app=$('#app');
  const champ=L.managers.find(x=>x.name===m.reigningChampion);
  const totalSeasons=Object.keys(championsAll()).length;
  const titleLeader=[...L.managers].sort((a,b)=>titlesOf(b.name)-titlesOf(a.name))[0];
  const pfLeader=[...L.managers].sort((a,b)=>b.pf-a.pf)[0];

  // ---- 1a hero: crest left, lede right ----
  const hero=el('section','hero hero-split');
  hero.innerHTML=`<div class="hero-inner">
      <div class="hero-logo-wrap"><img class="hero-logo" src="assets/logo.jpg" alt="Farmwood crest"></div>
      <div class="hero-text">
        <div class="hero-eyebrow">${totalSeasons} seasons · ${m.teams} managers · One tower</div>
        <h1 class="hero-head">Every ring, every curse, every Monday-night collapse.</h1>
        <p class="hero-lede">The complete, reconciled history of the Farmhood — from the Founders Era of 2014 to the ${m.reigningChampion} dynasty of today.</p>
      </div>
    </div>`;
  app.appendChild(hero);

  // ---- stat strip ----
  const cu=(n,suf)=>`<span class="countup" data-to="${n}"${suf?` data-suffix="${suf}"`:''}>0</span>`;
  const stats=el('div','stats');
  [[cu(totalSeasons),'Seasons','Since 2014'],
   [cu(L.managers.length),'Managers','Twelve strong'],
   [cu(titlesOf(titleLeader.name),'×'),'Most Titles',titleLeader.name],
   [cu(Math.round(pfLeader.pf)),'Most Points',pfLeader.name]
  ].forEach(([k,l,sub])=>{
    const s=el('div','stat');
    s.innerHTML=`<div class="k">${k}</div><div class="l">${l}</div><div class="l-sub">${sub||'&nbsp;'}</div>`;
    stats.appendChild(s);
  });
  app.appendChild(stats);

  // ---- stat of the day ----
  app.appendChild(el('div','sotd',`<span class="sotd-tag">Stat of the Day</span><span class="sotd-txt">${statOfTheDay()}</span>`)).style.marginTop='16px';

  // ---- two-column: title count | champion + ledger ----
  const grid=el('div','home-grid');
  const tcnt=titleCounts();
  const winners=Object.keys(tcnt).sort((a,b)=>tcnt[b]-tcnt[a]||titleYearsOf(a)[0]-titleYearsOf(b)[0]);
  const left=el('div','tl-wrap');
  let lh=`<div class="tl-head"><span>Title count — since 2014</span><span class="tl-key">★ = ring</span></div>`;
  winners.forEach((w,i)=>{
    lh+=`<div class="tl-row"><span class="tl-n">${i+1}</span><span class="tl-name">${w}</span>`+
        `<span class="tl-rings">${rings(tcnt[w])}</span><span class="tl-sp"></span>`+
        `<span class="tl-years">${titleYearsOf(w).join(', ')}</span></div>`;
  });
  lh+=`<div class="tl-note">Founders Era titles (2014–18, NFL.com) counted in full. Yogi, 2014 champion, has left the neighborhood.</div>`;
  left.innerHTML=lh;
  grid.appendChild(left);

  const right=el('div','home-right');
  const cf=el('div','champ-frame');
  cf.innerHTML=`<div class="cf-tag">Reigning Champion · MMXXV</div>
    <div class="cf-body">${avatarImg(champ.name,54)}
      <div><div class="cf-name">${champ.name}</div>
        <div class="cf-meta">${titlesOf(champ.name)}× champion · ${champ.wins}–${champ.losses} all-time · <span class="rings">${rings(titlesOf(champ.name))}</span></div>
      </div></div>
    <div class="cf-quote">“Rarely the best team on paper. Always the one standing at the end.”</div>`;
  right.appendChild(cf);

  const pot=L.pot||{total:3000,buyIn:100,teams:L.managers.length};
  const ledger=el('div','ledger');
  const shut=`<div class="lg-tag">The League Meme, Immortalized</div>
     <div class="lg-quote">“I pay when he pays.”</div>
     <div class="lg-sub">— everyone, to Ian, 2015 · Click to open the 2026 ledger →</div>`;
  const open=`<div class="lg-tag">The 2026 Ledger</div>
     <div class="lg-row"><span class="lg-amt">$${pot.total.toLocaleString()} <span class="lg-of">pot</span></span></div>
     <div class="lg-note">Buy-in $${pot.buyIn} · ${pot.teams} managers${pot.placeholder?' · placeholder figures':''}.</div>`;
  ledger.innerHTML=shut;
  let lgOpen=false;
  ledger.onclick=()=>{lgOpen=!lgOpen;ledger.innerHTML=lgOpen?open:shut;};
  right.appendChild(ledger);
  grid.appendChild(right);
  app.appendChild(grid);

  // all-time records strip (once backfill has run)
  if(L.allTime){
    const A=L.allTime, hw=A.highest_weeks[0], b=A.biggest_blowout, lk=A.luck[0], mo=motwLeaders(A);
    const secR=el('section','section');
    secR.appendChild(el('h2','h','<span class="bar"></span>League Records'));
    const gr=el('div','grid g2');
    [['Highest week ever',`${hw.name} · ${hw.pts.toFixed(1)}`,`${hw.season}, Week ${hw.week}`],
     ['Biggest blowout ever',`+${b.margin}`,`${b.winner} over ${b.loser}, ${b.season}`],
     ['Luckiest manager',`${lk.name} (+${lk.luck})`,'wins above expected, all-time'],
     ['Most weekly highs',`${mo.names}`,`${mo.count}× Manager of the Week`]
    ].forEach(([t,v,m])=>gr.appendChild(el('a','card hover',
      `<div class="meta" style="font-size:12px;font-weight:700;color:var(--blue-2)">${t}</div>
       <div class="big" style="font-size:22px;margin:5px 0 2px">${v}</div><div class="meta">${m}</div>`)).href='fun.html');
    secR.appendChild(gr);app.appendChild(secR);
  }

  // quick links
  const sec3=el('section','section');
  sec3.appendChild(el('h2','h','<span class="bar"></span>Explore'));
  const g=el('div','grid g3');
  [['power-rankings.html','Power Rankings','All-time strength index, weighted by win %, rings & scoring.'],
   ['records.html','Records','Every all-time leaderboard — wins, points, win %.'],
   ['history.html','History','Champion by champion, 2014 to today.'],
   ['fun.html','Fun Stats','Luck index, blowouts, manager of the week.'],
   ['matchups.html','Matchups','Week-by-week scores from the latest season.'],
   ['draft.html','2026 Draft Order','The order is set — see who picks where before kickoff.']
  ].forEach(([h,ti,d])=>{
    const c=el('a','card hover explore-card',`<h3>${ti}<span class="card-arrow">→</span></h3><div class="meta">${d}</div>`);c.href=h;g.appendChild(c);
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
    ms.map(m=>titlesOf(m.name)>0?'#B8912E':'#5C6E5F'), true);
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
    pfRank.map(()=>'#B8912E'), true);

  // playoff appearances chart
  if(L.playoffAppearances){
    const pa=Object.entries(L.playoffAppearances).sort((a,b)=>b[1]-a[1]);
    drawBar(chartCanvas(app,`Playoff Appearances <span class="badge muted" style="font-weight:600">of ${L.playoffSeasons} seasons (2019–25)</span>`,380),
      pa.map(x=>x[0]), pa.map(x=>x[1]), pa.map(x=>x[1]>=5?'#B8912E':'#5C6E5F'), true);
  }

  // championship-game appearances (stacked won vs lost), all-time
  if(L.finalsAppearances){
    const fa=[...L.finalsAppearances].filter(x=>x.app>0).sort((a,b)=>b.app-a.app||b.won-a.won);
    drawStacked(chartCanvas(app,`Championship Game Appearances <span class="badge muted" style="font-weight:600">all-time · <span style="color:var(--gold)">won</span> vs <span style="color:var(--loss)">lost</span></span>`,420),
      fa.map(x=>x.name), fa.map(x=>x.won), fa.map(x=>x.lost));
    app.appendChild(el('div','note','Every title game, 2014–present. Includes 2015 (Akash lost to ian) and 2020 (Joe lost to martinch94). The 2014, 2016, 2017 & 2018 runner-ups are still being recovered from the old NFL.com league.')).style.marginTop='14px';
  }

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
    const hasR=L.championRosters && L.championRosters[String(y)];
    const c=el('div','champ-card'+(hasR?' clickable':''));c.style.marginBottom='14px';
    if(hasR) c.onclick=()=>openRoster(String(y));
    c.innerHTML=`${avatarImg(champ,46)}
      <div style="flex:1">
        <div class="yr">${y} · ${s.teams} TEAMS · ${s.games} GAMES</div>
        <div class="who">${champ} 🏆</div>
        <div class="meta" style="color:var(--muted);margin-top:3px">${s.runnerNote}</div>
        ${hasR?'<div class="meta" style="color:var(--gold);font-size:12px;margin-top:5px;font-weight:700">View title roster →</div>':''}
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
    lkSorted.map(x=>x.luck>=0?'#2E7D4F':'#A0432E'), true);

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
  if(name===L.commissioner) out.push(['⚖️','Commissioner']);
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
  sec.appendChild(el('h2','h',`<span class="bar"></span>💰 The Money Board <span class="badge" style="font-weight:600;background:rgba(63,209,140,.14);color:#2E7D4F">$${total.toLocaleString()} paid out</span>`));
  const tc=el('div','tablecard');const t=el('table','tbl');
  t.innerHTML='<thead><tr><th>#</th><th>Manager</th><th class="r">All-Time Winnings</th></tr></thead>';
  const tb=el('tbody');
  rows.forEach(([n,v],i)=>{
    const mgr=L.managers.find(x=>x.name===n);
    tb.appendChild(el('tr','',
      `<td>${medalRank(i)}</td>
       <td>${avatarImg(n,28)} <span class="who-name">${n}</span> ${titlesOf(n)?'<span class="rings">'+rings(titlesOf(n))+'</span>':''}</td>
       <td class="r"><div style="display:flex;align-items:center;gap:12px;justify-content:flex-end">
         <div class="bar-track" style="width:110px"><div class="bar-fill" style="width:${(v/max*100).toFixed(0)}%;background:linear-gradient(90deg,#1E5A38,#2E7D4F)"></div></div>
         <b class="mono" style="color:#2E7D4F;min-width:58px;display:inline-block">$${v.toLocaleString()}</b></div></td>`));
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
      ${m.name===L.commissioner?'<span class="commish-tag">⚖️ Commissioner</span>':''}
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
       <div><b>${(L.playoffAppearances||{})[name]!=null?L.playoffAppearances[name]+'/'+L.playoffSeasons:'–'}</b><span>Playoffs</span></div>
     </div>
     ${badges?`<div class="prof-badges">${badges}</div>`:''}
     ${rivs.length?`<div class="prof-sec">All-Time Rivalries</div><div class="tablecard"><table class="tbl"><tbody>${rivRows}</tbody></table></div>`:''}`;
  ov.appendChild(box);
  ov.addEventListener('click',e=>{if(e.target===ov||e.target.classList.contains('modal-x'))document.body.removeChild(ov);});
  document.body.appendChild(ov);
}

/* ---------- DRAFT ---------- */
function renderDraftOrder(app){
  const d=L.draft2026; if(!d||!d.order) return;
  const sec=el('section','');
  sec.appendChild(el('h2','h',`<span class="bar"></span>${d.season} Draft Order <span class="badge blue" style="font-weight:600">${d.type} · ${d.rounds} rounds · ${d.scoring}</span>`));
  const list=el('div','draft-order');
  d.order.forEach((n,i)=>{
    const row=el('div','do-row'+(i===0?' first':''));
    row.innerHTML=`<span class="do-pick">${i+1}</span>${avatarImg(n,32)}<span class="do-name">${n}</span>
      <span class="do-meta">1.${String(i+1).padStart(2,'0')}</span>`;
    list.appendChild(row);
  });
  sec.appendChild(list);
  sec.appendChild(el('div','note',`Snake format — the order reverses each round, so <b>${d.order[d.order.length-1]}</b> picks 1.${d.teams} and 2.01 back to back. Draft date not scheduled yet.`)).style.marginTop='14px';
  app.appendChild(sec);
}
function renderDraft(){
  const app=$('#app');
  app.appendChild(header('The Draft','Draft','The 2026 order is set — plus every steal and bust in league history, ranked by season points against draft slot.'));
  renderDraftOrder(app);
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
      plugins:{legend:{display:false},tooltip:{backgroundColor:'#F8F5EB',borderColor:'rgba(23,59,39,.3)',borderWidth:1,titleColor:'#173B27',bodyColor:'#173B27',padding:10}},
      scales:{x:{grid:{color:'rgba(23,59,39,.12)'},ticks:{color:'#8A8064'}},
              y:{grid:{display:false},ticks:{color:'#173B27',font:{weight:'600'}}}}}});
}
function drawStacked(cv,labels,wins,losses){
  if(typeof Chart==='undefined'||!cv||!cv.getContext)return;
  new Chart(cv,{type:'bar',
    data:{labels,datasets:[
      {label:'Won',data:wins,backgroundColor:'#B8912E',borderRadius:5,maxBarThickness:26,stack:'s'},
      {label:'Lost',data:losses,backgroundColor:'#A0432E',borderRadius:5,maxBarThickness:26,stack:'s'}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:true,labels:{color:'#173B27',boxWidth:12,padding:14,font:{size:11}}},
        tooltip:{backgroundColor:'#F8F5EB',borderColor:'rgba(23,59,39,.3)',borderWidth:1,titleColor:'#173B27',bodyColor:'#173B27',padding:10}},
      scales:{x:{stacked:true,grid:{color:'rgba(23,59,39,.12)'},ticks:{color:'#8A8064',precision:0}},
              y:{stacked:true,grid:{display:false},ticks:{color:'#173B27',font:{weight:'600'}}}}}});
}

/* ---------- CHAMPION ROSTER (Sleeper-style) ---------- */
function openRoster(year){
  const r=L.championRosters && L.championRosters[year]; if(!r) return;
  const rows=r.roster.map(p=>{const cls=['QB','RB','WR','TE','K','DEF'].includes(p.slot)?p.slot:'FLEX';
    return `<div class="rsl"><span class="rsl-slot ${cls}">${p.slot}</span>
      <span class="rsl-name">${p.name}</span>
      <span class="rsl-meta">${[p.pos,p.team].filter(Boolean).join(' · ')}</span></div>`;}).join('');
  const ov=el('div','modal-ov'), box=el('div','modal');
  box.innerHTML=`<button class="modal-x" aria-label="Close">✕</button>
    <div class="prof-head">${avatarImg(r.champion,74)}<div>
      <div class="yr">${year} CHAMPION 🏆</div>
      <div class="prof-nm">${r.champion}</div>
      <div class="meta">Title-winning starting lineup</div></div></div>
    <div class="prof-sec">Starters</div>
    <div class="roster-list">${rows}</div>`;
  ov.appendChild(box);
  ov.addEventListener('click',e=>{if(e.target===ov||e.target.classList.contains('modal-x'))document.body.removeChild(ov);});
  document.body.appendChild(ov);
}

/* ---------- CHAT ASSISTANT (client-side, no backend) ---------- */
const FF_ALIAS={akash:'akaaashh',akaaashh:'akaaashh',pat:'pgorny',pgorny:'pgorny',marty:'martinch94',martin:'martinch94',martinch94:'martinch94',martinch:'martinch94',vince:'vpitello34',vinny:'vpitello34',vpitello34:'vpitello34',vpitello:'vpitello34',sid:'sidjunlee',sidjunlee:'sidjunlee',jim:'jwislek_20',jwislek_20:'jwislek_20',jwislek:'jwislek_20',albert:'Blumbo',blumbo:'Blumbo',dom:'cuch',cuch:'cuch',sal:'turi70',turi70:'turi70',marco:'maco71',maco71:'maco71',ian:'Siccboi',siccboi:'Siccboi',sasha:'Archibaldo',archibaldo:'Archibaldo',yogi:'Yogi',joe:'Joe'};
function ffResolve(q){
  const hits=[];
  Object.keys(FF_ALIAS).forEach(a=>{const m=q.match(new RegExp('\\b'+a+'\\b'));if(m)hits.push([m.index,FF_ALIAS[a]]);});
  const out=[];hits.sort((a,b)=>a[0]-b[0]).forEach(([,n])=>{if(!out.includes(n))out.push(n);});
  return out;
}
function ffResume(name){
  const m=L.managers.find(x=>x.name===name), t=titlesOf(name);
  if(!m){ return t?`${name} is a Founders-era champion (${titleYearsOf(name).join(', ')}) — no longer in the league.`:`I don't have stats for ${name}.`; }
  const luck=L.allTime&&L.allTime.luck.find(x=>x.name===name), win=(L.winnings||{})[name];
  let s=`<b>${name}</b> — ${m.wins}-${m.losses} all-time (${(winPct(m)*100).toFixed(1)}%), ${Math.round(m.pf).toLocaleString()} pts, ${t} ring${t!==1?'s':''}`;
  s+= t?` (${titleYearsOf(name).join(', ')}).`:'.';
  if(win!=null) s+=` Winnings $${win.toLocaleString()}.`;
  if(luck) s+=` Luck ${luck.luck>0?'+':''}${luck.luck} wins vs expected.`;
  return s;
}
function ffH2H(a,b){
  const r=((L.allTime&&L.allTime.rivalries)||[]).find(x=>(x.a===a&&x.b===b)||(x.a===b&&x.b===a));
  if(!r) return `I don't have a tracked all-time head-to-head for ${a} and ${b} (needs the all-time data loaded).`;
  const aw=r.a===a?r.a_wins:r.b_wins, bw=r.a===a?r.b_wins:r.a_wins;
  return `<b>${a} vs ${b}</b>: ${aw}–${bw} all-time${aw===bw?' (dead even)':', '+(aw>bw?a:b)+' leads'} across ${r.games} meetings.`;
}
function ffHelp(pre){return (pre||'Try asking:')+' <span class="chat-eg">“who won 2021?”</span> <span class="chat-eg">“how many titles does Blumbo have?”</span> <span class="chat-eg">“Akash vs cuch”</span> <span class="chat-eg">“who won the most money?”</span> <span class="chat-eg">“biggest blowout ever”</span> <span class="chat-eg">“tell me about maco71”</span>';}
function ffAnswer(raw){
  const q=(raw||'').toLowerCase().trim();
  if(!q) return ffHelp();
  if(/\b(help|examples?|what can you|how do you work)\b/.test(q)) return ffHelp();
  if(/commissioner|commish|who runs|who.?s in charge/.test(q)) return `⚖️ <b>${L.commissioner}</b> is the league commissioner.`;
  if(/\bfinal|championship (game|appearance)|title game|runner.?up/.test(q)){
    const fa=L.finalsAppearances||[], nm=ffResolve(q);
    if(nm.length) return nm.map(n=>{const x=fa.find(f=>f.name===n);return x?`<b>${n}</b> has reached ${x.app} championship game${x.app!==1?'s':''} all-time (${x.won}-${x.lost}).`:`No finals data for ${n}.`;}).join('<br>');
    const top=[...fa].sort((a,b)=>b.app-a.app);
    return `🏆 Most title-game appearances: ${top.slice(0,3).map(x=>`<b>${x.name}</b> (${x.app}, ${x.won}-${x.lost})`).join(', ')}.`;
  }
  const A=L.allTime, years=(q.match(/\b(20\d{2})\b/g)||[]).map(Number).filter(y=>y>=2014&&y<=2025), names=ffResolve(q);
  const mgrsByPf=[...L.managers].sort((a,b)=>b.pf-a.pf), mgrsByW=[...L.managers].sort((a,b)=>b.wins-a.wins), mgrsByWp=[...L.managers].sort((a,b)=>winPct(b)-winPct(a));
  const tc=titleCounts(), champAll=championsAll();

  // head-to-head
  if(names.length>=2 && (/\b(vs|versus|against|head.?to.?head|h2h|beat|series)\b/.test(q) || names.length===2)) return ffH2H(names[0],names[1]);
  // champion of a year
  if(years.length && /(win|won|champ|winner|title|took|first)/.test(q))
    return years.map(y=>champAll[y]?`🏆 <b>${champAll[y]}</b> won the ${y} championship${(L.formerChampions||[]).includes(champAll[y])?' (Founders Era)':''}.`:`I don't have a champion on record for ${y}.`).join('<br>');
  if(years.length && /\bwho\b/.test(q))
    return years.map(y=>champAll[y]?`🏆 <b>${champAll[y]}</b> won ${y}.`:`No ${y} champion on record.`).join('<br>');
  // titles / rings for a name
  if(names.length && /(title|ring|champ|how many)/.test(q) && !/playoff|postseason|point|money|winning|earn|luck|rival|trade|steal|bust/.test(q))
    return names.map(n=>{const t=titlesOf(n);return t?`<b>${n}</b> has ${t} title${t>1?'s':''} — ${titleYearsOf(n).join(', ')}.`:`<b>${n}</b> has no championships yet.`;}).join('<br>');
  // winnings / money
  if(/\b(money|winning|winnings|earn|earnings|paid|cash|bankroll|\$|richest)\b/.test(q)){
    if(names.length) return names.map(n=>(L.winnings||{})[n]!=null?`<b>${n}</b> has won $${L.winnings[n].toLocaleString()} (4-season total).`:`No winnings on record for ${n}.`).join('<br>');
    const top=Object.entries(L.winnings||{}).sort((a,b)=>b[1]-a[1]);
    return `💰 Money leaders: ${top.slice(0,3).map(([n,v])=>`<b>${n}</b> $${v.toLocaleString()}`).join(', ')}. Total pot: $${top.reduce((s,x)=>s+x[1],0).toLocaleString()}.`;
  }
  // superlatives
  if(/\bmost (titles|rings|champ)/.test(q)){const n=Object.keys(tc).sort((a,b)=>tc[b]-tc[a])[0];return `👑 <b>${n}</b> has the most titles: ${tc[n]} (${titleYearsOf(n).join(', ')}).`;}
  if(/\bmost points|points leader|highest scoring|most pf\b/.test(q)){const m=mgrsByPf[0];return `<b>${m.name}</b> has the most points all-time: ${Math.round(m.pf).toLocaleString()}.`;}
  if(/\bmost wins|best record\b/.test(q)){const m=mgrsByW[0];return `<b>${m.name}</b> has the most wins: ${m.wins}-${m.losses}.`;}
  if(/\bbest win|highest win|win %|win percent/.test(q)){const m=mgrsByWp[0];return `<b>${m.name}</b> has the best win %: ${(winPct(m)*100).toFixed(1)}%${titlesOf(m.name)?'':' (and no title)'}.`;}
  if(A&&/\bhighest (week|score)|most in a week|single.?week high/.test(q)){const h=A.highest_weeks[0];return `📈 Highest week ever: <b>${h.name}</b> — ${h.pts.toFixed(1)} (${h.season}, Week ${h.week}).`;}
  if(A&&/\bblowout|biggest win|beatdown|destroyed\b/.test(q)){const b=A.biggest_blowout;return `💥 Biggest blowout ever: <b>${b.winner}</b> ${b.score} over ${b.loser} (${b.season}, +${b.margin}).`;}
  if(A&&/\bclos(e|est)|nail.?biter|narrow/.test(q)){const c=A.closest_game;return `🔪 Closest game ever: <b>${c.winner}</b> edged ${c.loser} by ${c.margin} (${c.season}).`;}
  if(A&&/luck/.test(q)){
    if(names.length){return names.map(n=>{const x=A.luck.find(y=>y.name===n);return x?`<b>${n}</b> luck: ${x.luck>0?'+':''}${x.luck} (won ${x.actual}, expected ${x.expected}).`:`No luck data for ${n}.`;}).join('<br>');}
    return `🍀 Luckiest ever: <b>${A.luck[0].name}</b> (+${A.luck[0].luck}). ☠️ Unluckiest: <b>${A.luck[A.luck.length-1].name}</b> (${A.luck[A.luck.length-1].luck}).`;
  }
  if(A&&/\brival/.test(q)){const r=(A.rivalries||[])[0];return r?`⚔️ Biggest rivalry: <b>${r.a} vs ${r.b}</b> — ${r.games} meetings (${r.a_wins}-${r.b_wins}).`:`No rivalry data loaded.`;}
  // draft / trades (need data_extra)
  if(/draft order|draft position|draft slot|draft pick|when.*\bpick\b|what pick|who picks|first pick/.test(q)){
    const d=L.draft2026; if(!d) return 'No draft order is set yet.';
    const nm=ffResolve(q);
    if(nm.length) return nm.map(n=>{const i=d.order.indexOf(n);
      return i>=0?`<b>${n}</b> has pick #${i+1} (1.${String(i+1).padStart(2,'0')}) in the ${d.season} ${d.type.toLowerCase()} draft.`:`${n} isn't in the ${d.season} draft order.`;}).join('<br>');
    return `<b>${d.season} draft order:</b> `+d.order.map((n,i)=>`${i+1}. ${n}`).join(' · ');
  }
  if(/\bsteal/.test(q)){if(!L.extra)return 'Draft data isn\'t loaded yet — run extras.py, or open the Draft page.';const s=L.extra.steals[0];return `💎 Biggest draft steal: <b>${s.player}</b> (R${s.round}, #${s.pick}) scored ${s.pts.toFixed(1)} for ${s.by} in ${s.season}.`;}
  if(/\bbust/.test(q)){if(!L.extra)return 'Draft data isn\'t loaded yet — run extras.py.';const b=L.extra.busts[0];return `🪦 Biggest bust: <b>${b.player}</b> (R${b.round}, #${b.pick}) scored just ${b.pts.toFixed(1)} for ${b.by} in ${b.season}.`;}
  if(/\btrade|deal|active trader\b/.test(q)){if(!L.extra)return 'Trade data isn\'t loaded yet — run extras.py, or open the Trades page.';const t=Object.entries(L.extra.trader_counts)[0];return `🤝 ${L.extra.trades_total} trades all-time. Most active: <b>${t[0]}</b> (${t[1]}).`;}
  if(/playoff|postseason/.test(q)){
    if(names.length) return names.map(n=>{const p=(L.playoffAppearances||{})[n];return p!=null?`<b>${n}</b> has made the playoffs ${p} time${p!==1?'s':''} in ${L.playoffSeasons} seasons (2019–25).`:`No playoff data for ${n}.`;}).join('<br>');
    const top=Object.entries(L.playoffAppearances||{}).sort((a,b)=>b[1]-a[1]);
    return `🏟️ Most playoff appearances: ${top.slice(0,3).map(([n,v])=>`<b>${n}</b> (${v})`).join(', ')} of ${L.playoffSeasons} seasons.`;
  }
  // standings / last place
  if(years.includes(2025) && /\b(standing|finish|last|place|record|toilet|worst)\b/.test(q)){
    if(/last|toilet|worst/.test(q)){const s=L.standings2025[L.standings2025.length-1];return `In 2025, <b>${s.name}</b> finished last at ${s.w}-${s.l}.`;}
    return '2025 final: '+L.standings2025.slice(0,3).map(s=>`${s.rank}. ${s.name} (${s.w}-${s.l})`).join(', ')+'… (full table on the Matchups page).';
  }
  // list champions
  if(/\bchampions|title history|all winners|list.*win/.test(q))
    return 'Champions: '+Object.keys(champAll).sort().map(y=>`${y} ${champAll[y]}`).join(' · ');
  // single manager résumé
  if(names.length===1) return ffResume(names[0]);
  return ffHelp("I didn't catch that.");
}
function mountChat(){
  if(typeof document.addEventListener!=='function' || !document.body) return;
  const fab=document.createElement('button');fab.className='chat-fab';fab.innerHTML='💬';fab.setAttribute('aria-label','Ask the league bot');
  const panel=document.createElement('div');panel.className='chat-panel';
  panel.innerHTML=`<div class="chat-head"><img src="assets/logo.jpg" alt="" style="width:24px;height:24px;border-radius:50%"><b>Farmwood Bot</b><span class="chat-sub">ask about the league</span><button class="chat-close" aria-label="Close">✕</button></div>
    <div class="chat-msgs"></div>
    <form class="chat-form"><input class="chat-in" placeholder="Ask about a season, manager, record…" autocomplete="off"><button class="chat-send">➤</button></form>`;
  document.body.appendChild(fab);document.body.appendChild(panel);
  const msgs=panel.querySelector('.chat-msgs'), form=panel.querySelector('.chat-form'), input=panel.querySelector('.chat-in');
  const add=(html,who)=>{const d=document.createElement('div');d.className='chat-msg '+who;d.innerHTML=html;msgs.appendChild(d);msgs.scrollTop=msgs.scrollHeight;};
  add('👋 I\'m the Farmwood bot. '+ffHelp(),'bot');
  const ask=t=>{if(!t.trim())return;add(t.replace(/</g,'&lt;'),'user');setTimeout(()=>add(ffAnswer(t),'bot'),120);};
  const toggle=o=>{panel.classList.toggle('open',o);if(o)setTimeout(()=>input.focus(),50);};
  fab.addEventListener('click',()=>toggle(!panel.classList.contains('open')));
  panel.querySelector('.chat-close').addEventListener('click',()=>toggle(false));
  form.addEventListener('submit',e=>{e.preventDefault();const v=input.value;input.value='';ask(v);});
  msgs.addEventListener('click',e=>{if(e.target.classList.contains('chat-eg')){ask(e.target.textContent.replace(/[“”]/g,''));}});
}

function header(title,eyebrow,sub){
  const s=el('section','');
  s.innerHTML=`<div class="eyebrow">${eyebrow}</div><h1 class="title">${title}</h1><p class="sub">${sub}</p>`;
  return s;
}
