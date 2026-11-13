const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');

// A small DOM contract for real event handlers; models are not reimplemented.
class Element {
  constructor(tag, document) {
    Object.assign(this, {tagName: tag, document, children: [], dataset: {}, attributes: {}, listeners: {}, style: {}, nodeType: 1, _text: '', isConnected: true});
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key]; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  emit(type) { (this.listeners[type] || []).forEach(fn => fn({target: this})); }
  focus() { this.document.activeElement = this; }
  contains(element) { return element === this || this.children.some(child => child.contains(element)); }
  replaceWith(element) { const siblings = this.parentNode.children; siblings[siblings.indexOf(this)] = element; element.parentNode = this.parentNode; }
  querySelectorAll(tag) {
    const attribute = tag.match(/^\[data-([^=]+)="([^"]*)"\]$/);
    const matches = child => attribute ? child.dataset[attribute[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] === attribute[2] : child.tagName === tag;
    return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(tag)]);
  }
  querySelector(tag) { return this.querySelectorAll(tag)[0] || null; }
}
function harness() {
  const document = {activeElement: null};
  document.createElement = tag => new Element(tag, document);
  const context = {document, setTimeout, clearTimeout, AbortController};
  const host = document.createElement('main');
  vm.runInNewContext(fs.readFileSync(require.resolve('./desk.js'), 'utf8'), context);
  return {context, host, desk: context.FarmhoodDesk};
}
function select(host, label, value) {
  const field = host.querySelectorAll('label').find(element => element.children[0].textContent === label);
  assert.ok(field, 'Missing control: ' + label);
  const control = field.querySelector('select');
  control.focus(); control.value = value; control.emit('change');
  return control;
}
function press(host, label) {
  const button = host.querySelectorAll('button').find(item => item.textContent === label);
  assert.ok(button, 'Missing button: ' + label); button.focus(); button.emit('click'); return button;
}
async function settle() { for (let turn = 0; turn < 5; turn++) await new Promise(resolve => setImmediate(resolve)); }
async function open(details) { details.open = true; details.emit('toggle'); await settle(); }
function bundle() {
  return {
    snapshot: {currentWeek: 2}, shape: {},
    model: {completedThrough: 1, regularSeasonWeeks: 2, playoffTeams: 1, rosters: [
      {rosterId: 1, name: 'Alpha', wins: 1, ties: 0, pf: 100, cells: [{week: 2, remaining: true, opponentId: 2}]},
      {rosterId: 2, name: 'Bravo', wins: 0, ties: 0, pf: 0, cells: [{week: 2, remaining: true, opponentId: 1}]}
    ]},
    weeks: {1: [{rosterId: 1, matchupId: 1, points: 100.12}, {rosterId: 2, matchupId: 1, points: 0}]}
  };
}

test('odds renders observed scores, manager sensitivity, seed details and retained controls', () => {
  const h = harness(); const source = bundle();
  h.host.appendChild(h.desk.renderOdds(source));
  assert.match(h.host.textContent, /1 observed weeks/);
  assert.match(h.host.textContent, /AlphaPlayoffs 100%/);
  select(h.host, 'What-if manager', '1'); select(h.host, 'Future scoring', '1.1');
  assert.match(h.host.textContent, /What-if only: Alpha scores 10% more/);
  assert.match(h.host.textContent, /Baseline playoffs/);
  assert.match(h.host.textContent, /seed distribution/);
  select(h.host, 'Score sample', 'recent');
  assert.equal(source.oddsUi.window, 'recent');
  assert.equal(h.context.document.activeElement.value, 'recent');
  assert.equal(h.host.querySelectorAll('select')[2].value, '1');
});

test('odds never offers a confident forecast for missing opponents, empty samples or postseason eliminations', () => {
  const h = harness(); const source = bundle();
  source.model.rosters[0].cells = [{week: 2, missing: true, remaining: false}];
  assert.match(h.desk.renderOdds(source).textContent, /remaining schedule is incomplete/);
  source.model.rosters[0].cells = [];
  source.weeks = {};
  assert.match(h.desk.renderOdds(source).textContent, /No finalized scoring samples/);
  source.snapshot.currentWeek = 3;
  assert.match(h.desk.renderOdds(source).textContent, /closed for the postseason/);
});

