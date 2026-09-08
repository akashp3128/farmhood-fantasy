/* The Farmhood Press — published editorial content + live lineup intelligence. */
(function(){
  'use strict';

  const app=document.getElementById('app');
  if(!app)return;

  const pressState={
    index:null,
    activeTab:'preview',
    activeArticle:null,
    articleCache:new Map(),
    panel:null,
    tabs:new Map(),
    watchMount:null,
    watch:null,
    watchSnapshot:null,
    watchPlayers:null,
    watchError:'',
    watchBusy:false,
    watchTimer:null,
    articleRequest:0
  };

  function make(tag,className,text){
    const element=document.createElement(tag);
    if(className)element.className=className;
    if(text!==undefined&&text!==null)element.textContent=String(text);
    return element;
  }

  function clean(value,fallback){
    if(value===undefined||value===null)return fallback||'';
    if(typeof value==='string'||typeof value==='number')return String(value).trim()||(fallback||'');
    return fallback||'';
  }

  function first(){
    for(let index=0;index<arguments.length;index++){
      const value=clean(arguments[index],'');
      if(value)return value;
    }
    return '';
  }

  function list(value){return Array.isArray(value)?value.filter(item=>item!==undefined&&item!==null):[];}
  function finite(value){return value!==null&&value!==''&&Number.isFinite(Number(value))?Number(value):null;}
  function number(value,fallback){const parsed=finite(value);return parsed===null?(fallback===undefined?null:fallback):parsed;}
  function points(value){const parsed=finite(value);return parsed===null?'—':parsed.toFixed(1);}

  function probability(value){
    let parsed=finite(value);
    if(parsed===null)return '—';
    if(Math.abs(parsed)<=1)parsed*=100;
    return Math.max(0,Math.min(100,parsed)).toFixed(parsed%1?1:0)+'%';
  }

  function dateLabel(value,withTime){
    if(!value)return '';
    const parsed=new Date(value);
    if(Number.isNaN(parsed.getTime()))return clean(value,'');
    try{
      const options=withTime
        ?{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}
        :{month:'long',day:'numeric',year:'numeric'};
      return new Intl.DateTimeFormat(undefined,options).format(parsed);
    }catch(_error){return clean(value,'');}
  }

  function sentence(value){
    if(typeof value==='string'||typeof value==='number')return clean(value,'');
    if(!value||typeof value!=='object')return '';
    const player=first(value.playerName,value.player,value.name,value.starterName,value.starter);
    const status=first(value.status,value.injury,value.designation);
    const replacement=first(value.benchName,value.replacementName,value.bench,value.replacement,value.pivot);
    const gain=finite(value.projectionGain!==undefined?value.projectionGain:value.projectionDelta!==undefined?value.projectionDelta:value.delta);
    if(replacement){
      const swap=player?player+' → '+replacement:replacement;
      return swap+(gain!==null?' ('+(gain>=0?'+':'')+gain.toFixed(1)+' projected)':'');
    }
    return [player,status].filter(Boolean).join(' — ')||first(value.message,value.label,value.text);
  }

  function joinSentences(value){
    if(Array.isArray(value))return value.map(sentence).filter(Boolean).join(' · ');
    return sentence(value);
  }

  function addNavLink(){
    const links=document.querySelector('.nav-links');
    if(!links||links.querySelector('a[href="press.html"], [data-press-link]'))return;
    const anchor=make('a','link active','Press');
    anchor.href='press.html';
    anchor.dataset.pressLink='true';
    links.appendChild(anchor);
  }

  function buildShell(){
    if(typeof window.mountChrome==='function')window.mountChrome('press');
    addNavLink();
    app.replaceChildren();

    const masthead=make('header','press-masthead');
    const strip=make('div','press-kicker-row');
    strip.append(
      make('span','',"Farmhood's independent fantasy paper"),
      make('span','','Est. 2026'),
      make('span','',new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric'}).format(new Date()))
    );
    masthead.append(strip,make('h1','press-name','The Farmhood Press'),make('p','press-tagline','Predictions, receipts and the stories shaping the season.'));
    app.appendChild(masthead);

    const tabs=make('div','press-tabs');
    tabs.setAttribute('role','tablist');
    tabs.setAttribute('aria-label','Farmhood Press editions');
    [
      ['preview','Preview'],
      ['live','Live Desk'],
      ['recap','Recap'],
      ['archive','Archive']
    ].forEach(([key,label])=>{
      const button=make('button','press-tab',label);
      button.type='button';button.id='press-tab-'+key;button.dataset.tab=key;
      button.setAttribute('role','tab');button.setAttribute('aria-controls','press-panel');
      button.setAttribute('aria-selected','false');button.tabIndex=-1;
      button.addEventListener('click',()=>selectTab(key,true));
      button.addEventListener('keydown',event=>moveTabFocus(event,key));
      pressState.tabs.set(key,button);tabs.appendChild(button);
    });
    app.appendChild(tabs);
    const panel=make('section','press-panel');
    panel.id='press-panel';panel.setAttribute('role','tabpanel');panel.tabIndex=-1;
    app.appendChild(panel);pressState.panel=panel;
    updateTabState();
  }

  function moveTabFocus(event,key){
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();
    const keys=[...pressState.tabs.keys()],current=keys.indexOf(key);
    let next=current;
    if(event.key==='ArrowLeft')next=(current-1+keys.length)%keys.length;
    if(event.key==='ArrowRight')next=(current+1)%keys.length;
    if(event.key==='Home')next=0;
    if(event.key==='End')next=keys.length-1;
    pressState.tabs.get(keys[next]).focus();
  }

  function updateTabState(){
    pressState.tabs.forEach((button,key)=>{
      const selected=key===pressState.activeTab;
      button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;
    });
    if(pressState.panel)pressState.panel.setAttribute('aria-labelledby','press-tab-'+pressState.activeTab);
  }

  function indexArticles(){
    const rows=pressState.index&&Array.isArray(pressState.index.articles)?pressState.index.articles:[];
    return rows.filter(row=>row&&typeof row==='object'&&clean(row.status,'published').toLowerCase()!=='draft');
  }

  function kindOf(article){
    const value=first(article&&article.type,article&&article.edition,article&&article.label).toLowerCase();
    if(value.includes('recap')||value.includes('postgame'))return 'recap';
    if(value.includes('live'))return 'live';
    if(value.includes('preview')||value.includes('pregame'))return 'preview';
    return 'feature';
  }

  function articleId(article){return first(article&&article.articleId,article&&article.id,article&&article.slug);}

  function matchingMeta(type){
    const rows=indexArticles().filter(row=>kindOf(row)===type);
    if(!rows.length)return null;
    const activeId=articleId(pressState.activeArticle);
    const current=rows.find(row=>articleId(row)===activeId);
    if(current)return current;
    return rows.slice().sort((a,b)=>new Date(b.publishedAt||0)-new Date(a.publishedAt||0))[0];
  }

  function featuredMeta(){
    const rows=indexArticles();
    if(!rows.length)return null;
    const wanted=first(pressState.index&&pressState.index.featuredArticleId,pressState.index&&pressState.index.featured);
    return rows.find(row=>articleId(row)===wanted)||rows[0];
  }

  function safeArticleUrl(path){
    const raw=clean(path,'');
    if(!raw)return null;
    try{
      const base=new URL('../content/articles/',new URL('assets/press.js',window.location.href));
      const target=new URL(raw,window.location.href);
      if(target.origin!==base.origin||!target.href.startsWith(base.href))return null;
      return target;
    }catch(_error){return null;}
  }

  async function fetchJSON(url){
    const response=await window.fetch(url,{cache:'no-store',credentials:'same-origin',headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error('Published edition unavailable ('+response.status+').');
    return response.json();
  }

  async function loadIndex(){
    try{
      pressState.index=await fetchJSON('content/articles/index.json');
      const featured=featuredMeta();
      if(!featured){renderEmptyEdition('The first edition is on the press','Published stories will appear here as soon as the newsroom releases them.');return;}
      const featuredKind=kindOf(featured);
      pressState.activeTab=featuredKind==='recap'?'recap':'preview';
      updateTabState();
      await loadArticle(featured);
    }catch(error){
      renderEmptyEdition('The newsroom is between editions','The published archive could not be opened. Lineup Watch will keep reporting below.');
      appendStandaloneWatch();
    }
  }

  async function loadArticle(meta){
    const request=++pressState.articleRequest;
    const id=articleId(meta)||clean(meta&&meta.path,'');
    if(id&&pressState.articleCache.has(id)){
      pressState.activeArticle=pressState.articleCache.get(id);renderCurrent();return;
    }
    const url=safeArticleUrl(meta&&meta.path);
    if(!url){renderEmptyEdition('Edition unavailable','This story does not have a valid published file.');appendStandaloneWatch();return;}
    renderLoading('Loading the latest edition…');
    try{
      const article=await fetchJSON(url.href);
      if(request!==pressState.articleRequest)return;
      if(!article||typeof article!=='object')throw new Error('Invalid article.');
      if(id)pressState.articleCache.set(id,article);
      pressState.activeArticle=article;renderCurrent();
    }catch(_error){
      if(request!==pressState.articleRequest)return;
      renderEmptyEdition('That edition is off the press','The story file is temporarily unavailable. Try the archive again in a moment.');
      appendStandaloneWatch();
    }
  }

  function renderLoading(label){
    pressState.watchMount=null;pressState.panel.replaceChildren();
    const box=make('div','press-empty');box.setAttribute('role','status');
    box.append(make('h2','','Newsroom desk'),make('p','',label));pressState.panel.appendChild(box);
  }

  function renderEmptyEdition(title,description){
    pressState.watchMount=null;pressState.panel.replaceChildren();
    const box=make('div','press-empty');
    box.append(make('h2','',title),make('p','',description));pressState.panel.appendChild(box);
  }

  async function selectTab(key,focusPanel){
    pressState.activeTab=key;updateTabState();
    if(key==='live'){renderLiveDesk();}
    else if(key==='archive'){renderArchive();}
    else{
      const meta=matchingMeta(key);
      if(meta)await loadArticle(meta);
      else{
        renderEmptyEdition(key==='recap'?'Recap pending':'Preview pending',key==='recap'
          ?'The recap desk opens after the week is final. Until then, the original prediction stays frozen in the archive.'
          :'A published preview has not landed yet. Lineup Watch is still tracking the live league feed.');
        appendStandaloneWatch();
      }
    }
    if(focusPanel)pressState.panel.focus({preventScroll:true});
  }

  function renderCurrent(){
    if(pressState.activeTab==='live'){renderLiveDesk();return;}
    if(pressState.activeTab==='archive'){renderArchive();return;}
    if(!pressState.activeArticle){renderEmptyEdition('Edition pending','The newsroom is preparing the next story.');appendStandaloneWatch();return;}
    renderArticle(pressState.activeArticle);
  }

  function normalizedArticle(article){
    const lead=article&&article.lead;
    const leadObject=lead&&typeof lead==='object'&&!Array.isArray(lead)?lead:{};
    const meta=indexArticles().find(item=>articleId(item)===articleId(article))||{};
    const leadParagraphs=Array.isArray(lead)?lead:list(leadObject.body||article.body||article.paragraphs);
    return {
      raw:article,
      title:first(article.title,leadObject.headline,meta.title,'Untitled edition'),
      dek:first(article.dek,article.deck,leadObject.deck,meta.dek,meta.deck),
      edition:first(article.edition,article.label,meta.edition,kindOf(article)==='recap'?'Postgame Edition':'Pregame Edition'),
      status:first(article.status,meta.status,'Published'),
      season:number(article.season,number(meta.season,2026)),
      week:number(article.week,number(meta.week,null)),
      byline:first(article.byline,'Farmhood Intelligence Desk'),
      publishedAt:first(article.publishedAt,meta.publishedAt),
      updatedAt:first(article.updatedAt),
      dataAsOf:first(article.dataAsOf,article.factsAsOf,article.source&&article.source.dataAsOf,meta.dataAsOf),
      sourceId:first(article.source&&article.source.snapshotId,article.sourceSnapshotId,article.factCheck&&article.factCheck.snapshotId),
      leadParagraphs:leadParagraphs.map(value=>sentence(value)||first(value&&value.text)).filter(Boolean),
      pullQuote:first(leadObject.pullQuote,article.pullQuote),
      keyStat:first(leadObject.keyStat&&leadObject.keyStat.value,leadObject.keyStat,article.keyStat&&article.keyStat.value,article.keyStat),
      keyStatLabel:first(leadObject.keyStat&&leadObject.keyStat.label,article.keyStat&&article.keyStat.label,'Number to know'),
      keyStatNote:first(leadObject.keyStat&&leadObject.keyStat.note,article.keyStat&&article.keyStat.note),
      matchups:list(article.matchups),
      storylines:list(article.storylines),
      receipts:article.receipts||article.accuracy||null,
      awards:list(article.awards),
      factCheck:article.factCheck||null
    };
  }

  function renderArticle(article){
    const data=normalizedArticle(article);pressState.watchMount=null;pressState.panel.replaceChildren();
    const edition=make('div','press-edition-bar');
    const left=make('span','edition-status',[data.edition,data.season,data.week!==null?'Week '+data.week:''].filter(Boolean).join(' · '));
    const right=make('span','edition-date',[data.status,dateLabel(data.publishedAt,false)].filter(Boolean).join(' · '));
    edition.append(left,right);pressState.panel.appendChild(edition);

    const grid=make('article','press-lead-grid');
    const lead=make('div','press-lead');lead.appendChild(make('span','press-overline',data.edition));
    lead.appendChild(make('h1','press-headline',data.title));
    if(data.dek)lead.appendChild(make('p','press-dek',data.dek));
    const byline=make('div','press-byline');
    byline.append(make('span','','By'),make('b','',data.byline));
    if(data.updatedAt||data.publishedAt)byline.append(make('span','',dateLabel(data.updatedAt||data.publishedAt,true)));
    lead.appendChild(byline);
    const copy=make('div','press-copy');
    if(data.leadParagraphs.length)data.leadParagraphs.forEach(paragraph=>copy.appendChild(make('p','',paragraph)));
    else copy.appendChild(make('p','','The newsroom brief for this edition is being finalized. The verified matchup desk appears below.'));
    lead.appendChild(copy);grid.appendChild(lead);
    const aside=make('aside','press-lead-aside');
    if(data.pullQuote)aside.appendChild(make('blockquote','press-pullquote',data.pullQuote));
    if(data.keyStat){
      const stat=make('div','press-key-stat');
      stat.append(make('span','press-key-stat-label',data.keyStatLabel),make('strong','',data.keyStat));
      if(data.keyStatNote)stat.appendChild(make('span','',data.keyStatNote));
      aside.appendChild(stat);
    }
    if(!aside.childNodes.length){
      aside.appendChild(make('blockquote','press-pullquote',data.dek||'Every prediction stays on the record. Every lineup change gets a timestamp.'));
    }
    grid.appendChild(aside);pressState.panel.appendChild(grid);

    renderMatchupDesk(data,pressState.panel);
    const baseline=article.lineupSnapshot||(article.source&&article.source.lineupSnapshot)||null;
    if(baseline&&pressState.watchSnapshot&&pressState.watchPlayers&&window.FarmhoodLive&&typeof window.FarmhoodLive.lineupWatch==='function'){
      pressState.watch=window.FarmhoodLive.lineupWatch(pressState.watchSnapshot,pressState.watchPlayers,baseline);
    }
    const watch=make('section','press-watch');pressState.panel.appendChild(watch);pressState.watchMount=watch;renderLineupWatch();
    renderEditorialColumns(data,pressState.panel);
    renderSource(data,pressState.panel);
  }

  function normalizedMatchup(row,index){
    const teams=list(row&&row.teams);
    const a=teams[0]||{},b=teams[1]||{},pick=row&&row.pick||{};
    const projectedA=number(row&&row.projectedScoreA,number(a.projection,null));
    const projectedB=number(row&&row.projectedScoreB,number(b.projection,null));
    const finalA=number(row&&row.finalScoreA,number(row&&row.currentScoreA,null));
    const finalB=number(row&&row.finalScoreB,number(row&&row.currentScoreB,null));
    const managerA=first(row&&row.managerA,a.manager,a.name,'Team A');
    const managerB=first(row&&row.managerB,b.manager,b.name,'Team B');
    const picked=first(row&&row.predictedWinner,pick.manager,pick.winner);
    const winProbability=row&&row.winProbability!==undefined?row.winProbability:pick.winProbability;
    return {
      id:first(row&&row.matchupId,row&&row.id,index+1),managerA,managerB,projectedA,projectedB,finalA,finalB,picked,winProbability,
      winner:first(row&&row.winner),predictionCorrect:row&&row.predictionCorrect,
      headline:first(row&&row.headline,managerA+' and '+managerB+' meet at the line'),
      body:first(row&&row.analysis,row&&row.body,row&&row.summary),
      keyPlayer:joinSentences(row&&row.keyPlayer||row&&row.keyPlayers),
      upsetPath:joinSentences(row&&row.upsetPath),
      historyNote:joinSentences(row&&row.historyNote||row&&row.history),
      injuryWatch:joinSentences(row&&row.injuryWatch||row&&row.injuries||row&&row.lineupWatch)
    };
  }

  function renderMatchupDesk(data,parent){
    const recap=kindOf(data.raw)==='recap';
    const section=make('section','press-section');
    const head=make('div','press-section-head');
    head.append(make('h2','',recap?'The Matchup Reports':'The Prediction Desk'),make('p','',recap
      ?'Final scores, turning points and the decisions that shaped the week.'
      :'Published picks remain frozen; Live Desk forecasts may move before each player locks.'));
    section.appendChild(head);
    if(!data.matchups.length){
      section.appendChild(make('div','watch-empty','Matchup capsules have not been published for this edition.'));
      parent.appendChild(section);return;
    }
    const board=make('div','press-matchups');
    data.matchups.slice(0,6).forEach((raw,index)=>{
      const row=normalizedMatchup(raw,index),card=make('article','press-matchup');
      const top=make('div','press-matchup-top');
      top.append(make('span','','Matchup '+row.id),make('span','pick',row.picked?'Pick: '+row.picked:'Pick pending'));
      card.append(top,make('h3','',row.headline));
      const score=make('div','press-scoreline'),sideA=make('div','press-team'),sideB=make('div','press-team');
      sideA.append(make('span','press-team-name',row.managerA),make('strong','press-team-score',points(recap?row.finalA:row.projectedA)));
      sideB.append(make('span','press-team-name',row.managerB),make('strong','press-team-score',points(recap?row.finalB:row.projectedB)));
      score.append(sideA,make('span','press-score-vs',recap?'FINAL':'PROJ'),sideB);card.appendChild(score);
      const odds=make('div','press-odds');odds.append(make('span','',recap?'Original pick':'Win probability'),make('strong','',recap?(row.picked+(row.predictionCorrect?' ✓':' ✕')):probability(row.winProbability)));card.appendChild(odds);
      if(row.body)card.appendChild(make('p','press-matchup-body',row.body));
      const notes=make('div','press-matchup-notes');
      [
        ['Key player',row.keyPlayer],['Upset path',row.upsetPath],['From the archive',row.historyNote],['Injury watch',row.injuryWatch]
      ].forEach(([label,value])=>{
        if(!value)return;
        const note=make('div','press-matchup-note');note.append(make('b','',label),make('span','',value));notes.appendChild(note);
      });
      if(notes.childNodes.length)card.appendChild(notes);board.appendChild(card);
    });
    section.appendChild(board);parent.appendChild(section);
  }

  function normalizedStory(row,index){
    if(typeof row==='string')return {title:'Storyline '+(index+1),body:row,subjects:[]};
    return {title:first(row&&row.title,row&&row.headline,'Storyline '+(index+1)),body:first(row&&row.body,row&&row.summary,row&&row.text),subjects:list(row&&row.subjects)};
  }

  function receiptPairs(receipts){
    if(!receipts||typeof receipts!=='object'||Array.isArray(receipts))return [];
    const labels={correctWinners:'Correct winners',winnerAccuracy:'Winner accuracy',scoreError:'Average score error',marginError:'Average margin error',deskGrade:'AI desk grade',graded:'Picks graded'};
    return Object.keys(labels).filter(key=>receipts[key]!==undefined&&receipts[key]!==null).map(key=>[labels[key],clean(receipts[key],'—')]);
  }

  function renderEditorialColumns(data,parent){
    const section=make('section','press-section press-middle-grid');
    const stories=make('div','');
    const head=make('div','press-section-head');head.append(make('h2','','Storylines to Watch'),make('p','','The arcs the newsroom will carry from one edition to the next.'));stories.appendChild(head);
    const storyList=make('div','press-story-list');
    if(data.storylines.length){
      data.storylines.forEach((raw,index)=>{
        const row=normalizedStory(raw,index),story=make('article','press-story');story.append(make('h3','',row.title),make('p','',row.body));
        const subjects=make('div','press-subjects');row.subjects.forEach(subject=>{const value=sentence(subject);if(value)subjects.appendChild(make('span','press-subject',value));});
        if(subjects.childNodes.length)story.appendChild(subjects);storyList.appendChild(story);
      });
    }else storyList.appendChild(make('div','press-story',"Season storylines will accumulate here as the year's evidence arrives."));
    stories.appendChild(storyList);section.appendChild(stories);

    const receipts=make('aside','press-receipts');receipts.append(make('div','press-receipts-kicker','Accountability desk'),make('h3','','The Receipts'));
    const pairs=receiptPairs(data.receipts);
    if(pairs.length){
      pairs.forEach(([label,value])=>{const stat=make('div','receipt-stat');stat.append(make('span','',label),make('strong','',value));receipts.appendChild(stat);});
      receipts.appendChild(make('p','','Original picks are immutable. Grades compare those picks with final results.'));
    }else{
      receipts.appendChild(make('p','','The original prediction is frozen at first kickoff. The latest forecast can move with injuries and lineup swaps, but it never rewrites the pick.'));
      receipts.appendChild(make('p','receipt-placeholder','Accuracy, projected-score error and the weekly desk grade appear here after matchups are final.'));
    }
    if(data.awards.length){
      const label=make('div','press-receipts-kicker','Weekly honors');label.style.marginTop='18px';receipts.appendChild(label);
      data.awards.forEach(award=>{const copy=joinSentences(award);if(copy)receipts.appendChild(make('p','',copy));});
    }
    section.appendChild(receipts);parent.appendChild(section);
  }

  function renderSource(data,parent){
    const source=make('div','press-source');
    source.appendChild(make('strong','','Transparent data desk'));
    const details=[];
    if(data.dataAsOf)details.push('Facts verified '+dateLabel(data.dataAsOf,true));
    if(data.sourceId)details.push('Snapshot '+data.sourceId);
    details.push('Scores and lineups: Sleeper API');
    source.append(make('span','',details.join(' · ')),make('span','','Narrative generated from frozen league facts; calculations remain deterministic.'));
    parent.appendChild(source);
  }

  function appendStandaloneWatch(){
    const watch=make('section','press-watch');pressState.panel.appendChild(watch);pressState.watchMount=watch;renderLineupWatch();
  }

  function renderLiveDesk(){
    pressState.watchMount=null;pressState.panel.replaceChildren();
    const hero=make('div','press-live-hero'),copy=make('div','');
    copy.append(make('span','press-overline','Continuously updated'),make('h1','','Live Desk'),make('p','','Injuries, starter changes and bench pivots update before players lock. Published predictions remain untouched for The Receipts.'));
    const pulse=make('div','press-live-pulse');
    pulse.append(make('b','',pressState.watchSnapshot?'Week '+pressState.watchSnapshot.currentWeek:'Connecting…'),make('span','','Latest forecast · not the frozen pick'));
    hero.append(copy,pulse);pressState.panel.appendChild(hero);
    const watch=make('section','press-watch');pressState.panel.appendChild(watch);pressState.watchMount=watch;renderLineupWatch(true);
    const source=make('div','press-source');source.append(make('strong','','How this moves'),make('span','','Official Sleeper starters and league-scoring projections are recomputed on refresh.'),make('span','','A player locks when that player’s game begins.'));
    pressState.panel.appendChild(source);
  }

  function teamName(team){return first(team&&team.name,team&&team.manager,'Roster '+first(team&&team.rosterId,'?'));}
  function teamProjection(team){return number(team&&team.projection,number(team&&team.projectedPoints,null));}
  function teamChanged(team){const delta=finite(team&&team.projectionDelta);return Boolean(team&&(team.changed||team.lineupChanged||(delta!==null&&Math.abs(delta)>=1)));}
  function teamInjuries(team){return list(team&&team.injuries||team&&team.injuryAlerts);}
  function teamPivots(team){return list(team&&team.pivots||team&&team.benchPivots);}

  function watchTeams(){return list(pressState.watch&&pressState.watch.teams);}
  function findWatchTeam(name,rosterId){
    const teams=watchTeams();
    return teams.find(team=>rosterId!==undefined&&String(team.rosterId)===String(rosterId))||teams.find(team=>teamName(team)===name)||null;
  }

  function renderLineupWatch(expanded){
    const mount=pressState.watchMount;if(!mount)return;
    mount.replaceChildren();
    const head=make('div','watch-head'),title=make('div','watch-title');
    title.append(make('span','watch-dot'),make('h2','','Lineup Watch'));
    const actions=make('div','watch-actions');
    const updated=pressState.watch&&first(pressState.watch.updatedAt,pressState.watchSnapshot&&pressState.watchSnapshot.fetchedAt);
    actions.appendChild(make('span','',updated?'Updated '+dateLabel(updated,true):'Waiting for the league feed'));
    const refresh=make('button','watch-refresh',pressState.watchBusy?'Refreshing…':'Refresh');refresh.type='button';refresh.disabled=pressState.watchBusy;
    refresh.addEventListener('click',()=>refreshLineupWatch(true));actions.appendChild(refresh);head.append(title,actions);mount.appendChild(head);
    const status=make('div','watch-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    if(pressState.watchBusy&&!pressState.watch)status.textContent='Checking starters, injuries and available bench pivots…';
    else if(pressState.watchError)status.textContent=pressState.watchError;
    else if(pressState.watch){
      const phase=first(pressState.watch.phase&&pressState.watch.phase.label,pressState.watch.phase,pressState.watchSnapshot&&window.FarmhoodLive&&window.FarmhoodLive.phase(pressState.watchSnapshot).label);
      const coverage=finite(pressState.watch.projectionCoverage);
      status.textContent=[phase,coverage!==null?Math.round(coverage*100)+'% projection coverage':'','Auto-refreshes every minute'].filter(Boolean).join(' · ');
    }else status.textContent='Connecting to the official league feed…';
    mount.appendChild(status);

    if(!pressState.watch){
      mount.appendChild(make('div','watch-empty',pressState.watchError||'Live lineup intelligence is warming up. Published predictions and the archive remain available.'));return;
    }
    const matchups=list(pressState.watch.matchups);
    const board=make('div','watch-grid');
    if(matchups.length){
      matchups.forEach((row,index)=>board.appendChild(renderWatchMatchup(row,index,expanded)));
    }else{
      const teams=watchTeams();teams.forEach(team=>board.appendChild(renderWatchTeam(team,expanded)));
    }
    if(!board.childNodes.length)mount.appendChild(make('div','watch-empty','Sleeper has not posted this week’s lineups yet. Lineup Watch will populate automatically.'));
    else mount.appendChild(board);
  }

  function renderWatchMatchup(row,index,expanded){
    const managerA=first(row&&row.managerA,row&&row.teamA&&row.teamA.name,'Team A');
    const managerB=first(row&&row.managerB,row&&row.teamB&&row.teamB.name,'Team B');
    const teamA=findWatchTeam(managerA,row&&row.rosterIdA),teamB=findWatchTeam(managerB,row&&row.rosterIdB);
    const projectionA=number(row&&row.projectionA,teamProjection(teamA));
    const projectionB=number(row&&row.projectionB,teamProjection(teamB));
    const injuries=[...teamInjuries(teamA),...teamInjuries(teamB)];
    const pivots=[...teamPivots(teamA),...teamPivots(teamB)];
    const changed=teamChanged(teamA)||teamChanged(teamB)||Boolean(row&&row.changed);
    const card=make('article','watch-card'+(injuries.length?' alert':changed?' changed':''));
    const top=make('div','watch-card-top');top.appendChild(make('h3','',managerA+' vs '+managerB));
    top.appendChild(make('span','watch-badge '+(injuries.length?'alert':changed?'changed':''),injuries.length?injuries.length+' injury '+(injuries.length===1?'alert':'alerts'):changed?'Lineup changed':'No new swaps'));
    card.appendChild(top);
    const numbers=make('div','watch-numbers'),a=make('div','watch-number'),b=make('div','watch-number');
    a.append(make('small','',managerA),make('strong','',points(projectionA)));b.append(make('small','',managerB),make('strong','',points(projectionB)));
    numbers.append(a,make('span','watch-vs','PROJ'),b);card.appendChild(numbers);
    const winner=first(row&&row.predictedWinner,row&&row.pick&&row.pick.manager);
    if(winner){const callout=make('p','watch-callout');callout.append(make('strong','','Latest forecast: '),make('span','',winner+' '+probability(row&&row.winProbability)));card.appendChild(callout);}
    appendWatchDetails(card,injuries,pivots,teamA,teamB,expanded);
    return card;
  }

  function renderWatchTeam(team,expanded){
    const injuries=teamInjuries(team),pivots=teamPivots(team),changed=teamChanged(team);
    const card=make('article','watch-card'+(injuries.length?' alert':changed?' changed':''));
    const top=make('div','watch-card-top');top.append(make('h3','',teamName(team)),make('span','watch-badge '+(injuries.length?'alert':changed?'changed':''),injuries.length?'Injury alert':changed?'Lineup changed':'No new swaps'));card.appendChild(top);
    const numbers=make('div','watch-numbers'),projection=make('div','watch-number');projection.append(make('small','','Current projection'),make('strong','',points(teamProjection(team))));numbers.append(projection,make('span','watch-vs',''));
    const delta=make('div','watch-number');delta.append(make('small','','Since last check'),make('strong','',finite(team&&team.projectionDelta)===null?'—':(Number(team.projectionDelta)>=0?'+':'')+Number(team.projectionDelta).toFixed(1)));numbers.appendChild(delta);card.appendChild(numbers);
    appendWatchDetails(card,injuries,pivots,team,null,expanded);return card;
  }

  function appendWatchDetails(card,injuries,pivots,teamA,teamB,expanded){
    const injuryText=injuries.map(sentence).filter(Boolean);
    const pivotText=pivots.map(sentence).filter(Boolean);
    if(injuryText.length){const row=make('p','watch-callout injury');row.append(make('strong','','Injury watch: '),make('span','',injuryText.slice(0,expanded?6:2).join(' · ')));card.appendChild(row);}
    if(pivotText.length){const row=make('p','watch-callout pivot');row.append(make('strong','','Bench pivot: '),make('span','',pivotText.slice(0,expanded?6:2).join(' · ')));card.appendChild(row);}
    const emptyCount=team=>Array.isArray(team&&team.emptySlots)?team.emptySlots.length:number(team&&team.emptySlots,0);
    const empties=[emptyCount(teamA),emptyCount(teamB)].reduce((sum,value)=>sum+(value||0),0);
    if(empties){const row=make('p','watch-callout injury');row.append(make('strong','','Lineup warning: '),make('span','',empties+' empty starting '+(empties===1?'slot':'slots')));card.appendChild(row);}
    const lockedCount=team=>Array.isArray(team&&team.lockedSlots)?team.lockedSlots.length:number(team&&team.lockedSlots,0);
    const locked=[lockedCount(teamA),lockedCount(teamB)].reduce((sum,value)=>sum+(value||0),0);
    if(locked){const row=make('p','watch-callout locked');row.append(make('strong','','Locked: '),make('span','',locked+' starter '+(locked===1?'slot has':'slots have')+' begun play and will not receive bench-pivot suggestions.'));card.appendChild(row);}
  }

  function fallbackWatch(snapshot,playerFeed){
    if(!window.FarmhoodLive||typeof window.FarmhoodLive.groupMatchups!=='function')return null;
    const groups=window.FarmhoodLive.groupMatchups(snapshot.matchups,snapshot.rosters),teams=[];
    groups.forEach(group=>group.sides.forEach(side=>{
      const lineup=window.FarmhoodLive.lineupFor(side,snapshot.rosterPositions,playerFeed);
      const values=lineup.map(player=>finite(player.projection)).filter(value=>value!==null);
      teams.push({rosterId:side.rosterId,name:side.name,projection:values.length?values.reduce((sum,value)=>sum+value,0):null,
        injuries:lineup.filter(player=>player.injury).map(player=>({playerName:player.name,status:player.injury})),
        pivots:[],changed:false,emptySlots:lineup.filter(player=>player.id==='0').length});
    }));
    return {season:snapshot.season,week:snapshot.currentWeek,phase:window.FarmhoodLive.phase(snapshot).label,updatedAt:Date.now(),teams,
      matchups:groups.filter(group=>group.sides.length===2).map(group=>{
        const a=teams.find(team=>team.rosterId===group.sides[0].rosterId),b=teams.find(team=>team.rosterId===group.sides[1].rosterId);
        return {matchupId:group.id,managerA:a&&a.name,managerB:b&&b.name,projectionA:a&&a.projection,projectionB:b&&b.projection,predictedWinner:a&&b&&a.projection!==null&&b.projection!==null?(a.projection>=b.projection?a.name:b.name):''};
      }),source:'basic-live'};
  }

  async function refreshLineupWatch(force){
    if(pressState.watchBusy)return;
    const live=window.FarmhoodLive;
    if(!live||typeof live.load!=='function'){
      pressState.watchError='Live Lineup Watch is unavailable in this browser.';renderLineupWatch();return;
    }
    pressState.watchBusy=true;pressState.watchError='';renderLineupWatch(pressState.activeTab==='live');
    try{
      const snapshot=await live.load({force:Boolean(force)});
      const playerFeed=typeof live.loadPlayers==='function'?await live.loadPlayers(snapshot,snapshot.currentWeek,{force:Boolean(force)}):{players:{},source:'unavailable'};
      const article=pressState.activeArticle||{};
      const baseline=article.lineupSnapshot||(article.source&&article.source.lineupSnapshot)||null;
      const watch=typeof live.lineupWatch==='function'?await live.lineupWatch(snapshot,playerFeed,baseline):fallbackWatch(snapshot,playerFeed);
      if(!watch)throw new Error('Lineup intelligence has not initialized.');
      pressState.watchSnapshot=snapshot;pressState.watchPlayers=playerFeed;pressState.watch=watch;
      if(typeof live.lineupWatch!=='function')pressState.watchError='Starter projections are live; injury-aware bench pivots are still warming up.';
    }catch(_error){
      pressState.watchError=pressState.watch?'The newest check failed; showing the last available lineup snapshot.':'The live league feed could not connect. Published reporting is still available.';
    }finally{
      pressState.watchBusy=false;renderLineupWatch(pressState.activeTab==='live');
    }
  }

  function renderArchive(){
    pressState.watchMount=null;pressState.panel.replaceChildren();
    const heading=make('div','press-live-hero'),copy=make('div','');
    copy.append(make('span','press-overline','Permanent record'),make('h1','','Edition Archive'),make('p','','Original previews, final recaps, prediction receipts and the season stories that survived the week.'));
    heading.appendChild(copy);pressState.panel.appendChild(heading);
    const rows=indexArticles();
    if(!rows.length){pressState.panel.appendChild(make('div','press-empty','No published editions are in the archive yet.'));return;}
    const grid=make('div','press-archive');grid.style.marginTop='24px';
    rows.slice().sort((a,b)=>new Date(b.publishedAt||0)-new Date(a.publishedAt||0)).forEach(meta=>{
      const card=make('button','press-archive-card');card.type='button';
      const top=make('div','press-archive-meta');top.append(make('span','',[first(meta.edition,meta.type,'Feature'),meta.week!==undefined?'Week '+meta.week:''].filter(Boolean).join(' · ')),make('span','',dateLabel(meta.publishedAt,false)));
      card.append(top,make('h3','',first(meta.title,'Untitled edition')),make('p','',first(meta.dek,meta.deck,'Open this edition from the permanent Farmhood record.')),make('span','press-archive-open','Read edition →'));
      card.addEventListener('click',()=>{const kind=kindOf(meta);pressState.activeTab=kind==='recap'?'recap':'preview';updateTabState();loadArticle(meta);window.scrollTo({top:0,behavior:'smooth'});});
      grid.appendChild(card);
    });
    pressState.panel.appendChild(grid);
  }

  function beginPolling(){
    if(pressState.watchTimer)return;
    const refresh=window.FarmhoodLive&&finite(window.FarmhoodLive.refreshMs)||60000;
    pressState.watchTimer=window.setInterval(()=>{if(!document.hidden)refreshLineupWatch(false);},Math.max(30000,refresh));
    window.addEventListener('pagehide',()=>{if(pressState.watchTimer)window.clearInterval(pressState.watchTimer);},{once:true});
  }

  buildShell();
  loadIndex();
  refreshLineupWatch(false);
  beginPolling();
})();
