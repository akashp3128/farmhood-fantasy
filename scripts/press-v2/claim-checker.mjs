import { deepFreeze, invariant, nonEmptyText, unique } from './utils.mjs';

const CLAIM_INDEX_KIND = 'farmhood_press_v2_claim_index';

const NUMBER_WORDS = Object.freeze({
  zero: 0,
  one: 1,
  first: 1,
  once: 1,
  two: 2,
  second: 2,
  twice: 2,
  three: 3,
  third: 3,
  four: 4,
  fourth: 4,
  five: 5,
  fifth: 5,
  six: 6,
  sixth: 6,
  seven: 7,
  seventh: 7,
  eight: 8,
  eighth: 8,
  nine: 9,
  ninth: 9,
  ten: 10,
  tenth: 10,
  eleven: 11,
  eleventh: 11,
  twelve: 12,
  twelfth: 12
});

const STATISTICAL_MARKERS = Object.freeze([
  { key: 'maximum', pattern: /\b(?:highest|league[- ]high|high score|most|top[- ]scoring|led (?:the )?league)\b/i },
  { key: 'minimum', pattern: /\b(?:lowest|league[- ]low|low score|least|fewest)\b/i },
  { key: 'closest', pattern: /\b(?:closest|narrowest|tightest)\b/i },
  { key: 'largest', pattern: /\b(?:largest|widest|biggest)\b/i },
  { key: 'unique', pattern: /\b(?:only|sole|no other)\b/i },
  { key: 'rank', pattern: /\b(?:ranked|first place|second place|third place|percentile)\b/i },
  { key: 'streak', pattern: /\b(?:consecutive|in a row|straight (?:win|loss|victor)|winning streak|losing streak)\b/i },
  { key: 'over_projection', pattern: /\b(?:above|over|outperformed|beat) (?:the )?(?:captured |pregame |current )?projection\b/i },
  { key: 'under_projection', pattern: /\b(?:below|under|underperformed|trailed) (?:the )?(?:captured |pregame |current )?projection\b/i }
]);

const PREDICATE_MARKERS = Object.freeze([
  { key: 'availability', pattern: /\b(?:injur(?:y|ed)|questionable|doubtful|inactive|ruled out|listed out|suspended|injured reserve|\bir\b|participant|available to play)\b/i },
  { key: 'projection', pattern: /\b(?:project(?:ed|ion|s)?|forecast|outlook|estimated final|favorite|underdog|leaned?)\b/i },
  { key: 'lineup_role', pattern: /\b(?:starter|starting lineup|bench(?:ed)?|roster|lineup slot|flex slot)\b/i },
  { key: 'championship', pattern: /\b(?:champion|championship|title defense|title count|won the title|ringless)\b/i },
  { key: 'transaction', pattern: /\b(?:trade[sd]?|waiver|claimed|added|dropped|released|signed)\b/i },
  { key: 'nfl_usage', pattern: /\b(?:targets?|carries|snaps?|workload|route participation|usage rate)\b/i },
  { key: 'game_event', pattern: /\b(?:touchdowns?|tds?|fumbles?|interceptions?|ejected|ejection)\b/i }
]);
const PREDICATE_KEYS = new Set(PREDICATE_MARKERS.map(({ key }) => key));
const MEDICAL_TERMS = Object.freeze(['acl', 'mcl', 'achilles', 'ankle', 'hamstring', 'knee', 'concussion', 'shoulder', 'groin', 'calf', 'foot']);
const EXACT_PREDICATE_RULES = Object.freeze([
  { key: 'benched', assertion: /\b(?:benched|on (?:the )?bench)\b/i, evidence: /\b(?:benched|on (?:the )?bench|bench points)\b/i },
  { key: 'starter', assertion: /\b(?:starter|starting lineup)\b/i, evidence: /\b(?:starter|starting lineup)\b/i },
  { key: 'ruled_out', assertion: /\b(?:ruled out|listed out|inactive)\b/i, evidence: /\b(?:ruled out|listed out|inactive|\bout\b)\b/i },
  { key: 'questionable', assertion: /\bquestionable\b/i, evidence: /\bquestionable\b/i },
  { key: 'doubtful', assertion: /\bdoubtful\b/i, evidence: /\bdoubtful\b/i },
  { key: 'injured_reserve', assertion: /\b(?:injured reserve|\bir\b)\b/i, evidence: /\b(?:injured reserve|\bir\b)\b/i },
  { key: 'suspended', assertion: /\bsuspended\b/i, evidence: /\bsuspended\b/i },
  { key: 'touchdown', assertion: /\b(?:touchdowns?|tds?)\b/i, evidence: /\b(?:touchdowns?|tds?)\b/i },
  { key: 'fumble', assertion: /\bfumbles?\b/i, evidence: /\bfumbles?\b/i },
  { key: 'interception', assertion: /\binterceptions?\b/i, evidence: /\binterceptions?\b/i },
  { key: 'ejection', assertion: /\b(?:ejected|ejection)\b/i, evidence: /\b(?:ejected|ejection)\b/i },
  { key: 'traded', assertion: /\btrade[sd]?\b/i, evidence: /\btrade[sd]?\b/i },
  { key: 'signed', assertion: /\bsigned\b/i, evidence: /\bsigned\b/i },
  { key: 'released', assertion: /\breleased\b/i, evidence: /\breleased\b/i },
  { key: 'added', assertion: /\badded\b/i, evidence: /\badded\b/i },
  { key: 'dropped', assertion: /\bdropped\b/i, evidence: /\bdropped\b/i },
  { key: 'claimed', assertion: /\bclaimed\b/i, evidence: /\bclaimed\b/i }
]);

function assertedAvailability(text) {
  const checks = [
    ['Did not participate', /\b(?:did not participate|did not practice|dnp)\b/i],
    ['available_to_play', /\b(?:available to play|active|healthy|cleared to play|ready to play|not injured)\b/i],
    ['Full participant', /\b(?:full participant|practiced in full|full practice)\b/i],
    ['Limited participant', /\b(?:limited participant|limited practice)\b/i],
    ['IR', /\b(?:injured reserve|\bir\b)\b/i],
    ['Inactive', /\binactive\b/i],
    ['Questionable', /\bquestionable\b/i],
    ['Doubtful', /\bdoubtful\b/i],
    ['Out', /\b(?:ruled out|listed out|\bout\b)\b/i],
    ['Suspended', /\bsuspended\b/i],
    ['generic_injury', /\b(?:injury|injured)\b/i]
  ];
  return checks.find(([, pattern]) => pattern.test(text))?.[0] || null;
}