test('Fair Slate stays on labeled 2026, includes final zero and drills down by manager and week', () => {
  const h = harness(); const source = bundle();
  h.context.LEAGUE = {names2025: {1: 'Alpha', 2: 'Bravo'}, weekly2025: {1: [[1, 1, 75], [2, 1, 50]], 15: [[1, 1, 999], [2, 1, 900]]}};
  h.host.appendChild(h.desk.renderFair(source));
  assert.match(h.host.textContent, /ACTUAL RESULTS · 2026 · 1 complete/);
  assert.match(h.host.textContent, /100\.12/);
  assert.match(h.host.textContent, /Bravo/);
  press(h.host, 'All-play baseline'); select(h.host, 'Manager detail', 'Bravo');
  assert.match(h.host.textContent, /Bravo week-by-week schedule impact/);
  select(h.host, 'Through week', '1');
  select(h.host, 'Season', '2025');
  assert.match(h.host.textContent, /2025 · 1 complete/);
  assert.doesNotMatch(h.host.textContent, /999/);
});

test('draft loads lazily, uses authoritative roster ownership and filters all picks', async () => {
  const h = harness(); let calls = 0;
  h.context.LEAGUE = {live2026: {leagueId: '1', rosterNames: {1: 'Alpha', 2: 'Bravo'}}, draft2026: {draftId: 'draft'}};
  h.context.FarmhoodLive = {load: async () => ({rosters: [{rosterId: 1, name: 'Alpha'}, {rosterId: 2, name: 'Bravo'}], matchups: []})};
  h.context.fetch = async url => { calls++; return {ok: true, json: async () => url.endsWith('/picks')
    ? [{player_id: 'p1', roster_id: 1, round: 1, pick_no: 1, metadata: {first_name: 'Player', last_name: 'One', position: 'WR'}}]
    : [{roster_id: 1, players: [], starters: []}, {roster_id: 2, players: ['p1'], starters: ['p1']}]}; };
  h.desk.mountDraft(h.host); assert.equal(calls, 0);
  await open(h.host.querySelector('details'));
  assert.match(h.host.textContent, /Player One/);
  assert.match(h.host.textContent, /moved/);
  select(h.host, 'Roster status', 'gone');
  assert.match(h.host.textContent, /No picks match/);
  select(h.host, 'Roster status', 'moved');
  assert.match(h.host.textContent, /1 of 1 picks match/);
});

test('incomplete draft ownership is a recoverable error, not a board of Gone picks', async () => {
  const h = harness();
  h.context.LEAGUE = {live2026: {leagueId: '1'}, draft2026: {draftId: 'draft'}};
  h.context.FarmhoodLive = {load: async () => ({rosters: [{rosterId: 1, name: 'Alpha'}]})};
  h.context.fetch = async () => ({ok: true, json: async () => []});
  h.desk.mountDraft(h.host); await open(h.host.querySelector('details'));
  assert.match(h.host.textContent, /Nothing has been replaced with an estimate/);
  assert.equal(h.host.querySelector('button').textContent, 'Try again');
});

test('waiver history requests every finalized week, not only saved weeks, and filters trade outcomes', async () => {
  const h = harness(); const urls = [];
  h.context.LEAGUE = {live2026: {leagueId: '1', rosterNames: {1: 'Alpha', 2: 'Bravo'}}};
  h.context.FarmhoodLive = {
    load: async () => ({regularSeasonWeeks: 14, currentWeek: 3, rosters: [{wins: 2, losses: 0, ties: 0}, {wins: 0, losses: 2, ties: 0}]}),
    loadPlayers: async () => ({players: {p1: {name: 'Pickup', position: 'RB'}}})
  };
  h.context.fetch = async url => {
    urls.push(url);
    return {ok: true, json: async () => url.includes('/matchups/')
      ? [{roster_id: 1, players: ['p1'], starters: ['p1'], starters_points: [20]}, {roster_id: 2, players: [], starters: [], starters_points: []}]
      : url.endsWith('/transactions/1') ? [{transaction_id: 't1', status: 'complete', type: 'free_agent', adds: {p1: 1}, status_updated: 1}] : []};
  };
  h.desk.mountHistory(h.host); assert.equal(urls.length, 0);
  await open(h.host.querySelectorAll('details')[1]);
  assert.ok(urls.some(url => url.endsWith('/transactions/1')));
  assert.ok(urls.some(url => url.endsWith('/transactions/2')));
  assert.ok(!urls.some(url => url.includes('/transactions/3')));
  assert.match(h.host.textContent, /Pickup/);
  assert.match(h.host.textContent, /20\.00/);
  assert.match(h.host.textContent, /subsequent finalized weeks only/);
});

