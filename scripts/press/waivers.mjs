import { PRESS_CONFIG, PRESS_SCHEMA_VERSION } from './config.mjs';
import { assert, asNullableNumber, digest, safeId, safeText, unique } from './utils.mjs';

export const WAIVER_ARTICLE_TYPE = 'week_waiver_recap';
export const WAIVER_EDITION = 'Waiver Wire';
export const WAIVER_MODEL = 'farmhood-transactions-v1';

const INCLUDED_TYPES = new Set(['waiver', 'free_agent']);

function isoTimestamp(value, label) {
  const number = Number(value);
  assert(Number.isFinite(number) && number > 0, `${label} must contain a valid timestamp.`);
  const parsed = new Date(number);
  assert(Number.isFinite(parsed.getTime()), `${label} contains an invalid timestamp.`);
  return parsed.toISOString();
}

function optionalNonnegative(value, label, { integer = false } = {}) {
  const parsed = asNullableNumber(value);
  if (parsed === null) return null;
  assert(parsed >= 0 && (!integer || Number.isInteger(parsed)), `${label} must be a nonnegative${integer ? ' integer' : ''}.`);
  return parsed;
}

function playerName(player, id) {
  return safeText(player?.full_name || [player?.first_name, player?.last_name].filter(Boolean).join(' ') || player?.search_full_name, 100) || `Player ${id}`;
}

function playerRecord(id, players) {
  const playerId = safeId(id, 'Sleeper player ID');
  const player = players?.[playerId];
  if (!player && /^[A-Z]{2,3}$/.test(playerId)) {
    return { playerId, name: `${playerId} D/ST`, position: 'DEF', team: playerId };
  }
  assert(player && typeof player === 'object', `Sleeper player ${playerId} could not be resolved; refusing to publish an unnamed transaction.`);
  const name = playerName(player, playerId);
  assert(name && name !== `Player ${playerId}`, `Sleeper player ${playerId} does not have a verified name.`);
  return {
    playerId,
    name,
    position: safeText(player.position || player.fantasy_positions?.[0], 12) || null,
    team: safeText(player.team, 8) || null
  };
}

function rosterId(value, label) {
  const parsed = Number(value);
  assert(Number.isInteger(parsed) && parsed > 0, `${label} contains an invalid roster ID.`);
  return parsed;
}

