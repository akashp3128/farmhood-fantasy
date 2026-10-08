const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const trend = require('./power-trend.js');

function fixture(overrides = {}) {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    name: `Manager ${String(index + 1).padStart(2, '0')}`,
    rank: index + 1,
    previousRank: 12 - index,
    movement: 11 - index * 2
  }));
  return {
    rows,
    trendLabels: ['Pre', 'W1', 'W2', 'W3', 'W4 Live'],
    trend: Object.fromEntries(rows.map((row) => [row.name, [row.previousRank, 8, 6, row.previousRank, row.rank]])),
    ...overrides
  };
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

// The chart is deliberately DOM-only, so these renderer tests need no browser,
// chart package, network, canvas emulation, or generated image snapshots.
class FakeElement {
  constructor(tagName, document) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = document;
    this.children = [];
    this.attributes = new Map();
    this.dataset = new Proxy({}, {
      set: (target, key, value) => {
        target[key] = String(value);
        const attribute = `data-${String(key).replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())}`;
        this.attributes.set(attribute, String(value));
        return true;
      }
    });
    this.style = { setProperty(name, value) { this[name] = value; } };
    this.listeners = new Map();
    this.parentNode = null;
    this._text = '';
    this.value = '';
    this.hidden = false;
    this.disabled = false;
    this.open = false;
    this.classList = {
      add: (...tokens) => { this.className = [...new Set(this.className.split(/\s+/).filter(Boolean).concat(tokens))].join(' '); },
      remove: (...tokens) => { this.className = this.className.split(/\s+/).filter((token) => !tokens.includes(token)).join(' '); },
      contains: (token) => this.className.split(/\s+/).includes(token),
      toggle: (token, force) => {
        const enabled = force === undefined ? !this.classList.contains(token) : force;
        this.classList[enabled ? 'add' : 'remove'](token);
        return enabled;
      }
    };
  }
  get className() { return this.getAttribute('class') || ''; }
  set className(value) { this.setAttribute('class', value); }
  get childNodes() { return this.children; }
  get firstChild() { return this.children[0] || null; }
  get lastChild() { return this.children.at(-1) || null; }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
  set textContent(value) { this._text = String(value ?? ''); this.replaceChildren(); }
  get innerHTML() { return this.textContent; }
  set innerHTML(value) {
    assert.equal(value, '', 'renderer must create DOM nodes and assign manager data with textContent, not parse HTML');
    this._text = '';
    this.replaceChildren();
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
      this.dataset[key] = String(value);
    }
    if (name === 'id') this.id = String(value);
  }
  setAttributeNS(_namespace, name, value) { this.setAttribute(name, value); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  appendChild(child) {
    if (child.parentNode) child.remove();
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  append(...children) {
    children.forEach((child) => this.appendChild(typeof child === 'string' ? this.ownerDocument.createTextNode(child) : child));
  }
  replaceChildren(...children) {
    this.children.forEach((child) => { child.parentNode = null; });
    this.children = [];
    this.append(...children);
  }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }
  contains(element) { return element === this || this.children.some((child) => child.contains(element)); }
  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }
  dispatch(type, fields = {}) {
    const event = { type, target: this, currentTarget: this, preventDefault() { this.defaultPrevented = true; }, ...fields };
    (this.listeners.get(type) || []).forEach((handler) => handler(event));
    return event;
  }
  focus() { this.ownerDocument.activeElement = this; }
  matches(selector) {
    const classMatch = selector.match(/\.([\w-]+)/);
    const tagMatch = selector.match(/^[a-z][\w-]*/i);
    const attrMatch = selector.match(/\[([\w-]+)(?:=["']?([^"'\]]+)["']?)?\]/);
    return (!classMatch || this.classList.contains(classMatch[1]))
      && (!tagMatch || this.tagName.toLowerCase() === tagMatch[0].toLowerCase())
      && (!attrMatch || (this.hasAttribute(attrMatch[1]) && (attrMatch[2] === undefined || this.getAttribute(attrMatch[1]) === attrMatch[2])));
  }
  closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest(selector) || null; }
  querySelectorAll(selector) {
    const matches = [];
    const visit = (element) => element.children.forEach((child) => {
      if (selector.split(',').some((part) => child.matches(part.trim()))) matches.push(child);
      visit(child);
    });
    visit(this);
    return matches;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function withDocument(callback) {
  const oldDocument = global.document;
  const document = {
    activeElement: null,
    createElement(tagName) { return new FakeElement(tagName, this); },
    createElementNS(_namespace, tagName) { return this.createElement(tagName); },
    createTextNode(text) { const node = this.createElement('#text'); node.textContent = text; return node; }
  };
  global.document = document;
  try { return callback(document); }
  finally {
    if (oldDocument === undefined) delete global.document;
    else global.document = oldDocument;
  }
}

function withAnimationFrames(callback) {
  const oldRequest = global.requestAnimationFrame;
  const queue = [];
  global.requestAnimationFrame = (handler) => { queue.push(handler); return queue.length; };
  const flush = () => queue.splice(0).forEach((handler) => handler(0));
  try { return callback(flush, queue); }
  finally {
    if (oldRequest === undefined) delete global.requestAnimationFrame;
    else global.requestAnimationFrame = oldRequest;
  }
}

function setViewportSize(root, clientWidth = 563, scrollWidth = 960) {
  const viewport = root.querySelector('.power-trend-chart-scroll');
  assert.ok(viewport);
  viewport.clientWidth = clientWidth;
  viewport.scrollWidth = scrollWidth;
  return viewport;
}

function elements(root, tagName) { return root.querySelectorAll(tagName); }

function accessibleName(element) {
  return element.getAttribute('aria-label') || element.textContent.trim();
}

test('defaults to the current top six and all scope includes every manager', () => {
  const ranking = fixture();
  const top = trend.buildModel(ranking, {});
  const all = trend.buildModel(ranking, { scope: 'all' });

  assert.equal(top.scope, 'top6');
  assert.deepEqual(top.visibleRows.map((row) => row.name), ranking.rows.slice(0, 6).map((row) => row.name));
  assert.equal(all.scope, 'all');
  assert.deepEqual(all.visibleRows.map((row) => row.name), ranking.rows.map((row) => row.name));
  assert.equal(top.rankCount, 12, 'top-six visibility must not compress the rank scale to six');
});

test('current rank, not input order or historical peak, determines the top-six cohort', () => {
  const ranking = fixture();
  ranking.rows.reverse();
  const model = trend.buildModel(ranking, {});

  assert.deepEqual(model.visibleRows.map((row) => row.rank), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(model.rows.map((row) => row.rank), Array.from({ length: 12 }, (_, index) => index + 1));
});

test('rank scale puts rank one at the top and maps every integer checkpoint exactly', () => {
  const top = 30;
  const height = 220;
  assert.equal(trend.rankY(1, 12, top, height), top);
  assert.equal(trend.rankY(12, 12, top, height), top + height);
  for (let rank = 1; rank <= 12; rank++) {
    assert.equal(trend.rankY(rank, 12, top, height), top + (rank - 1) * 20);
  }
});

test('a live checkpoint remains distinct from the previous completed week', () => {
  const ranking = fixture();
  const model = trend.buildModel(ranking, {});
  const row = model.rows.find((item) => item.name === 'Manager 01');

  assert.deepEqual(model.labels, ['Pre', 'W1', 'W2', 'W3', 'W4 Live']);
  assert.equal(model.latestIndex, 4);
  assert.equal(model.checkpointIndex, 4);
  assert.deepEqual(model.checkpoints.map((checkpoint) => checkpoint.isLive), [false, false, false, false, true]);
  assert.equal(model.checkpoints[4].isLatest, true);
  assert.deepEqual(row.points.map((point) => [point.index, point.label, point.rank]), [
    [0, 'Pre', 12], [1, 'W1', 8], [2, 'W2', 6], [3, 'W3', 12], [4, 'W4 Live', 1]
  ]);
  assert.equal(row.latestRank, 1);
});

test('missing and nonfinite checkpoint values remain gaps and never become rank zero', () => {
  const labels = ['Pre', 'W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9 Live'];
  const ranking = fixture({ trendLabels: labels });
  ranking.trend['Manager 01'] = [3, null, undefined, NaN, Infinity, -Infinity, 0, -1, 13, 1];
  delete ranking.trend['Manager 02'];
  ranking.trend['Manager 03'] = [2];
  const model = trend.buildModel(ranking, {});

  assert.deepEqual(model.rows[0].points.map((point) => point.rank), [3, null, null, null, null, null, null, null, null, 1]);
  assert.ok(model.rows[1].points.every((point) => point.rank === null));
  assert.deepEqual(model.rows[2].points.map((point) => point.rank), [2, null, null, null, null, null, null, null, null, null]);
  assert.equal(model.rows[2].latestRank, null, 'missing latest history must not borrow an earlier checkpoint');
});

test('empty and one-checkpoint models render useful states without inventing history', () => {
  const empty = trend.buildModel({ rows: [], trendLabels: [], trend: {} }, {});
  const ranking = fixture({ trendLabels: ['Pre'] });
  ranking.trend = Object.fromEntries(ranking.rows.map((row) => [row.name, [row.rank]]));
  const single = trend.buildModel(ranking, {});

  assert.equal(empty.empty, true);
  assert.deepEqual(empty.visibleRows, []);
  assert.equal(single.singleCheckpoint, true);
  assert.equal(single.latestIndex, 0);
  assert.equal(single.checkpointIndex, 0);
  assert.ok(single.rows.every((row) => row.points.length === 1));
  assert.deepEqual(single.rows[0].points.map((point) => point.rank), [1]);
});

test('focusing a manager outside the top six retains the cohort and adds that manager', () => {
  const ranking = fixture();
  const model = trend.buildModel(ranking, { scope: 'top6', focus: 'Manager 12' });

  assert.equal(model.focus, 'Manager 12');
  assert.equal(model.focusRow.name, 'Manager 12');
  assert.equal(model.inspectorRow.name, 'Manager 12');
  assert.deepEqual(model.visibleRows.map((row) => row.rank), [1, 2, 3, 4, 5, 6, 12]);
  assert.equal(new Set(model.visibleRows.map((row) => row.name)).size, model.visibleRows.length);
});

test('unknown focus is cleared while a chosen historical checkpoint is retained', () => {
  const model = trend.buildModel(fixture(), { focus: 'No longer a manager', checkpoint: 2 });
  assert.equal(model.focus, null);
  assert.equal(model.focusRow, null);
  assert.equal(model.inspectorRow.rank, 1);
  assert.equal(model.checkpointIndex, 2);
});

test('manager identity does not use collision-prone slug or lowercase focus keys', () => {
  const names = ['Alpha One', 'Alpha-One', 'alpha one', 'A&B', 'A B'];
  const ranking = {
    rows: names.map((name, index) => ({ name, rank: index + 1, previousRank: index + 1, movement: 0 })),
    trendLabels: ['Pre', 'W1 Live'],
    trend: Object.fromEntries(names.map((name, index) => [name, [index + 1, index + 1]]))
  };
  for (const name of names) {
    const model = trend.buildModel(ranking, { focus: name });
    assert.equal(model.focusRow.name, name);
    assert.equal(model.focus, name);
  }
});

test('manager colors are deterministic across current rank changes and scope changes', () => {
  const ranking = fixture();
  const before = trend.buildModel(ranking, { scope: 'all' });
  const colors = new Map(before.rows.map((row) => [row.name, row.color]));
  ranking.rows.forEach((row) => { row.rank = 13 - row.rank; });
  const after = trend.buildModel(ranking, { scope: 'top6' });

  after.rows.forEach((row) => {
    assert.equal(row.color, colors.get(row.name));
    assert.equal(row.color, trend.colorForManager(row.name));
  });
});

test('model construction does not mutate ranking data or persistent UI state', () => {
  const ranking = deepFreeze(fixture());
  const uiState = deepFreeze({ scope: 'top6', focus: 'Manager 12', checkpoint: 1, tableOpen: true });
  const original = JSON.stringify({ ranking, uiState });
  assert.doesNotThrow(() => trend.buildModel(ranking, uiState));
  assert.equal(JSON.stringify({ ranking, uiState }), original);
});

test('movement reports ordinal rank change rather than power-score change', () => {
  const model = trend.buildModel(fixture(), {});
  assert.equal(model.rows[0].movement.delta, 11);
  assert.equal(model.rows[11].movement.delta, -11);
  assert.match(model.rows[0].movement.text, /11/);
  assert.match(model.rows[11].movement.text, /11/);
});

test('renderer returns a semantic section with labeled native controls and exact table data', () => withDocument(() => {
  const ranking = fixture();
  const root = trend.render(ranking, { scope: 'all', tableOpen: true });

  assert.equal(root.tagName, 'SECTION');
  assert.ok(elements(root, 'svg').length, 'rank trajectories must be present for several checkpoints');
  const selects = elements(root, 'select');
  assert.ok(selects.length >= 2, 'manager and checkpoint selection must be keyboard-accessible native controls');
  selects.forEach((select) => {
    const associatedLabel = select.closest('label') || elements(root, 'label').find((label) =>
      label.getAttribute('for') === select.id || label.htmlFor === select.id);
    assert.ok(select.getAttribute('aria-label') || associatedLabel, 'each select needs an accessible label');
  });
  elements(root, 'button').forEach((button) => assert.ok(accessibleName(button), 'every button needs a name'));
  const table = elements(root, 'table')[0];
  assert.ok(table, 'an equivalent exact-value table must be rendered');
  assert.match(table.textContent, /Pre/);
  assert.match(table.textContent, /W4 Live/);
  ranking.rows.forEach((row) => assert.ok(table.textContent.includes(row.name)));
  assert.ok(elements(table, 'th').some((header) => header.getAttribute('scope') === 'col' || header.scope === 'col'));
  assert.ok(elements(table, 'th').some((header) => header.getAttribute('scope') === 'row' || header.scope === 'row'));
}));

test('renderer preserves hostile manager names as literal text and unique control values', () => withDocument(() => {
  const names = ['<img src=x onerror=alert(1)>', 'A&B', 'Alpha One', 'Alpha-One', 'alpha one'];
  const ranking = {
    rows: names.map((name, index) => ({ name, rank: index + 1, previousRank: index + 1, movement: 0 })),
    trendLabels: ['Pre', 'W1 Live'],
    trend: Object.fromEntries(names.map((name, index) => [name, [index + 1, index + 1]]))
  };
  const root = trend.render(ranking, { scope: 'all', tableOpen: true });
  const options = elements(root, 'option');
  const managerValues = options.map((option) => option.value || option.getAttribute('value')).filter((value) => names.includes(value));

  assert.deepEqual(managerValues.slice().sort(), names.slice().sort());
  assert.equal(new Set(managerValues).size, names.length);
  assert.ok(root.textContent.includes(names[0]));
  assert.equal(elements(root, 'img').length, 0);
  assert.equal(elements(root, 'script').length, 0);
}));

test('renderer uses straight paths and never serializes invalid SVG coordinates', () => withDocument(() => {
  const ranking = fixture();
  ranking.trend['Manager 01'] = [4, null, 6, NaN, 1];
  const root = trend.render(ranking, { scope: 'all' });
  const svg = elements(root, 'svg')[0];
  assert.ok(svg);
  for (const element of [svg, ...elements(svg, '*')]) {
    for (const value of element.attributes.values()) {
      assert.doesNotMatch(value, /NaN|Infinity|undefined/, 'invalid history may not leak into coordinates');
    }
  }
  const paths = elements(svg, 'path').filter((element) => element.getAttribute('d'));
  assert.ok(paths.length);
  paths.forEach((element) => assert.doesNotMatch(element.getAttribute('d'), /[CQSTA]/i, 'checkpoint paths must not interpolate curved ranks'));
}));

test('renderer safely handles no history and a single preseason checkpoint', () => withDocument(() => {
  const empty = trend.render({ rows: [], trendLabels: [], trend: {} }, {});
  assert.equal(empty.tagName, 'SECTION');
  assert.ok(empty.textContent.trim());
  const ranking = fixture({ trendLabels: ['Pre'] });
  ranking.trend = Object.fromEntries(ranking.rows.map((row) => [row.name, [row.rank]]));
  const single = trend.render(ranking, { tableOpen: true });
  assert.equal(single.tagName, 'SECTION');
  assert.match(single.textContent, /Pre/);
  assert.doesNotMatch(single.textContent, /undefined|NaN/);
}));

test('native chart controls have unique refresh focus keys and preserve focus after interaction', () => withDocument((document) => {
  const state = { scope: 'top6', focus: null, checkpoint: null };
  const root = trend.render(fixture(), state);
  const focusable = [...elements(root, 'button'), ...elements(root, 'select'), ...elements(root, 'summary'),
    ...elements(root, '*').filter((element) => element.tabIndex === 0)];
  const keys = focusable.map((element) => element.dataset.liveFocusKey);
  assert.ok(keys.every(Boolean));
  assert.equal(new Set(keys).size, keys.length);

  const allButton = elements(root, 'button').find((button) => button.dataset.liveFocusKey === 'power-trend-scope-all');
  allButton.focus();
  allButton.dispatch('click');
  assert.equal(state.scope, 'all');
  assert.notEqual(document.activeElement, allButton, 'focus should move to the refreshed control');
  assert.equal(document.activeElement.dataset.liveFocusKey, 'power-trend-scope-all');
  assert.equal(document.activeElement.getAttribute('aria-pressed'), 'true');
}));

test('timeline context and chart appear before the stacked controls in reading order', () => withDocument(() => {
  const root = trend.render(fixture(), {});
  const context = root.querySelector('.power-trend-context');
  const figure = root.querySelector('.power-trend-figure');
  const controls = root.querySelector('.power-trend-controls');
  const inspector = root.querySelector('.power-trend-inspector');
  assert.ok(context && figure && controls && inspector);
  const index = (element) => root.children.indexOf(element);
  assert.ok(index(context) < index(figure), 'cohort and checkpoint context must precede the chart');
  assert.ok(index(figure) < index(controls), 'the chart must not sit below the entire stacked mobile control group');
  assert.ok(index(controls) < index(inspector), 'controls should precede the exact selected-manager inspection');
}));

test('initial rendering and polling do not steal focus from elsewhere on the page', () => withDocument((document) => {
  const unrelated = document.createElement('button');
  unrelated.textContent = 'Refresh league';
  unrelated.focus();
  const state = { scope: 'top6', focus: null, checkpoint: null };
  trend.render(fixture(), state);
  assert.equal(document.activeElement, unrelated);
  trend.render(fixture(), state);
  assert.equal(document.activeElement, unrelated);
}));

test('first narrow-screen layout exposes current endpoint labels without moving keyboard focus', () => withDocument((document) => withAnimationFrames((flush) => {
  const unrelated = document.createElement('button');
  unrelated.focus();
  const state = { scope: 'top6', focus: null, checkpoint: null };
  const root = trend.render(fixture(), state);
  const viewport = setViewportSize(root);
  flush();

  assert.equal(viewport.scrollLeft, 397);
  assert.equal(state.chartScrollLeft, 397);
  assert.equal(document.activeElement, unrelated, 'initial end-scroll must not focus the chart region');
  const svg = elements(root, 'svg')[0];
  assert.ok(Number(svg.getAttribute('width')) >= 960, 'the wider base viewBox prevents an oversized desktop chart');
})));

test('chart scroll state survives controls and polls, including an intentional left-edge position', () => withDocument(() => withAnimationFrames((flush) => {
  const state = { scope: 'top6', focus: null, checkpoint: null, chartScrollLeft: 0 };
  const ranking = fixture();
  const root = trend.render(ranking, state);
  const viewport = setViewportSize(root);
  flush();
  assert.equal(viewport.scrollLeft, 0, 'an explicit zero must not be mistaken for uninitialized scroll state');

  viewport.scrollLeft = 83;
  viewport.dispatch('scroll');
  assert.equal(state.chartScrollLeft, 83);
  const all = elements(root, 'button').find((button) => button.dataset.liveFocusKey === 'power-trend-scope-all');
  all.dispatch('click');
  const afterControls = setViewportSize(root);
  flush();
  assert.equal(afterControls.scrollLeft, 83);
  assert.equal(state.chartScrollLeft, 83);

  const polled = trend.render(ranking, state);
  const afterPoll = setViewportSize(polled);
  flush();
  assert.equal(afterPoll.scrollLeft, 83);
  afterPoll.scrollLeft = 0;
  afterPoll.dispatch('scroll');
  const polledAgain = trend.render(ranking, state);
  const afterLeftEdgePoll = setViewportSize(polledAgain);
  flush();
  assert.equal(afterLeftEdgePoll.scrollLeft, 0);
  assert.equal(state.chartScrollLeft, 0);
})));

test('saved chart scroll is clamped to the current overflow width', () => withDocument(() => withAnimationFrames((flush) => {
  const state = { chartScrollLeft: 397 };
  const root = trend.render(fixture(), state);
  const viewport = setViewportSize(root, 800, 960);
  flush();
  assert.equal(viewport.scrollLeft, 160);
  assert.equal(state.chartScrollLeft, 160);
})));

test('detached or superseded chart frames cannot restore obsolete scroll positions', () => withDocument(() => withAnimationFrames((flush) => {
  const detachedState = { chartScrollLeft: 60 };
  const detached = trend.render(fixture(), detachedState);
  const detachedViewport = setViewportSize(detached);
  detached.isConnected = false;
  flush();
  assert.notEqual(detachedViewport.scrollLeft, 60);
  assert.equal(detachedState.chartScrollLeft, 60);

  const state = { chartScrollLeft: 70 };
  const root = trend.render(fixture(), state);
  const stale = setViewportSize(root);
  const all = elements(root, 'button').find((button) => button.dataset.liveFocusKey === 'power-trend-scope-all');
  all.dispatch('click');
  const current = setViewportSize(root);
  flush();
  assert.notEqual(stale.scrollLeft, 70, 'superseded frame must not mutate the old detached chart viewport');
  assert.equal(current.scrollLeft, 70);
  assert.equal(state.chartScrollLeft, 70);
})));

test('manager, checkpoint, latest-follow, and data disclosure state survive successive renders', () => withDocument(() => {
  const state = { scope: 'top6', focus: null, checkpoint: null, tableOpen: false };
  const ranking = fixture();
  const root = trend.render(ranking, state);
  const manager = elements(root, 'select').find((select) => select.dataset.liveFocusKey === 'power-trend-focus');
  manager.value = 'Manager 12';
  manager.focus();
  manager.dispatch('change');
  assert.equal(state.focus, 'Manager 12');
  assert.match(root.textContent, /Current top 6 \+ Manager 12/);

  const previous = elements(root, 'button').find((button) => button.dataset.liveFocusKey === 'power-trend-previous');
  previous.dispatch('click');
  assert.equal(state.checkpoint, 3);
  const data = elements(root, 'details')[0];
  data.open = true;
  data.dispatch('toggle');
  assert.equal(state.tableOpen, true);

  const rerendered = trend.render(ranking, state);
  assert.equal(elements(rerendered, 'details')[0].open, true);
  assert.equal(elements(rerendered, 'select').find((select) => select.dataset.liveFocusKey === 'power-trend-focus').value, 'Manager 12');
  assert.equal(elements(rerendered, 'select').find((select) => select.dataset.liveFocusKey === 'power-trend-checkpoint').value, '3');
  const latest = elements(rerendered, 'button').find((button) => button.dataset.liveFocusKey === 'power-trend-latest');
  latest.dispatch('click');
  assert.equal(state.checkpoint, null);

  ranking.trendLabels.push('W5 Live');
  ranking.rows.forEach((row) => ranking.trend[row.name].push(row.rank));
  const polled = trend.render(ranking, state);
  assert.equal(elements(polled, 'select').find((select) => select.dataset.liveFocusKey === 'power-trend-checkpoint').value, '5');
  assert.match(polled.textContent, /Live · provisional ranks/);
  assert.match(polled.textContent, /CURRENT · W5 Live/);
  assert.equal(state.focus, 'Manager 12');
  assert.equal(state.tableOpen, true);
}));

test('gapped data paths restart at each valid checkpoint instead of connecting through a missing rank', () => withDocument(() => {
  const ranking = fixture();
  ranking.trend['Manager 01'] = [4, null, 6, NaN, 1];
  const root = trend.render(ranking, {});
  const team = elements(root, 'g').find((group) => group.getAttribute('data-manager') === 'Manager 01');
  const line = elements(team, 'path')[0];
  assert.equal((line.getAttribute('d').match(/M/g) || []).length, 3);
  assert.doesNotMatch(line.getAttribute('d'), /L/);
  assert.equal(elements(team, 'circle').length, 3);
  assert.match(elements(team, 'text').at(-1).textContent, /Manager 01  #1/);
}));

function rgb(hex) { return hex.slice(1).match(/../g).map((channel) => parseInt(channel, 16)); }
function luminance(hex) {
  return rgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}
function contrast(a, b) { return (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05); }
function composite(foreground, background, opacity) {
  const back = rgb(background);
  return '#' + rgb(foreground).map((channel, index) => Math.round(channel * opacity + back[index] * (1 - opacity)).toString(16).padStart(2, '0')).join('');
}

test('every manager palette color and muted chart state preserve required surface contrast', () => {
  const managers = ['martinch94', 'pgorny', 'jwislek_20', 'blumbo', 'vpitello34', 'akaaashh', 'maco71', 'siccboi', 'cuch', 'archibaldo', 'sidjunlee', 'turi70'];
  const css = fs.readFileSync(path.join(__dirname, 'power-trend.css'), 'utf8');
  const lineOpacity = Number(css.match(/\.power-trend-team\.is-muted \.power-trend-line\{opacity:([\d.]+)/)?.[1]);
  const pointOpacity = Number(css.match(/\.power-trend-team\.is-muted \.power-trend-point,[^{]+\{opacity:([\d.]+)/)?.[1]);
  assert.ok(Number.isFinite(lineOpacity) && Number.isFinite(pointOpacity));
  const surface = '#F8F5EB';
  const backgrounds = [surface, composite('#1E5A38', surface, 0.08), composite('#7D5F1A', surface, 0.06)];
  for (const manager of managers) {
    const color = trend.colorForManager(manager);
    assert.ok(contrast(color, surface) >= 4.5, `${manager} palette color must pass normal-text contrast`);
    for (const background of backgrounds) {
      assert.ok(contrast(composite(color, background, lineOpacity), background) >= 3, `${manager} muted line must pass 3:1`);
      assert.ok(contrast(composite(color, background, pointOpacity), background) >= 3, `${manager} muted checkpoint must pass 3:1`);
    }
  }
});

test('rank movement module introduces no remote data requests or paid service calls', () => {
  const source = fs.readFileSync(path.join(__dirname, 'power-trend.js'), 'utf8');
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/);
  assert.doesNotMatch(source, /https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
  assert.doesNotMatch(source, /\b(?:openai|anthropic|apiKey|api_key)\b/i);
  assert.doesNotMatch(source, /\bResizeObserver\b/, 'scroll initialization must not introduce a persistent resize observer');
});

test('power page mounts the timeline before the podium and full rankings, outside the disclosure', () => {
  const source = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  const mountStart = source.indexOf('function mountLivePower(node)');
  const mountEnd = source.indexOf('\nfunction powerMove(', mountStart);
  assert.ok(mountStart >= 0 && mountEnd > mountStart);
  const mountSource = source.slice(mountStart, mountEnd);
  const status = mountSource.indexOf('node.appendChild(liveStatusBar(');
  const timeline = mountSource.indexOf('node.appendChild(window.FarmhoodPowerTrend.render(ranking,trendState))');
  const podium = mountSource.indexOf('node.appendChild(renderPowerPodium(ranking))');
  const rankings = mountSource.indexOf('node.appendChild(renderPowerRankList(ranking,openManagers))');
  const disclosure = mountSource.indexOf('node.appendChild(disclosure)');

  assert.ok(status >= 0 && status < timeline && timeline < podium && podium < rankings && rankings < disclosure);
  assert.doesNotMatch(mountSource, /insights\.appendChild\([^\n]*FarmhoodPowerTrend/);
  assert.equal(mountSource.match(/const trendState=/g).length, 1);
  assert.ok(mountSource.indexOf('const trendState=') < mountSource.indexOf('const update=async'), 'UI state must survive refreshes');
  assert.match(mountSource, /window\.FarmhoodLive\.buildPower\(snapshot,weeks,L\.managers,titleCounts\(\),players\)/);
  assert.doesNotMatch(source, /function drawPowerTrend\(/, 'the retired curved canvas trend renderer must not remain');
});

test('power page loads the trend module before app rendering and its stylesheet', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'power-rankings.html'), 'utf8');
  const scripts = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (match) => match[1].split('?')[0]);
  const trendIndex = scripts.indexOf('assets/power-trend.js');
  const appIndex = scripts.indexOf('assets/app.js');
  assert.ok(trendIndex >= 0 && trendIndex < appIndex);
  assert.ok(html.includes('href="assets/power-trend.css?'));
  assert.ok(html.indexOf('assets/power-trend.js') < html.indexOf('renderPower();'));
});