const AVAILABILITY_LANGUAGE_PATTERN = /\b(?:questionable|doubtful|out|inactive|injur(?:y|ed)|injured reserve|ir|suspended|participant|practice[sd]?|dnp|available|active|healthy|cleared|ready to play)\b/i;

const RELATIONSHIP_PATTERN = /\b(?:beat|beats|defeated|defeats|led|leads|trailed|trails|edged|edges|outscored|outscores|topped|tops|routed|routes|crushed|crushes|handled|handles|downed|downs|bested|bests|slipped past|prevailed over|prevails over|prevailed against|prevails against|won against|wins against|won over|wins over|lost to|loses to|fell to|falls to|was beaten by|margin over|against|versus|vs\.?)\b/i;
const CANONICAL_RESULT_LANGUAGE = /\b(?:defeated|beat|led|lost to|trailed|tied)\b/i;
const RESULT_ASSERTION_LANGUAGE = /\b(?:win|wins|won|victory|victorious|loss|lost|defeat(?:ed|s)?|beat|led|lead(?:s|ing)?|trailed?|tie|tied|triumph(?:ed|s)?|edged|outscored|topped|routed|crushed|handled|downed|bested|survived|slipped past|prevailed|gets? past|came out ahead)\b/i;
const PROJECTION_ASSERTION_CONTEXT = /\b(?:projected|projection|forecast|outlook|favorite|underdog|favored|favoured|leaned)\b/i;
const NEGATED_PREDICATE_PATTERN = /\b(?:not|never|no longer|did not|was not|is not|wasn['’]t|isn['’]t|avoided|denied)\b[^.!?]{0,40}\b(?:questionable|doubtful|out|inactive|injur(?:y|ed)|participant|available|active|healthy|cleared|favorite|underdog|trade[sd]?|claim(?:ed)?|add(?:ed)?|drop(?:ped)?|release[sd]?|sign(?:ed)?|champion|championship|ring)\b/i;
const ROSTER_RELATIONSHIP_PATTERN = /\b(?:for|starter|bench|lineup|roster|supplied|contributed|carried|slot)\b/i;

const PROPER_NAME_ALLOWLIST = new Set([
  'Farmhood Press',
  'Farmhood Press Sports Desk'
]);

function issue(code, path, message, details = {}) {
  return { severity: 'error', code, path, message, ...details };
}

function normalizedText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’]/g, "'")
    .toLocaleLowerCase('en-US');
}

function compactEntity(value) {
  return normalizedText(value).replace(/[^a-z0-9]+/g, '');
}

function entityKey(reference) {
  if (!reference || typeof reference !== 'object') return null;
  if (reference.key) return String(reference.key);
  if (reference.type && reference.id != null) return `${reference.type}:${reference.id}`;
  return null;
}