function rosterMoves(value, label) {
  if (value == null) return new Map();
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object when present.`);
  const moves = new Map();
  Object.entries(value).forEach(([playerId, rawRosterId]) => {
    const id = rosterId(rawRosterId, label);
    if (!moves.has(id)) moves.set(id, []);
    moves.get(id).push(playerId);
  });
  return moves;
}

function managerForRoster(id, rosterNames) {
  const manager = safeText(rosterNames?.[id] ?? rosterNames?.[String(id)], 80);
  assert(manager, `Roster ${id} does not have a canonical manager mapping.`);
  return manager;
}

function managerSummaries(transactions) {
  const rows = new Map();
  transactions.forEach((transaction) => {
    if (!rows.has(transaction.manager)) {
      rows.set(transaction.manager, {
        manager: transaction.manager,
        rosterId: transaction.rosterId,
        transactionCount: 0,
        waiverClaims: 0,
        waiverBidsReported: 0,
        freeAgentMoves: 0,
        adds: 0,
        drops: 0,
        faabSpent: 0
      });
    }
    const row = rows.get(transaction.manager);
    row.transactionCount += 1;
    row.waiverClaims += transaction.transactionType === 'waiver' ? 1 : 0;
    row.freeAgentMoves += transaction.transactionType === 'free_agent' ? 1 : 0;
    row.adds += transaction.adds.length;
    row.drops += transaction.drops.length;
    if (transaction.waiverBid !== null) { row.waiverBidsReported += 1; row.faabSpent += transaction.waiverBid; }
  });
  const summaries = [...rows.values()].map((row) => ({ ...row, faabSpent: row.waiverClaims > 0 && row.waiverBidsReported === row.waiverClaims ? row.faabSpent : null }));
  return summaries.sort((left, right) => right.transactionCount - left.transactionCount || Number(right.faabSpent ?? -1) - Number(left.faabSpent ?? -1) || left.manager.localeCompare(right.manager));
}

function transactionSummary(transactions) {
  const waiverClaims = transactions.filter((row) => row.transactionType === 'waiver');
  const bids = waiverClaims.filter((row) => row.waiverBid !== null);
  const positionCounts = new Map();
  transactions.flatMap((row) => row.adds).forEach((player) => {
    const position = player.position || 'Unknown';
    positionCounts.set(position, (positionCounts.get(position) || 0) + 1);
  });
  const highestPositionCount = Math.max(0, ...positionCounts.values());
  const topAddedPositions = [...positionCounts.entries()].filter(([, count]) => count === highestPositionCount && count > 0).map(([position]) => position).sort();
  const highestBidValue = Math.max(-1, ...bids.map((row) => row.waiverBid));
  const highestBids = highestBidValue < 0 ? [] : bids.filter((row) => row.waiverBid === highestBidValue).map((row) => ({
    manager: row.manager,
    player: row.adds[0]?.name || null,
    bid: row.waiverBid,
    transactionId: row.transactionId
  }));
  const managers = managerSummaries(transactions);
  const mostActiveCount = managers[0]?.transactionCount || 0;
  return {
    completedTransactions: transactions.length,
    waiverClaims: waiverClaims.length,
    freeAgentMoves: transactions.filter((row) => row.transactionType === 'free_agent').length,
    adds: transactions.reduce((sum, row) => sum + row.adds.length, 0),
    drops: transactions.reduce((sum, row) => sum + row.drops.length, 0),
    managersActive: managers.length,
    waiverBidsReported: bids.length,
    faabSpent: waiverClaims.length > 0 && bids.length === waiverClaims.length ? bids.reduce((sum, row) => sum + row.waiverBid, 0) : null,
    highestBids,
    mostActiveManagers: managers.filter((row) => row.transactionCount === mostActiveCount && mostActiveCount > 0).map((row) => row.manager),
    mostActiveCount,
    topAddedPositions,
    topAddedPositionCount: highestPositionCount
  };
}

export function buildWaiverSnapshot({ rawTransactions, players, rosterNames = PRESS_CONFIG.rosterNames, season = PRESS_CONFIG.season, week, generatedAt, leagueId = PRESS_CONFIG.leagueId }) {
  assert(Array.isArray(rawTransactions), 'Sleeper transactions must be an array.');
  assert(players && typeof players === 'object' && !Array.isArray(players), 'Sleeper players must be an object map.');
  assert(Number.isInteger(week) && week >= 1 && week <= 18, 'Waiver recap week must be an integer from 1 through 18.');
  const completed = rawTransactions.filter((row) => row && row.status === 'complete' && INCLUDED_TYPES.has(row.type) && Number(row.leg) === week);
  const seen = new Set();
  const transactions = [];
  completed.forEach((row) => {
    const transactionId = safeId(row.transaction_id, 'Sleeper transaction ID');
    assert(!seen.has(transactionId), `Duplicate Sleeper transaction ${transactionId}.`);
    seen.add(transactionId);
    const addsByRoster = rosterMoves(row.adds, `${transactionId} adds`), dropsByRoster = rosterMoves(row.drops, `${transactionId} drops`);
    const involved = unique([...(row.roster_ids || []), ...addsByRoster.keys(), ...dropsByRoster.keys()].map((value) => rosterId(value, transactionId)));
    assert(involved.length === 1, `Completed ${row.type} transaction ${transactionId} must identify exactly one roster.`);
    involved.forEach((id) => {
      const adds = (addsByRoster.get(id) || []).map((playerId) => playerRecord(playerId, players)).sort((a, b) => a.name.localeCompare(b.name));
      const drops = (dropsByRoster.get(id) || []).map((playerId) => playerRecord(playerId, players)).sort((a, b) => a.name.localeCompare(b.name));
      if (!adds.length && !drops.length) return;
      const suffix = involved.length > 1 ? `-r${id}` : '';
      transactions.push({
        transactionId: `${transactionId}${suffix}`,
        sleeperTransactionId: transactionId,
        transactionType: row.type,
        status: 'complete',
        season,
        week,
        completedAt: isoTimestamp(row.status_updated ?? row.created, `${transactionId} completion`),
        rosterId: id,
        manager: managerForRoster(id, rosterNames),
        adds,
        drops,
        waiverBid: row.type === 'waiver' ? optionalNonnegative(row.settings?.waiver_bid, `${transactionId} waiver bid`) : null,
        waiverPriority: row.type === 'waiver' ? optionalNonnegative(row.settings?.priority, `${transactionId} waiver priority`, { integer: true }) : null,
        claimSequence: row.type === 'waiver' ? optionalNonnegative(row.settings?.seq, `${transactionId} claim sequence`, { integer: true }) : null,
        factIds: [`${season}:w${week}:transaction:${transactionId}${suffix}`]
      });
    });
  });
  transactions.sort((left, right) => new Date(right.completedAt) - new Date(left.completedAt) || right.transactionId.localeCompare(left.transactionId));
  const summaries = managerSummaries(transactions), summary = transactionSummary(transactions);
  const core = {
    schemaVersion: PRESS_SCHEMA_VERSION,
    kind: 'transactions',
    season,
    week,
    generatedAt,
    dataAsOf: generatedAt,
    immutable: true,
    source: {
      provider: 'Sleeper API',
      leagueId: String(leagueId),
      endpoint: `${PRESS_CONFIG.sleeperV1Root}/league/${leagueId}/transactions/${week}`,
      statusFilter: 'complete',
      includedTypes: ['waiver', 'free_agent'],
      excludedTypes: ['trade']
    },
    summary,
    managerSummaries: summaries,
    transactions,
    factIds: transactions.flatMap((row) => row.factIds)
  };
  const sourceRecord = { season, week, source: core.source, summary, managerSummaries: summaries, transactions };
  return { ...core, id: `farmhood-${season}-week-${String(week).padStart(2, '0')}-transactions-${digest(sourceRecord).slice(0, 16)}` };
}

function plural(value, singular, pluralValue = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralValue}`;
}

