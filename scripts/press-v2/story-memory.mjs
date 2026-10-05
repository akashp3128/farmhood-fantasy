export const STORY_MEMORY_VERSION = 1;
export const STORY_ARC_STATUSES = Object.freeze(['active', 'resolved', 'retired']);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function cleanStringArray(value, label) {
  assert(Array.isArray(value), `${label} must be an array.`);
  const cleaned = value.map((item) => String(item || '').trim()).filter(Boolean);
  assert(new Set(cleaned).size === cleaned.length, `${label} must not contain duplicates.`);
  return cleaned;
}

function normalizeEntry(entry) {
  assert(entry && typeof entry === 'object' && !Array.isArray(entry), 'Story-memory entry must be an object.');
  assert(typeof entry.articleId === 'string' && entry.articleId.trim(), 'Story-memory articleId is required.');
  assert(Number.isInteger(entry.season), `Story-memory ${entry.articleId} needs an integer season.`);
  assert(Number.isInteger(entry.week) && entry.week > 0, `Story-memory ${entry.articleId} needs a positive week.`);
  assert(['recap', 'weekend_outlook', 'waiver_wire', 'feature'].includes(entry.edition), `Story-memory ${entry.articleId} has an unknown edition.`);
  const arcs = (entry.storyArcs || []).map((arc) => {
    assert(arc && typeof arc === 'object' && !Array.isArray(arc), `Story-memory ${entry.articleId} contains an invalid story arc.`);
    assert(typeof arc.id === 'string' && arc.id.trim(), `Story-memory ${entry.articleId} contains an arc without an ID.`);
    assert(STORY_ARC_STATUSES.includes(arc.status), `Story arc ${arc.id} has unknown status ${arc.status}.`);
    assert(typeof arc.summary === 'string' && arc.summary.trim(), `Story arc ${arc.id} needs a summary.`);
    return {
      id: arc.id.trim(),
      status: arc.status,
      summary: arc.summary.trim(),
      subjects: cleanStringArray(arc.subjects || [], `Story arc ${arc.id} subjects`)
    };
  });
  return {
    articleId: entry.articleId.trim(),
    season: entry.season,
    week: entry.week,
    edition: entry.edition,
    angles: cleanStringArray(entry.angles || [], `Story-memory ${entry.articleId} angles`),
    cooldownPhrases: cleanStringArray(entry.cooldownPhrases || [], `Story-memory ${entry.articleId} cooldownPhrases`),
    historyFactIds: cleanStringArray(entry.historyFactIds || [], `Story-memory ${entry.articleId} historyFactIds`),
    storyArcs: arcs
  };
}

export function validateStoryMemory(memory) {
  assert(memory && typeof memory === 'object' && !Array.isArray(memory), 'Story memory must be an object.');
  assert(memory.schemaVersion === STORY_MEMORY_VERSION, `Story memory must use schema version ${STORY_MEMORY_VERSION}.`);
  assert(Array.isArray(memory.entries), 'Story memory entries must be an array.');
  const entries = memory.entries.map(normalizeEntry);
  const articleIds = entries.map((entry) => entry.articleId);
  assert(new Set(articleIds).size === articleIds.length, 'Story memory cannot contain duplicate article IDs.');
  return { schemaVersion: STORY_MEMORY_VERSION, entries };
}

/**
 * Returns the compact memory slice suitable for the next assignment packet.
 * Week distance is intentionally edition-agnostic: a Tuesday recap and Friday outlook
 * from the same week both count as recent use.
 */
export function deriveEditorialMemory(memory, options) {
  const normalized = validateStoryMemory(memory);
  const season = Number(options?.season);
  const week = Number(options?.week);
  assert(Number.isInteger(season), 'deriveEditorialMemory requires an integer season.');
  assert(Number.isInteger(week) && week > 0, 'deriveEditorialMemory requires a positive week.');
  const phraseCooldownWeeks = options.phraseCooldownWeeks ?? 3;
  const historyCooldownWeeks = options.historyCooldownWeeks ?? 2;
  const storyArcMaximumIdleWeeks = options.storyArcMaximumIdleWeeks ?? 4;
  const recent = normalized.entries
    .filter((entry) => entry.season === season && entry.week <= week)
    .sort((a, b) => a.week - b.week || a.articleId.localeCompare(b.articleId));
  const within = (entry, window) => week - entry.week < window;
  const cooldownPhrases = [...new Set(recent.filter((entry) => within(entry, phraseCooldownWeeks)).flatMap((entry) => entry.cooldownPhrases))];
  const cooledHistoryFactIds = [...new Set(recent.filter((entry) => within(entry, historyCooldownWeeks)).flatMap((entry) => entry.historyFactIds))];
  const recentAngles = [...new Set(recent.filter((entry) => within(entry, phraseCooldownWeeks)).flatMap((entry) => entry.angles))];

  const latestArcById = new Map();
  for (const entry of recent) {
    for (const arc of entry.storyArcs) latestArcById.set(arc.id, { ...arc, lastUpdatedWeek: entry.week, sourceArticleId: entry.articleId });
  }
  const activeStoryArcs = [...latestArcById.values()]
    .filter((arc) => arc.status === 'active' && week - arc.lastUpdatedWeek < storyArcMaximumIdleWeeks)
    .sort((a, b) => b.lastUpdatedWeek - a.lastUpdatedWeek || a.id.localeCompare(b.id));
  return { cooldownPhrases, cooledHistoryFactIds, recentAngles, activeStoryArcs };
}

export function recordStoryEdition(memory, entry) {
  const normalized = validateStoryMemory(memory);
  const nextEntry = normalizeEntry(entry);
  assert(!normalized.entries.some((existing) => existing.articleId === nextEntry.articleId), `Story memory already contains ${nextEntry.articleId}.`);
  return {
    schemaVersion: STORY_MEMORY_VERSION,
    entries: [...normalized.entries, nextEntry]
      .sort((a, b) => a.season - b.season || a.week - b.week || a.articleId.localeCompare(b.articleId))
  };
}