function numbersInText(text) {
  const found = [];
  const source = String(text || '');
  const digitPattern = /(?<![\p{L}\p{N}_])[-+]?\d{1,4}(?:,\d{3})*(?:\.\d+)?(?:%|st|nd|rd|th)?(?![\p{L}\p{N}_])/gu;
  for (const match of source.matchAll(digitPattern)) {
    const raw = match[0];
    const percent = raw.endsWith('%');
    const ordinal = /(?:st|nd|rd|th)$/i.test(raw);
    const numeric = Number(raw.replace(/,/g, '').replace(/(?:%|st|nd|rd|th)$/i, ''));
    if (Number.isFinite(numeric)) found.push({ raw, value: numeric, percent, ordinal, index: match.index });
  }
  const wordPattern = new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\b`, 'gi');
  for (const match of source.matchAll(wordPattern)) {
    found.push({ raw: match[0], value: NUMBER_WORDS[match[0].toLowerCase()], percent: false, ordinal: /(?:st|nd|rd|th)$/.test(match[0]), index: match.index });
  }
  return found.sort((left, right) => left.index - right.index);
}

function numericValues(value, target = []) {
  if (typeof value === 'number' && Number.isFinite(value)) target.push(value);
  else if (Array.isArray(value)) value.forEach((item) => numericValues(item, target));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => numericValues(item, target));
  return target;
}

function numberSupported(assertion, allowedValues) {
  return allowedValues.some((candidate) => {
    if (Math.abs(candidate - assertion.value) < 0.0001) return true;
    if (assertion.percent && Math.abs(candidate * 100 - assertion.value) < 0.0001) return true;
    return false;
  });
}

function markersIn(text, kind = '', tags = []) {
  const searchable = `${text || ''} ${kind.replaceAll('_', ' ')} ${(tags || []).join(' ').replaceAll('-', ' ')}`;
  return [...STATISTICAL_MARKERS, ...PREDICATE_MARKERS].filter(({ pattern }) => pattern.test(searchable)).map(({ key }) => key);
}

function labelsMentioned(text, identities) {
  const normalized = normalizedText(text);
  return identities.filter((identity) => {
    const label = normalizedText(identity.label);
    const boundary = identity.label.includes('_') || /\d/.test(identity.label)
      ? `(?:^|[^a-z0-9_])${escapePattern(label)}(?:$|[^a-z0-9_])`
      : `(?:^|[^a-z0-9])${escapePattern(label)}(?:$|[^a-z0-9])`;
    return new RegExp(boundary, 'i').test(normalized);
  });
}

function escapePattern(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripKnownLabels(text, identities) {
  let rendered = String(text || '');
  for (const identity of [...identities].sort((left, right) => right.label.length - left.label.length)) {
    rendered = rendered.replace(new RegExp(escapePattern(identity.label), 'gi'), ' ');
  }
  return rendered;
}

function normalizeIdentity(raw) {
  invariant(raw && typeof raw === 'object', 'Claim-check identities must be objects.');
  const key = entityKey(raw);
  invariant(key, 'Claim-check identity requires key or type/id.');
  return deepFreeze({
    key,
    type: nonEmptyText(raw.type || key.split(':', 1)[0], `identity ${key} type`, 30),
    id: String(raw.id ?? key.slice(key.indexOf(':') + 1)),
    label: nonEmptyText(raw.label ?? raw.displayName ?? raw.fullName ?? raw.name, `identity ${key} label`, 100)
  });
}

function factEntityKeys(fact, identities) {
  const keys = [entityKey(fact.subject), ...(fact.related || []).map(entityKey)].filter(Boolean);
  const mentioned = labelsMentioned(fact.claim, identities).map((identity) => identity.key);
  return unique([...keys, ...mentioned]).sort();
}

function normalizeFactEntry(fact, identities) {
  const claimId = nonEmptyText(fact?.factId, 'fact.factId', 180);
  const claim = nonEmptyText(fact?.claim, `fact ${claimId} claim`, 800);
  const numeric = unique([
    ...numbersInText(claim).map(({ value }) => value),
    ...numericValues(fact.value),
    ...numericValues(fact.context)
  ]).sort((left, right) => left - right);
  const scoreMatch = fact.kind === 'matchup_result' ? fact.claim.match(/(-?\d+(?:\.\d+)?)\s*[–—-]\s*(-?\d+(?:\.\d+)?)/) : null;
  return deepFreeze({
    claimId,
    sourceType: 'fact',
    claim,
    entityKeys: factEntityKeys(fact, identities),
    numericValues: numeric,
    markers: unique(markersIn(claim, fact.kind, fact.tags)).sort(),
    matchupIds: fact?.context?.matchupId == null ? [] : [Number(fact.context.matchupId)],
    kind: fact.kind || null,
    subjectKey: entityKey(fact.subject),
    value: fact.value,
    tags: fact.tags || [],
    context: fact.context || {},
    sourceUrls: [],
    availabilityStatus: fact.kind === 'player_availability_status' ? String(fact.value) : null,
    championshipCount: fact.kind === 'manager_championship_count' && Number.isFinite(Number(fact.value))
      ? Number(fact.value)
      : /\b(?:ringless|without (?:a|any) championships?|no championships?)\b/i.test(fact.claim) ? 0 : null,
    projectionLeaderKey: ['matchup_projection_edge', 'matchup_outlook_edge'].includes(fact.kind) ? entityKey(fact.subject) : null,
    relationship: fact.kind === 'matchup_result'
      ? fact.value === 'tie' ? {
          tie: true,
          teamAKey: entityKey(fact.subject),
          teamBKey: (fact.related || []).map(entityKey).find((key) => key?.startsWith('manager:')) || null,
          teamAScore: scoreMatch ? Number(scoreMatch[1]) : null,
          teamBScore: scoreMatch ? Number(scoreMatch[2]) : null,
          state: fact.state || null
        } : {
          tie: false,
          winnerKey: entityKey(fact.subject),
          loserKey: (fact.related || []).map(entityKey).find((key) => key?.startsWith('manager:')) || null,
          winnerScore: scoreMatch ? Number(scoreMatch[1]) : null,
          loserScore: scoreMatch ? Number(scoreMatch[2]) : null,
          state: fact.state || null
        }
      : null
  });
}

function normalizeResearchSubjects(subjects) {
  return (subjects || []).map((subject) => normalizeIdentity({
    ...subject,
    key: subject.key || entityKey(subject),
    label: subject.label ?? subject.name
  }));
}

function normalizeWebEntry(claim, identities) {
  const claimId = nonEmptyText(claim?.claimId, 'web claim ID', 180);
  invariant(claimId.startsWith('web:'), `Accepted web claim ${claimId} must use the web: namespace.`);
  const text = nonEmptyText(claim?.claim, `web claim ${claimId}`, 800);
  const subjectKey = nonEmptyText(claim?.subjectKey, `web claim ${claimId} subjectKey`, 180);
  invariant(identities.some((identity) => identity.key === subjectKey), `Web claim ${claimId} cites unknown subject ${subjectKey}.`);
  const sourceUrls = unique((claim.sourceUrls || []).map(String));
  invariant(sourceUrls.length > 0, `Web claim ${claimId} requires accepted source URLs.`);
  sourceUrls.forEach((url) => invariant(/^https:\/\//i.test(url), `Web claim ${claimId} contains a non-HTTPS source URL.`));
  return deepFreeze({
    claimId,
    sourceType: 'web',
    claim: text,
    entityKeys: unique([subjectKey, ...labelsMentioned(text, identities).map((identity) => identity.key)]).sort(),
    numericValues: unique(numbersInText(text).map(({ value }) => value)).sort((left, right) => left - right),
    markers: unique(markersIn(text)).sort(),
    matchupIds: [],
    kind: 'accepted_web_claim',
    context: { asOf: claim.asOf || null, status: claim.status || null },
    sourceUrls,
    availabilityStatus: claim.category === 'availability' ? claim.availabilityStatus || null : null,
    championshipCount: null,
    projectionLeaderKey: null
  });
}

/**
 * Builds the only evidence set publication copy may cite. Typed league facts and
 * already-validated web claims share one ID namespace but retain their origin.
 */
export function buildAllowedClaimIndex({
  facts = [],
  identities = [],
  webResearch = null,
  webClaims = [],
  researchSubjects = []
} = {}) {
  if (webResearch != null) {
    invariant(
      webResearch.kind === 'farmhood_press_v2_web_research' && webResearch.schemaVersion === 1 && webResearch.verificationStatus === 'verified',
      'webResearch must be a source-verified Farmhood Press V2 research packet.'
    );
  }
  const normalizedIdentities = [];
  const seenIdentityKeys = new Set();
  for (const identity of [...identities, ...normalizeResearchSubjects(researchSubjects)]) {
    const normalized = identity.key && identity.label && identity.type && identity.id != null && Object.isFrozen(identity)
      ? identity
      : normalizeIdentity(identity);
    if (seenIdentityKeys.has(normalized.key)) continue;
    seenIdentityKeys.add(normalized.key);
    normalizedIdentities.push(normalized);
  }
  normalizedIdentities.sort((left, right) => left.key.localeCompare(right.key));

  const entries = [
    ...facts.map((fact) => normalizeFactEntry(fact, normalizedIdentities)),
    ...(webResearch?.claims || webClaims).map((claim) => normalizeWebEntry(claim, normalizedIdentities))
  ];
  const seenClaimIds = new Set();
  for (const entry of entries) {
    invariant(!seenClaimIds.has(entry.claimId), `Allowed claim ID ${entry.claimId} was defined more than once.`);
    seenClaimIds.add(entry.claimId);
  }
  return deepFreeze({
    kind: CLAIM_INDEX_KIND,
    schemaVersion: 1,
    identities: normalizedIdentities,
    entries: entries.sort((left, right) => left.claimId.localeCompare(right.claimId))
  });
}

/** Returns every publishable assertion, assigning headlines their section evidence. */
export function articleNarrativeBlocks(article) {
  if (!article || typeof article !== 'object') return [];
  const blocks = [];
  const add = (path, block) => {
    if (!block || typeof block !== 'object') return;
    blocks.push({ path, text: block.text, claimIds: block.factIds });
  };
  const idsFrom = (rows) => unique((rows || []).flatMap((row) => Array.isArray(row?.factIds) ? row.factIds : []));
  const leadIds = unique([...(article.thesis?.factIds || []), ...idsFrom(article.lead)]);
  if (typeof article.title === 'string') blocks.push({ path: '$.title', text: article.title, claimIds: leadIds });
  if (typeof article.dek === 'string') blocks.push({ path: '$.dek', text: article.dek, claimIds: leadIds });
  add('$.thesis', article.thesis);
  (article.lead || []).forEach((block, index) => add(`$.lead[${index}]`, block));
  const season = article.seasonStoryline;
  const seasonBlocks = [season?.thesis, ...(season?.body || []), season?.whyNow, season?.carryForward];
  if (typeof season?.headline === 'string') blocks.push({ path: '$.seasonStoryline.headline', text: season.headline, claimIds: idsFrom(seasonBlocks) });
  add('$.seasonStoryline.thesis', season?.thesis);
  (season?.body || []).forEach((block, index) => add(`$.seasonStoryline.body[${index}]`, block));
  add('$.seasonStoryline.whyNow', season?.whyNow);
  add('$.seasonStoryline.carryForward', season?.carryForward);
  if (typeof article.mainEvent?.headline === 'string') blocks.push({ path: '$.mainEvent.headline', text: article.mainEvent.headline, claimIds: idsFrom(article.mainEvent.body) });
  (article.mainEvent?.body || []).forEach((block, index) => add(`$.mainEvent.body[${index}]`, block));
  (article.supportingStories || []).forEach((story, storyIndex) => {
    if (typeof story?.headline === 'string') blocks.push({ path: `$.supportingStories[${storyIndex}].headline`, text: story.headline, claimIds: idsFrom(story.body) });
    (story?.body || []).forEach((block, index) => add(`$.supportingStories[${storyIndex}].body[${index}]`, block));
  });
  (article.deskSections || []).forEach((section, sectionIndex) => {
    if (typeof section?.headline === 'string') blocks.push({ path: `$.deskSections[${sectionIndex}].headline`, text: section.headline, claimIds: idsFrom(section.body) });
    (section?.body || []).forEach((block, index) => add(`$.deskSections[${sectionIndex}].body[${index}]`, block));
  });
  (article.aroundLeague || []).forEach((entry, index) => {
    const entryIds = Array.isArray(entry?.body) ? idsFrom(entry.body) : entry?.factIds;
    if (typeof entry?.headline === 'string') blocks.push({ path: `$.aroundLeague[${index}].headline`, text: entry.headline, claimIds: entryIds });
    if (Array.isArray(entry?.body)) entry.body.forEach((block, bodyIndex) => add(`$.aroundLeague[${index}].body[${bodyIndex}]`, block));
    else blocks.push({ path: `$.aroundLeague[${index}].body`, text: entry?.body, claimIds: entry?.factIds });
  });
  add('$.pullQuote', article.pullQuote);
  return blocks;
}

function levenshtein(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function noncanonicalEntityIssues(text, identities, path) {
  const issues = [];
  const words = String(text || '').replace(/['’]s\b/g, '').match(/[A-Za-z0-9_'-]+/g) || [];
  for (const identity of identities.filter((item) => item.type === 'manager' || item.type === 'player')) {
    const expected = compactEntity(identity.label);
    const expectedWords = identity.label.match(/[A-Za-z0-9_'-]+/g)?.length || 1;
    for (let size = Math.max(1, expectedWords - 1); size <= expectedWords + 1; size += 1) {
      for (let start = 0; start + size <= words.length; start += 1) {
        const rendered = words.slice(start, start + size).join(' ');
        // A correct name followed by an ordinary word or score is not a near-miss name.
        if (new RegExp(`(?:^|[^A-Za-z0-9_])${escapePattern(identity.label)}(?:$|[^A-Za-z0-9_])`).test(rendered)) continue;
        if (!/[A-Z0-9_]/.test(rendered)) continue;
        const candidate = compactEntity(rendered);
        if (candidate === expected && rendered !== identity.label) {
          issues.push(issue('entity.noncanonical', path, `Use canonical ${identity.type} name ${identity.label}, not “${rendered}”.`, { entityKey: identity.key }));
          return issues;
        }
        if (candidate === expected) continue;
        const maximumDistance = expected.length >= 8 ? 2 : 1;
        if (candidate.length >= 4 && Math.abs(candidate.length - expected.length) <= maximumDistance && candidate[0] === expected[0]
          && levenshtein(candidate, expected) <= maximumDistance) {
          issues.push(issue('entity.unknown', path, `“${rendered}” is not a canonical entity; did you mean ${identity.label}?`, { entityKey: identity.key }));
          return issues;
        }
      }
    }
  }
  return issues;
}

function unknownProperNameIssues(text, identities, citedEntries, path) {
  const allowedText = normalizedText(citedEntries.map((entry) => entry.claim).join(' '));
  const stripped = stripKnownLabels(text, identities);
  const candidates = stripped.match(/\b[A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+)+\b/g) || [];
  return unique(candidates)
    .filter((candidate) => !PROPER_NAME_ALLOWLIST.has(candidate))
    .filter((candidate) => !allowedText.includes(normalizedText(candidate)))
    .map((candidate) => issue('entity.unknown', path, `Unknown or unsupported entity “${candidate}”. Add it to the identity registry or cite accepted evidence that names it.`));
}

function sentenceList(text) {
  return String(text || '').split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
}

function positionedIdentityMentions(text, identities) {
  const source = String(text || '');
  const mentions = [];
  for (const identity of identities) {
    const pattern = new RegExp(escapePattern(identity.label), 'gi');
    for (const match of source.matchAll(pattern)) {
      mentions.push({ identity, start: match.index, end: match.index + match[0].length });
    }
  }
  return mentions.sort((left, right) => left.start - right.start || right.end - left.end);
}

function relationshipIssues(text, identities, citedEntries, path) {
  const issues = [];
  for (const sentence of sentenceList(text)) {
    const positioned = positionedIdentityMentions(sentence, identities);
    const managers = positioned.filter(({ identity }) => identity.type === 'manager');
    const players = positioned.filter(({ identity }) => identity.type === 'player');
    const hasDirectMatchupAssertion = /\b(?:defeated|defeats|beat|beats|lost to|loses to|fell to|falls to|was beaten by|tied|routed|crushed|edged|topped|handled|downed|bested|prevailed|triumphed|triumphs|won against|wins against|won over|wins over)\b/i.test(sentence);
    const seasonContext = !hasDirectMatchupAssertion
      && citedEntries.some((entry) => /^season_/.test(entry.kind || '') || entry.tags?.includes('current-season'))
      && (/\b(?:season|scoring|standings|record|start|win column|through Week|title defense|career|next chapter|next test|needs?\b[^.!?]{0,140}\b(?:wins?|losses?|lead|standing))\b/i.test(sentence)
        || citedEntries.every((entry) => entry.matchupIds.length === 0));
    for (const relation of sentence.matchAll(new RegExp(RELATIONSHIP_PATTERN.source, 'gi'))) {
      const before = managers.filter((mention) => mention.end <= relation.index).at(-1);
      const after = managers.find((mention) => mention.start >= relation.index + relation[0].length);
      if (before && after && before.identity.key !== after.identity.key && !seasonContext) {
        const pair = [before.identity.key, after.identity.key];
        const verb = relation[0].toLowerCase();
        const directionalWin = /^(?:beat|beats|defeated|defeats|led|leads|edged|edges|outscored|outscores|topped|tops|routed|routes|crushed|crushes|handled|handles|downed|downs|bested|bests|slipped past|prevailed over|prevails over|prevailed against|prevails against|won against|wins against|won over|wins over|margin over)$/.test(verb);
        const directionalLoss = /^(?:lost to|loses to|trailed|trails|fell to|falls to|was beaten by)$/.test(verb);
        const sentenceScore = sentence.match(/(-?\d+(?:\.\d+)?)\s*[–—-]\s*(-?\d+(?:\.\d+)?)/);
        const supported = citedEntries.some((entry) => {
          if (entry.matchupIds.length === 0 || !pair.every((key) => entry.entityKeys.includes(key))) return false;
          if (directionalWin) {
            const direction = entry.relationship?.winnerKey === before.identity.key && entry.relationship?.loserKey === after.identity.key;
            const scores = !sentenceScore || entry.relationship?.winnerScore == null || (Number(sentenceScore[1]) === entry.relationship.winnerScore && Number(sentenceScore[2]) === entry.relationship.loserScore);
            return direction && scores;
          }
          if (directionalLoss) {
            const direction = entry.relationship?.loserKey === before.identity.key && entry.relationship?.winnerKey === after.identity.key;
            const scores = !sentenceScore || entry.relationship?.winnerScore == null || (Number(sentenceScore[1]) === entry.relationship.loserScore && Number(sentenceScore[2]) === entry.relationship.winnerScore);
            return direction && scores;
          }
          return true;
        });
        if (!supported) {
          issues.push(issue('relationship.matchup_mismatch', path, `${before.identity.label} and ${after.identity.label} are described with an opponent/result relationship the cited matchup facts do not support.`, { entityKeys: pair }));
        }
      }
    }
    const orderedManagers = managers.filter((mention, index, rows) => rows.findIndex((row) => row.identity.key === mention.identity.key) === index);
    const orderedScore = sentence.match(/(-?\d+(?:\.\d+)?)\s*[–—-]\s*(-?\d+(?:\.\d+)?)/);
    const recordAtoms = citedEntries.filter((entry) => ['season_record', 'season_all_play_record'].includes(entry.kind));
    let seasonRecord = false;
    if (seasonContext && orderedScore && [Number(orderedScore[1]), Number(orderedScore[2])].every((value) => Number.isInteger(value) && value >= 0)) {
      const records = [...sentence.matchAll(/(?<![\d.])(\d{1,2})\s*[–—-]\s*(\d{1,2})(?:\s*[–—-]\s*(\d{1,2}))?(?![\d.])/g)];
      seasonRecord = records.length > 0 && records.every((record) => {
        const prefix = sentence.slice(0, record.index);
        const recordContext = sentence.slice(Math.max(0, record.index - 55), record.index + record[0].length + 55);
        const genericGroup = /\b(?:[\d]+|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:managers|teams)(?:\s+[a-z]+){0,8}\s*$/i.test(prefix) || /\b(?:pack|group|managers|teams)\b[^.!?;]{0,12}$/i.test(prefix);
        let owner = genericGroup ? null : managers.filter((mention) => mention.end <= record.index).at(-1);
        if (/\b(?:the )?reigning champion(?:['’]s)?\b[^.!?;]{0,25}$/i.test(prefix)) {
          const champions = citedEntries.filter((entry) => entry.subjectKey && /\breigning\b[^.!?]{0,25}\bchampion\b/i.test(entry.claim));
          const championKeys = unique(champions.map((entry) => entry.subjectKey));
          if (championKeys.length === 1) owner = { identity: { key: championKeys[0], label: identities.find((identity) => identity.key === championKeys[0])?.label || 'the reigning champion' } };
        }
        const expectedKind = /\ball[- ]play\b/i.test(recordContext) ? 'season_all_play_record' : 'season_record';
        const supportedAtom = recordAtoms.some((entry) => entry.kind === expectedKind && (!owner || entry.subjectKey === owner.identity.key)
          && entry.value?.wins === Number(record[1]) && entry.value?.losses === Number(record[2])
          && (entry.value?.ties || 0) === Number(record[3] || 0));
        const exactRecord = new RegExp(`(?<![\\d.])${record[1]}\\s*[–—-]\\s*${record[2]}${record[3] ? `\\s*[–—-]\\s*${record[3]}` : ''}(?!\\d|\\.\\d)`);
        const groupAtom = genericGroup && citedEntries.some((entry) => entry.tags?.includes('current-season') && exactRecord.test(entry.claim));
        const historicalAtom = /\b20\d{2}\b/.test(recordContext) && citedEntries.some((entry) => entry.kind === 'manager_canonical_lore' && (!owner || entry.subjectKey === owner.identity.key) && exactRecord.test(entry.claim));
        const supported = supportedAtom || groupAtom || historicalAtom;
        if (!supported) issues.push(issue('relationship.season_record_mismatch', path, `Season record ${record[0]} lacks a matching cited record atom${owner ? ` for ${owner.identity.label}` : ''}.`));
        return supported;
      });
    }
    if (seasonContext) {
      const relevantKind = /\b(?:points|scoring)\b/i.test(sentence) ? 'season_points_for' : 'season_standing_rank';
      for (const comparison of sentence.matchAll(/\b(led|leads|outscored|outscores|trailed|trails|ahead of|behind)\b/gi)) {
        if (/\b(?:both|their|the)\s*$/i.test(sentence.slice(0, comparison.index))) continue;
        const before = managers.filter((mention) => mention.end <= comparison.index).at(-1);
        const after = managers.find((mention) => mention.start >= comparison.index + comparison[0].length);
        if (!before || !after || before.identity.key === after.identity.key) continue;
        const first = citedEntries.find((entry) => entry.kind === relevantKind && entry.subjectKey === before.identity.key);
        const second = citedEntries.find((entry) => entry.kind === relevantKind && entry.subjectKey === after.identity.key);
        const firstIsAhead = !/trailed|trails|behind/i.test(comparison[0]);
        const supported = first && second && (relevantKind === 'season_standing_rank'
          ? firstIsAhead ? Number(first.value) < Number(second.value) : Number(first.value) > Number(second.value)
          : firstIsAhead ? Number(first.value) > Number(second.value) : Number(first.value) < Number(second.value));
        if (!supported) issues.push(issue('relationship.season_comparison_mismatch', path, `The ${relevantKind === 'season_points_for' ? 'season scoring' : 'standings'} comparison between ${before.identity.label} and ${after.identity.label} lacks correctly ordered cited evidence.`));
      }
    }
    const pairKeys = orderedManagers.map((mention) => mention.identity.key);
    const citedResults = citedEntries.filter((entry) => entry.relationship && pairKeys.length === 2 && pairKeys.every((key) => entry.entityKeys.includes(key)));
    const relevantResults = citedEntries.filter((entry) => entry.relationship && managers.some((manager) => entry.entityKeys.includes(manager.identity.key)));
    const hasMatchupScopedEvidence = citedEntries.some((entry) => entry.matchupIds.length > 0);
    if (RESULT_ASSERTION_LANGUAGE.test(sentence) && !seasonContext && !PROJECTION_ASSERTION_CONTEXT.test(sentence) && managers.length > 0 && relevantResults.length === 0 && (orderedManagers.length >= 2 || hasMatchupScopedEvidence)) {
      issues.push(issue('relationship.result_missing', path, 'Win/loss/lead/tie language requires a cited matchup_result fact.', { entityKeys: managers.map((row) => row.identity.key) }));
    }
    if (orderedManagers.length === 2 && orderedScore && !seasonRecord && citedResults.length === 0 && !/\b(?:project(?:ed|ion)?|forecast|estimated|outlook)\b/i.test(sentence)) {
      issues.push(issue('relationship.result_missing', path, 'A two-manager non-projection scoreline requires a cited matchup_result fact.', { entityKeys: pairKeys }));
    }
    if (orderedManagers.length === 2 && orderedScore && !seasonRecord && citedResults.length) {
      const [firstManager, secondManager] = orderedManagers;
      const scoreSupported = citedResults.some((entry) => {
        if (entry.matchupIds.length === 0) return false;
        const scoreByManager = entry.relationship.tie
          ? new Map([[entry.relationship.teamAKey, entry.relationship.teamAScore], [entry.relationship.teamBKey, entry.relationship.teamBScore]])
          : new Map([[entry.relationship.winnerKey, entry.relationship.winnerScore], [entry.relationship.loserKey, entry.relationship.loserScore]]);
        return scoreByManager.has(firstManager.identity.key) && scoreByManager.has(secondManager.identity.key)
          && Number(orderedScore[1]) === scoreByManager.get(firstManager.identity.key)
          && Number(orderedScore[2]) === scoreByManager.get(secondManager.identity.key);
      });
      if (!scoreSupported) issues.push(issue('relationship.score_mismatch', path, `The ordered scoreline does not match ${firstManager.identity.label} and ${secondManager.identity.label} in the cited matchup result.`, { entityKeys: [firstManager.identity.key, secondManager.identity.key] }));
      if (!CANONICAL_RESULT_LANGUAGE.test(sentence)) issues.push(issue('relationship.result_format', path, 'Result sentences must use defeated/beat/lost to, or led/trailed for a live score, with the verified ordered scoreline.', { entityKeys: pairKeys }));
    }
    if (orderedManagers.length === 2 && citedResults.length && !orderedScore && !seasonContext) {
      issues.push(issue('relationship.result_format', path, 'A sentence citing a matchup result and naming both managers must include the verified ordered scoreline.', { entityKeys: pairKeys }));
    }
    if (RESULT_ASSERTION_LANGUAGE.test(sentence) && relevantResults.length && !seasonContext) {
      if (orderedManagers.length !== 2 || !orderedScore || !CANONICAL_RESULT_LANGUAGE.test(sentence)) {
        issues.push(issue('relationship.result_format', path, 'Result assertions must name both managers, use the verified ordered scoreline, and use defeated/beat/lost to or led/trailed.', { entityKeys: orderedManagers.map((row) => row.identity.key) }));
      } else {
        const hasLive = relevantResults.some((entry) => entry.relationship.state === 'live');
        const hasFinal = relevantResults.some((entry) => entry.relationship.state === 'final' || entry.relationship.state == null);
        const hasTie = relevantResults.some((entry) => entry.relationship.tie);
        if ((hasLive && !new RegExp(`\\b(?:led|trailed${hasTie ? '|tied' : ''})\\b`, 'i').test(sentence)) || (hasFinal && !new RegExp(`\\b(?:defeated|beat|lost to${hasTie ? '|tied' : ''})\\b`, 'i').test(sentence))) {
          issues.push(issue('relationship.result_phase', path, `Result wording does not match the cited ${hasLive ? 'live' : 'final'} state.`, { entityKeys: pairKeys }));
        }
      }
    }
    for (const projectionTerm of sentence.matchAll(/\b(favorite|underdog|projected winner|forecast winner|projected leader|projected loser|projected to win|projected to lose|projection favored|forecast favored|leaned toward|outlook lean)\b/gi)) {
      const term = projectionTerm[1].toLowerCase();
      const preferAfter = ['leaned toward', 'outlook lean', 'projection favored', 'forecast favored'].includes(term);
      const nearest = (preferAfter ? null : managers.filter((mention) => mention.end <= projectionTerm.index).at(-1))
        || managers.find((mention) => mention.start >= projectionTerm.index + projectionTerm[0].length)
        || managers.filter((mention) => mention.end <= projectionTerm.index).at(-1);
      if (!nearest) continue;
      const role = /underdog|projected loser|projected to lose/.test(term) ? 'underdog' : 'favorite';
      const prefix = sentence.slice(Math.max(0, projectionTerm.index - 24), projectionTerm.index);
      if (/\b(?:not|never|no longer)\b/i.test(prefix)) {
        issues.push(issue('relationship.projection_mismatch', path, `Negated projection-role language is not permitted for ${nearest?.identity.label || 'this manager'}.`, { entityKey: nearest?.identity.key }));
        continue;
      }
      const supported = citedEntries.some((entry) => entry.projectionLeaderKey
        && entry.entityKeys.includes(nearest.identity.key)
        && (role === 'favorite' ? entry.projectionLeaderKey === nearest.identity.key : entry.projectionLeaderKey !== nearest.identity.key));
      if (!supported) issues.push(issue('relationship.projection_mismatch', path, `${nearest.identity.label} is labeled the ${role} without a cited projection edge supporting that role.`, { entityKey: nearest.identity.key }));
    }
    if (managers.length > 0 && players.length > 0 && ROSTER_RELATIONSHIP_PATTERN.test(sentence)) {
      for (const player of players) {
        const manager = managers.slice().sort((left, right) => {
          const leftDistance = Math.min(Math.abs(left.start - player.end), Math.abs(player.start - left.end));
          const rightDistance = Math.min(Math.abs(right.start - player.end), Math.abs(player.start - right.end));
          return leftDistance - rightDistance;
        })[0];
        const supported = citedEntries.some((entry) => entry.sourceType === 'fact'
          && entry.entityKeys.includes(player.identity.key) && entry.entityKeys.includes(manager.identity.key));
        if (!supported) {
          issues.push(issue('relationship.roster_mismatch', path, `${player.identity.label} is linked to ${manager.identity.label} without one cited roster/player fact connecting them.`, { entityKeys: [player.identity.key, manager.identity.key] }));
        }
      }
    }
  }
  for (const match of String(text || '').matchAll(/\bmatchup\s+(\d+)\b/gi)) {
    const matchupId = Number(match[1]);
    if (!citedEntries.some((entry) => entry.matchupIds.includes(matchupId))) {
      issues.push(issue('relationship.matchup_id_mismatch', path, `Matchup ${matchupId} is not present in this paragraph's cited evidence.`, { matchupId }));
    }
  }
  return issues;
}