function activityStory(snapshot) {
  const { summary } = snapshot;
  if (!summary.completedTransactions) return { title: 'The wire stayed quiet', body: `Sleeper recorded no completed waiver or free-agent transactions for Week ${snapshot.week}.`, subjects: [], factIds: [] };
  const managers = summary.mostActiveManagers.join(' and ');
  return {
    title: summary.mostActiveManagers.length > 1 ? 'The activity lead was shared' : `${managers} led the transaction count`,
    body: `${managers} recorded ${plural(summary.mostActiveCount, 'completed transaction')}. This is an activity count, not a grade on the moves.`,
    subjects: summary.mostActiveManagers,
    factIds: snapshot.transactions.filter((row) => summary.mostActiveManagers.includes(row.manager)).flatMap((row) => row.factIds)
  };
}

function bidStory(snapshot) {
  const { summary } = snapshot;
  if (!summary.waiverClaims) return { title: 'No successful waiver claims', body: `Week ${snapshot.week} contained completed free-agent activity but no completed waiver claims.`, subjects: [], factIds: snapshot.transactions.map((row) => row.factIds[0]) };
  const leaders = summary.highestBids.map((row) => `${row.manager}${row.player ? ` for ${row.player}` : ''}`).join(' and ');
  const bidCoverage = summary.waiverBidsReported === summary.waiverClaims
    ? `Recorded successful bids totaled $${summary.faabSpent}.`
    : `Sleeper supplied bid amounts for ${summary.waiverBidsReported} of ${summary.waiverClaims} successful claims.`;
  return {
    title: `${plural(summary.waiverClaims, 'successful waiver claim')}`,
    body: summary.highestBids.length ? `${bidCoverage} The highest listed bid was $${summary.highestBids[0].bid}, submitted by ${leaders}.` : `Sleeper recorded ${plural(summary.waiverClaims, 'successful waiver claim')} without a bid amount.`,
    subjects: unique(summary.highestBids.map((row) => row.manager)),
    factIds: snapshot.transactions.filter((row) => row.transactionType === 'waiver').flatMap((row) => row.factIds)
  };
}

