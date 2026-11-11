import {
  canonicalize,
  deepFreeze,
  digest,
  identifier,
  invariant,
  isoTimestamp,
  nonEmptyText,
  stableJson,
  unique
} from './utils.mjs';

export const FACT_STATES = Object.freeze(['projection', 'live', 'final', 'historical', 'canonical', 'derived']);
export const EDITIONS = Object.freeze(['preview', 'late-preview', 'recap', 'waiver', 'season']);
export const SOURCE_FINALITY = Object.freeze(['live', 'provisional', 'final', 'historical', 'canonical']);

function normalizeSource(raw) {
  invariant(raw && typeof raw === 'object', 'Source metadata must be an object.');
  const source = {
    sourceId: identifier(raw.sourceId, 'source.sourceId'),
    provider: nonEmptyText(raw.provider, 'source.provider', 80),
    dataset: nonEmptyText(raw.dataset, 'source.dataset', 120),
    retrievedAt: isoTimestamp(raw.retrievedAt, 'source.retrievedAt'),
    observedAt: isoTimestamp(raw.observedAt ?? raw.retrievedAt, 'source.observedAt'),
    finality: nonEmptyText(raw.finality, 'source.finality', 20),
    uri: raw.uri == null ? null : nonEmptyText(raw.uri, 'source.uri', 500),
    contentHash: raw.contentHash == null ? null : identifier(raw.contentHash, 'source.contentHash'),
    licenseClass: raw.licenseClass == null ? 'internal-derived' : identifier(raw.licenseClass, 'source.licenseClass')
  };
  invariant(SOURCE_FINALITY.includes(source.finality), `Unsupported source finality ${source.finality}.`);
  invariant(Date.parse(source.observedAt) <= Date.parse(source.retrievedAt) + 300_000, `Source ${source.sourceId} was observed materially after it was retrieved.`);
  return deepFreeze(source);
}

function normalizeJsonValue(value, label) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    invariant(Number.isFinite(value), `${label} numeric values must be finite.`);
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => normalizeJsonValue(item, `${label}[${index}]`));
  invariant(value && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null), `${label} must contain only JSON values.`);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    nonEmptyText(key, `${label} key`, 120);
    invariant(!['__proto__', 'constructor', 'prototype'].includes(key), `${label} contains an unsafe key.`);
    return [key, normalizeJsonValue(item, `${label}.${key}`)];
  }));
}

function normalizeValue(value) {
  return canonicalize(normalizeJsonValue(value, 'fact.value'));
}

function normalizeContext(raw) {
  invariant(raw && typeof raw === 'object' && !Array.isArray(raw), 'fact.context must be an object.');
  const context = canonicalize(normalizeJsonValue(raw, 'fact.context'));
  invariant(Object.keys(context).length > 0, 'fact.context cannot be empty.');
  return context;
}

