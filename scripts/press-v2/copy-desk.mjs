import { validateLongFormShape } from './editorial-schema.mjs';

export const DEFAULT_CLICHES = Object.freeze([
  'at the end of the day',
  'buckle up',
  'fantasy roller coaster',
  'game changer',
  'in the world of fantasy football',
  'keep an eye on',
  'one for the ages',
  'only time will tell',
  'set the stage',
  'the dust settled',
  'when all was said and done',
  'written in the stars'
]);

const ACCESS_PATTERNS = Object.freeze([
  /\bsources? (?:say|said|tell|told|indicate|close to)\b/i,
  /\binside (?:the )?(?:locker room|war room|team facility)\b/i,
  /\b(?:we|the desk) (?:spoke|talked|checked in) with\b/i,
  /\boff[- ]the[- ]record\b/i,
  /\bpeople familiar with\b/i
]);
const MOTIVE_PATTERN = /\b(?:wanted|believed|felt|knew|hoped|thought|intended|planned|was determined|was desperate|did(?:n['’]t| not) care)\b/i;
const CAUSAL_PATTERN = /\b(?:because|caused|due to|as a result of|the reason (?:for|was)|led directly to)\b/i;
const QUOTE_PATTERN = /(?:"[^"\n]{2,}"|“[^”\n]{2,}”)/;
const INJURY_JOKE_PATTERN = /\b(?:injur(?:y|ed)|out|inactive|ir)\b[^.!?]{0,55}\b(?:joke|punchline|funny|hilarious|laugh)\b|\b(?:joke|punchline|funny|hilarious|laugh)\b[^.!?]{0,55}\b(?:injur(?:y|ed)|out|inactive|ir)\b/i;

function issue(severity, code, path, message) {
  return { severity, code, path, message };
}

function normalizeWords(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[’']/g, '')
    .toLowerCase()
    .match(/[a-z0-9_]+/g) || [];
}

function normalizeSentence(value) {
  return normalizeWords(value).join(' ');
}

function containsNormalizedPhrase(text, phrase) {
  const haystack = ` ${normalizeWords(text).join(' ')} `;
  const needle = normalizeWords(phrase).join(' ');
  return needle.length > 0 && haystack.includes(` ${needle} `);
}

function sentenceList(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function wordCount(text) {
  return normalizeWords(text).length;
}

/** Returns every prose field, retaining citations when the contract supplies them. */
export function articleProseBlocks(article) {
  if (!article || typeof article !== 'object') return [];
  const blocks = [];
  const add = (path, text, factIds = []) => {
    if (typeof text === 'string' && text.trim()) blocks.push({ path, text: text.trim(), factIds: Array.isArray(factIds) ? factIds : [] });
  };
  const addCited = (path, block) => add(path, block?.text, block?.factIds);
  const addFeature = (path, feature) => {
    add(`${path}.headline`, feature?.headline);
    (feature?.body || []).forEach((block, index) => addCited(`${path}.body[${index}]`, block));
  };

  add('$.title', article.title);
  add('$.dek', article.dek);
  addCited('$.thesis', article.thesis);
  (article.lead || []).forEach((block, index) => addCited(`$.lead[${index}]`, block));
  add('$.seasonStoryline.headline', article.seasonStoryline?.headline);
  addCited('$.seasonStoryline.thesis', article.seasonStoryline?.thesis);
  (article.seasonStoryline?.body || []).forEach((block, index) => addCited(`$.seasonStoryline.body[${index}]`, block));
  addCited('$.seasonStoryline.whyNow', article.seasonStoryline?.whyNow);
  addCited('$.seasonStoryline.carryForward', article.seasonStoryline?.carryForward);
  addFeature('$.mainEvent', article.mainEvent);
  (article.supportingStories || []).forEach((feature, index) => addFeature(`$.supportingStories[${index}]`, feature));
  (article.deskSections || []).forEach((section, index) => {
    add(`$.deskSections[${index}].headline`, section?.headline);
    (section?.body || []).forEach((block, bodyIndex) => addCited(`$.deskSections[${index}].body[${bodyIndex}]`, block));
  });
  (article.aroundLeague || []).forEach((entry, index) => {
    add(`$.aroundLeague[${index}].headline`, entry?.headline);
    if (Array.isArray(entry?.body)) entry.body.forEach((block, bodyIndex) => addCited(`$.aroundLeague[${index}].body[${bodyIndex}]`, block));
    else add(`$.aroundLeague[${index}].body`, entry?.body, entry?.factIds);
  });
  addCited('$.pullQuote', article.pullQuote);
  return blocks;
}

function managerSpellingIssues(blocks, managerNames) {
  const canonical = new Map(managerNames.map((name) => [normalizeWords(name).join(''), name]));
  const findings = [];
  const seen = new Set();
  for (const block of blocks) {
    const words = String(block.text).match(/[A-Za-z0-9_]+/g) || [];
    for (let start = 0; start < words.length; start += 1) {
      for (let size = 1; size <= 3 && start + size <= words.length; size += 1) {
        const rendered = words.slice(start, start + size).join(' ');
        const expected = canonical.get(normalizeWords(rendered).join(''));
        if (!expected || rendered === expected) continue;
        const key = `${block.path}:${expected}:${rendered}`;
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push(issue('error', 'manager.noncanonical', block.path, `Use canonical manager handle ${expected}, not “${rendered}”.`));
      }
    }
  }
  return findings;
}

function repeatedSentenceIssues(blocks) {
  const occurrences = new Map();
  for (const block of blocks) {
    for (const sentence of sentenceList(block.text)) {
      const normalized = normalizeSentence(sentence);
      if (normalized.length < 35) continue;
      if (!occurrences.has(normalized)) occurrences.set(normalized, []);
      occurrences.get(normalized).push(block.path);
    }
  }
  return [...occurrences.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([sentence, paths]) => issue('error', 'repetition.sentence', paths[1], `Repeated sentence-level copy appears in ${paths.join(', ')}: “${sentence.slice(0, 90)}”.`));
}

function repeatedNgramIssue(blocks, size = 7, minimumOccurrences = 3) {
  const occurrences = new Map();
  for (const block of blocks) {
    const words = normalizeWords(block.text);
    for (let index = 0; index + size <= words.length; index += 1) {
      const phrase = words.slice(index, index + size).join(' ');
      if (!occurrences.has(phrase)) occurrences.set(phrase, new Set());
      occurrences.get(phrase).add(block.path);
    }
  }
  const repeated = [...occurrences.entries()]
    .filter(([, paths]) => paths.size >= minimumOccurrences)
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))[0];
  if (!repeated) return [];
  const [phrase, paths] = repeated;
  return [issue('error', 'repetition.phrase', [...paths][1], `The phrase “${phrase}” repeats across ${paths.size} sections.`)];
}

function citationMetrics(blocks, knownEntities) {
  const citedBlocks = blocks.filter((block) => block.factIds.length > 0);
  const words = citedBlocks.reduce((sum, block) => sum + wordCount(block.text), 0);
  const factReferences = citedBlocks.reduce((sum, block) => sum + new Set(block.factIds).size, 0);
  const sentences = citedBlocks.flatMap((block) => sentenceList(block.text));
  const concreteSentences = sentences.filter((sentence) => {
    if (/\d/.test(sentence)) return true;
    return knownEntities.some((entity) => containsNormalizedPhrase(sentence, entity));
  }).length;
  return {
    narrativeWords: words,
    factReferences,
    factReferencesPer100Words: words === 0 ? 0 : Number(((factReferences / words) * 100).toFixed(2)),
    sentenceCount: sentences.length,
    concreteSentenceCount: concreteSentences,
    concreteSentenceRatio: sentences.length === 0 ? 0 : Number((concreteSentences / sentences.length).toFixed(3))
  };
}

function averageSentenceWords(blocks) {
  const lengths = blocks.flatMap((block) => sentenceList(block.text).map(wordCount)).filter(Boolean);
  if (lengths.length === 0) return { average: 0, maximum: 0 };
  return {
    average: Number((lengths.reduce((sum, length) => sum + length, 0) / lengths.length).toFixed(1)),
    maximum: Math.max(...lengths)
  };
}

/**
 * Deterministic editorial checks. No model is used here.
 *
 * `context` is the frozen reporting packet contract described in EDITORIAL_CONTRACT.md.
 */
export function runCopyDesk(article, context, options = {}) {
  const config = {
    minimumWords: options.minimumWords ?? 1100,
    maximumWords: options.maximumWords ?? 1700,
    minimumSectionDepth: options.minimumSectionDepth ?? true,
    minimumFactReferencesPer100Words: options.minimumFactReferencesPer100Words ?? 1,
    minimumConcreteSentenceRatio: options.minimumConcreteSentenceRatio ?? 0.55,
    cliches: options.cliches ?? DEFAULT_CLICHES,
    repeatedNgramSize: options.repeatedNgramSize ?? 7,
    repeatedNgramOccurrences: options.repeatedNgramOccurrences ?? 3
  };
  const errors = validateLongFormShape(article, context).map((finding) => ({ severity: 'error', ...finding }));
  const warnings = [];
  const blocks = articleProseBlocks(article);
  const allText = blocks.map((block) => block.text).join('\n');
  const entities = [...new Set([...(context.managerNames || []), ...(context.playerNames || [])])];
  const verifiedQuoteIds = new Set(context.verifiedQuoteFactIds || []);
  const verifiedIntentIds = new Set(context.verifiedIntentFactIds || []);
  const verifiedCausalIds = new Set(context.verifiedCausalFactIds || []);
  const hasAuthorizedId = (block, allowed) => block.factIds.some((factId) => allowed.has(factId));

  errors.push(...managerSpellingIssues(blocks, context.managerNames || []));
  for (const block of blocks) {
    if (QUOTE_PATTERN.test(block.text) && !hasAuthorizedId(block, verifiedQuoteIds)) {
      errors.push(issue('error', 'claim.unverified_quote', block.path, 'Literal quotation requires a verified quote fact ID.'));
    }
    if (ACCESS_PATTERNS.some((pattern) => pattern.test(block.text))) {
      errors.push(issue('error', 'claim.fake_access', block.path, 'Copy implies reporting access that the Press does not have.'));
    }
    if (MOTIVE_PATTERN.test(block.text) && !hasAuthorizedId(block, verifiedIntentIds)) {
      errors.push(issue('error', 'claim.unverified_motive', block.path, 'A manager or player motive requires a verified statement of intent.'));
    }
    if (CAUSAL_PATTERN.test(block.text) && !hasAuthorizedId(block, verifiedCausalIds)) {
      errors.push(issue('error', 'claim.unsupported_causality', block.path, 'Causal language requires a verified causal fact ID.'));
    }
    if (INJURY_JOKE_PATTERN.test(block.text)) {
      errors.push(issue('error', 'voice.injury_joke', block.path, 'Injury and inactive status cannot be used as a punch line.'));
    }
  }

  const prohibitedPhrases = [
    ...config.cliches.map((phrase) => ({ phrase, source: 'cliché', code: 'voice.cliche' })),
    ...(context.cooldownPhrases || []).map((phrase) => ({ phrase, source: 'cooldown', code: 'voice.cooldown' }))
  ];
  for (const { phrase, source, code } of prohibitedPhrases) {
    const block = blocks.find((candidate) => containsNormalizedPhrase(candidate.text, phrase));
    if (block) errors.push(issue('error', code, block.path, `The ${source} phrase “${phrase}” is unavailable for this edition.`));
  }
  errors.push(...repeatedSentenceIssues(blocks));
  errors.push(...repeatedNgramIssue(blocks, config.repeatedNgramSize, config.repeatedNgramOccurrences));

  const metrics = {
    totalWords: wordCount(allText),
    ...citationMetrics(blocks, entities),
    ...averageSentenceWords(blocks)
  };
  if (config.minimumSectionDepth) {
    const requireWords = (path, minimum) => {
      const actual = blocks.filter((block) => block.path.startsWith(path) && !block.path.endsWith('.headline')).reduce((sum, block) => sum + wordCount(block.text), 0);
      if (actual < minimum) errors.push(issue('error', 'depth.section_too_short', path, `This story has ${actual} words; at least ${minimum} are required to explain the managers, evidence, and next chapter.`));
      return actual;
    };
    requireWords('$.seasonStoryline', 180);
    const mainWords = requireWords('$.mainEvent.body', 180);
    (article.supportingStories || []).forEach((_, index) => {
      const supportWords = requireWords(`$.supportingStories[${index}].body`, 90);
      if (mainWords <= supportWords) errors.push(issue('error', 'depth.main_hierarchy', '$.mainEvent.body', 'The main event must be deeper than each supporting matchup.'));
    });
    (article.aroundLeague || []).forEach((_, index) => requireWords(`$.aroundLeague[${index}].body`, 90));
  }
  if (metrics.totalWords < config.minimumWords) {
    errors.push(issue('error', 'depth.too_short', '$', `Long-form ${context.edition} copy has ${metrics.totalWords} words; minimum is ${config.minimumWords}.`));
  }
  if (metrics.totalWords > config.maximumWords) {
    errors.push(issue('error', 'depth.too_long', '$', `Long-form ${context.edition} copy has ${metrics.totalWords} words; maximum is ${config.maximumWords}.`));
  }
  if (metrics.factReferencesPer100Words < config.minimumFactReferencesPer100Words) {
    errors.push(issue('error', 'density.citations', '$', `Fact-reference density is ${metrics.factReferencesPer100Words} per 100 words; minimum is ${config.minimumFactReferencesPer100Words}.`));
  }
  if (metrics.concreteSentenceRatio < config.minimumConcreteSentenceRatio) {
    errors.push(issue('error', 'density.specificity', '$', `Only ${(metrics.concreteSentenceRatio * 100).toFixed(1)}% of narrative sentences contain a verified entity or number; minimum is ${(config.minimumConcreteSentenceRatio * 100).toFixed(0)}%.`));
  }
  if (metrics.maximum > 48) {
    warnings.push(issue('warning', 'readability.long_sentence', '$', `The longest sentence is ${metrics.maximum} words; aim for 48 or fewer.`));
  }
  if (metrics.average > 30) {
    warnings.push(issue('warning', 'readability.sentence_average', '$', `Average sentence length is ${metrics.average} words; aim for 30 or fewer.`));
  }

  const uniqueErrors = [...new Map(errors.map((finding) => [`${finding.code}:${finding.path}:${finding.message}`, finding])).values()];
  return {
    pass: uniqueErrors.length === 0,
    errors: uniqueErrors,
    warnings,
    metrics
  };
}

export function assertCopyDesk(article, context, options = {}) {
  const report = runCopyDesk(article, context, options);
  if (!report.pass) {
    const summary = report.errors.map((finding) => `${finding.code} ${finding.path}: ${finding.message}`).join('\n');
    throw new Error(`Farmhood Press V2 copy desk rejected the article:\n${summary}`);
  }
  return report;
}
