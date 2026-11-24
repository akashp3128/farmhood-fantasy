/* Farmhood full-field schedule comparison. Read-only observed-score replays. */
(function(root, factory) {
  const api = factory(root);
  root.FarmhoodField = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function(root) {
  'use strict';

  const FIRST_NAMES = Object.freeze({
    Blumbo: 'Albert', akaaashh: 'Akash', Archibaldo: 'Sasha', jwislek_20: 'Jimmy',
    cuch: 'Dom', martinch94: 'Martin', turi70: 'Sal', Siccboi: 'Ian',
    maco71: 'Marco', pgorny: 'Pat', sidjunlee: 'Sid', vpitello34: 'Vince'
  });
  const integer = value => value != null && String(value).trim() !== '' && Number.isInteger(Number(value)) ? Number(value) : null;
  const score = value => value != null && String(value).trim() !== '' && Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) / 100 : null;
  const recordText = value => !value ? '—' : value.wins + '–' + value.losses + (value.ties ? '–' + value.ties : '');

  function displayName(roster, config) {
    const configured = config && Array.isArray(config.managers) && config.managers.find(manager =>
      Number(manager.rosterId) === Number(roster.rosterId) && manager.manager === roster.name);
    return String(configured && configured.firstName || FIRST_NAMES[roster.name] || roster.name);
  }

  // Every cell uses the same complete finalized scoreboards. Partial boards are
  // excluded league-wide, not interpreted as easy opponents or zero-point games.
  function buildModel(bundle, deskApi, config) {
    const source = bundle || {}, model = source.model || {};
    const desk = deskApi || root.FarmhoodDesk;
    const regularSeasonWeeks = Math.max(1, Math.min(18, integer(model.regularSeasonWeeks) || 14));
    const completedThrough = Math.max(0, Math.min(regularSeasonWeeks, integer(model.completedThrough) || 0));
    const result = {status: 'empty', teams: [], matrix: [], weeks: [], missingWeeks: [], completedThrough,
      regularSeasonWeeks, season: integer(source.snapshot && source.snapshot.season) || 2026,
      stale: !!(source.snapshot && source.snapshot.stale), unavailableComparisons: 0};
    if (!desk || typeof desk.scheduleReplay !== 'function' || typeof desk.seasonStrength !== 'function') return Object.assign(result, {status: 'unavailable'});
    const rosters = Array.isArray(model.rosters) ? model.rosters : [];
    const byId = new Map(), names = new Set();
    for (const roster of rosters) {
      const id = integer(roster && roster.rosterId), name = String(roster && roster.name || '').trim();
      if (id == null || id < 1 || byId.has(String(id)) || !name || names.has(name)) return Object.assign(result, {status: 'invalid'});
      names.add(name); byId.set(String(id), Object.assign({}, roster, {id: String(id), name}));
    }
    if (byId.size < 2) return result;
    for (let week = 1; week <= completedThrough; week++) {
      const raw = source.weeks && source.weeks[week];
      const rows = [], seen = new Set(), pairs = new Map();
      let valid = Array.isArray(raw) && raw.length === byId.size;
      if (valid) for (const row of raw) {
        const rosterId = integer(row && row.rosterId), matchupId = integer(row && row.matchupId), points = score(row && row.points);
        const id = String(rosterId), roster = byId.get(id);
        if (!roster || seen.has(id) || matchupId == null || matchupId < 1 || points == null) { valid = false; break; }
        seen.add(id); rows.push({id, name: roster.name, matchupId, points});
        if (!pairs.has(matchupId)) pairs.set(matchupId, []);
        pairs.get(matchupId).push(id);
      }
      if (valid && [...pairs.values()].every(pair => pair.length === 2)) result.weeks.push({week, final: true, rows});
      else result.missingWeeks.push(week);
    }
    if (!result.weeks.length) return result;
    const observed = new Map(desk.seasonStrength(result.weeks).map(team => [String(team.id), team]));
    result.teams = [...byId.values()].map(roster => {
      const profile = observed.get(roster.id);
      const own = desk.scheduleReplay({weeks: result.weeks, teamId: roster.id, scheduleId: roster.id, selfMatch: 'swap'});
      return {id: roster.id, name: roster.name, label: displayName(roster, config || source.payoutConfig),
        record: own.actual, points: profile ? profile.points : 0, rows: own.rows};
    }).sort((a, b) => b.record.equivalentWins - a.record.equivalentWins || b.points - a.points || a.name.localeCompare(b.name));
    // Unknown/custom leagues can repeat first names. Full handles remain unique.
    const labels = new Map();
    result.teams.forEach(team => labels.set(team.label.toLocaleLowerCase(), (labels.get(team.label.toLocaleLowerCase()) || 0) + 1));
    result.teams.forEach(team => { if (labels.get(team.label.toLocaleLowerCase()) > 1) team.label = team.name; });
    result.matrix = result.teams.map(team => result.teams.map(owner => {
      const replay = desk.scheduleReplay({weeks: result.weeks, teamId: team.id, scheduleId: owner.id, selfMatch: 'swap'});
      if (replay.games !== result.weeks.length || replay.skippedWeeks) {
        result.unavailableComparisons += 1;
        return {status: 'unavailable', record: null, delta: null, rows: []};
      }
      return {status: 'ready', record: replay.replay, delta: replay.winsDelta, rows: replay.rows};
    }));
    result.status = 'ready';
    return result;
  }

  function columnCount(width, total) {
    const count = width >= 960 ? 12 : width >= 680 ? 6 : width >= 470 ? 4 : 2;
    return Math.min(count, total);
  }
  function node(tag, className, value) {
    const element = root.document.createElement(tag);
    if (className) element.className = className;
    if (value != null) element.textContent = String(value);
    return element;
  }
  function header(text, className, scope) {
    const cell = node('th', className, text); cell.scope = scope || 'col'; return cell;
  }

  function render(bundle, options) {
    if (!root.document) return null;
    const settings = options || {}, source = bundle || {};
    const data = buildModel(source, settings.desk, settings.config);
    const host = node('section', 'field-comparison');
    host.setAttribute('aria-label', 'Full league schedule comparison');
    host.appendChild(node('h2', 'field-heading', 'Everyone’s record on every schedule'));
    if (data.status !== 'ready') {
      const text = data.status === 'unavailable' ? 'Schedule comparison is temporarily unavailable. The other season tools are still available.'
        : data.status === 'invalid' ? 'The manager identities are incomplete. No schedule records have been assumed.'
          : data.completedThrough ? 'Finalized scoreboards could not be loaded completely. No missing score has been treated as zero.'
            : 'No regular-season weeks are final yet. Actual-score comparisons will appear after the first completed week.';
      host.appendChild(node('p', 'field-note', text));
      return host;
    }
    const ui = source.fieldUi || (source.fieldUi = {view: 'matrix', teamId: null, scheduleId: null, week: null});
    if (!['matrix', 'weekly'].includes(ui.view)) ui.view = 'matrix';
    if (!data.teams.some(team => team.id === String(ui.teamId))) ui.teamId = null;
    if (!data.teams.some(team => team.id === String(ui.scheduleId))) ui.scheduleId = null;
    if (!Number.isInteger(Number(ui.week)) || Number(ui.week) < 1 || Number(ui.week) > data.regularSeasonWeeks) ui.week = null;
    const meta = node('p', 'field-meta', data.season + ' · ' + data.weeks.length + ' finalized ' + (data.weeks.length === 1 ? 'week' : 'weeks') + ' compared · Actual scores only');
    host.appendChild(meta);
    if (data.missingWeeks.length) host.appendChild(node('p', 'field-warning', 'Final data is unavailable for Week ' + data.missingWeeks.join(', ') + '. Every record below uses the same ' + data.weeks.length + ' captured weeks, not the complete season.'));
    if (data.stale) host.appendChild(node('p', 'field-warning', 'The league feed is cached. Refresh the Schedule Desk to check for more recent results or stat corrections.'));
    if (data.unavailableComparisons) host.appendChild(node('p', 'field-warning', 'Some schedule comparisons are unavailable. Missing results have not been filled with predictions.'));
    const switches = node('div', 'field-switches');
    switches.setAttribute('role', 'group'); switches.setAttribute('aria-label', 'Full league comparison view');
    const summary = node('p', 'field-summary'); summary.setAttribute('aria-live', 'polite'); summary.setAttribute('aria-atomic', 'true');
    const legend = node('div', 'field-legend'); legend.setAttribute('aria-label', 'Comparison legend');
    const boards = node('div', 'field-boards');
    const detail = node('details', 'field-breakdown');
    const detailSummary = node('summary', '', 'Week-by-week for the selected comparison');
    const detailBody = node('div', 'field-breakdown-body');
    detail.append(detailSummary, detailBody); detail.hidden = true;
    host.append(switches, summary, legend, boards, detail);
    host.appendChild(node('p', 'field-note field-method', 'Actual is the real record from the captured final weeks. Other records replay the same weekly scores against each schedule. Two-way swaps keep the original head-to-head intact; no team faces its own score. Ties count as half a win when comparing records. These are individual replays, not alternate league standings or predictions.'));
    let columns = 0, observer = null, attached = false;

    function notify() {
      if (typeof settings.onStateChange === 'function') settings.onStateChange({view: ui.view, teamId: ui.teamId, scheduleId: ui.scheduleId, week: ui.week});
    }
    function selection() {
      const team = data.teams.find(item => item.id === String(ui.teamId));
      const owner = data.teams.find(item => item.id === String(ui.scheduleId));
      return {team, owner, row: data.teams.indexOf(team), col: data.teams.indexOf(owner)};
    }
    function describe() {
      const picked = selection();
      detail.hidden = true; detailBody.textContent = '';
      if (ui.view === 'weekly' && picked.team && ui.week) {
        const row = picked.team.rows.find(item => item.week === Number(ui.week));
        summary.textContent = row ? picked.team.label + ' · Week ' + ui.week + ': ' + row.actualResult + ', ' + row.points.toFixed(2) + ' points against ' + row.originalOpponent + ' (' + row.originalPointsAgainst.toFixed(2) + ').'
          : picked.team.label + ' · Week ' + ui.week + ': ' + (Number(ui.week) <= data.completedThrough ? 'final data unavailable; excluded from every record.' : 'not final; no win or loss has been assumed.');
      } else if (ui.view === 'matrix' && picked.team && picked.owner) {
        const cell = data.matrix[picked.row][picked.col];
        summary.textContent = cell.status === 'ready' ? picked.team.label + ': actual ' + recordText(picked.team.record) + '. With ' + picked.owner.label + '’s schedule: ' + recordText(cell.record) + '.'
          : 'This comparison is unavailable. No missing result has been assumed.';
        if (cell.status === 'ready') {
          detail.hidden = false;
          cell.rows.forEach(row => {
            const card = node('article', 'field-week');
            card.appendChild(node('h3', '', 'Week ' + row.week));
            card.appendChild(node('p', 'field-week-result', 'Actual ' + row.actualResult + ' · Replayed ' + row.replayResult + (row.changed ? ' · changed' : ' · unchanged')));
            card.appendChild(node('p', '', row.points.toFixed(2) + ' points against ' + row.opponent + ' (' + row.opponentPoints.toFixed(2) + ').'));
            card.appendChild(node('p', 'field-meta', 'Original opponent: ' + row.originalOpponent + ' (' + row.originalPointsAgainst.toFixed(2) + ').' + (row.swapped ? ' Original head-to-head preserved.' : '')));
            detailBody.appendChild(card);
          });
        }
      } else summary.textContent = ui.view === 'matrix' ? 'Read across a row: Actual is the real record; each manager’s column replays that manager’s schedule.' : 'All managers and all regular-season weeks. W, L and T are final results; a dash is not a finalized result.';
      host.querySelectorAll('[data-field-key]').forEach(button => {
        const active = button.dataset.teamId === String(ui.teamId) && (ui.view === 'matrix' ? button.dataset.scheduleId === String(ui.scheduleId) : button.dataset.week === String(ui.week));
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      host.querySelectorAll('[data-field-axis]').forEach(axis => {
        const active = axis.dataset.fieldAxis === 'team' ? axis.dataset.teamId === String(ui.teamId) : axis.dataset.scheduleId === String(ui.scheduleId);
        axis.classList.toggle('field-selected-axis', active && ui.view === 'matrix');
      });
    }
    function choose(teamId, scheduleId, week) {
      ui.teamId = teamId; ui.scheduleId = scheduleId; ui.week = week;
      describe(); notify();
    }
    function cellButton(team, owner, week, cell) {
      const matrix = ui.view === 'matrix';
      const status = matrix ? cell.status !== 'ready' ? 'unknown' : cell.delta > 0 ? 'better' : cell.delta < 0 ? 'worse' : 'same'
        : !cell ? 'unknown' : cell.actualResult === 'W' ? 'better' : cell.actualResult === 'L' ? 'worse' : 'same';
      const button = node('button', 'field-result field-' + status, matrix ? recordText(cell.record) : cell ? cell.actualResult : '—');
      button.type = 'button'; button.dataset.teamId = team.id;
      if (matrix) button.dataset.scheduleId = owner.id; else button.dataset.week = String(week);
      button.dataset.fieldKey = matrix ? 'm:' + team.id + ':' + owner.id : 'w:' + team.id + ':' + week;
      button.setAttribute('aria-pressed', 'false');
      const label = matrix ? team.label + ' (' + team.name + ') with ' + owner.label + '’s schedule: ' + recordText(cell.record) + '. Actual: ' + recordText(team.record) + '.'
        : team.label + ', Week ' + week + ': ' + (cell ? cell.actualResult + ', ' + cell.points.toFixed(2) + ' points against ' + cell.originalOpponent + ' ' + cell.originalPointsAgainst.toFixed(2) : week <= data.completedThrough ? 'final data unavailable' : 'not final');
      button.setAttribute('aria-label', label);
      button.addEventListener('click', () => choose(team.id, matrix ? owner.id : null, matrix ? null : week));
      return button;
    }
    function draw(force) {
      const width = host.clientWidth || Number(root.innerWidth) || 1036;
      const count = ui.view === 'matrix' ? columnCount(width, data.teams.length) : columnCount(width, data.regularSeasonWeeks);
      if (!force && count === columns) return;
      columns = count;
      const active = root.document.activeElement;
      const focus = active && host.contains(active) && active.dataset ? active.dataset.fieldKey : null;
      boards.textContent = ''; legend.textContent = '';
      switches.querySelectorAll('button').forEach(button => {
        const selected = button.dataset.fieldView === ui.view;
        button.className = 'field-view-button' + (selected ? ' active' : ''); button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });
      const keys = ui.view === 'matrix' ? [['better', 'Better than Actual'], ['same', 'Same as Actual'], ['worse', 'Worse than Actual']]
        : [['better', 'W · Win'], ['worse', 'L · Loss'], ['same', 'T · Tie'], ['unknown', '— · Not final / unavailable']];
      keys.forEach(item => { const key = node('span', 'field-key'); const swatch = node('span', 'field-swatch field-' + item[0]); swatch.setAttribute('aria-hidden', 'true'); key.append(swatch, node('span', '', item[1])); legend.appendChild(key); });
      const allColumns = ui.view === 'matrix' ? data.teams : Array.from({length: data.regularSeasonWeeks}, (_, index) => index + 1);
      for (let start = 0; start < allColumns.length; start += count) {
        const group = allColumns.slice(start, start + count);
        const section = node('section', 'field-band');
        const scroll = node('div', 'field-scroll'); scroll.tabIndex = 0; scroll.setAttribute('role', 'region');
        const caption = ui.view === 'matrix' ? 'All managers · ' + group.map(team => team.label).join(', ') + ' schedules' : 'All managers · Weeks ' + group[0] + '–' + group[group.length - 1];
        scroll.setAttribute('aria-label', caption);
        const table = node('table', 'field-table'); table.appendChild(node('caption', allColumns.length <= count ? 'field-caption sr-only' : 'field-caption', caption));
        const thead = node('thead'), axis = node('tr');
        const manager = header('Manager', 'field-name'); manager.rowSpan = 2;
        const actual = header(data.missingWeeks.length ? 'Actual*' : 'Actual', 'field-actual'); actual.rowSpan = 2;
        actual.setAttribute('aria-label', 'Actual record from the same ' + data.weeks.length + ' captured finalized weeks');
        const axisTitle = header(ui.view === 'matrix' ? 'Record with this manager’s schedule' : 'Actual weekly results', 'field-axis-title'); axisTitle.colSpan = group.length;
        axis.append(manager, actual, axisTitle); thead.appendChild(axis);
        const labels = node('tr'); group.forEach(value => {
          const label = header(ui.view === 'matrix' ? value.label : 'W' + value, 'field-column-label');
          if (ui.view === 'matrix') { label.dataset.fieldAxis = 'schedule'; label.dataset.scheduleId = value.id; label.setAttribute('title', value.name); }
          labels.appendChild(label);
        }); thead.appendChild(labels); table.appendChild(thead);
        const tbody = node('tbody');
        data.teams.forEach((team, rowIndex) => {
          const row = node('tr'), name = header(team.label, 'field-name', 'row'); name.dataset.fieldAxis = 'team'; name.dataset.teamId = team.id; name.setAttribute('title', team.name);
          row.append(name, node('td', 'field-actual', recordText(team.record)));
          group.forEach((value, index) => {
            const cell = node('td');
            cell.appendChild(ui.view === 'matrix' ? cellButton(team, value, null, data.matrix[rowIndex][start + index])
              : cellButton(team, null, value, team.rows.find(result => result.week === value)));
            row.appendChild(cell);
          }); tbody.appendChild(row);
        }); table.appendChild(tbody); scroll.appendChild(table); section.appendChild(scroll); boards.appendChild(section);
      }
      describe();
      if (focus) { const target = host.querySelector('[data-field-key="' + focus + '"]'); if (target) target.focus({preventScroll: true}); }
    }
    [['matrix', 'Every schedule'], ['weekly', 'Week by week']].forEach(item => {
      const button = node('button', 'field-view-button', item[1]); button.type = 'button'; button.dataset.fieldView = item[0];
      button.setAttribute('aria-pressed', ui.view === item[0] ? 'true' : 'false');
      button.addEventListener('click', () => { ui.view = item[0]; draw(true); notify(); }); switches.appendChild(button);
    });
    draw(true);
    if (typeof root.ResizeObserver === 'function') {
      observer = new root.ResizeObserver(() => {
        if (host.isConnected) attached = true;
        else if (attached) { observer.disconnect(); return; }
        draw(false);
      }); observer.observe(host);
    }
    host.dispose = () => { if (observer) observer.disconnect(); };
    return host;
  }

  return {buildModel, render, columnCount, recordText, displayName, FIRST_NAMES};
});
