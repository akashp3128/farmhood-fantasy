/* Farmhood rank movement: weekly model checkpoints, not an interpolated forecast. */
(function (global) {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const PALETTE = ['#17543C', '#245F9B', '#984019', '#75478E', '#096C70', '#A23969', '#626215', '#775135', '#922F32', '#3F4BA0', '#476016', '#65507B'];
  const MANAGERS = ['martinch94', 'pgorny', 'jwislek_20', 'blumbo', 'vpitello34', 'akaaashh', 'maco71', 'siccboi', 'cuch', 'archibaldo', 'sidjunlee', 'turi70'];
  let nextId = 0;

  /** Normalize color identity only; punctuation is meaningful and is not removed. */
  function canonicalName(name) {
    return String(name == null ? '' : name).trim().toLowerCase();
  }

  /** Colors belong to managers, never to their changing place in the standings. */
  function colorForManager(name) {
    const key = canonicalName(name), known = MANAGERS.indexOf(key);
    if (known >= 0) return PALETTE[known];
    let hash = 2166136261;
    for (let i = 0; i < key.length; i += 1) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
    return PALETTE[(hash >>> 0) % PALETTE.length];
  }

  function validRank(value, max) {
    return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 1 && (max == null || value <= max) ? value : null;
  }

  /** Rank 1 is always at the top. A one-rank scale has no invented vertical span. */
  function rankY(rank, rankCount, top, height) {
    if (validRank(rank, rankCount) == null) return null;
    return (top == null ? 0 : top) + (rankCount > 1 ? (rank - 1) * (height == null ? 1 : height) / (rankCount - 1) : 0);
  }

  function movementFor(points) {
    if (points.length < 2) return {delta: null, kind: 'unavailable', text: 'No earlier checkpoint'};
    const previous = points[points.length - 2].rank, latest = points[points.length - 1].rank;
    if (previous == null || latest == null) return {delta: null, kind: 'unavailable', text: 'Change unavailable'};
    const delta = previous - latest, count = Math.abs(delta), spots = count === 1 ? 'spot' : 'spots';
    return {delta, kind: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat', text: delta > 0 ? `↑ Up ${count} ${spots}` : delta < 0 ? `↓ Down ${count} ${spots}` : '→ No change'};
  }

  /** Pure, testable presentation model. Neither ranking nor uiState is changed. */
  function buildModel(ranking, uiState) {
    const input = ranking || {}, state = uiState || {}, seen = new Set();
    const labels = Array.isArray(input.trendLabels) ? input.trendLabels.map(label => String(label)) : [];
    const sourceRows = (Array.isArray(input.rows) ? input.rows : []).filter(row => {
      if (!row || typeof row.name !== 'string' || !row.name.trim() || seen.has(row.name)) return false;
      seen.add(row.name); return true;
    });
    const rankCount = Math.max(1, sourceRows.length, ...sourceRows.map(row => validRank(row.rank) || 0));
    const rows = sourceRows.map(row => {
      const history = input.trend && Array.isArray(input.trend[row.name]) ? input.trend[row.name] : [];
      const points = labels.map((label, index) => ({index, label, rank: validRank(history[index], rankCount)}));
      return {name: row.name, canonicalName: canonicalName(row.name), rank: validRank(row.rank, rankCount), previousRank: validRank(row.previousRank, rankCount), color: colorForManager(row.name), points, movement: movementFor(points), latestRank: points.length ? points[points.length - 1].rank : null};
    }).sort((a, b) => (a.rank == null ? Infinity : a.rank) - (b.rank == null ? Infinity : b.rank) || a.name.localeCompare(b.name));
    const requestedFocus = typeof state.focus === 'string' ? state.focus : null;
    let focusRow = rows.find(row => row.name === requestedFocus) || null;
    if (!focusRow && requestedFocus) {
      const matches = rows.filter(row => row.canonicalName === canonicalName(requestedFocus));
      if (matches.length === 1) focusRow = matches[0];
    }
    const scope = state.scope === 'all' ? 'all' : 'top6', cohort = scope === 'all' ? rows : rows.slice(0, 6);
    const visibleRows = cohort.slice();
    const extraFocus = !!focusRow && !visibleRows.includes(focusRow);
    if (extraFocus) visibleRows.push(focusRow);
    visibleRows.sort((a, b) => (a.rank == null ? Infinity : a.rank) - (b.rank == null ? Infinity : b.rank) || a.name.localeCompare(b.name));
    const latestIndex = labels.length - 1;
    const checkpointIndex = latestIndex < 0 ? -1 : Number.isInteger(state.checkpoint) ? Math.max(0, Math.min(latestIndex, state.checkpoint)) : latestIndex;
    const checkpoints = labels.map((label, index) => ({index, label, isLive: /(?:^|\s)live\b/i.test(label), isLatest: index === latestIndex}));
    const baseLabel = scope === 'all' ? `All ${rows.length} teams` : `Current top ${Math.min(6, rows.length)}`;
    const cohortLabel = `${baseLabel}${extraFocus ? ` + ${focusRow.name}` : ''} · ${visibleRows.length} of ${rows.length} teams shown`;
    return {labels, checkpoints, rows, visibleRows, scope, focus: focusRow ? focusRow.name : null, focusRow, inspectorRow: focusRow || rows[0] || null, checkpointIndex, latestIndex, rankCount, cohortLabel, empty: !rows.length || !labels.length || !rows.some(row => row.points.some(point => point.rank != null)), singleCheckpoint: labels.length === 1};
  }

  function node(tag, className, copy) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (copy != null) element.textContent = copy;
    return element;
  }

  function svgNode(tag, attributes, copy) {
    const element = document.createElementNS(SVG_NS, tag);
    Object.keys(attributes || {}).forEach(key => element.setAttribute(key, attributes[key]));
    if (copy != null) element.textContent = copy;
    return element;
  }

  function focusKey(element, key) {
    element.dataset.liveFocusKey = `power-trend-${key}`;
    return element;
  }

  function checkpointKind(checkpoint) {
    if (!checkpoint) return 'No model checkpoint available';
    return /^pre(?:season)?$/i.test(checkpoint.label.trim()) ? 'Preseason checkpoint' : checkpoint.isLive ? 'Live · provisional ranks' : 'Finalized checkpoint';
  }

  function rankCopy(rank) { return rank == null ? 'Unavailable' : `#${rank}`; }

  function createChart(model, id) {
    const figure = node('figure', 'power-trend-figure');
    const caption = node('figcaption', 'power-trend-caption');
    caption.append(node('span', '', 'Rank 1 is best. Current positions are labeled at the right edge.'), node('strong', '', `Selected: ${model.labels[model.checkpointIndex]}`));
    figure.appendChild(caption);
    const scrollHint = node('p', `power-trend-scroll-hint${model.labels.length > 7 ? ' is-long-history' : ''}`, '↔ Scroll the chart sideways to see every checkpoint and current team label.');
    scrollHint.id = `${id}-scroll-hint`;
    const viewport = focusKey(node('div', 'power-trend-chart-scroll'), 'chart');
    viewport.tabIndex = 0;
    viewport.setAttribute('role', 'region');
    viewport.setAttribute('aria-label', 'Scrollable rank movement chart');
    viewport.setAttribute('aria-describedby', scrollHint.id);
    const width = Math.max(960, 260 + Math.max(0, model.labels.length - 1) * 104), top = 42, plotHeight = Math.max(26, (model.rankCount - 1) * 27), height = top + plotHeight + 54;
    const left = 43, right = width - 205, step = model.labels.length > 1 ? (right - left) / (model.labels.length - 1) : 0;
    const xFor = index => model.labels.length > 1 ? left + step * index : right;
    const yFor = rank => rankY(rank, model.rankCount, top, plotHeight);
    const svg = svgNode('svg', {class: 'power-trend-svg', xmlns: SVG_NS, viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', 'aria-labelledby': `${id}-chart-title ${id}-chart-desc`});
    svg.style.setProperty('--power-trend-min-width', `${width}px`);
    svg.appendChild(svgNode('title', {id: `${id}-chart-title`}, `Power-ranking movement. ${model.cohortLabel}.`));
    svg.appendChild(svgNode('desc', {id: `${id}-chart-desc`}, `Straight lines connect weekly model checkpoints only; gaps mean a checkpoint rank is unavailable. Checkpoints are recalculated from season data, and live checkpoints are provisional. The shaded column is ${model.labels[model.checkpointIndex]}. Use the manager and checkpoint controls for exact ranks, or open the data table below.`));
    const selectedX = xFor(model.checkpointIndex), bandWidth = Math.min(44, model.labels.length > 1 ? step * 0.55 : 44);
    if (model.checkpointIndex !== model.latestIndex) svg.appendChild(svgNode('rect', {class: 'power-trend-latest-band', x: xFor(model.latestIndex) - bandWidth / 2, y: top - 18, width: bandWidth, height: plotHeight + 36}));
    svg.appendChild(svgNode('rect', {class: 'power-trend-selected-band', x: selectedX - bandWidth / 2, y: top - 18, width: bandWidth, height: plotHeight + 36}));
    svg.appendChild(svgNode('text', {class: 'power-trend-axis-note', x: left, y: 16}, 'RANK'));
    svg.appendChild(svgNode('text', {class: 'power-trend-current-note', x: right + 17, y: 16}, `CURRENT · ${model.labels[model.latestIndex]}`));
    for (let rank = 1; rank <= model.rankCount; rank += 1) {
      const y = yFor(rank);
      svg.appendChild(svgNode('line', {class: 'power-trend-grid', x1: left - 10, x2: right + 8, y1: y, y2: y}));
      svg.appendChild(svgNode('text', {class: 'power-trend-axis-rank', x: left - 16, y: y + 4, 'text-anchor': 'end'}, `#${rank}`));
    }
    model.checkpoints.forEach(checkpoint => {
      const x = xFor(checkpoint.index);
      svg.appendChild(svgNode('line', {class: 'power-trend-checkpoint-guide', x1: x, x2: x, y1: top - 9, y2: top + plotHeight + 10}));
      const tick = svgNode('text', {class: `power-trend-axis-checkpoint${checkpoint.index === model.checkpointIndex ? ' is-selected' : ''}`, x, y: top + plotHeight + 33, 'text-anchor': 'middle'}, checkpoint.label);
      svg.appendChild(tick);
    });
    const ordered = model.visibleRows.filter(row => row.name !== model.focus).concat(model.visibleRows.filter(row => row.name === model.focus));
    ordered.forEach(row => {
      const isFocus = row.name === model.focus, isMuted = !!model.focus && !isFocus;
      const group = svgNode('g', {class: `power-trend-team${isFocus ? ' is-focused' : ''}${isMuted ? ' is-muted' : ''}`, 'data-manager': row.name});
      group.style.setProperty('--power-trend-team-color', row.color);
      let path = '', active = false;
      row.points.forEach(point => {
        if (point.rank == null) { active = false; return; }
        path += `${active ? ' L' : ' M'}${xFor(point.index)} ${yFor(point.rank)}`;
        active = true;
      });
      if (!model.singleCheckpoint) group.appendChild(svgNode('path', {class: 'power-trend-line', d: path.trim(), fill: 'none', stroke: row.color, 'vector-effect': 'non-scaling-stroke'}));
      row.points.forEach(point => {
        if (point.rank == null) return;
        const circle = svgNode('circle', {class: `power-trend-point${point.index === model.checkpointIndex ? ' is-selected-checkpoint' : ''}`, cx: xFor(point.index), cy: yFor(point.rank), r: isFocus || point.index === model.checkpointIndex ? 4.5 : 3.1, fill: row.color, 'vector-effect': 'non-scaling-stroke'});
        circle.appendChild(svgNode('title', {}, `${row.name}: ${point.label}, rank ${point.rank}`));
        group.appendChild(circle);
      });
      if (row.latestRank != null) {
        const y = yFor(row.latestRank);
        group.appendChild(svgNode('line', {class: 'power-trend-label-leader', x1: right + 7, x2: right + 14, y1: y, y2: y, stroke: row.color, 'vector-effect': 'non-scaling-stroke'}));
        group.appendChild(svgNode('text', {class: 'power-trend-end-label', x: right + 20, y: y + 4}, `${row.name}  #${row.latestRank}${isFocus ? ' ←' : ''}`));
      }
      svg.appendChild(group);
    });
    viewport.appendChild(svg);
    figure.append(scrollHint, viewport);
    const missing = model.visibleRows.filter(row => row.latestRank == null);
    if (missing.length) figure.appendChild(node('p', 'power-trend-missing', `No rank available at ${model.labels[model.latestIndex]} for: ${missing.map(row => row.name).join(', ')}. Lines stop at the last available point.`));
    return figure;
  }

  function createInspector(model) {
    const inspector = node('div', 'power-trend-inspector');
    inspector.setAttribute('role', 'status');
    inspector.setAttribute('aria-live', 'polite');
    inspector.setAttribute('aria-atomic', 'true');
    const row = model.inspectorRow;
    if (!row || model.checkpointIndex < 0) {
      inspector.appendChild(node('p', '', 'Exact rank history will appear when checkpoints are available.'));
      return inspector;
    }
    const head = node('div', 'power-trend-inspector-head');
    const identity = node('div', 'power-trend-inspector-identity');
    identity.append(node('span', 'power-trend-kicker', model.focus ? 'Highlighted manager' : 'Inspecting current leader'), node('h3', '', row.name));
    const checkpoint = model.checkpoints[model.checkpointIndex], selectedRank = row.points[model.checkpointIndex].rank;
    const selected = node('div', 'power-trend-inspector-rank');
    selected.append(node('strong', 'mono', rankCopy(selectedRank)), node('span', '', checkpoint.label));
    head.append(identity, selected);
    const latest = node('p', 'power-trend-inspector-move');
    const prefix = model.labels.length > 1 ? `Latest change (${model.labels[model.latestIndex - 1]} → ${model.labels[model.latestIndex]}): ` : 'Latest change: ';
    latest.append(node('span', '', prefix), node('strong', '', row.movement.text));
    if (row.movement.delta != null) latest.appendChild(node('span', '', ` (${rankCopy(row.points[model.latestIndex - 1].rank)} → ${rankCopy(row.latestRank)})`));
    const history = node('ol', 'power-trend-inspector-history');
    history.setAttribute('aria-label', `${row.name} exact rank at every checkpoint`);
    row.points.forEach(point => {
      const item = node('li', point.index === model.checkpointIndex ? 'is-selected' : '');
      if (point.index === model.checkpointIndex) item.setAttribute('aria-current', 'true');
      item.append(node('span', '', point.label), node('strong', 'mono', rankCopy(point.rank)));
      history.appendChild(item);
    });
    inspector.append(head, latest, history);
    if (!model.focus) inspector.appendChild(node('p', 'power-trend-inspector-help', 'Choose a manager above to highlight their line while keeping the other teams in view.'));
    return inspector;
  }

  function createTable(model, state, id) {
    const details = node('details', 'power-trend-data');
    details.open = !!state.tableOpen;
    const summary = focusKey(node('summary', '', `Exact checkpoint ranks · ${model.visibleRows.length} teams`), 'data');
    const viewport = focusKey(node('div', 'power-trend-table-scroll'), 'table');
    viewport.tabIndex = 0;
    viewport.setAttribute('role', 'region');
    viewport.setAttribute('aria-label', 'Scrollable exact rank data');
    const table = node('table', 'power-trend-table');
    const caption = node('caption', '', `${model.cohortLabel}. Recalculated from season data; live checkpoints are provisional. A dash means a rank is unavailable. Latest change compares the final two checkpoints.`);
    caption.id = `${id}-table-caption`;
    const head = node('thead'), headRow = node('tr');
    ['Manager', ...model.labels, 'Latest change'].forEach(label => {
      const cell = node('th', '', label); cell.scope = 'col'; headRow.appendChild(cell);
    });
    head.appendChild(headRow);
    const body = node('tbody');
    model.visibleRows.forEach(row => {
      const tableRow = node('tr', row.name === model.focus ? 'is-focused' : '');
      const manager = node('th', '', row.name); manager.scope = 'row'; tableRow.appendChild(manager);
      row.points.forEach(point => {
        const cell = node('td', `mono${point.index === model.checkpointIndex ? ' is-selected' : ''}`, point.rank == null ? '—' : `#${point.rank}`);
        if (point.rank == null) cell.setAttribute('aria-label', 'Rank unavailable');
        tableRow.appendChild(cell);
      });
      tableRow.appendChild(node('td', '', row.movement.text)); body.appendChild(tableRow);
    });
    table.append(caption, head, body); viewport.appendChild(table); details.append(summary, viewport);
    details.addEventListener('toggle', () => { state.tableOpen = details.open; });
    return details;
  }

  /**
   * Render a self-contained section. Keep the same state object across live polls.
   * checkpoint=null follows the latest data; a numeric index preserves inspection.
   * chartScrollLeft is remembered after layout; undefined initially shows CURRENT.
   * Controls refresh this section in place and retain their native keyboard focus.
   */
  function render(ranking, uiState) {
    const state = uiState && typeof uiState === 'object' ? uiState : {scope: 'top6', focus: null, checkpoint: null};
    const section = node('section', 'power-trend-section');
    const id = `power-trend-${++nextId}`;
    section.setAttribute('aria-labelledby', `${id}-title`);
    section.setAttribute('aria-describedby', `${id}-description`);
    let layoutGeneration = 0;
    function refresh() {
      const generation = ++layoutGeneration;
      const focused = document.activeElement && section.contains(document.activeElement) ? document.activeElement.dataset.liveFocusKey : null;
      const previousViewport = section.querySelector('.power-trend-chart-scroll');
      if (previousViewport && previousViewport.clientWidth > 0 && Number.isFinite(previousViewport.scrollLeft)) state.chartScrollLeft = Math.max(0, previousViewport.scrollLeft);
      const model = buildModel(ranking, state);
      const head = node('div', 'power-trend-head');
      const heading = node('h2', 'h', 'Rank Movement'); heading.id = `${id}-title`;
      const badge = node('span', 'power-trend-latest', model.latestIndex >= 0 ? `Latest: ${model.labels[model.latestIndex]}` : 'Awaiting checkpoints');
      head.append(heading, badge);
      const description = node('p', 'power-trend-description', 'Weekly model checkpoints, recalculated from season data. Live checkpoints are provisional. Straight lines connect checkpoint ranks; they do not estimate ranks between weeks.');
      description.id = `${id}-description`;
      const controls = node('div', 'power-trend-controls');
      const scope = node('fieldset', 'power-trend-scope');
      scope.appendChild(node('legend', '', 'Show teams'));
      const scopeButtons = node('div', 'power-trend-scope-buttons');
      [['top6', 'Current top 6'], ['all', `All ${model.rows.length} teams`]].forEach(([value, label]) => {
        const button = focusKey(node('button', '', label), `scope-${value}`);
        button.type = 'button'; button.setAttribute('aria-pressed', String(model.scope === value));
        button.addEventListener('click', () => { state.scope = value; refresh(); });
        scopeButtons.appendChild(button);
      });
      scope.appendChild(scopeButtons);
      const focusLabel = node('label', 'power-trend-select');
      focusLabel.appendChild(node('span', '', 'Highlight manager'));
      const focusSelect = focusKey(node('select'), 'focus');
      const noFocus = node('option', '', 'No team highlighted'); noFocus.value = ''; focusSelect.appendChild(noFocus);
      model.rows.forEach(row => {
        const option = node('option', '', `${row.rank == null ? '—' : '#' + row.rank} · ${row.name}`); option.value = row.name; focusSelect.appendChild(option);
      });
      focusSelect.value = model.focus || ''; focusSelect.disabled = !model.rows.length;
      focusSelect.addEventListener('change', () => { state.focus = focusSelect.value || null; refresh(); });
      focusLabel.appendChild(focusSelect);
      const checkpointLabel = node('label', 'power-trend-select power-trend-checkpoint-select');
      checkpointLabel.appendChild(node('span', '', 'Inspect checkpoint'));
      const checkpointSelect = focusKey(node('select'), 'checkpoint');
      model.checkpoints.forEach(checkpoint => {
        const option = node('option', '', `${checkpoint.label}${checkpoint.isLatest ? ' · latest' : ''}`); option.value = String(checkpoint.index); checkpointSelect.appendChild(option);
      });
      checkpointSelect.value = String(model.checkpointIndex); checkpointSelect.disabled = model.latestIndex < 0;
      checkpointSelect.addEventListener('change', () => { state.checkpoint = Number(checkpointSelect.value); refresh(); });
      checkpointLabel.appendChild(checkpointSelect);
      const navigation = node('div', 'power-trend-checkpoint-nav');
      [['previous', '← Previous', -1], ['next', 'Next →', 1]].forEach(([key, label, delta]) => {
        const button = focusKey(node('button', '', label), key); button.type = 'button';
        button.setAttribute('aria-label', `${delta < 0 ? 'Previous' : 'Next'} rank checkpoint`);
        button.disabled = delta < 0 ? model.checkpointIndex <= 0 : model.checkpointIndex >= model.latestIndex;
        button.addEventListener('click', () => { state.checkpoint = model.checkpointIndex + delta; refresh(); }); navigation.appendChild(button);
      });
      const latestButton = focusKey(node('button', '', 'Latest'), 'latest'); latestButton.type = 'button'; latestButton.disabled = model.latestIndex < 0;
      latestButton.setAttribute('aria-label', 'Follow the latest rank checkpoint');
      latestButton.setAttribute('aria-pressed', String(!Number.isInteger(state.checkpoint)));
      latestButton.addEventListener('click', () => { state.checkpoint = null; refresh(); }); navigation.appendChild(latestButton);
      controls.append(scope, focusLabel, checkpointLabel, navigation);
      const context = node('div', 'power-trend-context');
      context.append(node('strong', '', model.cohortLabel), node('span', '', `${Number.isInteger(state.checkpoint) ? 'Selected checkpoint' : 'Following latest'} · ${checkpointKind(model.checkpoints[model.checkpointIndex])}`));
      const children = [head, description, context];
      if (model.empty) {
        children.push(node('p', 'power-trend-empty-state', 'No checkpoint ranks are available yet. The chart will appear when season data supports its first model checkpoints; no movement has been assumed.'));
      } else {
        if (model.singleCheckpoint) children.push(node('p', 'power-trend-first-checkpoint', /^pre(?:season)?$/i.test(model.labels[0].trim()) ? 'Preseason model only. The first movement line appears when Week 1 scoring creates a second checkpoint.' : `One model checkpoint (${model.labels[0]}). Points show exact ranks; movement needs a second checkpoint.`));
        children.push(createChart(model, id));
      }
      children.push(controls, createInspector(model), createTable(model, state, id));
      section.replaceChildren(...children);
      const viewport = section.querySelector('.power-trend-chart-scroll');
      if (viewport) {
        viewport.addEventListener('scroll', () => {
          if (generation === layoutGeneration && section.isConnected !== false && Number.isFinite(viewport.scrollLeft)) state.chartScrollLeft = Math.max(0, viewport.scrollLeft);
        });
        const restoreChartScroll = () => {
          // render() returns a detached section. One frame gives its parent time to
          // insert it and gives the browser real dimensions without an observer.
          if (generation !== layoutGeneration || section.isConnected === false) return;
          const maximum = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
          if (!Number.isFinite(maximum) || !(viewport.clientWidth > 0)) return;
          const preferred = Number.isFinite(state.chartScrollLeft) ? Math.max(0, state.chartScrollLeft) : maximum;
          viewport.scrollLeft = Math.min(maximum, preferred);
          state.chartScrollLeft = viewport.scrollLeft;
        };
        if (typeof global.requestAnimationFrame === 'function') global.requestAnimationFrame(restoreChartScroll);
        else restoreChartScroll();
      }
      if (focused) {
        const control = Array.from(section.querySelectorAll('[data-live-focus-key]')).find(element => element.dataset.liveFocusKey === focused);
        if (control && !control.disabled) control.focus({preventScroll: true});
        else if (control) {
          const checkpoint = Array.from(section.querySelectorAll('[data-live-focus-key]')).find(element => element.dataset.liveFocusKey === 'power-trend-checkpoint');
          if (checkpoint && !checkpoint.disabled) checkpoint.focus({preventScroll: true});
        }
      }
    }
    refresh();
    return section;
  }

  const api = {render, buildModel, rankY, colorForManager, canonicalName};
  global.FarmhoodPowerTrend = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
