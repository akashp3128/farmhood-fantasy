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

  function rivalryCell(rivalry){
    const cell=make('div','payout-award-cell rivalry');
    if(!rivalry){cell.appendChild(make('span','payout-dash','—'));return cell;}
    const names=rivalry.participants.map(item=>item.firstName).join(' vs ');cell.appendChild(make('strong','',names));
    if(rivalry.status==='final'){
      const winner=(rivalry.leaders||[]).map(item=>item.firstName||item.manager).join(' & ');
      const result=rivalry.leaders.length>1?'Tie · prize split':`${winner} wins`;
      cell.append(make('small','',`${result} · ${(rivalry.scores||[]).map(item=>score(item.score)).join('–')}`),make('small','payout-share',allocationsText(rivalry.allocations)));
    }else cell.appendChild(make('small','',`${money(rivalry.awardCents)} on the line`));
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

  function renderDashboard(mount,data){
    const {config,ledger}=data;mount.innerHTML='';
    const status=make('div','payout-update-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const updated=document.createElement('time');updated.dateTime=ledger.updatedAt;updated.textContent=new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Chicago'}).format(new Date(ledger.updatedAt))+' CT';
    status.append(make('span','payout-live-dot'),make('strong','',`Finalized through Week ${ledger.status.completedThroughWeek}`),make('span','', 'Last ledger change '),updated,make('a','payout-refresh','Refresh'));
    const refresh=status.querySelector('a');refresh.href='#';refresh.addEventListener('click',event=>{event.preventDefault();refresh.textContent='Refreshing…';load({force:true}).then(fresh=>renderDashboard(mount,fresh)).catch(()=>{refresh.textContent='Try again';});});mount.appendChild(status);

    if(ledger.audit&&ledger.audit.status==='needs_review')mount.appendChild(make('div','note payout-review-note','The latest Sleeper data needs commissioner review before every award can be trusted. No affected result was guessed.'));
    const summary=make('section','payout-summary-grid');
    summary.append(
      summaryStat(money(ledger.accounting.totalCents),'Total pot',`${money(config.pot.buyIn*100)} × ${config.pot.teams} managers`),
      summaryStat(money(ledger.accounting.awardedCents),'Awarded','Calculated earnings'),
      summaryStat(money(ledger.accounting.reservedCents),'Still reserved','Future weekly + season prizes'),
      summaryStat(`${ledger.status.completedThroughWeek}/14`,'Weeks finalized','Tuesday reconciliation')
    );mount.appendChild(summary);

    const allocation=make('section','section payout-allocation');allocation.appendChild(make('h2','h','How the $3,000 Is Split'));
    const allocationGrid=make('div','payout-allocation-grid');[
      ['Season purse',ledger.accounting.seasonPoolCents,'1st, 2nd, 3rd + points champion'],
      ['Weekly highs',ledger.accounting.weeklyHighPoolCents,'$30 × 14 weeks'],
      ['Position prizes',ledger.accounting.positionPoolCents,'$10 × 14 rotating positions'],
      ['Rivalry weeks',ledger.accounting.rivalryPoolCents,'$50 × 6 showdowns']
    ].forEach(([label,value,note])=>{const card=make('div','payout-allocation-card');card.append(make('span','',label),make('strong','',money(value)),make('small','',note));allocationGrid.appendChild(card);});
    allocation.appendChild(allocationGrid);mount.appendChild(allocation);

    const season=make('section','section');season.appendChild(make('h2','h','End-of-Season Purse'));
    const seasonGrid=make('div','payout-prize-grid');ledger.seasonPrizes.prizes.forEach(prize=>seasonGrid.appendChild(prizeCard(prize)));season.appendChild(seasonGrid);mount.appendChild(season);

    const regularSeasonComplete=ledger.status.completedThroughWeek>=14;
    const nextWeek=regularSeasonComplete?14:Math.max(1,ledger.status.completedThroughWeek+1),next=ledger.weekly.find(item=>item.week===nextWeek);
    const nextSection=make('section','section payout-next');nextSection.appendChild(make('h2','h',regularSeasonComplete?'Regular-Season Prizes Complete':`Week ${nextWeek} Money`));
    const nextGrid=make('div','payout-next-grid');
    const nextCards=regularSeasonComplete
      ? [['Weekly highs',money(ledger.accounting.weeklyHighPoolCents),'14 awards reconciled'],['Position prizes',money(ledger.accounting.positionPoolCents),'14 starting-player awards'],['Season purse',money(ledger.accounting.seasonPoolCents),ledger.seasonPrizes.status==='final'?'Final standings settled':'Settles after the playoffs']]
      : [['Weekly high',money(next.highScore.awardCents),'Highest team score'],[`${next.position} starter`,money(next.positionPrize.awardCents),'Highest eligible starter'],[next.rivalry?'Rivalry showdown':'Rivalry week',next.rivalry?money(next.rivalry.awardCents):'—',next.rivalry?next.rivalry.participants.map(item=>item.firstName).join(' vs '):'No rivalry payout']];
    nextCards
      .forEach(([label,value,note])=>{const card=make('div','payout-next-card');card.append(make('span','',label),make('strong','',value),make('small','',note));nextGrid.appendChild(card);});
    nextSection.appendChild(nextGrid);mount.appendChild(nextSection);

    const weekly=make('section','section');weekly.appendChild(make('h2','h','2026 Weekly Ledger'));
    const tableCard=make('div','tablecard'),table=make('table','tbl payout-ledger-table'),caption=make('caption','sr-only','Weekly payout winners and amounts for the 2026 season');
    const thead=document.createElement('thead'),headRow=document.createElement('tr');['Week','Status','$30 High Score','$10 Position','$50 Rivalry'].forEach(label=>{const th=make('th','',label);th.scope='col';headRow.appendChild(th);});thead.appendChild(headRow);
    const tbody=document.createElement('tbody');ledger.weekly.forEach(week=>{
      const row=document.createElement('tr'),weekCell=make('th','payout-week-number',`Week ${week.week}`);weekCell.scope='row';
      const statusCell=document.createElement('td');statusCell.appendChild(statusBadge(week.status));
      const highCell=document.createElement('td');highCell.appendChild(awardCell(week.highScore,'high'));
      const positionCell=document.createElement('td');const posLabel=make('span','payout-position-label',week.position);positionCell.append(posLabel,awardCell(week.positionPrize,'position'));
      const rivalry=document.createElement('td');rivalry.appendChild(rivalryCell(week.rivalry));
      row.append(weekCell,statusCell,highCell,positionCell,rivalry);tbody.appendChild(row);
    });table.append(caption,thead,tbody);tableCard.appendChild(table);weekly.appendChild(tableCard);mount.appendChild(weekly);

    const cash=make('section','section');cash.appendChild(make('h2','h','2026 Cash Standings'));
    const cashTable=make('table','tbl payout-cash-table'),cashHead=document.createElement('thead'),cashHeadRow=document.createElement('tr');['#','Manager','Week Highs','Position','Rivalry','Season','Awarded'].forEach(label=>{const th=make('th',label==='#'||label==='Manager'?'':'r',label);th.scope='col';cashHeadRow.appendChild(th);});cashHead.appendChild(cashHeadRow);
    const cashBody=document.createElement('tbody');let competitionRank=0,previousTotal=null;
    ledger.managerTotals.forEach((manager,index)=>{
      if(previousTotal===null||manager.totalCents!==previousTotal)competitionRank=index+1;
      previousTotal=manager.totalCents;
      const rankLabel=ledger.accounting.awardedCents===0?'—':String(competitionRank);
      const row=document.createElement('tr'),rank=make('td','mono',rankLabel),name=document.createElement('td');
      name.appendChild(managerIdentity(manager,true));row.append(rank,name);
      ['weeklyHighCents','positionCents','rivalryCents','seasonCents','totalCents'].forEach(field=>{
        row.appendChild(make('td','r mono'+(field==='totalCents'?' payout-total':''),money(manager[field])));
      });
      cashBody.appendChild(row);
    });
    cashTable.append(cashHead,cashBody);const cashWrap=make('div','tablecard');cashWrap.appendChild(cashTable);cash.appendChild(cashWrap);cash.appendChild(make('div','note','Awarded means calculated entitlement from official results. Cash-transfer status is not tracked by Sleeper.'));mount.appendChild(cash);

    const rivalries=make('section','section');rivalries.appendChild(make('h2','h','Rivalry Calendar'));
    const rivalryGrid=make('div','payout-rivalry-grid');config.rivalries.forEach(rivalry=>{const week=ledger.weekly.find(item=>item.week===rivalry.week),card=make('a','payout-rivalry-card');card.href=`matchups.html#week-${rivalry.week}`;card.append(make('span','payout-rivalry-week',`Week ${rivalry.week}`),make('strong','',`${rivalry.labelA} vs ${rivalry.labelB}`),make('small','',`${rivalry.managerA} vs ${rivalry.managerB}`),statusBadge(week&&week.rivalry&&week.rivalry.status));rivalryGrid.appendChild(card);});rivalries.appendChild(rivalryGrid);mount.appendChild(rivalries);

    const rules=make('details','payout-rules'),ruleSummary=make('summary','','How winners are determined');rules.appendChild(ruleSummary);
    const list=document.createElement('ul');Object.values(ledger.rules).forEach(rule=>list.appendChild(make('li','',rule)));rules.appendChild(list);mount.appendChild(rules);
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
