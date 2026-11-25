const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),vm=require('node:vm');
class Element{
 constructor(tag,document){Object.assign(this,{tagName:tag.toUpperCase(),document,children:[],dataset:{},attributes:{},listeners:{},style:{},_text:'',isConnected:true,clientWidth:1024,nodeType:1});this.classList={toggle:(name,on)=>{const all=new Set((this.className||'').split(' ').filter(Boolean));if(on)all.add(name);else all.delete(name);this.className=[...all].join(' ');}};}
 set textContent(v){this._text=String(v);this.children=[];}get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
 appendChild(c){c.parentNode=this;this.children.push(c);return c;}append(...cs){cs.forEach(c=>this.appendChild(c));}
 insertBefore(c,ref){c.parentNode=this;const i=this.children.indexOf(ref);if(i<0)this.children.push(c);else this.children.splice(i,0,c);return c;}
 setAttribute(k,v){this.attributes[k]=String(v);}getAttribute(k){if(k.startsWith('data-'))return this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())];return this.attributes[k];}
 addEventListener(k,fn){(this.listeners[k]||=[]).push(fn);}async emit(k){await Promise.all((this.listeners[k]||[]).map(fn=>fn({target:this,preventDefault(){}})));}async click(){await this.emit('click');}
 contains(el){return this===el||this.children.some(c=>c.contains(el));}focus(){this.document.activeElement=this;}select(){}remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);}
 querySelectorAll(selector){const m=selector.match(/^([a-z]+)?(?:\.([\w-]+))?(?:\[([\w-]+)(?:="([^"]*)")?\])?$/i);if(!m)throw Error('Unsupported test selector '+selector);const matches=e=>(!m[1]||e.tagName===m[1].toUpperCase())&&(!m[2]||(e.className||'').split(' ').includes(m[2]))&&(!m[3]||(m[4]!=null?e.getAttribute(m[3])===m[4]:e.getAttribute(m[3])!=null));return this.children.flatMap(c=>[...(matches(c)?[c]:[]),...c.querySelectorAll(selector)]);}
 querySelector(s){return this.querySelectorAll(s)[0]||null;}
 set value(v){this._value=String(v);}get value(){if(this._value!=null)return this._value;const options=this.querySelectorAll('option');return options.length?(options.find(o=>o.selected)||options[0]).value:'';}
}
function fixture(){const teams=Array.from({length:8},(_,i)=>({rosterId:i+1,name:'Team '+(i+1),wins:i<4?1:0,losses:i<4?0:1,ties:0,pf:120-i*5,pa:80+i*5}));const slate=pairs=>pairs.flatMap((p,i)=>p.map(id=>({rosterId:id,matchupId:i+1,points:0})));return{snapshot:{leagueId:'league',season:2026,currentWeek:2,regularSeasonWeeks:3,rosters:teams},model:{regularSeasonWeeks:3,completedThrough:1,playoffTeams:6,rosters:teams},shape:{leagueSettings:{playoff_teams:6,playoff_week_start:4,last_scored_leg:1}},weeks:{1:slate([[1,2],[3,4],[5,6],[7,8]]),2:slate([[1,5],[2,6],[3,7],[4,8]]),3:slate([[1,2],[3,4],[5,6],[7,8]])}};}
function harness(){const document={activeElement:null};document.createElement=tag=>new Element(tag,document);document.createTextNode=text=>{const n=new Element('text',document);n.textContent=text;return n;};let copied='';const context={document,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,location:new URL('https://example.test/playoffs.html'),navigator:{clipboard:{writeText:async text=>{copied=text;}}}};for(const file of ['playoff-model.js','playoffs.js'])vm.runInNewContext(fs.readFileSync(require.resolve('./'+file),'utf8'),context);return{context,api:context.FarmhoodPlayoffs,modelApi:context.FarmhoodPlayoffModel,copied:()=>copied};}
const findButton=(host,text)=>{const b=host.querySelectorAll('button').find(b=>b.textContent===text);assert.ok(b,'Missing '+text);return b;};
const pick=(host,id,opponent,week)=>{const b=host.querySelectorAll('button').find(b=>b.getAttribute('aria-label')===`Pick Team ${id} to beat Team ${opponent} in Week ${week}`);assert.ok(b);return b;};

test('winner picks update the entire field, stay selected across weeks and can be cleared',async()=>{
 const h=harness(),source=fixture(),before=JSON.stringify(source),view=h.api.render(source),host=view.element;
 assert.match(host.textContent,/0 of 8 remaining games/);assert.equal(host.querySelectorAll('.pm-standing-name').length,8);
 await pick(host,1,5,2).click();assert.equal(view.result.picksMade,1);assert.equal(pick(host,1,5,2).getAttribute('aria-pressed'),'true');
 await host.querySelectorAll('button').find(b=>b.dataset.week==='3').click();await pick(host,1,2,3).click();assert.equal(view.result.picksMade,2);
 await host.querySelectorAll('button').find(b=>b.dataset.week==='2').click();assert.equal(pick(host,1,5,2).getAttribute('aria-pressed'),'true');
 await findButton(host,'Clear my picks').click();assert.equal(view.result.picksMade,0);assert.equal(JSON.stringify(source),before);
});
test('score input infers winners, exposes contradictions and clears stale estimates when choosing another winner',async()=>{
 const h=harness(),view=h.api.render(fixture()),host=view.element;
 const [a,b]=host.querySelectorAll('input');a.value='100';await a.emit('input');b.value='90';await b.emit('input');
 assert.equal(view.result.picksMade,1);assert.equal(pick(host,1,5,2).getAttribute('aria-pressed'),'true');
 await pick(host,5,1,2).click();assert.equal(a.value,'');assert.equal(b.value,'');
 a.value='100';await a.emit('input');b.value='90';await b.emit('input');
 assert.equal(view.result.picksMade,0);assert.match(host.querySelector('.pm-game-error').textContent,/conflict/);
});
test('a single future score cannot be mislabeled as unchanged official standings',async()=>{
 const h=harness(),view=h.api.render(fixture()),host=view.element;
 host.querySelector('input').value='110';await host.querySelector('input').emit('input');
 assert.equal(view.result.picksMade,0);assert.match(host.textContent,/Partial scenario/);assert.doesNotMatch(host.textContent,/Current standings\. No future outcomes/);
});
test('a complete scenario opens the standard bracket while incomplete scenarios disclose missing picks',async()=>{
 const h=harness(),view=h.api.render(fixture()),host=view.element;
 await findButton(host,'Scenario bracket').click();assert.match(host.textContent,/Finish all 8 remaining picks/);
 await findButton(host,'Fill: higher current seed wins').click();assert.equal(view.result.complete,true);assert.match(host.textContent,/First-round byes/);assert.match(host.textContent,/Opening round/);
});
test('share links are league scoped, preserve valid choices and drop newly finalized games',async()=>{
 const h=harness(),source=fixture(),model=h.modelApi.createModel(source),view=h.api.render(source);
 await pick(view.element,1,5,2).click();await findButton(view.element,'Copy scenario link').click();
 const raw=new URL(h.copied()).searchParams.get('scenario'),parsed=h.api.decodeScenario(raw,model);
 assert.equal(parsed.picks['2:1'],1);
 assert.deepEqual(JSON.parse(JSON.stringify(h.api.decodeScenario(raw,{...model,leagueId:'wrong'}).picks)),{});
 const shared=h.api.encodeScenario({...model,completedThrough:0},{'1:1':1,'3:1':1},{});
 const old=h.api.decodeScenario(shared,model);assert.equal(old.picks['3:1'],1);assert.equal(old.picks['1:1'],undefined);assert.match(old.notice,/New final results/);
 assert.match(h.api.decodeScenario('x'.repeat(12001),model).notice,/could not/);
});
test('shared hypothetical scores cannot attach to different opponents after a fixture change',()=>{
 const h=harness(),model=h.modelApi.createModel(fixture());
 const saved=h.api.encodeScenario(model,{'2:1':1},{'2:1':{a:100,b:50}});
 const changed={...model,games:model.games.map(game=>game.key==='2:1'?{...game,b:6}:game)};
 const restored=h.api.decodeScenario(saved,changed);assert.equal(restored.picks['2:1'],undefined);assert.equal(restored.scores['2:1'],undefined);assert.match(restored.notice,/matchups changed/);
});
test('on-demand odds use final history and are invalidated when picks change',async()=>{
 const h=harness(),source=fixture();h.context.FarmhoodLive={loadWeek:async()=>source.snapshot.rosters.map(t=>({rosterId:t.rosterId,points:t.pf}))};
 const view=h.api.render(source),host=view.element;await findButton(host,'Estimate playoff odds').click();
 assert.match(host.textContent,/2000 simulated finishes/);assert.match(host.textContent,/not a calibrated forecast/);
 await pick(host,1,5,2).click();assert.match(host.textContent,/Re-run after changing/);
});
test('loader rejects mismatched settings instead of inventing a playoff field',async()=>{
 const h=harness();h.context.FarmhoodLive={load:async()=>fixture().snapshot};h.context.fetch=async()=>({ok:true,json:async()=>({league_id:'wrong',season:'2026',settings:{}})});
 await assert.rejects(h.api.load(),/mismatched/);
});
test('the regular-season machine does not fabricate postseason seeds from stale standing totals',()=>{
 const h=harness(),source=fixture();source.snapshot.currentWeek=4;
 const view=h.api.render(source);assert.match(view.element.textContent,/closed for the postseason/);assert.equal(view.element.querySelectorAll('.pm-pick').length,0);
});
test('playoff route loads the numerical model before the UI and is discoverable without a new primary nav item',()=>{
 const page=fs.readFileSync(require('node:path').join(__dirname,'..','playoffs.html'),'utf8'),app=fs.readFileSync(require.resolve('./app.js'),'utf8');
 assert.ok(page.indexOf('assets/playoff-model.js')<page.indexOf('assets/playoffs.js'));
 assert.match(app,/\['playoffs.html','Playoff Machine','playoffs'\]/);
});

test('full-field schedule comparison keeps all managers, real records and every finalized comparison',()=>{
 const h=harness();vm.runInNewContext(fs.readFileSync(require.resolve('./desk.js'),'utf8'),h.context);vm.runInNewContext(fs.readFileSync(require.resolve('./field-comparison.js'),'utf8'),h.context);
 const source=fixture(),field=h.context.FarmhoodField.buildModel(source);
 assert.equal(field.status,'ready');assert.equal(field.teams.length,8);assert.equal(field.matrix.flat().length,64);
 assert.ok(field.matrix.flat().every(cell=>cell.record.games===1));assert.ok(field.teams.every((team,index)=>JSON.stringify(field.matrix[index][index].record)===JSON.stringify(team.record)));
 const host=h.context.FarmhoodField.render(source);assert.match(host.textContent,/Everyone’s record on every schedule/);assert.equal(host.querySelectorAll('.field-result').length,64);
 source.weeks[1][0].points=null;assert.equal(h.context.FarmhoodField.buildModel(source).status,'empty');
});
