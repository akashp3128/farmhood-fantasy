/* Farmhood Press V2 — isolated front page, week dossier and long-form reader. */
(function(){
  'use strict';

  const app=document.getElementById('app');
  if(!app)return;

  const state={
    index:null,
    shadow:false,
    dossier:null,
    storyMemory:null,
    chromeMounted:false,
    articles:new Map(),
    stage:null,
    nav:new Map(),
    archiveFilter:'all',
    request:0
  };

  function make(tag,className,text){
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text!==undefined&&text!==null)node.textContent=String(text);
    return node;
  }

  function first(){
    for(let i=0;i<arguments.length;i++){
      const value=arguments[i];
      if(value!==undefined&&value!==null&&String(value).trim())return String(value).trim();
    }
    return '';
  }

  function list(value){return Array.isArray(value)?value.filter(Boolean):[];}
  function numeric(value){const parsed=Number(value);return value!==null&&value!==''&&Number.isFinite(parsed)?parsed:null;}
  function points(value){const parsed=numeric(value);return parsed===null?'—':parsed.toFixed(2).replace(/0$/,'').replace(/\.0$/,'');}

  function unique(values){return [...new Set(list(values).filter(Boolean))];}

  function subjectLabels(value){
    return unique(list(value).map(subject=>{
      const label=typeof subject==='string'?subject:first(subject&&subject.label,subject&&subject.manager,subject&&subject.name);
      const ownerId=String(label).replace(/^manager:/,'');
      return window.LEAGUE&&window.LEAGUE.live2026&&window.LEAGUE.live2026.owners&&window.LEAGUE.live2026.owners[ownerId]||label;
    }).filter(Boolean));
  }

  function citedBlocks(value,fallbackFactIds){
    const fallback=unique(fallbackFactIds),rows=Array.isArray(value)?value:(value?[value]:[]),blocks=[];
    rows.forEach(row=>{
      if(typeof row==='string'){
        const textValue=first(row);if(textValue)blocks.push({text:textValue,factIds:fallback});return;
      }
      if(!row||typeof row!=='object')return;
      const rowFacts=unique(list(row.factIds).length?row.factIds:fallback);
      if(Array.isArray(row.body)&&!first(row.text,row.summary,row.copy)){
        blocks.push(...citedBlocks(row.body,rowFacts));return;
      }
      const textValue=first(row.text,typeof row.body==='string'?row.body:'',row.summary,row.copy);
      if(textValue)blocks.push({text:textValue,factIds:rowFacts,focus:first(row.focus)});
    });
    return blocks;
  }

  function blockFactIds(blocks){return unique(list(blocks).flatMap(block=>list(block&&block.factIds)));}
  function blocksText(blocks){return list(blocks).map(block=>first(block&&block.text,block)).filter(Boolean).join(' ');}

  function matchupStorySections(source,fallbackText,fallbackFactIds){
    const row=source&&typeof source==='object'?source:{},fallback=unique(fallbackFactIds||row.factIds);
    const body=citedBlocks(row.body,fallback),focused=body.some(block=>block.focus);
    let happened=citedBlocks(row.whatHappened,fallback),mattered=citedBlocks(row.whyItMattered||row.whyItMatters,fallback),next=citedBlocks(row.nextChapter||row.carryForward,fallback);
    if(focused){
      happened=body.filter(block=>block.focus==='what_happened');
      mattered=body.filter(block=>block.focus==='why_it_mattered');
      next=body.filter(block=>block.focus==='next_chapter');
    }else if(!happened.length&&!mattered.length&&!next.length&&body.length>=3){
      const openingCount=body.length>=4?2:1;
      happened=body.slice(0,openingCount);mattered=body.slice(openingCount,-1);next=body.slice(-1);
    }else if(!happened.length&&!mattered.length&&!next.length){
      happened=body.length?body.slice(0,1):citedBlocks(fallbackText,fallback);
      mattered=body.slice(1);
    }
    return [
      {key:'happened',label:'What happened',blocks:happened},
      {key:'mattered',label:'Why it mattered',blocks:mattered},
      {key:'next',label:'Next chapter',blocks:next}
    ].filter(section=>section.blocks.length);
  }

  function normalizedSeasonArc(row,fallbackStatus){
    if(!row||typeof row!=='object')return null;
    const fallbackFacts=unique(row.factIds),whyNow=citedBlocks(row.whyNow||row.whyItMattered||row.whyItMatters||row.body||row.summary,fallbackFacts);
    const carryForward=citedBlocks(row.carryForward||row.nextChapter,fallbackFacts);
    const headline=first(row.headline,row.title);
    if(!headline&&!whyNow.length&&!carryForward.length)return null;
    return {
      id:first(row.id,row.arcId),
      headline:first(headline,'Season storyline'),
      status:first(row.status,row.state,fallbackStatus),
      subjects:subjectLabels(row.subjects||row.managers),
      thesis:citedBlocks(row.thesis,fallbackFacts),
      body:citedBlocks(row.body,fallbackFacts),
      whyNow,
      carryForward
    };
  }

  function normalizeSeasonStoryline(article){
    if(!article||typeof article!=='object')return null;
    const raw=article.seasonStoryline&&typeof article.seasonStoryline==='object'?article.seasonStoryline:null;
    if(!raw)return null;
    const carrySection=list(article.deskSections).find(section=>['carries_forward','sunday_watch','standings_stakes'].includes(first(section&&section.kind)));
    const source=raw,fallbackFacts=unique(source&&source.factIds||blockFactIds(citedBlocks(source&&source.body)));
    const whyNow=citedBlocks(source&&source.whyNow||source&&source.whyItMattered||source&&source.whyItMatters||source&&source.body,fallbackFacts);
    const carryForward=citedBlocks(source&&source.carryForward||source&&source.nextChapter||carrySection&&carrySection.body,fallbackFacts);
    const explicitSecondary=list(raw&&(raw.secondaryArcs||raw.arcs));
    const secondarySource=explicitSecondary.length?explicitSecondary:list(article.secondaryArcs);
    const secondaryArcs=secondarySource.map(row=>normalizedSeasonArc(row,'On the board')).filter(Boolean).slice(0,3);
    return {
      id:first(source.id,source.arcId),
      headline:first(source&&source.headline,source&&source.title,'The season’s defining thread'),
      status:first(source&&source.status,source&&source.state,raw?'Developing':'Current lead'),
      subjects:subjectLabels(source&&source.subjects||source&&source.managers),
      thesis:citedBlocks(source&&source.thesis,fallbackFacts),
      body:citedBlocks(source&&source.body,fallbackFacts),
      whyNow,
      carryForward,
      secondaryArcs,
      explicit:true
    };
  }

  function dateLabel(value,withTime){
    const parsed=new Date(value);
    if(!value||Number.isNaN(parsed.getTime()))return '';
    const options=withTime
      ?{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/Chicago',timeZoneName:'short'}
      :{month:'long',day:'numeric',year:'numeric',timeZone:'America/Chicago'};
    try{return new Intl.DateTimeFormat(undefined,options).format(parsed);}catch(_error){return String(value);}
  }

  function typeOf(row){
    const raw=first(row&&row.type,row&&row.edition).toLowerCase();
    if(raw.includes('waiver'))return 'waivers';
    if(raw.includes('recap')||raw.includes('postgame'))return 'recap';
    return 'preview';
  }

  function editionLabel(row){
    if(typeOf(row)==='waivers')return 'Waiver Wire';
    if(typeOf(row)==='recap')return 'Postgame Recap';
    return first(row&&row.edition).toLowerCase().includes('outlook')?'Weekend Outlook':'Pregame Preview';
  }

  function publishedRows(){
    return list(state.index&&state.index.articles).filter(row=>first(row.status,'published').toLowerCase()!=='draft');
  }

  function articleId(row){return first(row&&row.articleId,row&&row.id,row&&row.slug);}
  function latestWeek(){return publishedRows().reduce((max,row)=>Math.max(max,numeric(row.week)||0),0);}
  function featuredMeta(){
    const rows=publishedRows(),wanted=first(state.index&&state.index.featuredArticleId);
    return rows.find(row=>articleId(row)===wanted)||rows[0]||null;
  }

  function safeArticleUrl(path){
    const raw=first(path);
    if(!raw)return null;
    try{
      const target=new URL(raw,window.location.href),roots=[new URL('content/articles/',window.location.href),new URL('content/press-v2/',window.location.href)];
      if(!roots.some(root=>target.origin===root.origin&&target.pathname.startsWith(root.pathname))||!target.pathname.endsWith('.json'))return null;
      return target;
    }catch(_error){return null;}
  }

  async function fetchJson(url){
    const response=await fetch(url,{cache:'no-store',credentials:'same-origin',headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error('The newsroom file could not be opened ('+response.status+').');
    return response.json();
  }

  async function loadArticle(meta){
    const id=articleId(meta);
    if(id&&state.articles.has(id))return state.articles.get(id);
    const url=safeArticleUrl(meta&&meta.path);
    if(!url)throw new Error('This edition does not have a valid story file.');
    const article=await fetchJson(url.href);
    if(!article||typeof article!=='object')throw new Error('This edition is not a valid story.');
    if(id)state.articles.set(id,article);
    return article;
  }

  function normalizeArticle(article,meta){
    const envelope=article&&article.kind==='farmhood_press_v2_shadow_edition'?article:null;
    const copy=envelope&&envelope.article?envelope.article:article;
    const rawLead=copy&&copy.lead,lead=rawLead&&typeof rawLead==='object'&&!Array.isArray(rawLead)?rawLead:{};
    const leadParagraphs=Array.isArray(rawLead)?rawLead:list(lead.body||copy.body||copy.paragraphs);
    const longForm=envelope?copy:null;
    const features=longForm?[longForm.mainEvent,...list(longForm.supportingStories),...list(longForm.deskSections)]:[];
    const featureBody=row=>citedBlocks(row&&row.body,row&&row.factIds);
    const matchupStories=longForm?[longForm.mainEvent,...list(longForm.supportingStories),...list(longForm.aroundLeague).map(row=>({...row,matchupIds:[row.matchupId]}))]:[];
    const storylines=longForm?features.map(row=>({
      title:first(row&&row.headline,row&&row.kind&&String(row.kind).replaceAll('_',' ')),
      body:featureBody(row).map(block=>first(block&&block.text,block)).join(' '),
      subjects:list(row&&row.subjects),
      factIds:featureBody(row).flatMap(block=>list(block&&block.factIds))
    })):list(copy.storylines);
    const evidenceFacts=list(envelope&&envelope.evidence&&envelope.evidence.facts);
    const webClaims=list(envelope&&envelope.evidence&&envelope.evidence.acceptedWebClaims);
    const featureForMatchup=id=>matchupStories.find(row=>list(row&&row.matchupIds).map(Number).includes(Number(id)));
    const matchupIds=[...new Set(evidenceFacts.map(fact=>numeric(fact&&fact.context&&fact.context.matchupId)).filter(value=>value!==null))].sort((a,b)=>a-b);
    const fallbackV2Matchups=matchupIds.map(id=>{
      const facts=evidenceFacts.filter(fact=>numeric(fact&&fact.context&&fact.context.matchupId)===id);
      const scores=facts.filter(fact=>fact.kind==='team_week_score');
      const result=facts.find(fact=>fact.kind==='matchup_result');
      const feature=featureForMatchup(id);
      const top=facts.find(fact=>fact.kind==='team_top_starter');
      const history=facts.find(fact=>fact.kind==='head_to_head_record');
      const storySections=matchupStorySections(feature,first(result&&result.claim),feature&&feature.factIds);
      return {
        matchupId:id,
        managerA:first(scores[0]&&scores[0].subject&&scores[0].subject.label,result&&result.subject&&result.subject.label),
        managerB:first(scores[1]&&scores[1].subject&&scores[1].subject.label,result&&result.related&&result.related[0]&&result.related[0].label),
        finalScoreA:scores[0]&&scores[0].value,
        finalScoreB:scores[1]&&scores[1].value,
        winner:first(result&&result.subject&&result.subject.label),
        headline:first(feature&&feature.headline,'Matchup '+id),
        analysis:blocksText(storySections.flatMap(section=>section.blocks)),
        storySections,
        citationIds:blockFactIds(storySections.flatMap(section=>section.blocks)),
        keyPlayer:first(top&&top.subject&&top.subject.label),
        historyNote:first(history&&history.claim),
        injuryWatch:facts.filter(fact=>fact.kind==='player_availability_status').map(fact=>fact.claim)
      };
    });
    const gamebookRows=list(envelope&&envelope.gamebook&&envelope.gamebook.matchups);
    const v2Matchups=gamebookRows.length?gamebookRows.map(row=>{
      const id=numeric(row.matchupId),facts=evidenceFacts.filter(fact=>numeric(fact&&fact.context&&fact.context.matchupId)===id),feature=featureForMatchup(id);
      const teams=list(row.teams),teamA=teams[0]||{},teamB=teams[1]||{};
      const recap=first(copy.edition).toLowerCase()==='recap';
      const projectionA=numeric(teamA.projection),projectionB=numeric(teamB.projection);
      const projectedWinner=projectionA===null||projectionB===null||projectionA===projectionB?'':projectionA>projectionB?teamA.manager:teamB.manager;
      const top=facts.find(fact=>fact.kind==='team_top_starter'),history=facts.find(fact=>fact.kind==='head_to_head_record');
      const storySections=matchupStorySections(feature,first(row.resultClaim),feature&&feature.factIds);
      return {
        matchupId:id,
        managerA:first(teamA.manager,feature&&feature.subjects&&feature.subjects[0]),
        managerB:first(teamB.manager,feature&&feature.subjects&&feature.subjects[1]),
        currentScoreA:numeric(teamA.score),currentScoreB:numeric(teamB.score),
        finalScoreA:recap?numeric(teamA.score):null,finalScoreB:recap?numeric(teamB.score):null,
        forecastScoreA:recap?null:projectionA,forecastScoreB:recap?null:projectionB,
        forecastWinner:recap?'':projectedWinner,winner:recap?first(row.resultLeader):'',
        headline:first(feature&&feature.headline,'Matchup '+id),
        analysis:blocksText(storySections.flatMap(section=>section.blocks)),
        storySections,
        citationIds:blockFactIds(storySections.flatMap(section=>section.blocks)),
        keyPlayer:first(row.topStarters&&row.topStarters[0]&&row.topStarters[0].player,top&&top.subject&&top.subject.label),
        historyNote:first(history&&history.claim),
        injuryWatch:list(row.injuries).map(injury=>first(injury.claim,[injury.player,injury.status].filter(Boolean).join(' — ')))
      };
    }):fallbackV2Matchups;
    return {
      raw:copy,
      envelope:envelope,
      longForm:longForm,
      meta:meta||{},
      id:first(envelope&&envelope.articleId,copy.articleId,articleId(meta)),
      type:typeOf(copy),
      season:numeric(envelope&&envelope.season)||numeric(copy.season)||numeric(meta&&meta.season)||2026,
      week:numeric(envelope&&envelope.week)||numeric(copy.week)||numeric(meta&&meta.week),
      edition:editionLabel(copy),
      title:first(copy.title,meta&&meta.title,'Untitled edition'),
      dek:first(copy.dek,copy.deck,meta&&meta.dek,meta&&meta.deck),
      byline:first(copy.byline,'Farmhood Intelligence Desk'),
      publishedAt:first(envelope&&envelope.generatedAt,copy.publishedAt,meta&&meta.publishedAt,meta&&meta.generatedAt),
      dataAsOf:first(envelope&&envelope.dataAsOf,copy.dataAsOf,copy.source&&copy.source.dataAsOf,meta&&meta.dataAsOf),
      leadParagraphs:leadParagraphs.map(value=>typeof value==='string'?value:first(value&&value.text,value&&value.body)).filter(Boolean),
      thesis:first(copy.thesis&&copy.thesis.text),
      pullQuote:first(lead.pullQuote,copy.pullQuote&&copy.pullQuote.text,copy.pullQuote),
      keyStat:lead.keyStat&&typeof lead.keyStat==='object'?lead.keyStat:(copy.keyStat||null),
      storylines:storylines,
      seasonStoryline:longForm?normalizeSeasonStoryline(longForm):null,
      matchups:longForm?v2Matchups:list(copy.matchups),
      transactions:list(copy.transactions),
      transactionSummary:copy.transactionSummary&&typeof copy.transactionSummary==='object'?copy.transactionSummary:{},
      receipts:copy.receipts&&typeof copy.receipts==='object'?copy.receipts:null,
      awards:list(copy.awards),
      forecastContext:copy.forecastContext&&typeof copy.forecastContext==='object'?copy.forecastContext:{},
      source:envelope?{snapshotId:first(envelope.evidence&&envelope.evidence.sourceLedger&&envelope.evidence.sourceLedger[0]&&envelope.evidence.sourceLedger[0].contentHash),model:envelope.generation&&envelope.generation.model}:copy.source&&typeof copy.source==='object'?copy.source:{},
      factCheck:envelope?{status:envelope.quality&&envelope.quality.rubric&&envelope.quality.rubric.pass?'passed':'review',matchupsReconciled:v2Matchups.length}:copy.factCheck&&typeof copy.factCheck==='object'?copy.factCheck:{},
      tags:list(copy.tags||meta&&meta.tags),
      webSources:list(envelope&&envelope.evidence&&envelope.evidence.webSources),
      webClaims:webClaims,
      quality:envelope&&envelope.quality||null,
      memory:envelope&&envelope.memory||envelope&&envelope.editorialMemory||null,
      totalCost:numeric(envelope&&envelope.generation&&envelope.generation.totalEstimatedCostUsd)
    };
  }

  function storyTitle(row,index){return typeof row==='string'?'Storyline '+(index+1):first(row&&row.title,'Storyline '+(index+1));}
  function storyBody(row){return typeof row==='string'?row:first(row&&row.body,row&&row.summary,row&&row.text);}
  function storySubjects(row){return row&&typeof row==='object'?list(row.subjects):[];}

  function estimatedRead(data){
    const words=[];
    words.push(...data.leadParagraphs);
    data.storylines.forEach(row=>words.push(storyBody(row)));
    data.matchups.forEach(row=>words.push(first(row.analysis,row.body,row.summary)));
    if(data.seasonStoryline)words.push(...[data.seasonStoryline.thesis,data.seasonStoryline.body,data.seasonStoryline.whyNow,data.seasonStoryline.carryForward].flat().map(block=>block.text));
    const count=unique(words).join(' ').trim().split(/\s+/).filter(Boolean).length;
    return Math.max(3,Math.ceil(count/210));
  }

  function buildShell(){
    if(!state.chromeMounted&&typeof window.mountChrome==='function'){window.mountChrome('press');state.chromeMounted=true;}
    app.replaceChildren();

    const prototype=make('div','pv2-prototype-bar');
    prototype.append(make('span','','Press V2 · Isolated editorial prototype'));
    const back=make('a','','Return to the current Press');back.href='press.html';prototype.appendChild(back);
    app.appendChild(prototype);

    const masthead=make('header','pv2-masthead');
    const dateline=make('div','pv2-dateline');
    dateline.append(
      make('span','','The league, reported with receipts'),
      make('span','','Est. 2026'),
      make('span','',new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric'}).format(new Date()))
    );
    masthead.append(dateline,make('div','pv2-name','The Farmhood Press'),make('p','pv2-tagline','Long-form league journalism with a verified gamebook beside every story.'));
    app.appendChild(masthead);

    const nav=make('nav','pv2-nav');nav.setAttribute('aria-label','Press V2 sections');
    [['latest','Latest'],['week','Week'],['storylines','Storylines'],['archive','Archive']].forEach(([key,label])=>{
      const button=make('button','pv2-nav-button',label);button.type='button';button.dataset.route=key;
      button.addEventListener('click',()=>go(key,true));state.nav.set(key,button);nav.appendChild(button);
    });
    app.appendChild(nav);
    const stage=make('section','pv2-stage');stage.id='press-v2-stage';stage.tabIndex=-1;app.appendChild(stage);state.stage=stage;
    stage.setAttribute('aria-label','Farmhood Press content');
  }

  function currentRoute(){
    const hash=decodeURIComponent(location.hash.replace(/^#/,''));
    if(hash.startsWith('article/'))return {name:'article',id:hash.slice(8)};
    if(['latest','week','storylines','archive'].includes(hash))return {name:hash};
    return {name:'latest'};
  }

  function setNav(name){
    state.nav.forEach((button,key)=>{
      const active=key===name||(name==='article'&&key==='latest');
      if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
      if(key==='week')button.textContent=latestWeek()?'Week '+latestWeek():'Week';
    });
  }

  function go(name,focus){
    const target='#'+name;
    if(location.hash===target){route(focus);return;}
    if(focus)state.stage.dataset.focusAfterRoute='true';
    location.hash=name;
  }

  function openArticle(id){go('article/'+encodeURIComponent(id),true);}

  function finishRender(){
    if(state.stage.dataset.focusAfterRoute==='true'){
      delete state.stage.dataset.focusAfterRoute;
      state.stage.focus({preventScroll:true});
      const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
      state.stage.scrollIntoView({behavior:reduced?'auto':'smooth',block:'start'});
    }
  }

  function renderLoading(label){
    state.stage.replaceChildren();
    const empty=make('div','pv2-empty');empty.setAttribute('role','status');
    const copy=make('div','');copy.append(make('h1','','The desk is opening'),make('p','',label));empty.appendChild(copy);state.stage.appendChild(empty);
  }

  function renderError(title,message,retry){
    state.stage.replaceChildren();
    const empty=make('div','pv2-empty'),copy=make('div','');empty.setAttribute('role','alert');copy.append(make('h1','',title),make('p','',message));
    const action=make('button','pv2-button pv2-button-secondary',retry?'Try again':'Back to Latest');action.type='button';action.addEventListener('click',retry||(()=>go('latest',true)));copy.appendChild(action);empty.appendChild(copy);state.stage.appendChild(empty);finishRender();
  }

  function metaLine(data){
    const meta=make('div','pv2-meta');
    [data.edition,'Week '+data.week,data.byline?'By '+data.byline:'',dateLabel(data.publishedAt,false),estimatedRead(data)+' min read'].filter(Boolean).forEach(value=>meta.appendChild(make('span','',value)));
    return meta;
  }

  function makeButton(label,handler,secondary){
    const button=make('button','pv2-button'+(secondary?' pv2-button-secondary':''),label);button.type='button';button.addEventListener('click',handler);return button;
  }

  function sourceKind(data){
    if(data.envelope)return data.envelope.publicationStatus==='format_preview'?'Existing frozen Week 3 record':'Press V2 typed fact registry';
    if(data.type==='waivers')return first(data.source.provider,'Sleeper transactions');
    if(data.type==='recap')return 'Final league snapshot';
    return data.edition==='Weekend Outlook'?'Live league snapshot':'Pregame league snapshot';
  }

  function appendFactRow(parent,label,value,className){
    const row=make('div','pv2-fact-row'),copy=make('strong',className||'',value);row.append(make('span','',label),copy);parent.appendChild(row);
  }

  function heroFacts(data){
    const card=make('aside','pv2-news-brief');
    card.append(make('span','pv2-label pv2-label-fact','Verified Gamebook'),make('h2','','At a glance'),make('p','','Facts below come from the frozen league record, separate from the column’s interpretation.'));
    const facts=make('div','pv2-fact-stack');
    appendFactRow(facts,'Fact check',first(data.factCheck.status,'Published').toUpperCase(),data.factCheck.status==='passed'?'pv2-win':'');
    appendFactRow(facts,'Source',sourceKind(data));
    if(data.matchups.length)appendFactRow(facts,'Matchups',String(data.matchups.length));
    if(data.transactions.length)appendFactRow(facts,'Transactions',String(data.transactions.length));
    if(data.keyStat){
      const key=data.keyStat&&typeof data.keyStat==='object'?data.keyStat:{};
      appendFactRow(facts,first(key.label,'Number to know'),first(key.value,data.keyStat));
    }
    card.appendChild(facts);return card;
  }

  function labStatusCard(){
    const dossier=state.dossier,card=make('details','pv2-news-brief pv2-lab-card pv2-review-details');
    card.appendChild(make('summary','','About this review'));
    if(!dossier){card.appendChild(make('p','','This review opens the existing league archive. A newly generated edition has not been loaded.'));return card;}
    card.appendChild(make('p','','The review uses frozen league records. This generation plan was prepared without a paid request.'));
    const facts=make('div','pv2-fact-stack');
    appendFactRow(facts,'Verified registry',String(dossier.reportingSummary&&dossier.reportingSummary.factCount||'—')+' facts');
    appendFactRow(facts,'Writer brief',String(dossier.selectedFactCount||'—')+' facts');
    if(dossier.writerPolicy&&dossier.writerPolicy.roughLocalTokenEstimate)appendFactRow(facts,'Local prompt estimate',Number(dossier.writerPolicy.roughLocalTokenEstimate).toLocaleString()+' tokens');
    appendFactRow(facts,'Web searches','Up to '+String(dossier.researchPolicy&&dossier.researchPolicy.maximumSearchCalls||3));
    appendFactRow(facts,'Internal safety stop','$'+Number(dossier.hardTotalCostUsd||.09).toFixed(2));
    appendFactRow(facts,'Owner-approved max','$'+Number(dossier.userApprovedMaximumUsd||.1).toFixed(2));
    appendFactRow(facts,'Live publishing','Disabled');
    card.appendChild(facts);return card;
  }

  function reviewNotice(data){
    if(!data.envelope||data.envelope.publicationStatus!=='format_preview')return null;
    return make('p','pv2-review-notice','Review copy · Based on the archived Week '+data.week+' league record.');
  }

  function sectionHeading(title,description){
    const head=make('div','pv2-section-heading');head.append(make('h2','',title),make('p','',description));return head;
  }

  function appendSubjects(parent,subjects){
    const names=subjectLabels(subjects);if(!names.length)return;
    const tags=make('div','pv2-subjects');tags.setAttribute('aria-label','Managers in this story');
    names.forEach(subject=>tags.appendChild(make('span','pv2-subject',subject)));parent.appendChild(tags);
  }

  function seasonStatus(status){
    const labels={emerging:'Emerging',active:'Developing',resolved:'Resolved',retired:'Archived'};
    return labels[String(status).toLowerCase()]||first(status,'Developing');
  }

  function renderSeasonDesk(data,options){
    const arc=data.seasonStoryline;if(!arc)return null;
    const settings=options||{},section=make('section','pv2-season-desk');
    if(settings.reader)section.id='pv2-context';
    section.setAttribute('aria-label','Main season storyline');
    const heading=make('header','pv2-season-heading'),title=make('div','');
    title.append(make('span','pv2-kicker','Season desk · '+data.season),make('h2','',arc.headline));
    heading.append(title,make('span','pv2-arc-status',seasonStatus(arc.status)));section.appendChild(heading);
    appendSubjects(section,arc.subjects);
    const narrative=make('div','pv2-season-copy');
    arc.thesis.forEach(block=>narrative.appendChild(citedParagraph(block,data,'pv2-season-thesis')));
    arc.body.forEach(block=>narrative.appendChild(citedParagraph(block,data)));section.appendChild(narrative);
    const developments=make('div','pv2-season-developments');
    [['Why this week matters',arc.whyNow],['The next chapter',arc.carryForward]].forEach(([label,blocks])=>{
      if(!blocks.length)return;
      const card=make('section','pv2-season-development');card.appendChild(make('h3','',label));
      blocks.forEach(block=>card.appendChild(citedParagraph(block,data)));developments.appendChild(card);
    });section.appendChild(developments);
    if(settings.withAction){const actions=make('div','pv2-actions');actions.appendChild(makeButton('Follow the season storylines',()=>go('storylines',true),true));section.appendChild(actions);}
    return section;
  }

  function renderArcCard(arc,data,options){
    const settings=options||{},card=make('article','pv2-thread');
    card.append(make('span','pv2-label pv2-label-context',settings.label||seasonStatus(arc.status)),make('h2','',arc.headline));
    appendSubjects(card,arc.subjects);
    const blocks=unique([...(arc.thesis||[]),...(arc.body||[]),...(arc.whyNow||[])].map(block=>block.text));
    blocks.forEach(textValue=>{
      const block=[...(arc.thesis||[]),...(arc.body||[]),...(arc.whyNow||[])].find(item=>item.text===textValue);
      card.appendChild(data?citedParagraph(block,data):make('p','',textValue));
    });
    if(arc.carryForward&&arc.carryForward.length){
      const next=make('div','pv2-thread-next');next.appendChild(make('h3','','What comes next'));
      arc.carryForward.forEach(block=>next.appendChild(data?citedParagraph(block,data):make('p','',block.text)));card.appendChild(next);
    }
    if(settings.week)card.appendChild(make('p','pv2-thread-date','Last reported · Week '+settings.week));
    if(settings.articleId)card.appendChild(makeButton('Read this edition',()=>openArticle(settings.articleId),true));
    return card;
  }

  async function renderLatest(){
    const request=++state.request,meta=featuredMeta();
    if(!meta){renderError('The press is between editions','No published stories were found.');return;}
    renderLoading('Setting the current issue on the front page…');
    try{
      const article=await loadArticle(meta);if(request!==state.request)return;
      const data=normalizeArticle(article,meta);state.stage.replaceChildren();

      const hero=make('section','pv2-front-hero'),lead=make('div','pv2-front-lead');
      lead.append(make('span','pv2-kicker','Lead story · '+data.edition),make('h1','pv2-front-title',data.title));
      if(data.dek)lead.appendChild(make('p','pv2-front-dek',data.dek));
      lead.appendChild(metaLine(data));
      const notice=reviewNotice(data);if(notice)lead.appendChild(notice);
      const preview=make('div','pv2-lead-preview');
      if(data.longForm)list(data.longForm.lead).slice(0,2).forEach(block=>preview.appendChild(citedParagraph(block,data)));
      else data.leadParagraphs.slice(0,2).forEach(paragraph=>preview.appendChild(make('p','',paragraph)));
      lead.appendChild(preview);
      const actions=make('div','pv2-actions');actions.append(makeButton('Read the full edition',()=>openArticle(data.id)),makeButton('Open Week '+data.week+' dossier',()=>go('week',true),true));lead.appendChild(actions);hero.appendChild(lead);
      const rail=make('div','pv2-front-rail');rail.appendChild(heroFacts(data));
      if(!state.shadow||data.envelope&&data.envelope.publicationStatus==='format_preview')rail.appendChild(labStatusCard());
      if(data.webSources.length){
        const sources=make('aside','pv2-news-brief');sources.append(make('span','pv2-label pv2-label-context','External reporting'),make('h2','','Sources behind this edition'));
        data.webSources.forEach(source=>{const link=make('a','pv2-source-link',first(source.title,source.publisher,'Source'));link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';sources.appendChild(link);});rail.appendChild(sources);
      }
      if(data.pullQuote){const quote=make('blockquote','pv2-rail-quote');quote.appendChild(make('span','',data.pullQuote));if(data.longForm)appendInlineSourceLinks(quote,data,data.longForm.pullQuote&&data.longForm.pullQuote.factIds);rail.appendChild(quote);}
      hero.appendChild(rail);state.stage.appendChild(hero);

      const seasonDesk=renderSeasonDesk(data,{withAction:true});if(seasonDesk)state.stage.appendChild(seasonDesk);

      const weekRows=publishedRows().filter(row=>numeric(row.week)===data.week).sort((a,b)=>{
        const order={preview:0,waivers:1,recap:2};return order[typeOf(a)]-order[typeOf(b)];
      });
      state.stage.appendChild(sectionHeading('This Week’s Issue','One week, one permanent record: outlook, wire report and final recap stay connected.'));
      const strip=make('div','pv2-issue-strip');
      weekRows.forEach(row=>{
        const card=make('article','pv2-issue-card');card.setAttribute('aria-current',String(articleId(row)===data.id));
        card.append(make('span','pv2-label '+(typeOf(row)==='recap'?'pv2-label-fact':typeOf(row)==='preview'?'pv2-label-forecast':'pv2-label-context'),editionLabel(row)),make('h3','',row.title),make('p','',first(row.dek,row.deck)));
        const action=make('button','pv2-card-action','Open edition →');action.type='button';action.addEventListener('click',()=>openArticle(articleId(row)));card.appendChild(action);strip.appendChild(card);
      });
      state.stage.appendChild(strip);

      if(data.matchups.length){
        state.stage.appendChild(sectionHeading('The Matchup Notebook','Open a matchup for the verified scoreline, the press-box read and the historical context behind it.'));
        state.stage.appendChild(renderMatchupNotebook(data));
      }
      if(data.seasonStoryline&&data.seasonStoryline.secondaryArcs.length){
        state.stage.appendChild(sectionHeading('Other Stories to Follow','Manager stories running alongside the season’s main thread.'));
        const secondary=make('div','pv2-thread-grid');data.seasonStoryline.secondaryArcs.forEach(arc=>secondary.appendChild(renderArcCard(arc,data)));state.stage.appendChild(secondary);
      }else if(data.storylines.length&&!data.longForm){
        state.stage.appendChild(sectionHeading('Stories Moving the Season','The current edition’s continuing manager stories.'));
        state.stage.appendChild(renderStoryList(data.storylines,data));
      }
      finishRender();
    }catch(error){if(request===state.request)renderError('The front page missed the press',error.message);}
  }

  function conciseSummary(data){
    const rows=[];
    if(data.thesis)rows.push(data.thesis);
    data.leadParagraphs.slice(0,2).forEach(value=>rows.push(value));
    if(rows.length<3&&data.keyStat&&typeof data.keyStat==='object')rows.push([data.keyStat.label,data.keyStat.value,data.keyStat.note].filter(Boolean).join(': '));
    if(rows.length<3&&data.storylines.length)rows.push(storyBody(data.storylines[0]));
    return rows.slice(0,3).filter(Boolean);
  }

  function appendSourceRow(parent,label,value){
    if(!value&&value!==0)return;
    const row=make('div','pv2-source-row');row.append(make('dt','',label),make('dd','',value));parent.appendChild(row);
  }

  function renderGamebook(data){
    const aside=make('aside','pv2-gamebook');aside.setAttribute('aria-label','Verified article gamebook');
    const jumps=make('nav','pv2-gamebook-card');jumps.setAttribute('aria-label','Article sections');jumps.append(make('span','pv2-label pv2-label-context','In this edition'),make('h2','','Jump to the desk'));
    const jumpList=make('div','pv2-jump-list');
    [['story','Story'],['context','Season context'],[data.matchups.length?'matchups':'transactions',data.matchups.length?'Matchups':'Transactions']].forEach(([id,label])=>{
      const link=make('button','pv2-jump-link',label);link.type='button';
      link.addEventListener('click',()=>{const target=document.getElementById('pv2-'+id),reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;if(target)target.scrollIntoView({behavior:reduced?'auto':'smooth',block:'start'});});
      jumpList.appendChild(link);
    });jumps.appendChild(jumpList);aside.appendChild(jumps);

    const verified=make('section','pv2-gamebook-card pv2-gamebook-card-verified');
    verified.append(make('span','pv2-label pv2-label-fact','Verified Gamebook'),make('h2','','Facts, not framing'),make('p','','Scores, lineups and transaction totals come from the frozen source snapshot. Pressbox analysis is labeled separately.'));
    const dl=make('dl','pv2-source-list');
    appendSourceRow(dl,'Fact check',first(data.factCheck.status,'Published').toUpperCase());
    appendSourceRow(dl,'Data captured',dateLabel(data.dataAsOf,true));
    appendSourceRow(dl,'Source',sourceKind(data));
    appendSourceRow(dl,'Snapshot',first(data.factCheck.snapshotId,data.source.snapshotId));
    if(numeric(data.factCheck.projectionCoverage)!==null)appendSourceRow(dl,'Projection coverage',Math.round(numeric(data.factCheck.projectionCoverage)*100)+'%');
    if(numeric(data.factCheck.matchupsReconciled)!==null)appendSourceRow(dl,'Matchups reconciled',String(data.factCheck.matchupsReconciled));
    verified.appendChild(dl);
    if(data.webSources.length){
      const sourceBlock=make('div','pv2-web-sources');sourceBlock.appendChild(make('span','pv2-label pv2-label-context','External reporting'));
      data.webSources.forEach(source=>{
        const link=make('a','pv2-source-link',first(source.title,source.publisher,'Source'));
        link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';sourceBlock.appendChild(link);
      });
      verified.appendChild(sourceBlock);
    }
    const method=make('details','pv2-method'),summary=make('summary','','Method & provenance');
    const deterministic=data.source.deterministic===true;
    method.append(summary,make('p','',deterministic
      ?'This edition was assembled deterministically from completed league records and used no generative request.'
      :'The prose may be AI-assisted, but factual fields are validated against the frozen league snapshot before publication. Narrative cannot overwrite the gamebook.'));
    verified.appendChild(method);aside.appendChild(verified);

    if(data.keyStat){
      const key=data.keyStat&&typeof data.keyStat==='object'?data.keyStat:{value:data.keyStat};
      const card=make('section','pv2-gamebook-card');card.append(make('span','pv2-label pv2-label-fact','Number to know'),make('h3','',first(key.value,'—')));
      if(key.label)card.appendChild(make('p','',key.label));if(key.note)card.appendChild(make('p','',key.note));aside.appendChild(card);
    }

    if(data.envelope){
      const preview=data.envelope.publicationStatus==='format_preview',passed=Boolean(data.quality&&data.quality.rubric&&data.quality.rubric.pass),quality=make('section','pv2-gamebook-card');
      quality.append(make('span','pv2-label '+(passed?'pv2-label-fact':'pv2-label-context'),preview?'Review sample':passed?'Copy desk':'Review status'),make('h3','',preview?'Manually written review sample':passed?'Passed every publication gate':'Awaiting editorial review'));
      if(preview)quality.appendChild(make('p','','This copy was written for review from archived league evidence. No paid AI generation was used.'));
      const list=make('dl','pv2-source-list');
      const score=numeric(data.quality&&data.quality.rubric&&data.quality.rubric.score);
      appendSourceRow(list,'Quality score',score===null?'Not run':String(score)+' / 100');
      ['claimCheck','copyDesk'].forEach(key=>{
        const report=data.quality&&data.quality[key],errors=report&&Array.isArray(report.errors)?report.errors:[],label=key==='claimCheck'?'Claim check':'Copy desk';
        appendSourceRow(list,label,report&&Array.isArray(report.errors)?errors.length+' error'+(errors.length===1?'':'s'):'Not run');
      });
      appendSourceRow(list,'Generation cost',data.totalCost===null?'—':'$'+data.totalCost.toFixed(4));
      quality.appendChild(list);aside.appendChild(quality);
    }

    const transparency=make('section','pv2-gamebook-card');transparency.append(make('span','pv2-label pv2-label-analysis','Editorial line'),make('h3','','Interpretation stays labeled'));
    const noReceipt=data.forecastContext.receiptEligible===false||first(data.forecastContext.mode).toLowerCase().includes('late_outlook');
    if(noReceipt)transparency.appendChild(make('p','','This week began with a post-kickoff outlook, so it is preserved for transparency but excluded from original-prediction grading.'));
    else if(data.receipts){
      const receiptList=make('dl','pv2-source-list');Object.entries(data.receipts).slice(0,5).forEach(([key,value])=>appendSourceRow(receiptList,key.replace(/([A-Z])/g,' $1'),String(value)));transparency.appendChild(receiptList);
    }else transparency.appendChild(make('p','','Opinion, forecast and historical context use their own visual labels; verified values retain a source timestamp.'));
    aside.appendChild(transparency);return aside;
  }

  function renderStoryList(rows,data){
    const stories=make('div','pv2-story-list');
    rows.forEach((row,index)=>{
      const item=make('article','pv2-story-item');item.appendChild(make('h3','',storyTitle(row,index)));
      item.appendChild(data&&row&&list(row.factIds).length?citedParagraph({text:storyBody(row),factIds:row.factIds},data):make('p','',storyBody(row)));
      const subjects=storySubjects(row);if(subjects.length){const tags=make('div','pv2-subjects');subjects.forEach(subject=>tags.appendChild(make('span','pv2-subject',subject)));item.appendChild(tags);}
      stories.appendChild(item);
    });
    return stories;
  }

  function inlineSources(data,factIds){
    const claimIds=new Set(list(factIds).filter(id=>String(id).startsWith('web:'))),urls=[];
    data.webClaims.filter(claim=>claimIds.has(claim.claimId)).forEach(claim=>list(claim.sourceUrls).forEach(url=>{if(!urls.includes(url))urls.push(url);}));
    return urls.map(url=>{
      try{
        const parsed=new URL(url);if(parsed.protocol!=='https:')return null;
        const source=data.webSources.find(row=>row.url===url)||{};
        return {url,title:first(source.title,source.publisher,parsed.hostname)};
      }catch(_error){return null;}
    }).filter(Boolean);
  }

  function citedParagraph(block,data,className){
    const paragraph=make('p',className||'');paragraph.appendChild(make('span','',first(block&&block.text,block)));
    appendInlineSourceLinks(paragraph,data,block&&block.factIds);
    return paragraph;
  }

  function appendInlineSourceLinks(parent,data,factIds,withTitles){
    const sources=inlineSources(data,factIds);
    if(sources.length){
      const citations=make('span','pv2-inline-citations');citations.setAttribute('aria-label','External sources');
      sources.forEach((source,index)=>{const link=make('a','pv2-inline-citation','['+(index+1)+']'+(withTitles?' '+source.title:''));link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';link.title=source.title;link.setAttribute('aria-label','Source '+(index+1)+': '+source.title);citations.appendChild(link);});
      parent.appendChild(citations);
    }
  }

  function renderLongFormNarrative(data){
    const article=data.longForm,copy=make('div','pv2-copy pv2-long-form');
    copy.append(make('span','pv2-label pv2-label-analysis','Reported narrative'),make('h2','','The desk’s case'));
    if(data.thesis)copy.appendChild(citedParagraph(article.thesis,data,'pv2-thesis'));
    list(article.lead).forEach(block=>copy.appendChild(citedParagraph(block,data)));
    const seasonDesk=renderSeasonDesk(data,{reader:true});if(seasonDesk)copy.appendChild(seasonDesk);
    const feature=(row,label)=>{
      if(!row)return;
      const section=make('section','pv2-feature');section.append(make('span','pv2-label '+(label==='Main event'?'pv2-label-fact':'pv2-label-analysis'),label),make('h2','',row.headline));
      list(row.body).forEach(block=>section.appendChild(citedParagraph(block,data)));copy.appendChild(section);
    };
    feature(article.mainEvent,'Main event');
    list(article.supportingStories).forEach((row,index)=>feature(row,'Supporting story '+(index+1)));
    if(data.pullQuote){const block=make('blockquote','pv2-analysis-block');block.append(make('span','pv2-label pv2-label-analysis','The line'),make('h3','',data.pullQuote));appendInlineSourceLinks(block,data,article.pullQuote&&article.pullQuote.factIds,true);copy.appendChild(block);}
    list(article.deskSections).forEach((section,index)=>{
      const row=make('section','pv2-desk-section');row.append(make('span','pv2-label pv2-label-context',first(section.kind).replaceAll('_',' ')),make('h2','',section.headline));
      if(index===0&&!data.seasonStoryline)row.id='pv2-context';
      list(section.body).forEach(block=>row.appendChild(citedParagraph(block,data)));copy.appendChild(row);
    });
    return copy;
  }

  function matchupData(row,index,data){
    const managerA=first(row.managerA,row.teams&&row.teams[0]&&row.teams[0].manager,'Team A');
    const managerB=first(row.managerB,row.teams&&row.teams[1]&&row.teams[1].manager,'Team B');
    const finalA=numeric(row.finalScoreA),finalB=numeric(row.finalScoreB),currentA=numeric(row.currentScoreA),currentB=numeric(row.currentScoreB);
    const forecastA=numeric(row.forecastScoreA),forecastB=numeric(row.forecastScoreB),projectedA=numeric(row.projectedScoreA),projectedB=numeric(row.projectedScoreB);
    let scoreA=data.type==='recap'?finalA:(forecastA!==null?forecastA:(projectedA!==null?projectedA:currentA));
    let scoreB=data.type==='recap'?finalB:(forecastB!==null?forecastB:(projectedB!==null?projectedB:currentB));
    const scoreLabel=data.type==='recap'?'Final':data.edition==='Weekend Outlook'?'Estimated final':'Projected';
    return {
      id:first(row.matchupId,row.id,index+1),managerA,managerB,scoreA,scoreB,scoreLabel,
      headline:first(row.headline,managerA+' vs. '+managerB),analysis:first(row.analysis,row.body,row.summary,'The press-box report is still being filed.'),
      storySections:list(row.storySections),
      winner:first(row.winner,row.forecastWinner,row.predictedWinner),keyPlayer:first(row.keyPlayer&&row.keyPlayer.name,row.keyPlayer),
      injuries:Array.isArray(row.injuryWatch)?row.injuryWatch.join(' · '):first(row.injuryWatch),
      history:first(row.historyNote,row.history),upset:first(row.upsetPath),pick:first(row.predictedWinner,row.pick&&row.pick.manager,row.forecastWinner),citationIds:list(row.citationIds)
    };
  }

  function miniFact(label,value,context){
    const box=make('div','pv2-mini-fact'+(context?' pv2-mini-fact-context':''));box.append(make('span','',label),make('strong','',value));return box;
  }

  function renderMatchupNotebook(data){
    const notebook=make('div','pv2-notebook');notebook.id='pv2-matchups';
    data.matchups.forEach((row,index)=>{
      const item=matchupData(row,index,data),details=make('details','pv2-matchup');if(index===0)details.open=true;
      const summary=make('summary',''),copy=make('div','');copy.append(make('span','pv2-matchup-id','Matchup '+item.id),make('h3','pv2-matchup-title',item.headline),make('span','pv2-matchup-managers',item.managerA+' vs. '+item.managerB));
      const score=make('div','pv2-score');score.setAttribute('aria-label',item.scoreLabel+': '+item.managerA+' '+points(item.scoreA)+', '+item.managerB+' '+points(item.scoreB));
      score.append(make('span','',item.scoreLabel),make('strong','',points(item.scoreA)+' — '+points(item.scoreB)));summary.append(copy,score);details.appendChild(summary);
      const body=make('div','pv2-matchup-body'),analysis=make('div','pv2-matchup-analysis');
      if(item.storySections.length){
        item.storySections.forEach(section=>{
          const report=make('section','pv2-matchup-story-section');report.appendChild(make('h4','',section.label));
          list(section.blocks).forEach(block=>report.appendChild(citedParagraph(block,data)));analysis.appendChild(report);
        });
      }else{
        analysis.append(make('span','pv2-label pv2-label-analysis','Pressbox read'));
        analysis.appendChild(citedParagraph({text:item.analysis,factIds:item.citationIds},data));
      }body.appendChild(analysis);
      const facts=make('div','pv2-matchup-facts');
      if(item.keyPlayer)facts.appendChild(miniFact('Key player',item.keyPlayer,false));
      if(item.winner)facts.appendChild(miniFact(data.type==='recap'?'Winner':item.scoreLabel+' lean',item.winner,false));
      if(item.pick&&item.pick!==item.winner)facts.appendChild(miniFact('Published pick',item.pick,false));
      if(item.injuries)facts.appendChild(miniFact('Availability record',item.injuries,false));
      if(item.history)facts.appendChild(miniFact('Historical context',item.history,true));
      if(item.upset)facts.appendChild(miniFact('Path to the upset',item.upset,true));
      body.appendChild(facts);details.appendChild(body);notebook.appendChild(details);
    });
    return notebook;
  }

  function renderTransactionNotebook(data){
    const notebook=make('div','pv2-notebook');notebook.id='pv2-transactions';
    data.transactions.forEach((row,index)=>{
      const details=make('details','pv2-matchup');if(index===0)details.open=true;
      const adds=list(row.adds).map(player=>first(player.name,player.playerName)).filter(Boolean),drops=list(row.drops).map(player=>first(player.name,player.playerName)).filter(Boolean);
      const summary=make('summary',''),copy=make('div','');copy.append(make('span','pv2-matchup-id',first(row.transactionType,'Transaction')),make('h3','pv2-matchup-title',first(row.manager,'Unknown manager')));
      const score=make('div','pv2-score');score.append(make('span','','Adds / drops'),make('strong','',adds.length+' / '+drops.length));summary.append(copy,score);details.appendChild(summary);
      const body=make('div','pv2-matchup-body'),facts=make('div','pv2-matchup-facts');
      facts.append(miniFact('Added',adds.join(' · ')||'None',false),miniFact('Dropped',drops.join(' · ')||'None',true));
      if(row.waiverBid!==undefined&&row.waiverBid!==null)facts.appendChild(miniFact('FAAB bid','$'+row.waiverBid,false));
      body.appendChild(facts);details.appendChild(body);notebook.appendChild(details);
    });
    return notebook;
  }

  async function renderArticle(id){
    const meta=publishedRows().find(row=>articleId(row)===id);
    if(!meta){renderError('That story is not in the archive','The requested edition may have moved or is not published.');return;}
    const request=++state.request;renderLoading('Laying out the full edition…');
    try{
      const article=await loadArticle(meta);if(request!==state.request)return;
      const data=normalizeArticle(article,meta);state.stage.replaceChildren();
      const head=make('header','pv2-reader-head');head.appendChild(makeButton('← Back to Latest',()=>go('latest',true),true));
      head.append(make('span','pv2-kicker',data.edition+' · Week '+data.week),make('h1','',data.title));if(data.dek)head.appendChild(make('p','pv2-reader-dek',data.dek));head.appendChild(metaLine(data));state.stage.appendChild(head);
      const notice=reviewNotice(data);if(notice)head.appendChild(notice);

      const layout=make('div','pv2-reader-layout'),main=make('article','pv2-reader-main');main.id='pv2-story';
      const summary=make('section','pv2-summary');summary.append(make('span','pv2-label pv2-label-fact','60-second summary'),make('h2','','The edition in three points'));
      const bullets=make('ul','pv2-summary-list');
      if(data.longForm)[data.longForm.thesis,...list(data.longForm.lead)].slice(0,3).forEach(block=>{const item=make('li','');item.appendChild(make('span','',first(block&&block.text,block)));appendInlineSourceLinks(item,data,block&&block.factIds);bullets.appendChild(item);});
      else conciseSummary(data).forEach(item=>bullets.appendChild(make('li','',item)));
      summary.appendChild(bullets);main.appendChild(summary);

      if(data.longForm)main.appendChild(renderLongFormNarrative(data));
      else{
        const copy=make('div','pv2-copy');copy.append(make('span','pv2-label pv2-label-analysis','Reported narrative'),make('h2','',data.type==='recap'?'How the week turned':data.type==='waivers'?'What moved on the wire':'What the weekend is asking'));
        data.leadParagraphs.forEach(paragraph=>copy.appendChild(make('p','',paragraph)));
        if(data.pullQuote){const block=make('blockquote','pv2-analysis-block');block.append(make('span','pv2-label pv2-label-analysis','From the press box'),make('h3','',data.pullQuote));copy.appendChild(block);}
        main.appendChild(copy);
      }

      if(data.storylines.length&&!data.longForm){
        const context=make('section','');context.id='pv2-context';context.appendChild(sectionHeading('The Season in Context','These are the newsroom’s interpretations. Verified scores and source details remain in the Gamebook.'));context.appendChild(renderStoryList(data.storylines,data));main.appendChild(context);
      }
      if(data.matchups.length){main.appendChild(sectionHeading('The Matchup Notebook','Every game’s full story: what happened, why it mattered, and what comes next for its managers.'));main.appendChild(renderMatchupNotebook(data));}
      else if(data.transactions.length){main.appendChild(sectionHeading('The Transaction Notebook','Completed league records only. Open a manager’s card for adds and drops.'));main.appendChild(renderTransactionNotebook(data));}
      if(data.awards.length){
        const honors=make('section','');honors.appendChild(sectionHeading('Weekly Honors','Awards are editorial selections supported by the edition’s verified data.'));
        const stories=data.awards.map((row,index)=>typeof row==='string'?{title:'Honor '+(index+1),body:row}:{title:first(row.title,row.label,'Honor '+(index+1)),body:first(row.body,row.description,row.player,row.manager)});honors.appendChild(renderStoryList(stories,data));main.appendChild(honors);
      }
      layout.append(main,renderGamebook(data));state.stage.appendChild(layout);finishRender();
    }catch(error){if(request===state.request)renderError('That edition missed the press',error.message);}
  }

  async function renderWeek(){
    const week=latestWeek(),rows=publishedRows().filter(row=>numeric(row.week)===week).sort((a,b)=>new Date(a.publishedAt)-new Date(b.publishedAt));state.stage.replaceChildren();
    const intro=make('header','pv2-page-intro'),copy=make('div','');copy.append(make('span','pv2-kicker','Current weekly dossier'),make('h1','','Week '+week+', from forecast to final'),make('p','','Every edition remains connected, so the league can see what changed without rewriting what was originally published.'));intro.append(copy,make('strong','',rows.length+' published editions'));state.stage.appendChild(intro);
    const line=make('div','pv2-weekline');
    rows.forEach(row=>{
      const card=make('article','pv2-week-card');
      card.append(make('div','pv2-week-date',editionLabel(row)+' · '+dateLabel(row.publishedAt,false)));
      const text=make('div','pv2-week-copy');text.append(make('h2','',row.title),make('p','',first(row.dek,row.deck)));card.append(text,makeButton('Read edition',()=>openArticle(articleId(row)),true));line.appendChild(card);
    });
    state.stage.appendChild(line);finishRender();
  }

  async function renderStorylines(){
    const request=++state.request;renderLoading('Opening the manager stories and their season history…');
    const rows=publishedRows().sort((a,b)=>(numeric(b.week)||0)-(numeric(a.week)||0)||new Date(first(b.publishedAt,b.generatedAt))-new Date(first(a.publishedAt,a.generatedAt)));
    const loaded=await Promise.allSettled(rows.map(async meta=>normalizeArticle(await loadArticle(meta),meta)));
    if(request!==state.request)return;
    const editions=loaded.filter(result=>result.status==='fulfilled').map(result=>result.value);
    state.stage.replaceChildren();
    const current=editions.find(data=>data.seasonStoryline),season=current?current.season:2026;
    const intro=make('header','pv2-page-intro'),copy=make('div','');
    copy.append(make('span','pv2-kicker','Season-long reporting'),make('h1','','The managers shaping the season'),make('p','','Follow the main season story, the managers moving it, and the chapters each week adds.'));
    intro.append(copy,make('strong','',season+' season desk'));state.stage.appendChild(intro);
    if(current){
      const main=renderSeasonDesk(current);state.stage.appendChild(main);
      const actions=make('div','pv2-actions');actions.appendChild(makeButton('Read Week '+current.week+' edition',()=>openArticle(current.id),true));main.appendChild(actions);
    }
    const secondary=new Map();
    editions.forEach(data=>{
      const arcs=data.seasonStoryline?data.seasonStoryline.secondaryArcs:[];
      arcs.forEach(arc=>{const key=arc.id||arc.headline.toLowerCase();if(!secondary.has(key))secondary.set(key,{arc,data});});
      if(!data.longForm)data.storylines.forEach((row,index)=>{
        const arc=normalizedSeasonArc({...row,headline:storyTitle(row,index),body:storyBody(row)},'Reported');
        if(arc&&arc.subjects.length&&!secondary.has(arc.headline.toLowerCase()))secondary.set(arc.headline.toLowerCase(),{arc,data});
      });
    });
    if(secondary.size){
      state.stage.appendChild(sectionHeading('Other Manager Stories','The latest reported chapter of each continuing thread.'));
      const grid=make('div','pv2-thread-grid');secondary.forEach(({arc,data})=>grid.appendChild(renderArcCard(arc,data,{week:data.week,articleId:data.id})));state.stage.appendChild(grid);
    }
    const entries=list(state.storyMemory&&state.storyMemory.entries).filter(entry=>numeric(entry.season)===season).sort((a,b)=>(numeric(a.week)||0)-(numeric(b.week)||0));
    const remembered=new Map();entries.forEach(entry=>list(entry.storyArcs).forEach(arc=>remembered.set(arc.id,{arc,entry})));
    const memoryRows=[...remembered.values()].filter(({arc})=>subjectLabels(arc.subjects).length&&first(arc.summary));
    if(memoryRows.length){
      state.stage.appendChild(sectionHeading('The Season Notebook','Earlier manager chapters kept for context. Their reporting week shows when the thread was last updated.'));
      const grid=make('div','pv2-thread-grid');memoryRows.forEach(({arc,entry})=>{
        const data=editions.find(item=>item.id===entry.articleId),summary=first(arc.summary),opening=summary.split(/(?<=[.!?])\s+/)[0];
        const editionHeadline=data&&data.seasonStoryline&&!first(arc.id).startsWith('angle:')?data.seasonStoryline.headline:'';
        const headline=first(arc.headline,editionHeadline,opening.length<=130?opening:subjectLabels(arc.subjects).join(' / ')+' · Season thread');
        const normalized=normalizedSeasonArc({...arc,headline,body:summary},arc.status);
        grid.appendChild(renderArcCard(normalized,data,{label:seasonStatus(arc.status)+' · Season background',week:entry.week,articleId:data&&data.id}));
      });state.stage.appendChild(grid);
    }
    const reviewMemories=[];
    editions.filter(data=>data.season===season&&data.envelope&&data.envelope.publicationStatus==='format_preview'&&data.memory).forEach(data=>{
      list(data.memory.entries).filter(entry=>numeric(entry.season)===season).forEach(entry=>list(entry.storyArcs).forEach(arc=>reviewMemories.push({arc,data,week:numeric(entry.week)||data.week,sourceId:first(entry.articleId,data.id)})));
      list(data.memory.activeStoryArcs).forEach(arc=>reviewMemories.push({arc,data,week:numeric(arc.lastUpdatedWeek)||data.week,sourceId:first(arc.sourceArticleId,data.id)}));
    });
    const reviewedArcs=new Map();
    reviewMemories.sort((a,b)=>(a.week||0)-(b.week||0)||new Date(a.data.publishedAt)-new Date(b.data.publishedAt)).forEach(row=>{
      if(subjectLabels(row.arc.subjects).length&&first(row.arc.summary,row.arc.headline))reviewedArcs.set(first(row.arc.id,row.arc.headline,row.arc.summary),row);
    });
    if(reviewedArcs.size){
      state.stage.appendChild(sectionHeading('Review Continuity','Manager threads preserved with the manually written review sample.'));
      const grid=make('div','pv2-thread-grid');reviewedArcs.forEach(({arc,data,week,sourceId})=>{
        const source=editions.find(edition=>edition.id===sourceId)||data,summary=first(arc.summary),opening=summary.split(/(?<=[.!?])\s+/)[0];
        const headline=first(arc.headline,opening.length<=130?opening:subjectLabels(arc.subjects).join(' / ')+' · Season thread');
        const normalized=normalizedSeasonArc({...arc,headline,body:arc.body||summary},arc.status);
        grid.appendChild(renderArcCard(normalized,source,{label:'Review-only continuity · '+seasonStatus(arc.status),week,articleId:source.id}));
      });state.stage.appendChild(grid);
    }
    const chapters=editions.filter(data=>data.seasonStoryline);
    if(chapters.length>1){
      state.stage.appendChild(sectionHeading('How the Main Story Developed','Each chapter preserves what the desk knew that week.'));
      const timeline=make('div','pv2-weekline');chapters.forEach(data=>{
        const card=make('article','pv2-week-card'),textValue=make('div','pv2-week-copy');
        card.appendChild(make('div','pv2-week-date','Week '+data.week+' · '+data.edition));
        textValue.appendChild(make('h2','',data.seasonStoryline.headline));data.seasonStoryline.thesis.forEach(block=>textValue.appendChild(citedParagraph(block,data)));
        card.append(textValue,makeButton('Read chapter',()=>openArticle(data.id),true));timeline.appendChild(card);
      });state.stage.appendChild(timeline);
    }
    if(!current&&!secondary.size&&!memoryRows.length&&!reviewedArcs.size){
      const empty=make('div','pv2-empty'),textValue=make('div','');textValue.append(make('h2','','The first season chapter is being reported'),make('p','','The next edition will add a main season storyline and the managers driving it.'));empty.appendChild(textValue);state.stage.appendChild(empty);
    }
    if(loaded.some(result=>result.status==='rejected'))state.stage.appendChild(make('p','pv2-partial-note','Some earlier editions could not be loaded. The available season chapters are shown above.'));
    finishRender();
  }

  function renderArchive(){
    state.stage.replaceChildren();
    const intro=make('header','pv2-page-intro'),copy=make('div','');copy.append(make('span','pv2-kicker','Permanent league record'),make('h1','','The Press archive'),make('p','','Browse the original Outlooks, verified Wire reports and final Recaps exactly as published.'));intro.append(copy,make('strong','',publishedRows().length+' editions'));state.stage.appendChild(intro);
    const controls=make('div','pv2-archive-controls');
    [['all','All editions'],['preview','Outlooks'],['waivers','Waivers'],['recap','Recaps']].forEach(([key,label])=>{const button=make('button','pv2-filter',label);button.type='button';button.setAttribute('aria-pressed',String(state.archiveFilter===key));button.addEventListener('click',()=>{state.archiveFilter=key;renderArchive();});controls.appendChild(button);});state.stage.appendChild(controls);
    const rows=publishedRows().filter(row=>state.archiveFilter==='all'||typeOf(row)===state.archiveFilter).sort((a,b)=>new Date(b.publishedAt)-new Date(a.publishedAt));
    const grid=make('div','pv2-archive');rows.forEach(row=>{const card=make('article','pv2-archive-card');card.append(make('span','pv2-label '+(typeOf(row)==='recap'?'pv2-label-fact':typeOf(row)==='preview'?'pv2-label-forecast':'pv2-label-context'),editionLabel(row)+' · Week '+row.week),make('h2','',row.title),make('p','',first(row.dek,row.deck)),makeButton('Read edition',()=>openArticle(articleId(row)),true));grid.appendChild(card);});state.stage.appendChild(grid);finishRender();
  }

  async function route(focus){
    const current=currentRoute();setNav(current.name);if(focus)state.stage.dataset.focusAfterRoute='true';
    if(current.name==='week'||current.name==='storylines'||current.name==='archive')state.request+=1;
    if(current.name==='latest')await renderLatest();
    else if(current.name==='week')renderWeek();
    else if(current.name==='storylines')await renderStorylines();
    else if(current.name==='archive')renderArchive();
    else if(current.name==='article')await renderArticle(current.id);
  }

  async function start(){
    buildShell();renderLoading('Loading the published archive without touching the production Press…');
    try{
      let shadowIndex=null;
      try{shadowIndex=await fetchJson('content/press-v2/index.json');}catch(_error){shadowIndex=null;}
      try{state.dossier=await fetchJson('content/press-v2/dossiers/2026-week-03-recap-v2-shadow.json');}catch(_error){state.dossier=null;}
      try{state.storyMemory=await fetchJson('content/press-v2/story-memory.json');}catch(_error){state.storyMemory=null;}
      if(shadowIndex&&list(shadowIndex.articles).length){state.index=shadowIndex;state.shadow=true;}
      else{state.index=await fetchJson('content/articles/index.json');state.shadow=false;}
      await route(false);
    }catch(error){renderError('The prototype could not open the archive',error.message,()=>start());}
  }

  window.addEventListener('hashchange',()=>route(true));
  start();
})();