function positionStory(snapshot) {
  const { summary } = snapshot;
  if (!summary.adds) return { title: 'No additions recorded', body: `The completed Week ${snapshot.week} records contain drops only.`, subjects: [], factIds: snapshot.transactions.flatMap((row) => row.factIds) };
  const positions = summary.topAddedPositions.join(' and ');
  return {
    title: `${positions} led the add board`,
    body: `${positions} accounted for ${plural(summary.topAddedPositionCount, 'addition')} among ${plural(summary.adds, 'verified add')}.`,
    subjects: [],
    factIds: snapshot.transactions.filter((row) => row.adds.some((player) => summary.topAddedPositions.includes(player.position || 'Unknown'))).flatMap((row) => row.factIds)
  };
}

export function buildWaiverArticle(snapshot, { publishedAt = snapshot.generatedAt } = {}) {
  assert(snapshot?.kind === 'transactions' && Array.isArray(snapshot.transactions), 'A verified transaction snapshot is required.');
  const { summary } = snapshot;
  const titleParts = [summary.waiverClaims ? plural(summary.waiverClaims, 'Claim') : '', summary.freeAgentMoves ? plural(summary.freeAgentMoves, 'Free-Agent Move') : ''].filter(Boolean);
  const title = titleParts.length ? `Week ${snapshot.week} Waiver Wire: ${titleParts.join(', ')}` : `Week ${snapshot.week} Waiver Wire: No Completed Moves`;
  const dek = `Sleeper recorded ${plural(summary.completedTransactions, 'completed transaction')}: ${plural(summary.waiverClaims, 'waiver claim')} and ${plural(summary.freeAgentMoves, 'free-agent move')}, covering ${plural(summary.adds, 'add')} and ${plural(summary.drops, 'drop')}.`;
  const lead = [
    `This report includes only completed Sleeper waiver and free-agent transactions assigned to Week ${snapshot.week}. Trades and failed or pending claims are excluded.`,
    summary.completedTransactions
      ? `${plural(summary.managersActive, 'manager')} participated in ${plural(summary.completedTransactions, 'verified move')}. Every player and manager name below comes from the frozen transaction record.`
      : 'No completed waiver or free-agent move was present in the verified weekly transaction feed.'
  ];
  const highest = summary.highestBids[0];
  const pullQuote = highest
    ? `Highest successful waiver bid: $${highest.bid}${highest.player ? ` for ${highest.player}` : ''} by ${highest.manager}.`
    : `${plural(summary.completedTransactions, 'completed move')} appeared on the Week ${snapshot.week} transaction wire.`;
  const article = {
    schemaVersion: PRESS_SCHEMA_VERSION,
    articleId: `${snapshot.season}-week-${String(snapshot.week).padStart(2, '0')}-waiver-recap`,
    type: WAIVER_ARTICLE_TYPE,
    season: snapshot.season,
    week: snapshot.week,
    status: 'published',
    edition: WAIVER_EDITION,
    title,
    dek,
    byline: PRESS_CONFIG.byline,
    publishedAt,
    updatedAt: publishedAt,
    dataAsOf: snapshot.dataAsOf,
    tone: 'verified transaction report',
    lead: {
      body: lead,
      pullQuote,
      keyStat: {
        label: 'Completed moves',
        value: String(summary.completedTransactions),
        note: `${plural(summary.adds, 'add')} · ${plural(summary.drops, 'drop')}`
      }
    },
    transactions: snapshot.transactions,
    managerSummaries: snapshot.managerSummaries,
    transactionSummary: snapshot.summary,
    storylines: [activityStory(snapshot), bidStory(snapshot), positionStory(snapshot)],
    transactionContext: {
      completedOnly: true,
      includedTypes: ['waiver', 'free_agent'],
      tradesExcluded: true,
      timezone: PRESS_CONFIG.timezone,
      sourceSnapshotId: snapshot.id
    },
    source: {
      snapshotId: snapshot.id,
      dataAsOf: snapshot.dataAsOf,
      provider: 'Sleeper API',
      endpoint: snapshot.source.endpoint,
      model: WAIVER_MODEL,
      deterministic: true,
      openaiRequests: 0
    },
    factCheck: {
      status: 'passed',
      snapshotId: snapshot.id,
      completedTransactions: summary.completedTransactions,
      managersMapped: snapshot.managerSummaries.length,
      playersResolved: snapshot.transactions.reduce((sum, row) => sum + row.adds.length + row.drops.length, 0)
    },
    tags: ['Waiver Wire', `Week ${snapshot.week}`, 'Transactions']
  };
  validateWaiverArticle(article, snapshot);
  return article;
}