/**
 * Deterministically verifies paragraph-level grounding after Structured Outputs.
 * It intentionally returns every repairable error instead of failing on the first.
 */
export function validateArticleClaims(article, allowedClaims, options = {}) {
  invariant(allowedClaims?.kind === CLAIM_INDEX_KIND, 'validateArticleClaims requires a Press V2 allowed claim index.');
  const entryById = new Map(allowedClaims.entries.map((entry) => [entry.claimId, entry]));
  const blocks = articleNarrativeBlocks(article);
  const errors = [];
  const metrics = {
    paragraphCount: blocks.length,
    citationReferences: 0,
    webClaimReferences: 0,
    numericAssertions: 0,
    statisticalAssertions: 0,
    predicateAssertions: 0,
    entityMentions: 0
  };

  if (blocks.length === 0) errors.push(issue('claim.no_narrative', '$', 'Article contains no narrative paragraphs to verify.'));
  for (const block of blocks) {
    const text = typeof block.text === 'string' ? block.text.trim() : '';
    if (!text) {
      errors.push(issue('claim.empty_paragraph', block.path, 'Narrative paragraph text is required.'));
      continue;
    }
    const rawClaimIds = Array.isArray(block.claimIds) ? block.claimIds.map(String) : [];
    const claimIds = unique(rawClaimIds);
    if (claimIds.length === 0) {
      errors.push(issue('citation.missing', `${block.path}.factIds`, 'Every narrative paragraph must cite at least one allowed fact or web claim.'));
      continue;
    }
    if (claimIds.length !== rawClaimIds.length) {
      errors.push(issue('citation.duplicate', `${block.path}.factIds`, 'A narrative paragraph must not repeat a claim ID.'));
    }
    metrics.citationReferences += claimIds.length;
    const citedEntries = [];
    for (const claimId of claimIds) {
      const entry = entryById.get(claimId);
      if (!entry) errors.push(issue('citation.unknown', `${block.path}.factIds`, `Unknown or unaccepted claim ID: ${claimId}`, { claimId }));
      else {
        citedEntries.push(entry);
        if (entry.sourceType === 'web') metrics.webClaimReferences += 1;
      }
    }
    if (citedEntries.length === 0) continue;

    const authorizedEntityKeys = new Set(citedEntries.flatMap((entry) => entry.entityKeys));
    const mentioned = labelsMentioned(text, allowedClaims.identities);
    metrics.entityMentions += mentioned.length;
    for (const identity of mentioned) {
      if (!authorizedEntityKeys.has(identity.key)) {
        errors.push(issue('entity.uncited', block.path, `${identity.label} appears without a cited fact or accepted web claim about that entity.`, { entityKey: identity.key }));
      }
    }
    errors.push(...noncanonicalEntityIssues(text, allowedClaims.identities, block.path));
    errors.push(...unknownProperNameIssues(text, allowedClaims.identities, citedEntries, block.path));

    const scrubbed = stripKnownLabels(text, allowedClaims.identities);
    const assertions = numbersInText(scrubbed);
    const allowedNumbers = unique(citedEntries.flatMap((entry) => entry.numericValues));
    metrics.numericAssertions += assertions.length;
    for (const assertion of assertions) {
      if (!numberSupported(assertion, allowedNumbers)) {
        errors.push(issue('claim.uncited_number', block.path, `Numeric assertion “${assertion.raw}” is not supported by this paragraph's cited evidence.`, { value: assertion.value }));
      }
    }

    const paragraphMarkers = unique(markersIn(text));
    const allowedMarkers = new Set(citedEntries.flatMap((entry) => entry.markers));
    metrics.statisticalAssertions += paragraphMarkers.filter((marker) => !PREDICATE_KEYS.has(marker)).length;
    metrics.predicateAssertions += paragraphMarkers.filter((marker) => PREDICATE_KEYS.has(marker)).length;
    for (const marker of paragraphMarkers) {
      if (!allowedMarkers.has(marker)) {
        const predicate = PREDICATE_KEYS.has(marker);
        errors.push(issue(predicate ? 'claim.unsupported_predicate' : 'claim.unsupported_statistic', block.path, `${predicate ? 'Factual predicate' : 'Statistical assertion'} “${marker}” is not supported by this paragraph's cited evidence.`, { marker }));
      }
    }
    const citedText = normalizedText(citedEntries.map((entry) => entry.claim).join(' '));
    if (NEGATED_PREDICATE_PATTERN.test(text) && !/\bdid not (?:participate|practice)\b/i.test(text)) {
      errors.push(issue('claim.unsupported_predicate', block.path, 'Negated status, projection, transaction, or championship predicates are not permitted; state the verified atom directly.', { marker: 'predicate:negated' }));
    }
    const availabilityText = text.replace(/\bactive career\b/gi, 'career').replace(/\blineups available(?: at capture)?\b/gi, 'captured lineups');
    const availability = assertedAvailability(availabilityText);
    const mentionedKeys = new Set(mentioned.map((identity) => identity.key));
    const citedAvailability = citedEntries.filter((entry) => entry.availabilityStatus && entry.entityKeys.some((key) => mentionedKeys.has(key)));
    if (citedAvailability.length && !availability) {
      errors.push(issue('claim.unsupported_predicate', block.path, 'A cited availability atom may be used only with recognized canonical availability language.', { marker: 'availability:unclassified' }));
    }
    if (availability) {
      const supported = availability === 'generic_injury'
        ? citedEntries.some((entry) => entry.availabilityStatus)
        : availability === 'available_to_play'
        ? citedEntries.some((entry) => /\bavailable to play\b/i.test(entry.claim))
        : citedEntries.some((entry) => normalizedText(entry.availabilityStatus) === normalizedText(availability));
      if (!supported) errors.push(issue('claim.unsupported_predicate', block.path, `Availability assertion “${availability.replaceAll('_', ' ')}” conflicts with or is absent from this paragraph's cited evidence.`, { marker: `availability:${availability}` }));
    } else if (AVAILABILITY_LANGUAGE_PATTERN.test(availabilityText)) {
      errors.push(issue('claim.unsupported_predicate', block.path, 'Availability language could not be mapped to a verified status atom.', { marker: 'availability:unclassified' }));
    }
    if (/\b(?:ringless|titleless|without (?:a|any) championships?|without (?:a|any) rings?|no championships?|no rings?)\b/i.test(text)) {
      const supported = citedEntries.some((entry) => entry.championshipCount === 0 || /\b(?:ringless|titleless|without (?:a|any) championships?|without (?:a|any) rings?|no championships?|no rings?)\b/i.test(entry.claim));
      if (!supported) errors.push(issue('claim.unsupported_predicate', block.path, 'A ringless/no-championship assertion conflicts with the cited championship evidence.', { marker: 'championship:none' }));
    }
    if (/\b(?:won|earned|has|owns)\b[^.!?]{0,35}\b(?:championships?|titles?|rings?)\b|\b(?:reigning|former) champion\b/i.test(text)) {
      const supported = citedEntries.some((entry) => entry.championshipCount > 0 || (/\b(?:won|champion|championship|title)\b/i.test(entry.claim) && !/\b(?:without|no|ringless|titleless)\b/i.test(entry.claim)));
      if (!supported) errors.push(issue('claim.unsupported_predicate', block.path, 'A positive championship assertion lacks positive cited championship evidence.', { marker: 'championship:positive' }));
    }
    for (const rule of EXACT_PREDICATE_RULES) {
      if (rule.assertion.test(text) && !rule.evidence.test(citedText)) errors.push(issue('claim.unsupported_predicate', block.path, `Predicate “${rule.key}” is absent from this paragraph's cited evidence.`, { marker: rule.key }));
    }
    for (const term of MEDICAL_TERMS.filter((candidate) => new RegExp(`\\b${candidate}\\b`, 'i').test(text))) {
      if (!new RegExp(`\\b${term}\\b`, 'i').test(citedText)) errors.push(issue('claim.unsupported_predicate', block.path, `Medical detail “${term}” is absent from this paragraph's cited evidence.`, { marker: `medical:${term}` }));
    }
    errors.push(...relationshipIssues(text, allowedClaims.identities, citedEntries, block.path));
  }

  const uniqueErrors = [...new Map(errors.map((finding) => [`${finding.code}:${finding.path}:${finding.message}`, finding])).values()];
  const errorCodes = uniqueErrors.reduce((counts, finding) => ({ ...counts, [finding.code]: (counts[finding.code] || 0) + 1 }), {});
  return deepFreeze({ pass: uniqueErrors.length === 0, errors: uniqueErrors, metrics: { ...metrics, errorCodes }, options: { strict: options.strict !== false } });
}

export function assertArticleClaims(article, allowedClaims, options = {}) {
  const report = validateArticleClaims(article, allowedClaims, options);
  if (!report.pass) {
    const summary = report.errors.map((finding) => `${finding.code} ${finding.path}: ${finding.message}`).join('\n');
    throw new Error(`Farmhood Press V2 claim checker rejected the article:\n${summary}`);
  }
  return report;
}
