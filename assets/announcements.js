/* Homepage-only, versioned announcements. No network requests or polling. */
(function(root,factory){
  const api=factory(root);root.FarmhoodAnnouncements=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis,function(root){
  'use strict';
  const RELEASE='season-tools-2026-v1';
  const memory=new Map(),mounted=new WeakMap();
  let nextId=0;
  const storageKeyFor=release=>'farmhood:announcement:'+release;
  function read(key){
    if(memory.has(key))return memory.get(key);
    try{return root.localStorage.getItem(key)==='dismissed';}catch(_error){return false;}
  }
  function write(key,dismissed){
    memory.set(key,dismissed);
    try{root.localStorage.setItem(key,dismissed?'dismissed':'shown');}catch(_error){}
  }
  function seasonOpen(snapshot,season){
    if(!snapshot)return true;
    if(Number(snapshot.season)!==season||snapshot.status==='complete')return false;
    const regular=Number(snapshot.regularSeasonWeeks);
    if(!Number.isInteger(regular)||regular<1)return true;
    if(Number(snapshot.currentWeek)>regular)return false;
    const rosters=Array.isArray(snapshot.rosters)?snapshot.rosters:[];
    const totals=rosters.map(team=>{
      const values=[team.wins,team.losses,team.ties];
      return values.every(value=>Number.isInteger(value)&&value>=0)?values.reduce((a,b)=>a+b,0):null;
    });
    return !(totals.length&&totals.every(value=>value!=null&&value>=regular));
  }
  function mount(parent,options){
    if(!parent||!root.document)return null;
    const settings=options||{},release=String(settings.release||RELEASE),season=Number(settings.season||2026);
    const existing=mounted.get(parent);
    if(existing){
      if(existing.release===release&&parent.contains(existing.element))return existing;
      existing.dispose();if(parent.contains(existing.element))existing.element.remove();
    }
    const key=storageKeyFor(release);
    function node(tag,cls,text){const el=root.document.createElement(tag);if(cls)el.className=cls;if(text!=null)el.textContent=text;return el;}
    const section=node('section','home-announcement');section.setAttribute('aria-label','What’s new on Farmhood');section.dataset.homeAnnouncement=release;
    const strip=node('div','announcement-strip');strip.id='home-announcement-'+(++nextId);
    const copy=node('div','announcement-copy');
    const badge=node('span','announcement-badge','New on Farmhood');
    const heading=node('strong','announcement-heading','Play out the possibilities.');
    const description=node('p','announcement-description','Two new tools for your playoff path and your schedule.');
    const titleRow=node('div','announcement-title-row');titleRow.append(badge,heading);copy.append(titleRow,description);
    const actions=node('div','announcement-actions');
    const playoff=node('a','announcement-link announcement-primary','Playoff Machine →');playoff.href='playoffs.html';
    const comparison=node('a','announcement-link','Compare schedules →');comparison.href='schedule.html#compare';
    actions.append(playoff,comparison);
    const dismiss=node('button','announcement-dismiss','×');dismiss.type='button';dismiss.setAttribute('aria-label','Dismiss new tools announcement');dismiss.setAttribute('aria-controls',strip.id);
    const reopen=node('button','announcement-reopen','What’s new on Farmhood →');reopen.type='button';reopen.setAttribute('aria-controls',strip.id);
    strip.append(copy,actions,dismiss);section.append(strip,reopen);parent.appendChild(section);
    let dismissed=read(key),disposed=false;
    function show(value,persist,focus){
      dismissed=value;strip.hidden=value;reopen.hidden=!value;
      section.classList.toggle('is-dismissed',value);reopen.setAttribute('aria-expanded',value?'false':'true');
      if(persist)write(key,value);
      if(focus)(value?reopen:playoff.hidden?comparison:playoff).focus({preventScroll:true});
    }
    dismiss.addEventListener('click',()=>show(true,true,true));
    reopen.addEventListener('click',()=>show(false,true,true));
    function onStorage(event){
      if(event.key!==key||!['dismissed','shown'].includes(event.newValue))return;
      const value=event.newValue==='dismissed';memory.set(key,value);
      const active=root.document.activeElement;
      show(value,false,(value&&strip.contains(active))||(!value&&active===reopen));
    }
    if(typeof root.addEventListener==='function')root.addEventListener('storage',onStorage);
    const controller={element:section,release,get dismissed(){return dismissed;},
      update(snapshot){
        if(disposed)return;
        const open=seasonOpen(snapshot,season),focused=root.document.activeElement===playoff;
        playoff.hidden=!open;comparison.classList.toggle('announcement-primary',!open);
        badge.textContent=open?'New on Farmhood':'Season tools';
        heading.textContent=open?'Play out the possibilities.':'See your season from every angle.';
        description.textContent=open?'Two new tools for your playoff path and your schedule.':'Compare every manager’s record on every schedule.';
        reopen.textContent=open?'What’s new on Farmhood →':'Explore season tools →';
        if(!open&&focused&&!dismissed)comparison.focus({preventScroll:true});
      },
      dispose(){disposed=true;if(typeof root.removeEventListener==='function')root.removeEventListener('storage',onStorage);}
    };
    mounted.set(parent,controller);show(dismissed,false,false);
    if(settings.snapshot)controller.update(settings.snapshot);
    return controller;
  }
  return {mount,seasonOpen,storageKeyFor,RELEASE};
});