export function validateWaiverArticle(article, snapshot) {
  assert(article?.type === WAIVER_ARTICLE_TYPE && article.edition === WAIVER_EDITION, 'Waiver article type or edition is invalid.');
  assert(article.season === snapshot.season && article.week === snapshot.week, 'Waiver article season/week mismatch.');
  assert(article.source?.snapshotId === snapshot.id && article.transactionContext?.sourceSnapshotId === snapshot.id, 'Waiver article snapshot lineage mismatch.');
  assert(article.source?.deterministic === true && article.source?.openaiRequests === 0, 'Waiver article must remain deterministic and zero-AI.');
  assert(article.transactionContext?.timezone === PRESS_CONFIG.timezone, 'Waiver article timestamps must use the league Central timezone.');
  assert(JSON.stringify(article.transactions) === JSON.stringify(snapshot.transactions), 'Waiver article transactions do not match the frozen snapshot.');
  assert(JSON.stringify(article.managerSummaries) === JSON.stringify(snapshot.managerSummaries), 'Waiver article manager summaries do not match the frozen snapshot.');
  assert(JSON.stringify(article.transactionSummary) === JSON.stringify(snapshot.summary), 'Waiver article totals do not match the frozen snapshot.');
  assert(article.receipts === undefined && article.matchups === undefined, 'Waiver article must not contain prediction receipts or matchup claims.');
  const managers = new Set(Object.values(PRESS_CONFIG.rosterNames));
  const facts = new Set(snapshot.factIds);
  article.transactions.forEach((row) => {
    assert(row.status === 'complete' && INCLUDED_TYPES.has(row.transactionType), `Invalid waiver article transaction ${row.transactionId}.`);
    assert(managers.has(row.manager), `Unknown transaction manager ${row.manager}.`);
    row.factIds.forEach((factId) => assert(facts.has(factId), `Unknown transaction fact ID ${factId}.`));
    [...row.adds, ...row.drops].forEach((player) => assert(player.playerId && player.name, `Unnamed player in transaction ${row.transactionId}.`));
  });
  article.storylines.flatMap((story) => story.factIds || []).forEach((factId) => assert(facts.has(factId), `Unknown waiver storyline fact ID ${factId}.`));
  return article;
}

export function waiverArticleMetadata(article, path) {
  return {
    articleId: article.articleId,
    path,
    type: article.type,
    edition: article.edition,
    season: article.season,
    week: article.week,
    status: article.status,
    title: article.title,
    dek: article.dek,
    publishedAt: article.publishedAt,
    dataAsOf: article.dataAsOf,
    storylines: article.storylines.map((item) => item.title),
    tags: article.tags
  };
}
