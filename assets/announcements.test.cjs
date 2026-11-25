const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
class Element{
 constructor(tag,document){Object.assign(this,{tagName:tag.toUpperCase(),document,children:[],attributes:{},dataset:{},listeners:{},className:'',_text:''});this.classList={toggle:(name,on)=>{const all=new Set(this.className.split(' ').filter(Boolean));if(on)all.add(name);else all.delete(name);this.className=[...all].join(' ');}};}
 set textContent(value){this._text=String(value);this.children=[];}get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
 appendChild(child){child.parentNode=this;this.children.push(child);return child;}append(...children){children.forEach(child=>this.appendChild(child));}
 setAttribute(name,value){this.attributes[name]=String(value);}getAttribute(name){return this.attributes[name];}
 addEventListener(name,fn){(this.listeners[name]||=[]).push(fn);}click(){(this.listeners.click||[]).forEach(fn=>fn({target:this}));}
 focus(){this.document.activeElement=this;}contains(item){return item===this||this.children.some(child=>child.contains(item));}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(child=>child!==this);}
 querySelectorAll(selector){const match=e=>selector.startsWith('.')?e.className.split(' ').includes(selector.slice(1)):e.tagName===selector.toUpperCase();return this.children.flatMap(child=>[...(match(child)?[child]:[]),...child.querySelectorAll(selector)]);}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
}
function harness(storage){
 const document={activeElement:null};document.createElement=tag=>new Element(tag,document);
 const values=new Map(),events={};let requests=0,timers=0;
 const context={document,localStorage:storage||{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)},fetch:()=>{requests++;throw Error('No requests allowed');},setInterval:()=>{timers++;},addEventListener:(name,fn)=>(events[name]||=[]).push(fn),removeEventListener:(name,fn)=>{events[name]=(events[name]||[]).filter(item=>item!==fn);}};
 vm.runInNewContext(fs.readFileSync(require.resolve('./announcements.js'),'utf8'),context);
 return {context,document,values,events,parent:document.createElement('main'),api:context.FarmhoodAnnouncements,requests:()=>requests,timers:()=>timers};
}
const snapshot=(week=12,games=11)=>({season:2026,regularSeasonWeeks:14,currentWeek:week,status:'in_season',rosters:Array.from({length:12},()=>({wins:games,losses:0,ties:0}))});

