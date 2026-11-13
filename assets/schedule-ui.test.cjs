const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');

// Small DOM contract, intentionally dependency-free. Exercises real mounted
// listeners and asynchronous rerenders, not a second implementation of views.
class Element {
  constructor(tag, document) {
    this.tagName = tag;
    this.document = document;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this._text = '';
  }
  set textContent(value) { this._text = String(value); this.children.forEach(child => child.parentNode = null); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return key === 'data-sched-focus' ? this.dataset.schedFocus : this.attributes[key]; }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  emit(type, data = {}) { (this.listeners[type] || []).forEach(listener => listener({preventDefault() {}, ...data})); }
  click() { this.emit('click'); }
  focus() { this.document.activeElement = this; }
  contains(child) { return child === this || this.children.some(item => item.contains(child)); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); }
  querySelectorAll(selector) {
    const match = element => {
      const attr = selector.match(/^\[([^=]+)="([^"]*)"\]$/);
      return attr ? element.getAttribute(attr[1]) === attr[2] : selector[0] === '#' ? element.id === selector.slice(1) : element.tagName === selector;
    };
    return this.children.flatMap(child => [...(match(child) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  set value(value) { this._value = String(value); }
  get value() {
    if (this._value != null) return this._value;
    const options = this.querySelectorAll('option');
    return options.length ? (options.find(option => option.selected) || options[0]).value : '';
  }
}

function season() {
  const teams = 'ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LAC LAR LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS'.split(' ');
  return Array.from({length: 272}, (_, index) => {
    const week = Math.floor(index / 16) + 1;
    const pair = index % 16;
    return {week: week <= 8 && pair === week - 1 ? 18 : week, home: teams[pair * 2], away: teams[pair * 2 + 1], game_id: String(index)};
  });
}

function snapshot(name = 'Alpha') {
  return {leagueId: '1', season: 2026, currentWeek: 1, regularSeasonWeeks: 2, rosterPositions: ['RB'], rosters: [{rosterId: 1, name, wins: 0, pf: 1}, {rosterId: 2, name: 'Bravo', wins: 0, pf: 0}], matchups: [{rosterId: 1, matchupId: 1, points: 0, starters: ['p1'], players: ['p1']}, {rosterId: 2, matchupId: 1, points: 0, starters: ['p2'], players: ['p2']}]};
}

function harness(query = '', hash = '#heat') {
  const document = {activeElement: null};
  document.createElement = tag => new Element(tag, document);
  document.createTextNode = text => {const item = new Element('text', document); item.textContent = text; return item;};
  const host = document.createElement('main');
  document.getElementById = () => host;
  const events = {};
  const refreshes = [];
  const feed = {source: 'test', players: {p1: {id: 'p1', name: 'Runner A', position: 'RB', team: 'BAL'}, p2: {id: 'p2', name: 'Runner B', position: 'RB', team: 'DAL'}}};
  const context = {
    document, URLSearchParams, setTimeout, clearTimeout,
    location: {pathname: '/schedule.html', search: query, hash},
    addEventListener: (type, fn) => (events[type] ||= []).push(fn),
    history: {replaceState: (_state, _title, url) => {
      const parsed = new URL(url, 'https://example.test');
      context.location.search = parsed.search;
      context.location.hash = parsed.hash;
    }},
    liveStatusBar: (_snapshot, refresh) => {refreshes.push(refresh); return document.createElement('div');},
    fetch: async url => ({ok: true, json: async () => url.endsWith('/rosters')
      ? [{roster_id: 1, players: ['p1'], starters: ['p1']}, {roster_id: 2, players: ['p2'], starters: ['p2']}]
      : url.includes('/schedule/nfl/') ? season() : {settings: {playoff_week_start: 3, playoff_teams: 1}}}),
    FarmhoodLive: {
      load: async () => snapshot(),
      loadWeek: async () => snapshot().matchups,
      loadPlayers: async () => feed,
      lineupFor: row => row.starters.map(id => ({...feed.players[id], slot: 'RB'}))
    }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('./schedule.js'), 'utf8'), context);
  return {context, host, refreshes, feed, events, focus: key => host.querySelector('[data-sched-focus="' + key + '"]')};
}

async function settle() { for (let turn = 0; turn < 4; turn++) await new Promise(resolve => setImmediate(resolve)); }
function deferred() { let resolve; const promise = new Promise(done => resolve = done); return {promise, resolve}; }

test('mounted schedule keeps URL selections, keyboard tabs and browser hash navigation', async () => {
  const h = harness('?a=Bravo&b=Alpha&sort=slate&pa=p2&pb=p1&campaign=kept', '#bye');
  h.context.FarmhoodSchedule.mount(h.host);
  await settle();
  assert.equal(h.focus('player-a').value, 'p2');
  assert.equal(h.focus('player-b').value, 'p1');
  assert.equal(new URLSearchParams(h.context.location.search).get('sort'), 'slate');
  assert.equal(new URLSearchParams(h.context.location.search).get('campaign'), 'kept');
  h.focus('player-a').value = 'p1';
  h.focus('player-a').emit('change');
  assert.equal(new URLSearchParams(h.context.location.search).get('pa'), 'p1');
  assert.equal(h.context.document.activeElement.dataset.schedFocus, 'player-a');
  const tab = h.focus('tab-bye');
  tab.focus();
  tab.parentNode.emit('keydown', {key: 'Home'});
  assert.equal(h.context.location.hash, '#heat');
  assert.equal(h.context.document.activeElement.dataset.schedFocus, 'tab-heat');
  assert.equal(h.focus('tab-heat').tabIndex, 0);
  assert.equal(h.focus('tab-bye').tabIndex, -1);
  h.context.location.hash = '#h2h';
  h.events.hashchange[0]();
  assert.ok(h.focus('select-a'));
  h.context.location.hash = '#invalid';
  h.events.hashchange[0]();
  assert.equal(h.context.location.hash, '#heat');
});

test('pickup completion preserves the player select focus', async () => {
  const h = harness('', '#bye');
  const pickup = deferred();
  h.context.FarmhoodLive.loadPlayers = async (_snapshot, week) => week === 2 ? pickup.promise : h.feed;
  h.context.FarmhoodSchedule.mount(h.host);
  await settle();
  h.focus('player-a').focus();
  pickup.resolve(h.feed);
  await settle();
  assert.equal(h.context.document.activeElement, h.focus('player-a'));
});

test('older refresh completion cannot overwrite a newer captured snapshot', async () => {
  const h = harness();
  h.context.FarmhoodSchedule.mount(h.host);
  await settle();
  const old = deferred();
  const fresh = deferred();
  const loads = [old, fresh];
  h.context.FarmhoodLive.load = () => loads.shift().promise;
  const oldRefresh = h.refreshes.at(-1)();
  const newRefresh = h.refreshes.at(-1)();
  fresh.resolve(snapshot('Latest Manager'));
  await newRefresh;
  old.resolve(snapshot('Outdated Manager'));
  await oldRefresh;
  assert.match(h.host.textContent, /Latest Manager/);
  assert.doesNotMatch(h.host.textContent, /Outdated Manager/);
});

test('comparison scope persists in the URL and replay links select the compared managers', async () => {
  const h = harness('?a=Alpha&b=Bravo&scope=completed', '#h2h');
  h.context.FarmhoodSchedule.mount(h.host); await settle();
  assert.equal(h.focus('scope-window').value, 'completed');
  assert.match(h.host.textContent, /Team scoring vs schedule difficulty/);
  const link = h.host.querySelectorAll('a').find(item => item.textContent.includes('Replay Alpha on Bravo'));
  assert.ok(link);
  const url = new URL(link.href, 'https://example.test');
  assert.equal(url.hash, '#fair');
  assert.equal(url.searchParams.get('replayTeam'), 'Alpha');
  assert.equal(url.searchParams.get('replayOwner'), 'Bravo');
  h.focus('scope-window').value = 'season'; h.focus('scope-window').emit('change');
  assert.equal(new URLSearchParams(h.context.location.search).get('scope'), 'season');
  assert.equal(h.context.document.activeElement.dataset.schedFocus, 'scope-window');
});

test('mobile heatmap keeps a labeled keyboard scroll region and a single full-card compare target', async () => {
  const h = harness();
  h.context.FarmhoodSchedule.mount(h.host); await settle();
  const scroller = h.host.querySelectorAll('div').find(item => item.className === 'sched-scroll');
  assert.equal(scroller.tabIndex, 0);
  assert.equal(scroller.getAttribute('role'), 'region');
  assert.match(scroller.getAttribute('aria-label'), /Full season heatmap, horizontally scrollable/);
  scroller.emit('keydown', {target: scroller, key: 'ArrowRight'});
  assert.equal(scroller.scrollLeft, 96);
  scroller.emit('keydown', {target: scroller, key: 'ArrowLeft'});
  assert.equal(scroller.scrollLeft, 0);
  assert.match(h.host.textContent, /Swipe or scroll sideways/);
  const compare = h.focus('compare-1');
  assert.equal(compare.tagName, 'button');
  assert.match(compare.textContent, /Alpha/);
  compare.click();
  assert.equal(h.context.location.hash, '#h2h');
  assert.ok(h.focus('select-a'));
});
