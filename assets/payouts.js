/* Farmhood Fantasy — 2026 payout center and contextual prize UI. */
(function(root){
  'use strict';

  let cached=null,pending=null;
  const make=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
  const money=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:Number(cents)%100?2:0}).format(Number(cents||0)/100);
  const score=value=>Number(value||0).toFixed(2).replace(/\.00$/,'');

  async function request(path){
    const response=await fetch(path,{cache:'no-store',credentials:'omit',headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error(`Payout data request failed (${response.status}).`);
    return response.json();
  }

  function valid(config,ledger){
    return config&&ledger&&config.schemaVersion===1&&ledger.schemaVersion===1&&config.season===2026&&ledger.season===2026&&
      config.leagueId===ledger.leagueId&&Array.isArray(config.managers)&&config.managers.length===12&&Array.isArray(ledger.weekly)&&ledger.weekly.length===14;
  }

  function load(options){
    const force=!!(options&&options.force);
    if(cached&&!force)return Promise.resolve(cached);
    if(pending&&!force)return pending;
    const suffix=force?`?v=${Date.now()}`:'';
    const requestPromise=Promise.all([
      request(`content/payouts/2026-config.json${suffix}`),
      request(`content/payouts/2026.json${suffix}`)
    ]).then(([config,ledger])=>{if(!valid(config,ledger))throw new Error('Payout files did not pass the browser identity check.');cached={config,ledger};return cached;})
      .finally(()=>{if(pending===requestPromise)pending=null;});
    pending=requestPromise;return requestPromise;
  }

  function managerAvatar(manager,size){
    const wrap=make('span','payout-avatar'),fallback=make('span','payout-avatar-fallback',(manager.firstName||manager.manager||'?').slice(0,1).toUpperCase());
    wrap.style.width=size+'px';wrap.style.height=size+'px';wrap.appendChild(fallback);
    const url=root.LEAGUE&&root.LEAGUE.avatars&&root.LEAGUE.avatars[manager.manager];
    if(url){const image=document.createElement('img');image.src=url;image.alt='';image.loading='lazy';image.addEventListener('error',()=>image.remove());wrap.appendChild(image);}
    return wrap;
  }

  function managerIdentity(manager,withAvatar){
    const line=make('span','payout-manager');if(withAvatar)line.appendChild(managerAvatar(manager,30));
    const copy=make('span','payout-manager-copy'),name=make('strong','',manager.firstName||manager.manager),handle=make('small','',manager.manager);
    copy.append(name,handle);line.appendChild(copy);return line;
  }

  function statusBadge(status){
    const labels={final:'Final',pending:'Pending',provisional:'Provisional',needs_review:'Needs review'};
    return make('span',`payout-status ${status||'pending'}`,labels[status]||status||'Pending');
  }

  function allocationsText(allocations){
    return (allocations||[]).map(item=>`${item.firstName||item.manager} · ${money(item.shareCents)}`).join(' · ');
  }

  function awardCell(award,kind){
    const cell=make('div','payout-award-cell');
    if(!award||award.status!=='final'){
      cell.appendChild(make('strong','payout-awaiting',kind==='position'?`${award&&award.position||''} winner posts Tuesday`:'Awaiting Tuesday close'));
      return cell;
    }
    if(kind==='position'){
      (award.players||[]).forEach(player=>{
        const line=make('span','payout-player-line'),photo=make('span','payout-player-photo'),fallback=make('span','',player.position||player.slot||'—');
        photo.appendChild(fallback);
        if(player.playerId&&/^[A-Za-z0-9_-]{1,24}$/.test(player.playerId)){
          const image=document.createElement('img');image.alt='';image.loading='lazy';
          image.src=player.position==='DEF'?`https://sleepercdn.com/images/team_logos/nfl/${player.playerId.toLowerCase()}.png`:`https://sleepercdn.com/content/nfl/players/thumb/${player.playerId}.jpg`;
          image.addEventListener('error',()=>image.remove());photo.appendChild(image);
        }
        const copy=make('span',''),name=make('strong','',player.playerName),meta=make('small','',`${player.firstName||player.manager} · ${score(player.score)} pts`);
        copy.append(name,meta);line.append(photo,copy);cell.appendChild(line);
      });
    }else{
      const names=(award.leaders||[]).map(item=>item.firstName||item.manager).join(' & ');
      cell.append(make('strong','payout-winner',names),make('small','',`${(award.leaders||[]).map(item=>score(item.score)+' pts').join(' · ')}`));
    }
    cell.appendChild(make('small','payout-share',allocationsText(award.allocations)));
    return cell;
  }

  function rivalryCell(rivalry,week){
    const cell=make('div','payout-award-cell rivalry');
    if(!rivalry){cell.appendChild(make('span','payout-dash','—'));return cell;}
    const names=rivalry.participants.map(item=>item.firstName).join(' vs ');cell.appendChild(make('strong','',names));
    if(rivalry.status==='final'){
      const winner=(rivalry.leaders||[]).map(item=>item.firstName||item.manager).join(' & ');
      const result=(rivalry.leaders||[]).length>1?'Tie · prize split':`${winner} wins`;
      cell.append(make('small','',`${result} · ${(rivalry.scores||[]).map(item=>score(item.score)).join('–')}`),make('small','payout-share',allocationsText(rivalry.allocations)));
    }else cell.appendChild(make('small','',`${money(rivalry.awardCents)} on the line`));
    if(week){const link=make('a','payout-rivalry-open','Open matchup →');link.href=`matchups.html#week-${week}`;cell.appendChild(link);}
    return cell;
  }

  function prizeCard(prize){
    const card=make('article','payout-season-prize'),head=make('div','payout-prize-head'),label=make('span','',prize.label),amount=make('strong','payout-amount',money(prize.awardCents));
    head.append(label,amount);card.append(head,statusBadge(prize.status));
    if(prize.leaders&&prize.leaders.length){
      const winners=make('div','payout-prize-winners');prize.leaders.forEach(manager=>winners.appendChild(managerIdentity(manager,true)));card.appendChild(winners);
      if(prize.allocations&&prize.allocations.length)card.appendChild(make('small','payout-prize-shares',allocationsText(prize.allocations)));
    }else card.appendChild(make('p','payout-prize-note',prize.key==='regularSeasonPointsLeader'?'Highest regular-season Points For':'Settles after the playoffs'));
    return card;
  }

  function summaryStat(value,label,meta){
    const card=make('div','payout-summary-stat');card.append(make('strong','payout-summary-value',value),make('span','payout-summary-label',label),make('small','',meta));return card;
  }

  function requestedView(mount){
    const aliases={overview:'overview','payout-overview':'overview',weekly:'weekly','weekly-ledger':'weekly','payout-weekly':'weekly',standings:'standings','cash-standings':'standings','payout-standings':'standings'};
    const hash=root.location&&root.location.hash?root.location.hash.slice(1):'';
    return aliases[mount.dataset.payoutView]||aliases[hash]||'overview';
  }

  function viewControls(mount,views,initialView){
    const controls=make('div','clarity-tabs payout-view-switcher');controls.setAttribute('role','tablist');controls.setAttribute('aria-label','Payout Center views');
    const buttons=[];
    const activate=(key,updateUrl)=>{
      const active=views.some(view=>view.key===key)?key:'overview';
      mount.dataset.payoutView=active;
      views.forEach((view,index)=>{
        const selected=view.key===active,button=buttons[index];
        view.panel.hidden=!selected;
        button.setAttribute('aria-selected',String(selected));
        button.tabIndex=selected?0:-1;
      });
      if(updateUrl&&root.history&&root.history.replaceState)root.history.replaceState(null,'',`#payout-${active}`);
    };
    views.forEach((view,index)=>{
      const button=make('button','clarity-tab payout-view-button',view.label);button.type='button';button.id=`payout-tab-${view.key}`;button.setAttribute('role','tab');button.setAttribute('aria-controls',view.panel.id);
      button.addEventListener('click',()=>activate(view.key,true));
      button.addEventListener('keydown',event=>{
        let target=index;
        if(event.key==='ArrowRight')target=(index+1)%views.length;
        else if(event.key==='ArrowLeft')target=(index-1+views.length)%views.length;
        else if(event.key==='Home')target=0;
        else if(event.key==='End')target=views.length-1;
        else return;
        event.preventDefault();activate(views[target].key,true);buttons[target].focus();
      });
      buttons.push(button);controls.appendChild(button);
    });
    views.forEach(view=>{view.panel.setAttribute('role','tabpanel');view.panel.setAttribute('aria-labelledby',`payout-tab-${view.key}`);});
    activate(initialView,false);return controls;
  }

  function viewPanel(key){
    const panel=make('section',`clarity-panel payout-view-panel payout-view-${key}`);panel.id=`payout-panel-${key}`;return panel;
  }

  function nextMoneySection(ledger){
    const regularSeasonComplete=ledger.status.completedThroughWeek>=14;
    const currentWeek=Math.max(1,Math.min(14,Number(ledger.status.currentWeek)||1));
    const nextWeek=regularSeasonComplete?14:Math.max(currentWeek,ledger.status.completedThroughWeek+1);
    const next=ledger.weekly.find(item=>item.week===nextWeek)||ledger.weekly[ledger.weekly.length-1];
    const section=make('section','section payout-next payout-money-now');
    section.appendChild(make('h2','h',regularSeasonComplete?'Regular-Season Money Closed':`Week ${nextWeek} Money`));
    section.appendChild(make('p','payout-section-copy',regularSeasonComplete?'All 14 weekly high-score and starting-player prizes have been reconciled.':'The next dollars in play, all together in one place.'));
    const grid=make('div','payout-next-grid');
    const cards=regularSeasonComplete
      ? [['Weekly highs',money(ledger.accounting.weeklyHighPoolCents),'14 awards reconciled'],['Position prizes',money(ledger.accounting.positionPoolCents),'14 starting-player awards'],['Season purse',money(ledger.accounting.seasonPoolCents),ledger.seasonPrizes.status==='final'?'Final standings settled':'Settles after the playoffs']]
      : [['Weekly high',money(next.highScore.awardCents),'Highest team score'],[`${next.position} starter`,money(next.positionPrize.awardCents),'Highest eligible starter'],[next.rivalry?'Rivalry showdown':'Rivalry week',next.rivalry?money(next.rivalry.awardCents):'—',next.rivalry?next.rivalry.participants.map(item=>item.firstName).join(' vs '):'No rivalry payout']];
    cards.forEach(([label,value,note])=>{const card=make('div','payout-next-card');card.append(make('span','',label),make('strong','',value),make('small','',note));grid.appendChild(card);});
    section.appendChild(grid);return section;
  }

  function accountingSummary(config,ledger){
    const summary=make('section','payout-summary-grid payout-accounting-summary');summary.setAttribute('aria-label','Payout accounting summary');
    summary.append(
      summaryStat(money(ledger.accounting.awardedCents),'Awarded','Calculated earnings'),
      summaryStat(money(ledger.accounting.reservedCents),'Still reserved','Future weekly + season prizes'),
      summaryStat(`${ledger.status.completedThroughWeek}/14`,'Weeks finalized','Tuesday reconciliation'),
      summaryStat(money(ledger.accounting.totalCents),'Total pot',`${money(config.pot.buyIn*100)} × ${config.pot.teams} managers`)
    );return summary;
  }

  function seasonPrizeSection(ledger){
    const season=make('section','section payout-season-section');season.appendChild(make('h2','h','End-of-Season Purse'));
    season.appendChild(make('p','payout-section-copy','Reserved until the regular season and playoffs settle.'));
    const grid=make('div','payout-prize-grid');ledger.seasonPrizes.prizes.forEach(prize=>grid.appendChild(prizeCard(prize)));season.appendChild(grid);return season;
  }

  function structureDisclosure(ledger){
    const details=make('details','clarity-disclosure payout-structure-disclosure'),summary=make('summary','','How the $3,000 pot works');details.appendChild(summary);
    const body=make('div','clarity-disclosure-body payout-structure-body'),allocationGrid=make('div','payout-allocation-grid');[
      ['Season purse',ledger.accounting.seasonPoolCents,'1st, 2nd, 3rd + points champion'],
      ['Weekly highs',ledger.accounting.weeklyHighPoolCents,'$30 × 14 weeks'],
      ['Position prizes',ledger.accounting.positionPoolCents,'$10 × 14 rotating positions'],
      ['Rivalry weeks',ledger.accounting.rivalryPoolCents,'$50 × 6 showdowns']
    ].forEach(([label,value,note])=>{const card=make('div','payout-allocation-card');card.append(make('span','',label),make('strong','',money(value)),make('small','',note));allocationGrid.appendChild(card);});
    body.append(allocationGrid,make('h3','payout-rules-heading','How winners are determined'));
    const list=document.createElement('ul');list.className='payout-rules-list';Object.values(ledger.rules).forEach(rule=>list.appendChild(make('li','',rule)));body.appendChild(list);details.appendChild(body);return details;
  }

  function weeklyTable(ledger){
    const card=make('div','tablecard payout-ledger-desktop clarity-desktop-only'),table=make('table','tbl payout-ledger-table'),caption=make('caption','sr-only','Weekly payout winners and amounts for the 2026 season');
    const thead=document.createElement('thead'),headRow=document.createElement('tr');['Week','Status','$30 High Score','$10 Position','$50 Rivalry'].forEach(label=>{const th=make('th','',label);th.scope='col';headRow.appendChild(th);});thead.appendChild(headRow);
    const tbody=document.createElement('tbody');ledger.weekly.forEach(week=>{
      const row=document.createElement('tr'),weekCell=make('th','payout-week-number');weekCell.scope='row';
      const link=make('a','payout-week-link',`Week ${week.week}`);link.href=`matchups.html#week-${week.week}`;weekCell.appendChild(link);
      const statusCell=document.createElement('td');statusCell.appendChild(statusBadge(week.status));
      const highCell=document.createElement('td');highCell.appendChild(awardCell(week.highScore,'high'));
      const positionCell=document.createElement('td');positionCell.append(make('span','payout-position-label',week.position),awardCell(week.positionPrize,'position'));
      const rivalry=document.createElement('td');rivalry.appendChild(rivalryCell(week.rivalry,week.week));
      row.append(weekCell,statusCell,highCell,positionCell,rivalry);tbody.appendChild(row);
    });table.append(caption,thead,tbody);card.appendChild(table);return card;
  }

  function weeklyCards(ledger){
    const cards=make('div','payout-week-cards clarity-mobile-only');cards.setAttribute('aria-label','Weekly payout ledger');
    const focusWeek=ledger.status.completedThroughWeek>=14?14:Math.max(Number(ledger.status.currentWeek)||1,ledger.status.completedThroughWeek+1);
    ledger.weekly.forEach(week=>{
      const card=make('details','payout-week-card');card.open=week.week===focusWeek;
      const summary=make('summary','payout-week-card-summary'),title=make('span','payout-week-card-title');title.append(make('strong','',`Week ${week.week}`),make('small','',`${week.position} position prize${week.rivalry?' · Rivalry week':''}`));
      const stakes=week.highScore.awardCents+week.positionPrize.awardCents+(week.rivalry?week.rivalry.awardCents:0);
      const meta=make('span','payout-week-card-meta');meta.append(statusBadge(week.status),make('strong','',money(stakes)));
      summary.append(title,meta);card.appendChild(summary);
      const body=make('div','payout-week-card-body');
      const high=make('section','payout-week-card-award');high.append(make('h3','',`${money(week.highScore.awardCents)} Weekly High`),awardCell(week.highScore,'high'));
      const position=make('section','payout-week-card-award');position.append(make('h3','',`${money(week.positionPrize.awardCents)} ${week.position} Starter`),awardCell(week.positionPrize,'position'));
      body.append(high,position);
      if(week.rivalry){const rivalry=make('section','payout-week-card-award payout-week-card-rivalry');rivalry.append(make('h3','',`${money(week.rivalry.awardCents)} Rivalry`),rivalryCell(week.rivalry));body.appendChild(rivalry);}
      const matchup=make('a','payout-week-matchup-link','View this week’s matchups →');matchup.href=`matchups.html#week-${week.week}`;body.appendChild(matchup);card.appendChild(body);cards.appendChild(card);
    });return cards;
  }

  function rankedManagerTotals(ledger){
    let competitionRank=0,previousTotal=null;
    return ledger.managerTotals.map((manager,index)=>{
      if(previousTotal===null||manager.totalCents!==previousTotal)competitionRank=index+1;
      previousTotal=manager.totalCents;
      return {manager,rank:ledger.accounting.awardedCents===0?'—':String(competitionRank)};
    });
  }

  function cashTable(rows){
    const wrap=make('div','tablecard payout-cash-desktop clarity-desktop-only'),table=make('table','tbl payout-cash-table'),head=document.createElement('thead'),headRow=document.createElement('tr');
    ['#','Manager','Week Highs','Position','Rivalry','Season','Awarded'].forEach(label=>{const th=make('th',label==='#'||label==='Manager'?'':'r',label);th.scope='col';headRow.appendChild(th);});head.appendChild(headRow);
    const body=document.createElement('tbody');rows.forEach(({manager,rank})=>{
      const row=document.createElement('tr'),rankCell=make('td','mono',rank),name=document.createElement('td');name.appendChild(managerIdentity(manager,true));row.append(rankCell,name);
      ['weeklyHighCents','positionCents','rivalryCents','seasonCents','totalCents'].forEach(field=>row.appendChild(make('td','r mono'+(field==='totalCents'?' payout-total':''),money(manager[field]))));body.appendChild(row);
    });table.append(head,body);wrap.appendChild(table);return wrap;
  }

  function cashCards(rows){
    const cards=make('div','payout-cash-cards clarity-mobile-only');cards.setAttribute('aria-label','Manager payout standings');
    rows.forEach(({manager,rank})=>{
      const card=make('details','payout-cash-card'),summary=make('summary','payout-cash-card-summary'),identity=make('span','payout-cash-card-identity');identity.append(make('span','payout-cash-card-rank',rank),managerIdentity(manager,true));
      summary.append(identity,make('strong','payout-cash-card-total',money(manager.totalCents)));card.appendChild(summary);
      const breakdown=make('dl','payout-cash-breakdown');[['Weekly highs','weeklyHighCents'],['Position','positionCents'],['Rivalry','rivalryCents'],['Season','seasonCents']].forEach(([label,field])=>{const item=make('div','payout-cash-breakdown-item');item.append(make('dt','',label),make('dd','',money(manager[field])));breakdown.appendChild(item);});
      card.appendChild(breakdown);cards.appendChild(card);
    });return cards;
  }

  function renderDashboard(mount,data){
    const active=document.activeElement,focusKey=active&&mount.contains(active)?(active.id||active.dataset&&active.dataset.payoutFocusKey||''):'';
    const {config,ledger}=data,initialView=requestedView(mount);mount.innerHTML='';
    const status=make('div','payout-update-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const updated=document.createElement('time');updated.dateTime=ledger.updatedAt;updated.textContent=new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Chicago'}).format(new Date(ledger.updatedAt))+' CT';
    const finalizedLabel=ledger.status.completedThroughWeek?`Finalized through Week ${ledger.status.completedThroughWeek}`:'Awaiting Week 1 close';
    status.append(make('span','payout-live-dot'),make('strong','',finalizedLabel),make('span','', 'Last ledger change '),updated,make('button','payout-refresh','Refresh'));
    const refresh=status.querySelector('button');refresh.type='button';refresh.dataset.payoutFocusKey='refresh';refresh.addEventListener('click',()=>{refresh.textContent='Refreshing…';load({force:true}).then(fresh=>renderDashboard(mount,fresh)).catch(()=>{refresh.textContent='Try again';});});mount.appendChild(status);

    if(ledger.audit&&ledger.audit.status==='needs_review')mount.appendChild(make('div','note payout-review-note','The latest Sleeper data needs commissioner review before every award can be trusted. No affected result was guessed.'));
    const overview=viewPanel('overview'),weekly=viewPanel('weekly'),standings=viewPanel('standings');
    overview.append(nextMoneySection(ledger),accountingSummary(config,ledger),seasonPrizeSection(ledger),structureDisclosure(ledger));

    weekly.append(make('h2','h','2026 Weekly Ledger'),make('p','payout-section-copy','Every high score, eligible starting-player prize and rivalry result stays with its week.'));
    weekly.append(weeklyTable(ledger),weeklyCards(ledger));

    const rows=rankedManagerTotals(ledger);
    standings.append(make('h2','h','2026 Cash Standings'),make('p','payout-section-copy','Calculated awards by manager, with weekly and season money separated.'));
    standings.append(cashTable(rows),cashCards(rows),make('div','note payout-cash-note','Awarded means calculated entitlement from official results. Cash-transfer status is not tracked by Sleeper.'));

    const views=[{key:'overview',label:'Overview',panel:overview},{key:'weekly',label:'Weekly Ledger',panel:weekly},{key:'standings',label:'Cash Standings',panel:standings}];
    mount.append(viewControls(mount,views,initialView),overview,weekly,standings);
    if(focusKey){const target=focusKey==='refresh'?mount.querySelector('[data-payout-focus-key="refresh"]'):document.getElementById(focusKey);if(target)target.focus({preventScroll:true});}
  }

  function renderPayouts(){
    const app=document.querySelector('#app');
    if(typeof root.header==='function')app.appendChild(root.header('2026 Payout Center','The Money','Every weekly prize, rivalry purse and end-of-season dollar—reconciled against official Sleeper results every Tuesday morning.'));
    else{const heading=make('header','');heading.append(make('h1','title','2026 Payout Center'),make('p','sub','Every 2026 payout in one verified ledger.'));app.appendChild(heading);}
    const mount=make('div','payout-center'),loading=make('div','live-loading');loading.setAttribute('role','status');loading.append(make('span','live-spinner'),make('span','','Loading the $3,000 ledger…'));mount.appendChild(loading);app.appendChild(mount);
    const showError=error=>{
      mount.innerHTML='';mount.appendChild(make('div','note live-error',error.message+' The payout structure remains unchanged.'));
      const retry=make('button','live-refresh payout-retry','Try again');retry.type='button';retry.addEventListener('click',()=>{retry.disabled=true;retry.textContent='Refreshing…';load({force:true}).then(data=>renderDashboard(mount,data)).catch(showError);});mount.appendChild(retry);
    };
    load().then(data=>renderDashboard(mount,data)).catch(showError);
  }

  function mountHomeSummary(link){
    if(!link)return;
    load().then(({ledger})=>{if(!link.isConnected)return;const awarded=money(ledger.accounting.awardedCents),reserved=money(ledger.accounting.reservedCents);link.innerHTML='';
      link.append(make('div','lg-tag','The 2026 Payout Center'),make('div','lg-row'),make('div','lg-note',`Finalized through Week ${ledger.status.completedThroughWeek} · ${reserved} still reserved`),make('div','lg-sub','Open the complete weekly ledger →'));
      const row=link.querySelector('.lg-row');row.append(make('span','lg-amt',`${awarded} awarded`),make('span','lg-count',`${money(ledger.accounting.totalCents)} pot`));
    }).catch(()=>{});
  }

  function mountMatchupContext(mount,board,week){
    if(!mount||!board)return;
    mount.innerHTML='';mount.appendChild(make('div','payout-context-loading','Loading Week '+week+' prize stakes…'));
    load().then(({ledger})=>{
      if(!mount.isConnected||!board.isConnected)return;
      const item=ledger.weekly.find(row=>row.week===week);if(!item)return;
      mount.innerHTML='';const strip=make('a','payout-week-strip');strip.href='payouts.html';
      const high=make('span','');high.append(make('small','','$30 Weekly High'),make('strong','',item.highScore.status==='final'?(item.highScore.leaders.map(row=>row.firstName).join(' & ')+' · '+score(item.highScore.leaders[0].score)):'Highest team score'));
      const position=make('span','');position.append(make('small','',`$10 ${item.position}`),make('strong','',item.positionPrize.status==='final'?(item.positionPrize.players.map(row=>row.playerName).join(' & ')+' · '+score(item.positionPrize.players[0].score)):'Top eligible starter'));
      const rivalry=make('span','');rivalry.append(make('small','',item.rivalry?'$50 Rivalry':'Rivalry'),make('strong','',item.rivalry?(item.rivalry.participants.map(row=>row.firstName).join(' vs ')):'No rivalry this week'));
      strip.append(high,position,rivalry);mount.appendChild(strip);
      if(item.rivalry){
        const names=new Set(item.rivalry.participants.map(row=>row.manager));
        board.querySelectorAll('.matchup-detail').forEach(details=>{
          if(names.has(details.dataset.managerA)&&names.has(details.dataset.managerB)){
            details.classList.add('payout-rivalry-matchup');
            const tied=item.rivalry.status==='final'&&item.rivalry.leaders.length>1;
            const finalLabel=tied?'Tie · $50 split':`${item.rivalry.leaders.map(row=>row.firstName).join(' & ')} · ${money(item.rivalry.allocations[0]?.shareCents||0)}`;
            const vs=details.querySelector('.vs');if(vs&&!vs.querySelector('.payout-rivalry-chip'))vs.appendChild(make('em','payout-rivalry-chip',item.rivalry.status==='final'?finalLabel:'Rivalry · $50'));
          }
        });
      }
      if(item.positionPrize.status==='final'){
        const winners=new Map(item.positionPrize.players.map(player=>[player.playerId,player]));
        const allocations=new Map(item.positionPrize.allocations.map(allocation=>[allocation.ownerId,allocation.shareCents]));
        board.querySelectorAll('.duel-player').forEach(card=>{const player=winners.get(card.dataset.playerId);if(player){
          const share=allocations.get(player.ownerId)||0,label=item.positionPrize.allocations.length>1?`${item.position} prize · ${money(share)}`:`${item.position} winner · ${money(share)}`;
          card.classList.add('payout-position-winner');card.appendChild(make('span','payout-player-win-chip',label));
        }});
      }
    }).catch(()=>{if(mount.isConnected){mount.innerHTML='';mount.appendChild(make('div','note','Payout stakes are temporarily unavailable. Matchup scores are unaffected.'));}});
  }

  root.FarmhoodPayouts={load,money,mountHomeSummary,mountMatchupContext};
  root.renderPayouts=renderPayouts;
})(window);