test('the quiet announcement is local, compact and links directly to both new tools',()=>{
 const h=harness(),view=h.api.mount(h.parent),strip=view.element.querySelector('.announcement-strip');
 assert.equal(strip.hidden,false);assert.match(strip.textContent,/Play out the possibilities/);
 assert.deepEqual(view.element.querySelectorAll('a').map(link=>link.href),['playoffs.html','schedule.html#compare']);
 assert.equal(view.element.querySelector('.announcement-dismiss').getAttribute('aria-label'),'Dismiss new tools announcement');
 assert.equal(view.element.querySelector('.announcement-reopen').hidden,true);assert.equal(h.requests(),0);assert.equal(h.timers(),0);
});
test('dismiss and reopen persist by release and move keyboard focus to a visible control',()=>{
 const h=harness(),view=h.api.mount(h.parent),dismiss=view.element.querySelector('.announcement-dismiss'),reopen=view.element.querySelector('.announcement-reopen');
 dismiss.focus();dismiss.click();
 assert.equal(view.dismissed,true);assert.equal(view.element.querySelector('.announcement-strip').hidden,true);assert.equal(h.document.activeElement,reopen);
 assert.equal(reopen.getAttribute('aria-expanded'),'false');assert.equal(h.values.get(h.api.storageKeyFor(h.api.RELEASE)),'dismissed');
 reopen.click();assert.equal(view.dismissed,false);assert.equal(h.document.activeElement,view.element.querySelector('a'));assert.equal(h.values.get(h.api.storageKeyFor(h.api.RELEASE)),'shown');
});
test('live updates neither recreate the banner nor reset dismissal',()=>{
 const h=harness(),view=h.api.mount(h.parent),original=view.element;view.element.querySelector('.announcement-dismiss').click();
 for(let i=0;i<20;i++)view.update(snapshot());
 assert.equal(h.api.mount(h.parent),view);assert.equal(h.parent.children.length,1);assert.equal(view.element,original);assert.equal(view.dismissed,true);
});
test('the same release stays dismissed after a full remount; a new release appears once',()=>{
 const h=harness();let view=h.api.mount(h.parent);view.element.querySelector('.announcement-dismiss').click();h.parent.textContent='';
 view=h.api.mount(h.parent);assert.equal(view.dismissed,true);assert.equal(h.events.storage.length,1);
 view=h.api.mount(h.parent,{release:'another-release'});assert.equal(view.dismissed,false);assert.equal(h.parent.children.length,1);assert.equal(h.events.storage.length,1);
});
test('blocked storage APIs do not break the homepage or forget dismissal during the current page session',()=>{
 for(const storage of [{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}},{getItem(){return null;},setItem(){throw Error('blocked');}}]){
  const h=harness(storage);let view=h.api.mount(h.parent);view.element.querySelector('.announcement-dismiss').click();h.parent.textContent='';view=h.api.mount(h.parent);assert.equal(view.dismissed,true);
 }
 const h=harness();Object.defineProperty(h.context,'localStorage',{get(){throw Error('SecurityError');}});
 let view=h.api.mount(h.parent);view.element.querySelector('.announcement-dismiss').click();h.parent.textContent='';view=h.api.mount(h.parent);assert.equal(view.dismissed,true);
});
test('malformed or old storage values cannot dismiss a new release',()=>{
 const h=harness({getItem(){return '{bad-json-or-old-value}';},setItem(){}});assert.equal(h.api.mount(h.parent).dismissed,false);
});
test('storage events synchronize known preferences without stealing unrelated keyboard focus',()=>{
 const h=harness(),view=h.api.mount(h.parent),other=h.document.createElement('input');other.focus();
 h.events.storage[0]({key:h.api.storageKeyFor(h.api.RELEASE),newValue:'dismissed'});assert.equal(view.dismissed,true);assert.equal(h.document.activeElement,other);
 h.events.storage[0]({key:'unrelated',newValue:'shown'});assert.equal(view.dismissed,true);
 h.events.storage[0]({key:h.api.storageKeyFor(h.api.RELEASE),newValue:'invalid'});assert.equal(view.dismissed,true);
 view.element.querySelector('.announcement-reopen').focus();h.events.storage[0]({key:h.api.storageKeyFor(h.api.RELEASE),newValue:'shown'});assert.equal(view.dismissed,false);assert.equal(h.document.activeElement,view.element.querySelector('a'));
});
test('the closed regular-season machine is not advertised, while schedule comparison remains available',()=>{
 const h=harness(),view=h.api.mount(h.parent);view.update(snapshot());
 const [playoff,comparison]=view.element.querySelectorAll('a');assert.equal(playoff.hidden,false);
 playoff.focus();view.update(snapshot(15,14));assert.equal(playoff.hidden,true);assert.equal(h.document.activeElement,comparison);assert.match(comparison.className,/announcement-primary/);
 assert.equal(view.element.querySelector('.announcement-badge').textContent,'Season tools');
 view.element.querySelector('.announcement-dismiss').click();view.update(snapshot(16,14));assert.equal(view.dismissed,true);
 view.element.querySelector('.announcement-reopen').click();assert.equal(h.document.activeElement,comparison);
});
test('season closure requires actual valid records, not guessed missing totals',()=>{
 const h=harness();assert.equal(h.api.seasonOpen(snapshot(14,13),2026),true);assert.equal(h.api.seasonOpen(snapshot(14,14),2026),false);
 assert.equal(h.api.seasonOpen({...snapshot(),rosters:[{}]},2026),true);assert.equal(h.api.seasonOpen({...snapshot(),season:2027},2026),false);
});
test('homepage script order and placement preserve the hero and the existing live dashboard',()=>{
 const page=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),app=fs.readFileSync(require.resolve('./app.js'),'utf8');
 assert.ok(page.indexOf('assets/announcements.js')<page.indexOf('assets/app.js'));
 const home=app.slice(app.indexOf('function renderHome(){'),app.indexOf('function mountHomeLive('));
 assert.ok(home.indexOf('FarmhoodAnnouncements.mount(app)')<home.indexOf('app.appendChild(hero)'));
 assert.match(home,/Every ring, every curse, every Monday-night collapse/);
 const live=app.slice(app.indexOf('function mountHomeLive('),app.indexOf('/* ---------- PLAYFUL POLISH'));
 assert.match(live,/homeAnnouncement.update\(snapshot\)/);assert.doesNotMatch(live,/FarmhoodAnnouncements.mount/);
 assert.ok(fs.existsSync(path.join(__dirname,'..','playoffs.html')));assert.match(fs.readFileSync(require.resolve('./schedule.js'),'utf8'),/\['compare', 'Compare league'\]/);
});