function normalizeFact(raw, registry) {
  invariant(raw && typeof raw === 'object', 'Fact must be an object.');
  const kind = identifier(raw.kind, 'fact.kind');
  const semanticKey = identifier(raw.semanticKey, 'fact.semanticKey');
  const state = nonEmptyText(raw.state, 'fact.state', 20);
  invariant(FACT_STATES.includes(state), `Unsupported fact state ${state}.`);
  const subject = registry.identities.reference(raw.subject.type, raw.subject.id);
  const related = (raw.related || []).map((reference) => registry.identities.reference(reference.type, reference.id));
  invariant(new Set(related.map((reference) => reference.key)).size === related.length, `Fact ${semanticKey} repeats a related entity.`);
  invariant(!related.some((reference) => reference.key === subject.key), `Fact ${semanticKey} cannot relate its subject to itself.`);
  const value = normalizeValue(raw.value);
  const unit = raw.unit == null ? null : identifier(raw.unit, 'fact.unit');
  if (typeof value === 'number') invariant(unit, `Numeric fact ${semanticKey} requires a unit.`);
  const asOf = isoTimestamp(raw.asOf, 'fact.asOf');
  const sourceIds = unique((raw.sourceIds || []).map((sourceId) => identifier(sourceId, 'fact.sourceId'))).sort();
  sourceIds.forEach((sourceId) => {
    invariant(registry.hasSource(sourceId), `Fact ${semanticKey} cites unknown source ${sourceId}.`);
  });
  const derivedFrom = unique((raw.derivedFrom || []).map((factId) => identifier(factId, 'fact.derivedFrom'))).sort();
  derivedFrom.forEach((factId) => invariant(registry.has(factId), `Fact ${semanticKey} derives from unknown fact ${factId}.`));
  invariant(sourceIds.length > 0 || derivedFrom.length > 0, `Fact ${semanticKey} needs sourceIds or derivedFrom lineage.`);
  const eligibleEditions = unique((raw.eligibleEditions || EDITIONS).map((edition) => nonEmptyText(edition, 'fact.edition', 20))).sort();
  eligibleEditions.forEach((edition) => invariant(EDITIONS.includes(edition), `Unsupported fact edition ${edition}.`));
  const factCore = {
    semanticKey,
    kind,
    subject,
    related,
    value,
    unit,
    state,
    asOf,
    context: normalizeContext(raw.context),
    claim: nonEmptyText(raw.claim, 'fact.claim', 500),
    sourceIds,
    derivedFrom,
    eligibleEditions,
    tags: unique((raw.tags || []).map((tag) => identifier(tag, 'fact.tag'))).sort()
  };
  const generatedFactId = `fact:${semanticKey}:${digest(factCore, 12)}`;
  const factId = raw.factId == null ? generatedFactId : identifier(raw.factId, 'fact.factId');
  invariant(factId === generatedFactId, `Fact ${semanticKey} failed its content-derived ID integrity check.`);
  return deepFreeze({ factId, ...factCore });
}

export class FactRegistry {
  #sources = new Map();
  #facts = new Map();
  #semantic = new Map();

  constructor({ identities, sources = [] } = {}) {
    invariant(identities && typeof identities.reference === 'function', 'FactRegistry requires an IdentityIndex.');
    this.identities = identities;
    sources.forEach((source) => this.addSource(source));
  }

  addSource(raw) {
    const source = normalizeSource(raw);
    const existing = this.#sources.get(source.sourceId);
    if (existing) invariant(stableJson(existing) === stableJson(source), `Source ${source.sourceId} was redefined.`);
    else this.#sources.set(source.sourceId, source);
    return source;
  }

  hasSource(sourceId) {
    return this.#sources.has(String(sourceId));
  }

  source(sourceId) {
    const source = this.#sources.get(String(sourceId));
    invariant(source, `Unknown source ${sourceId}.`);
    return source;
  }

  add(raw) {
    const fact = normalizeFact(raw, this);
    const existingById = this.#facts.get(fact.factId);
    if (existingById) {
      invariant(stableJson(existingById) === stableJson(fact), `Fact ID ${fact.factId} was redefined.`);
      return existingById;
    }
    const existingSemanticId = this.#semantic.get(fact.semanticKey);
    invariant(!existingSemanticId, `Semantic fact ${fact.semanticKey} already exists as ${existingSemanticId}.`);
    this.#facts.set(fact.factId, fact);
    this.#semantic.set(fact.semanticKey, fact.factId);
    return fact;
  }

  has(factId) {
    return this.#facts.has(String(factId));
  }

  get(factId) {
    const fact = this.#facts.get(String(factId));
    invariant(fact, `Unknown fact ${factId}.`);
    return fact;
  }

  bySemanticKey(semanticKey) {
    const factId = this.#semantic.get(String(semanticKey));
    return factId ? this.#facts.get(factId) : null;
  }

  find({ kind, state, subjectKey, tag, edition, context = {} } = {}) {
    return this.list().filter((fact) => {
      if (kind && fact.kind !== kind) return false;
      if (state && fact.state !== state) return false;
      if (subjectKey && fact.subject.key !== subjectKey) return false;
      if (tag && !fact.tags.includes(tag)) return false;
      if (edition && !fact.eligibleEditions.includes(edition)) return false;
      return Object.entries(context).every(([key, value]) => stableJson(fact.context[key]) === stableJson(value));
    });
  }

  list() {
    return [...this.#facts.values()].sort((left, right) => left.semanticKey.localeCompare(right.semanticKey));
  }

  sources() {
    return [...this.#sources.values()].sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  }

  toJSON() {
    return deepFreeze({
      schemaVersion: 1,
      sources: this.sources(),
      facts: this.list()
    });
  }
}