test('manager comparisons load finalized 2026 scores, retain the selected pair and label the archive', async () => {
  const h = harness();
  h.context.LEAGUE = {managers: [{name: 'Alpha'}, {name: 'Bravo'}], names2025: {1: 'Alpha', 2: 'Bravo'}, weekly2025: {1: [[1, 1, 75], [2, 1, 50]], 15: [[1, 1, 999], [2, 1, 900]]}};
  h.context.FarmhoodLive = {
    load: async () => ({regularSeasonWeeks: 14, rosters: [{rosterId: 1, name: 'Alpha', wins: 1, losses: 0, ties: 0}, {rosterId: 2, name: 'Bravo', wins: 0, losses: 1, ties: 0}]}),
    loadWeek: async () => bundle().weeks[1]
  };
  h.desk.mountManagers(h.host); await open(h.host.querySelector('details'));
  assert.match(h.host.textContent, /2026 · 1 finalized regular-season weeks/);
  select(h.host, 'Manager detail', 'Alpha');
  const comparison = select(h.host, 'Compare with', 'Bravo');
  assert.equal(comparison.disabled, false);
  assert.match(h.host.textContent, /2026 weekly scoring comparison/);
  assert.match(h.host.textContent, /100\.12/);
  select(h.host, 'Season', '2025');
  assert.match(h.host.textContent, /2025 weekly scoring comparison/);
  assert.doesNotMatch(h.host.textContent, /999/);
  select(h.host, 'Manager detail', 'all');
  assert.equal(comparison.disabled, true);
});

test('each interactive host loads live data before the feature entry point, including Managers and History', () => {
  const path = require('node:path');
  for (const name of ['managers', 'history', 'draft', 'matchups', 'schedule']) {
    const html = fs.readFileSync(path.join(__dirname, '..', name + '.html'), 'utf8');
    assert.ok(html.indexOf('src="assets/live.js') > 0, name + ' missing live feed');
    assert.ok(html.indexOf('src="assets/live.js') < html.indexOf('src="assets/desk.js'), name + ' wrong script order');
  }
});

test('schedule replay switches self-match handling, compares strength, and keeps all-play distinct', () => {
  const h = harness(), source = bundle();
  h.host.appendChild(h.desk.renderFair(source));
  assert.match(h.host.textContent, /Alpha on Bravo’s schedule/);
  assert.match(h.host.textContent, /0 paired weeks compared · 1 excluded/);
  assert.match(h.host.textContent, /Self-matchup excluded from both/);
  select(h.host, 'Self-matchup rule', 'swap');
  assert.match(h.host.textContent, /1 paired weeks compared · 0 excluded/);
  assert.match(h.host.textContent, /Two-way schedule swap/);
  assert.match(h.host.textContent, /Bravo · swapped/);
  press(h.host, 'Season strength');
  assert.match(h.host.textContent, /team strength vs schedule strength/);
  assert.match(h.host.textContent, /Median pts/);
  press(h.host, 'All-play baseline');
  assert.match(h.host.textContent, /not the same as borrowing one manager’s schedule/);
  press(h.host, 'Schedule replay');
  assert.equal(source.fairUi.selfMatch, 'swap');
  assert.equal(h.context.document.activeElement.textContent, 'Schedule replay');
});

