const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// Exercise the shipped browser entry point, including fetches and tab clicks,
// without adding a browser or DOM package to this static site's dependencies.
class Element {
  constructor(tag, document) {
    this.tagName = tag.toUpperCase();
    this.document = document;
    this.childNodes = [];
    this.className = '';
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.listeners = {};
    this._text = '';
    this.classList = {
      add: (...values) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...values])].join(' '); },
      toggle: (value, force) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        const enabled = force === undefined ? !classes.has(value) : force;
        if (enabled) classes.add(value); else classes.delete(value);
        this.className = [...classes].join(' ');
        return enabled;
      }
    };
  }
  set textContent(value) { this._text = String(value); this.childNodes = []; }
  get textContent() { return this._text + this.childNodes.map((child) => child.textContent).join(''); }
  appendChild(child) { child.parentNode = this; this.childNodes.push(child); return child; }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  replaceChildren(...children) { this._text = ''; this.childNodes = []; this.append(...children); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(name, listener) { (this.listeners[name] ||= []).push(listener); }
  focus() { this.document.activeElement = this; }
  contains(node) { return this === node || this.childNodes.some((child) => child.contains(node)); }
  querySelectorAll(selector) {
    const matches = (node) => selector.startsWith('.')
      ? node.className.split(/\s+/).includes(selector.slice(1))
      : selector.startsWith('#') ? node.id === selector.slice(1)
        : selector === '[data-watch-focus-key]' ? node.dataset.watchFocusKey !== undefined
          : node.tagName === selector.toUpperCase();
    const result = [];
    const visit = (node) => node.childNodes.forEach((child) => { if (matches(child)) result.push(child); visit(child); });
    visit(this);
    return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  async click() { await Promise.all((this.listeners.click || []).map((listener) => listener({ target: this }))); }
}

const script = fs.readFileSync(path.join(__dirname, 'press.js'), 'utf8');
const settle = () => new Promise((resolve) => setImmediate(resolve));

function article(overrides = {}) {
  return {
    articleId: 'recap-3', type: 'week_recap', edition: 'Postgame Edition', season: 2026, week: 3,
    status: 'published', publishedAt: '2026-09-29T12:00:00Z', title: 'The final whistle',
    lead: { body: ['Alpha finishes ahead of Bravo.'] },
    source: { snapshotId: 'final-3', predictionKind: 'results_only' },
    forecastContext: { mode: 'results_only', receiptEligible: false, publishedForecastExists: false },
    matchups: [{
      matchupId: 1, managerA: 'Alpha', managerB: 'Bravo', finalScoreA: 122.5, finalScoreB: 111.2,
      winner: 'Alpha', headline: 'Alpha seals the win', analysis: 'The final margin was 11.3 points.',
      keyPlayer: 'The lead scorer', historyNote: 'Their first meeting this season.'
    }],
    storylines: [], awards: [], receipts: null,
    ...overrides
  };
}

function metadata(row, overrides = {}) {
  return {
    articleId: row.articleId, path: `content/articles/${row.articleId}.json`, type: row.type,
    edition: row.edition, title: row.title, week: row.week, publishedAt: row.publishedAt,
    ...(row.forecastContext ? { forecastContext: row.forecastContext } : {}),
    ...overrides
  };
}

async function browser(articles, { featured = articles[0].articleId, rows = articles.map((row) => metadata(row)) } = {}) {
  const document = {
    activeElement: null,
    hidden: false,
    createElement(tag) { return new Element(tag, this); },
    getElementById(id) { return id === 'app' ? this.app : this.app.querySelector(`#${id}`); },
    querySelector() { return null; }
  };
  document.app = new Element('main', document);
  const requested = [];
  const window = {
    location: { href: 'https://farmhood.example/press.html' },
    async fetch(input) {
      const url = new URL(input, this.location.href);
      requested.push(url.pathname);
      const payload = url.pathname.endsWith('/index.json')
        ? { featuredArticleId: featured, articles: rows }
        : articles.find((row) => url.pathname.endsWith(`/${row.articleId}.json`));
      return { ok: Boolean(payload), status: payload ? 200 : 404, async json() { return structuredClone(payload); } };
    },
    setInterval() { return 1; }, clearInterval() {}, addEventListener() {}, scrollTo() {}
  };
  vm.runInNewContext(script, { window, document, URL, Intl, Date }, { filename: 'press.js' });
  await settle();
  return {
    app: document.app,
    panel: document.getElementById('press-panel'),
    requested,
    async tab(name) { await document.getElementById(`press-tab-${name}`).click(); await settle(); },
    async open(card) { await card.click(); await settle(); }
  };
}

function assertResultsOnly(view) {
  assert.match(view.panel.querySelector('.edition-status').textContent, /^Results-only Recap/);
  assert.match(view.panel.querySelector('.press-results-only-notice').textContent, /No Preview or Weekend Outlook forecast was published/);
  assert.match(view.panel.querySelector('.press-results-only-notice').textContent, /without forecast comparisons, prediction receipts or a desk grade/);
  const matchup = view.panel.querySelector('.press-matchup');
  assert.match(matchup.textContent, /Final winner: Alpha/);
  assert.equal(matchup.querySelector('.press-score-vs').textContent, 'FINAL');
  assert.deepEqual(matchup.querySelectorAll('.press-team-score').map((node) => node.textContent), ['122.5', '111.2']);
  assert.equal(matchup.querySelector('.press-odds'), null);
  assert.equal(matchup.querySelector('.pick'), null);
  assert.doesNotMatch(matchup.textContent, /forecast|pick|grade|Upset path|Injury watch|✓|✕|%/i);
  const receipts = view.panel.querySelector('.press-receipts');
  assert.match(receipts.textContent, /No original receipt/);
  assert.match(receipts.textContent, /No Preview or Weekend Outlook forecast was published/);
  assert.equal(receipts.querySelector('.receipt-stat'), null);
  const source = view.panel.querySelector('.press-source');
  assert.match(source.textContent, /Final results verified from the published snapshot/);
  assert.match(source.textContent, /No Preview or Weekend Outlook forecast exists/);
  assert.doesNotMatch(view.panel.textContent, /frozen (?:Weekend Outlook|late outlook)|outlook snapshot is frozen|Every prediction stays on the record/i);
}

test('featured results-only recap discloses missing forecast and never renders stale forecast or grade fields', async () => {
  const row = article();
  row.matchups[0] = {
    ...row.matchups[0], predictedWinner: 'Bravo', winProbability: 0.88, predictionCorrect: false,
    projectedScoreA: 99, projectedScoreB: 140, forecastWinner: 'Bravo', forecastProbability: 0.88,
    forecastScoreA: 100, forecastScoreB: 140, upsetPath: 'A future upset path.', injuryWatch: 'A future lineup concern.'
  };
  row.receipts = { deskGrade: '99/100', winnerAccuracy: '100%', graded: 6 };
  const view = await browser([row]);
  assertResultsOnly(view);
  assert.equal(view.app.querySelector('#press-tab-recap').getAttribute('aria-selected'), 'true');
  assert.match(view.panel.querySelector('.press-pullquote').textContent, /No published forecast to grade/);
});

test('Recap tab opens results-only reporting independently of the featured preview', async () => {
  const preview = article({ articleId: 'preview-4', type: 'week_preview', edition: 'Pregame Edition', forecastContext: undefined, source: {}, week: 4 });
  const view = await browser([preview, article()]);
  assert.equal(view.panel.querySelector('.press-results-only-notice'), null);
  await view.tab('recap');
  assertResultsOnly(view);
  assert.ok(view.requested.includes('/content/articles/recap-3.json'));
});

test('Archive labels results-only metadata and opens it as a recap, retaining late and original edition labels', async () => {
  const result = article();
  const late = article({ articleId: 'late-4', type: 'week_late_preview', edition: 'Weekend Outlook', forecastContext: { mode: 'late_outlook', receiptEligible: false }, source: {} });
  const original = article({ articleId: 'preview-5', type: 'week_preview', edition: 'Pregame Edition', forecastContext: undefined, source: {} });
  const view = await browser([result, late, original]);
  await view.tab('archive');
  const cards = view.panel.querySelectorAll('.press-archive-card');
  assert.match(cards[0].querySelector('.press-archive-meta').textContent, /^Results-only Recap/);
  assert.match(cards[0].querySelector('.press-archive-disclosure').textContent, /No published Preview or Weekend Outlook forecast/);
  assert.match(cards[1].querySelector('.press-archive-meta').textContent, /^Weekend Outlook/);
  assert.match(cards[2].querySelector('.press-archive-meta').textContent, /^Pregame Edition/);
  assert.equal(cards[1].querySelector('.press-archive-disclosure'), null);
  await view.open(cards[0]);
  assertResultsOnly(view);
  assert.equal(view.app.querySelector('#press-tab-recap').getAttribute('aria-selected'), 'true');
});

test('results-only index metadata supplies disclosures when an older article omits forecast context', async () => {
  const row = article({ forecastContext: undefined, source: { snapshotId: 'final-3' } });
  const view = await browser([row], { rows: [metadata(row, { forecastContext: { mode: 'results_only', receiptEligible: false } })] });
  assertResultsOnly(view);
});

test('results-only source lineage alone suppresses fabricated late-outlook receipts', async () => {
  const view = await browser([article({ forecastContext: undefined })]);
  assertResultsOnly(view);
});

test('normalized results-only mode takes precedence over stale late-preview type', async () => {
  const view = await browser([article({ type: 'week_late_preview', source: {}, forecastContext: { mode: 'Results-only' } })]);
  assertResultsOnly(view);
  assert.equal(view.app.querySelector('#press-tab-recap').getAttribute('aria-selected'), 'true');
  assert.equal(view.panel.querySelector('.press-matchup-late'), null);
});

test('original preview still renders frozen picks and projected scores', async () => {
  const row = article({ type: 'week_preview', edition: 'Pregame Edition', forecastContext: undefined, source: { predictionKind: 'original_prediction' } });
  Object.assign(row.matchups[0], { projectedScoreA: 130, projectedScoreB: 115, predictedWinner: 'Alpha', winProbability: 0.65 });
  const view = await browser([row]);
  const card = view.panel.querySelector('.press-matchup');
  assert.equal(view.panel.querySelector('.edition-status').textContent, 'Pregame Edition · 2026 · Week 3');
  assert.equal(card.querySelector('.press-score-vs').textContent, 'PROJ');
  assert.match(card.querySelector('.pick').textContent, /Pick: Alpha/);
  assert.match(card.querySelector('.press-odds').textContent, /Win probability65%/);
  assert.match(view.panel.querySelector('.press-receipts').textContent, /The original prediction is frozen at first kickoff/);
});

test('original recap still shows its correct pick and deterministic receipt statistics', async () => {
  const row = article({ forecastContext: undefined, source: { predictionKind: 'original_prediction' }, receipts: { correctWinners: '5/6', deskGrade: '91/100' } });
  Object.assign(row.matchups[0], { predictedWinner: 'Alpha', predictionCorrect: true });
  const view = await browser([row]);
  assert.match(view.panel.querySelector('.press-odds').textContent, /Original pickAlpha ✓/);
  assert.match(view.panel.querySelector('.press-receipts').textContent, /Correct winners5\/6AI desk grade91\/100/);
  assert.equal(view.panel.querySelectorAll('.receipt-stat').length, 2);
});

test('late Weekend Outlook still shows captured scores and its ungraded live forecast', async () => {
  const row = article({ type: 'week_late_preview', edition: 'Weekend Outlook', source: { predictionKind: 'late_forecast' }, forecastContext: { mode: 'late_outlook', receiptEligible: false } });
  Object.assign(row.matchups[0], { currentScoreA: 20, currentScoreB: 15, forecastScoreA: 125, forecastScoreB: 112, forecastWinner: 'Alpha', forecastProbability: 0.63, forecastStatus: 'complete', startedAtCapture: true });
  const view = await browser([row]);
  const card = view.panel.querySelector('.press-matchup');
  assert.equal(view.panel.querySelector('.press-results-only-notice'), null);
  assert.match(view.panel.querySelector('.press-late-notice').textContent, /published after kickoff/);
  assert.match(card.textContent, /Friday lean: Alpha/);
  assert.deepEqual(card.querySelectorAll('.press-score-vs').map((node) => node.textContent), ['CURRENT', 'EST. FINAL']);
  assert.match(card.querySelector('.press-odds').textContent, /Live outlookAlpha · 63%/);
  assert.match(view.panel.querySelector('.press-receipts').textContent, /Weekend Outlook snapshot is frozen for transparency/);
});

for (const complete of [true, false]) {
  test(`late-baseline recap retains ${complete ? 'complete' : 'incomplete'} frozen Weekend Outlook disclosure`, async () => {
    const row = article({ source: { predictionKind: 'late_forecast' }, forecastContext: { mode: 'late_outlook_baseline', receiptEligible: false } });
    Object.assign(row.matchups[0], { forecastWinner: complete ? 'Alpha' : null, forecastProbability: complete ? 0.63 : null, forecastStatus: complete ? 'complete' : 'incomplete' });
    const view = await browser([row]);
    const card = view.panel.querySelector('.press-matchup');
    assert.equal(view.panel.querySelector('.press-results-only-notice'), null);
    assert.match(card.querySelector('.pick').textContent, /No pre-kickoff pick/);
    assert.match(card.querySelector('.press-odds').textContent, complete ? /Frozen Weekend OutlookAlpha · 63%/ : /Frozen Weekend OutlookNo complete late forecast/);
    assert.match(view.panel.querySelector('.press-source').textContent, /reconciled against a frozen late outlook/);
    assert.match(view.panel.querySelector('.press-receipts').textContent, /frozen Weekend Outlook remains available/);
    assert.equal(view.panel.querySelector('.receipt-stat'), null);
  });
}