test('schedule comparison deep links select the two managers and update without discarding other parameters', () => {
  const h = harness(), source = bundle();
  h.context.URLSearchParams = URLSearchParams;
  h.context.location = {pathname: '/schedule.html', search: '?a=Alpha&scope=completed&replayTeam=Bravo&replayOwner=Alpha'};
  let lastUrl = '';
  h.context.history = {replaceState: (_state, _title, url) => { lastUrl = url; }};
  h.host.appendChild(h.desk.renderFair(source));
  assert.match(h.host.textContent, /Bravo on Alpha’s schedule/);
  select(h.host, 'Self-matchup rule', 'swap');
  assert.match(lastUrl, /scope=completed/);
  assert.match(lastUrl, /replayMethod=swap/);
  assert.match(lastUrl, /replaySeason=2026/);
  assert.match(lastUrl, /replayWeek=all/);
  assert.match(lastUrl, /#fair$/);
});

async function moneyHarness(phase = 'Scheduled') {
  const h = harness();
  h.context.LEAGUE = {};
  h.context.fetch = async () => ({ok: true, json: async () => ({regularSeasonWeeks: 14, positionSchedule: {1: 'QB', 2: 'QB'}, weeklyPrizes: {highestScore: 30, positionLeader: 10}, rivalryPrize: 50, rivalries: [{week: 1, managerA: 'Alpha', managerB: 'Bravo', labelA: 'Al', labelB: 'Be'}]})});
  h.context.FarmhoodLive = {lineupFor: row => [{id: 'p' + row.rosterId, name: 'QB ' + row.rosterId, slot: 'QB', position: 'QB', projection: 20, points: row.points, gameStatus: phase === 'Live' ? 'live' : 'pre_game'}]};
  const ctx = {snapshot: {season: 2026, rosters: [{rosterId: 1, name: 'Alpha'}, {rosterId: 2, name: 'Bravo'}], rosterPositions: ['QB']}, selectedWeek: 1, weekState: phase,
    rows: [{rosterId: 1, points: phase === 'Scheduled' ? 0 : 42}, {rosterId: 2, points: phase === 'Scheduled' ? 0 : 38}],
    forecast: {teams: [{rosterId: 1, pregameProjection: 128.07, projection: 50}, {rosterId: 2, pregameProjection: 121.31, projection: 60}]}};
  h.desk.mountMatchup(h.host, ctx); await settle(); return {...h, ctx};
}

test('money defaults to actual points, never pregame zero leaders, and labels every estimate explicitly', async () => {
  const h = await moneyHarness();
  assert.match(h.host.textContent, /ACTUAL POINTS · PTS · NOT STARTED/);
  assert.match(h.host.textContent, /No leader or prize has been earned/);
  assert.doesNotMatch(h.host.textContent, /128\.07|highest actual|split this prize/);
  press(h.host, 'Projections · EST');
  assert.match(h.host.textContent, /128\.07 Proj · EST/);
  assert.match(h.host.textContent, /ESTIMATES ONLY/);
  assert.doesNotMatch(h.host.textContent, / · leads|128\.07 Pts/);
  h.desk.mountMatchup(h.host, h.ctx);
  assert.match(h.host.textContent, /128\.07 Proj · EST/);
  h.desk.mountMatchup(h.host, {...h.ctx, selectedWeek: 2});
  assert.match(h.host.textContent, /ACTUAL POINTS · PTS · NOT STARTED/);
});

test('live and final actual score views do not substitute estimates or certify payouts', async () => {
  const h = await moneyHarness('Live');
  assert.match(h.host.textContent, /42\.00 Pts · highest actual/);
  assert.match(h.host.textContent, /LIVE \/ PROVISIONAL/);
  assert.doesNotMatch(h.host.textContent, /128\.07/);
  h.desk.mountMatchup(h.host, {...h.ctx, weekState: 'Final'});
  assert.match(h.host.textContent, /FINAL SCORES/);
  assert.match(h.host.textContent, /does not certify awards/);
  press(h.host, 'Projections · EST');
  assert.match(h.host.textContent, /128\.07 Proj · EST/);
});
